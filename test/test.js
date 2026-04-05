const args = process.argv.slice(2);
const debug = args.includes('--debug');

const { assert, test, time, readJSON, summary, context: c, createSimulationWithBackend, compileCircuit, loadCircuitWires, declareMemory } = require('./lib/runner');

if (debug) {
    require('./lib/runner').setDebugMode(true);
}

function initSim(file, backend) {
    const sim = createSimulationWithBackend(backend);
    sim.unserialize(readJSON(file));
    sim.compile();
    return sim;
}

console.log('Misc tests:');

test("fract", () => {
    const positive = c.Math.fract(2.3);
    assert(positive > 0.29 && positive < 0.31)
    const negative = c.Math.fract(-2.3);
    assert(negative < -0.29 && negative > -0.31)
});

console.log('\nSimulation tests:');

test("reset functionality", () => {
    const sim = initSim('data/minimal.json', 'js');
    // Set a constant value
    sim.setConstValue(2, 1);
    // Run a few ticks
    sim.simulate(10);
    // Check that nets have been set
    const net0Value = sim.getNetValue(0);
    assert(net0Value !== null, `Net 0 should be driven, got ${net0Value}`);
    // Reset simulation
    sim.reset();
    // Verify nets are cleared
    const net0ValueAfterReset = sim.getNetValue(0);
    assert(net0ValueAfterReset === null, `Net 0 should be cleared after reset, got ${net0ValueAfterReset}`);
    const net1ValueAfterReset = sim.getNetValue(1);
    assert(net1ValueAfterReset === null, `Net 1 should be cleared after reset, got ${net1ValueAfterReset}`);
    const net2ValueAfterReset = sim.getNetValue(2);
    assert(net2ValueAfterReset === null, `Net 2 should be cleared after reset, got ${net2ValueAfterReset}`);
});

test("reset preserves constants", () => {
    const sim = initSim('data/minimal.json', 'js');
    // Set constant values
    sim.setConstValue(0, 1);
    sim.setConstValue(1, 1);
    sim.setConstValue(2, 1);
    // Run some ticks
    sim.simulate(10);
    // Verify constants are set before reset
    assert(sim.getConstValue(0) === 1, `Constant 0 should be 1 before reset`);
    assert(sim.getConstValue(1) === 1, `Constant 1 should be 1 before reset`);
    assert(sim.getConstValue(2) === 1, `Constant 2 should be 1 before reset`);
    // Reset simulation
    sim.reset();
    // Verify constants are preserved after reset
    assert(sim.getConstValue(0) === 1, `Constant 0 should still be 1 after reset`);
    assert(sim.getConstValue(1) === 1, `Constant 1 should still be 1 after reset`);
    assert(sim.getConstValue(2) === 1, `Constant 2 should still be 1 after reset`);
});

test("net conflicts", () => {
    const sim = compileCircuit('data/tests.stc', 'ConflictBuffer');
    const cInput   = sim.getConstId('cInput');
    const cEnable1 = sim.getConstId('cEnable1');
    const cEnable2 = sim.getConstId('cEnable2');

    // No conflict: only cEnable1 active — pOutput should equal cInput, pIntermediate should be undriven
    sim.setConstValue(cInput, 1);
    sim.setConstValue(cEnable1, 1);
    sim.setConstValue(cEnable2, 0);
    sim.simulate(5);
    assert(sim.getProbeValue('pOutput') === 1, `pOutput should equal cInput (1) with only cEnable1 active, got ${sim.getProbeValue('pOutput')}`);
    assert(sim.getProbeValue('pIntermediate') === null, `pIntermediate should be undriven when cEnable2 is low, got ${sim.getProbeValue('pIntermediate')}`);

    // No conflict: only cEnable2 active — pOutput should equal cInput, pIntermediate should equal cInput
    sim.setConstValue(cEnable1, 0);
    sim.setConstValue(cEnable2, 1);
    sim.simulate(5);
    assert(sim.getProbeValue('pOutput') === 1, `pOutput should equal cInput (1) with only cEnable2 active, got ${sim.getProbeValue('pOutput')}`);
    assert(sim.getProbeValue('pIntermediate') === 1, `pIntermediate should equal cInput (1) when cEnable2 is high, got ${sim.getProbeValue('pIntermediate')}`);

    // Conflict: both enables active — pOutput should be -1 (conflict), pIntermediate should still equal cInput
    // NOTE: net conflict detection is not yet fully implemented; the pOutput assertion is expected to fail for now.
    sim.setConstValue(cEnable1, 1);
    sim.setConstValue(cEnable2, 1);
    sim.simulate(5);
    assert(sim.getProbeValue('pIntermediate') === 1, `pIntermediate should equal cInput (1) with both enables active, got ${sim.getProbeValue('pIntermediate')}`);
    assert(sim.getProbeValue('pOutput') === -1, `pOutput should be -1 (conflict) when both enables are active, got ${sim.getProbeValue('pOutput')}`);
});

test("no false positive conflict on AND gate output", () => {
    const sim = compileCircuit('data/tests.stc', 'ConflictGate');
    const cA = sim.getConstId('cA');
    const cB = sim.getConstId('cB');

    sim.setConstValue(cA, 1);
    sim.setConstValue(cB, 1);
    sim.simulate(5);

    // Input probes should reflect the constants with no conflict
    assert(sim.getProbeValue('pA') === 1, `pA should be 1, got ${sim.getProbeValue('pA')}`);
    assert(sim.getProbeValue('pB') === 1, `pB should be 1, got ${sim.getProbeValue('pB')}`);

    // pQ is driven by a single AND gate output — no conflict should be reported.
    // Currently a false positive: the implementation incorrectly reports -1 here.
    assert(sim.getProbeValue('pQ') === 1, `pQ should be 1 (1 & 1), got ${sim.getProbeValue('pQ')}`);
});

test("delayed conflict (clock-driven)", () => {
    const sim = compileCircuit('data/tests.stc', 'DelayedConflict');
    // targetTPS=10000 in runner, clock=1Hz → one full clock period = 10000 ticks.
    // The 4-bit counter advances on each rising edge. Conflict occurs when q0 and q3
    // are both high, i.e. at counter values 9 (1001) and 11 (1011).
    const ticksPerCycle = 10000;

    // Initial state: no conflict
    sim.simulate(5);
    assert(sim.getProbeValue('pConflict') !== -1, `no initial conflict`);

    // Cycles 1–8: counter values 1–8, q3 and q0 never simultaneously high → no conflict
    for (let cycle = 1; cycle <= 8; cycle++) {
        sim.simulate(ticksPerCycle);
        assert(sim.getProbeValue('pConflict') !== -1, `no conflict at cycle ${cycle}`);
    }

    // Cycle 9: counter reaches 9 (binary 1001, q0=1 q3=1) → conflict
    sim.simulate(ticksPerCycle);
    assert(sim.getProbeValue('pConflict') === -1, `conflict at cycle 9 (count 9, q0 and q3 both high), got ${sim.getProbeValue('pConflict')}`);

    // Cycle 10: counter advances to 10 (binary 1010, q0=0) → conflict clears
    sim.simulate(ticksPerCycle);
    assert(sim.getProbeValue('pConflict') !== -1, `conflict clears at cycle 10 (count 10, q0 low), got ${sim.getProbeValue('pConflict')}`);

    // Cycle 11: counter reaches 11 (binary 1011, q0=1 q3=1) → conflict resumes
    sim.simulate(ticksPerCycle);
    assert(sim.getProbeValue('pConflict') === -1, `conflict at cycle 11 (count 11, q0 and q3 both high), got ${sim.getProbeValue('pConflict')}`);
});

test("break on conflict (clock-driven)", () => {
    const sim = compileCircuit('data/tests.stc', 'DelayedConflict', 'js', { breakOnConflict: true });
    // Same circuit as above but with breakOnConflict enabled.
    // simulate() should return 0 while no conflict is active, 1 when the tick loop breaks.
    const ticksPerCycle = 10000;

    // Initial state: no break
    assert(sim.simulate(5) === 0, `no break before clock starts`);

    // Cycles 1–8: no conflict → simulate returns 0 each time
    for (let cycle = 1; cycle <= 8; cycle++) {
        assert(sim.simulate(ticksPerCycle) === 0, `no break at cycle ${cycle}`);
    }

    // Cycle 9: conflict → simulate breaks early (returns 1)
    assert(sim.simulate(ticksPerCycle) === 1, `break triggered at cycle 9 (count 9)`);

    // After the break, the simulation is stuck at the conflicting state (count 9).
    // Tick one step at a time until the conflict clears (counter advances to count 10).
    // One clock period (~10000 ticks) is needed to advance past count 9.
    let cleared = false;
    for (let t = 0; t < ticksPerCycle * 2; t++) {
        if (sim.simulate(1) === 0) { cleared = true; break; }
    }
    assert(cleared, `conflict should clear once counter advances past count 9`);

    // One full cycle with count 10 (q0=0) produces no conflict
    assert(sim.simulate(ticksPerCycle) === 0, `no break at count 10`);

    // The next conflict (count 11, binary 1011, q0=1 q3=1) is reached shortly after
    let breakAgain = false;
    for (let t = 0; t < ticksPerCycle * 2; t++) {
        if (sim.simulate(1) === 1) { breakAgain = true; break; }
    }
    assert(breakAgain, `conflict should recur at count 11 (q0 and q3 both high again)`);
});

console.log('\nMemory (ROM/RAM) tests:');

test("ROM read with 2-bit address and 8-bit data", () => {
    const sim = createSimulationWithBackend('js');
    const suffix = '@rom0@0_0';

    // Declare a ROM: 2-bit address (4 entries), 8-bit data, values [0xAA, 0x55, 0xFF, 0x01]
    declareMemory(sim, 'rom', 2, 8, 'AA55FF01', suffix);

    // Declare constants for address bits and output enable
    sim.declareConst(0, '@ca0@0_0');
    sim.declareConst(0, '@ca1@0_0');
    sim.declareConst(1, '@coe@0_0');

    // Declare nets: connect constants to ROM address inputs and OE
    sim.declareNet(['q@ca0@0_0', 'a0' + suffix]);
    sim.declareNet(['q@ca1@0_0', 'a1' + suffix]);
    sim.declareNet(['q@coe@0_0', 'oe' + suffix]);

    // Declare probes for data output bits
    for (let i = 0; i < 8; i++) {
        sim.declareProbe('do' + i, '@pdo' + i + '@0_0');
        sim.declareNet(['do' + i + suffix, 'input@pdo' + i + '@0_0']);
    }

    sim.compile();

    // Helper: read 8-bit value from probes
    const readData = () => {
        let v = 0;
        for (let i = 0; i < 8; i++) {
            const bit = sim.getProbeValue('do' + i);
            if (bit === 1) v |= (1 << i);
        }
        return v;
    };

    // Address 0 → 0xAA
    sim.setConstValue(0, 0);
    sim.setConstValue(1, 0);
    sim.simulate(5);
    assert(readData() === 0xAA, `addr 0: expected 0xAA, got 0x${readData().toString(16)}`);

    // Address 1 → 0x55
    sim.setConstValue(0, 1);
    sim.setConstValue(1, 0);
    sim.simulate(5);
    assert(readData() === 0x55, `addr 1: expected 0x55, got 0x${readData().toString(16)}`);

    // Address 2 → 0xFF
    sim.setConstValue(0, 0);
    sim.setConstValue(1, 1);
    sim.simulate(5);
    assert(readData() === 0xFF, `addr 2: expected 0xFF, got 0x${readData().toString(16)}`);

    // Address 3 → 0x01
    sim.setConstValue(0, 1);
    sim.setConstValue(1, 1);
    sim.simulate(5);
    assert(readData() === 0x01, `addr 3: expected 0x01, got 0x${readData().toString(16)}`);
});

test("RAM write and read back with 2-bit address and 4-bit data", () => {
    const sim = createSimulationWithBackend('js');
    const suffix = '@ram0@0_0';

    // Declare a RAM: 2-bit address (4 entries), 4-bit data, initially all zeros
    declareMemory(sim, 'ram', 2, 4, '', suffix);

    // Constants for address (2 bits), data-in (4 bits), write-enable
    sim.declareConst(0, '@ca0@0_0');
    sim.declareConst(0, '@ca1@0_0');
    sim.declareConst(0, '@cdi0@0_0');
    sim.declareConst(0, '@cdi1@0_0');
    sim.declareConst(0, '@cdi2@0_0');
    sim.declareConst(0, '@cdi3@0_0');
    sim.declareConst(0, '@cwe@0_0');
    sim.declareConst(1, '@coe@0_0');

    // Connect constants to RAM ports
    sim.declareNet(['q@ca0@0_0', 'a0' + suffix]);
    sim.declareNet(['q@ca1@0_0', 'a1' + suffix]);
    sim.declareNet(['q@cdi0@0_0', 'di0' + suffix]);
    sim.declareNet(['q@cdi1@0_0', 'di1' + suffix]);
    sim.declareNet(['q@cdi2@0_0', 'di2' + suffix]);
    sim.declareNet(['q@cdi3@0_0', 'di3' + suffix]);
    sim.declareNet(['q@cwe@0_0', 'we' + suffix]);
    sim.declareNet(['q@coe@0_0', 'oe' + suffix]);

    // Probes for data output
    for (let i = 0; i < 4; i++) {
        sim.declareProbe('do' + i, '@pdo' + i + '@0_0');
        sim.declareNet(['do' + i + suffix, 'input@pdo' + i + '@0_0']);
    }

    sim.compile();

    const readData = () => {
        let v = 0;
        for (let i = 0; i < 4; i++) {
            const bit = sim.getProbeValue('do' + i);
            if (bit === 1) v |= (1 << i);
        }
        return v;
    };

    const setAddr = (addr) => {
        sim.setConstValue(0, addr & 1);
        sim.setConstValue(1, (addr >>> 1) & 1);
    };

    const setDataIn = (val) => {
        sim.setConstValue(2, val & 1);
        sim.setConstValue(3, (val >>> 1) & 1);
        sim.setConstValue(4, (val >>> 2) & 1);
        sim.setConstValue(5, (val >>> 3) & 1);
    };

    const setWriteEnable = (we) => {
        sim.setConstValue(6, we);
    };

    // Initial: read addr 0 should be 0
    setAddr(0);
    setWriteEnable(0);
    setDataIn(0);
    sim.simulate(5);
    assert(readData() === 0, `initial addr 0: expected 0, got ${readData()}`);

    // Write 0xA (1010) to address 0
    setAddr(0);
    setDataIn(0xA);
    setWriteEnable(1);
    sim.simulate(5);

    // Read back address 0 (disable write first)
    setWriteEnable(0);
    sim.simulate(5);
    assert(readData() === 0xA, `addr 0 after write: expected 0xA, got 0x${readData().toString(16)}`);

    // Write 0x5 to address 2
    setAddr(2);
    setDataIn(0x5);
    setWriteEnable(1);
    sim.simulate(5);

    // Read back address 2
    setWriteEnable(0);
    sim.simulate(5);
    assert(readData() === 0x5, `addr 2 after write: expected 0x5, got 0x${readData().toString(16)}`);

    // Verify address 0 still has 0xA
    setAddr(0);
    sim.simulate(5);
    assert(readData() === 0xA, `addr 0 still: expected 0xA, got 0x${readData().toString(16)}`);
});

test("ROM reset restores initial data", () => {
    const sim = createSimulationWithBackend('js');
    const suffix = '@rom0@0_0';
    declareMemory(sim, 'rom', 1, 8, '4299', suffix);
    sim.declareConst(0, '@ca0@0_0');
    sim.declareConst(1, '@coe@0_0');
    sim.declareNet(['q@ca0@0_0', 'a0' + suffix]);
    sim.declareNet(['q@coe@0_0', 'oe' + suffix]);
    for (let i = 0; i < 8; i++) {
        sim.declareProbe('do' + i, '@pdo' + i + '@0_0');
        sim.declareNet(['do' + i + suffix, 'input@pdo' + i + '@0_0']);
    }
    sim.compile();

    const readData = () => {
        let v = 0;
        for (let i = 0; i < 8; i++) {
            const bit = sim.getProbeValue('do' + i);
            if (bit === 1) v |= (1 << i);
        }
        return v;
    };

    // Verify initial read at address 0
    sim.setConstValue(0, 0);
    sim.simulate(5);
    assert(readData() === 0x42, `addr 0: expected 0x42, got 0x${readData().toString(16)}`);

    // Tamper with memory via setMemoryData
    sim.setMemoryData(0, 0, 0xFF);
    sim.simulate(5);
    assert(readData() === 0xFF, `after tamper: expected 0xFF, got 0x${readData().toString(16)}`);

    // Reset should restore initial data
    sim.reset();
    sim.simulate(5);
    assert(readData() === 0x42, `after reset: expected 0x42, got 0x${readData().toString(16)}`);
});

test("RAM with 1-bit data width (32 values packed per element)", () => {
    const sim = createSimulationWithBackend('js');
    const suffix = '@ram0@0_0';
    declareMemory(sim, 'ram', 3, 1, '', suffix);
    sim.declareConst(0, '@ca0@0_0');
    sim.declareConst(0, '@ca1@0_0');
    sim.declareConst(0, '@ca2@0_0');
    sim.declareConst(0, '@cdi0@0_0');
    sim.declareConst(0, '@cwe@0_0');
    sim.declareConst(1, '@coe@0_0');

    sim.declareNet(['q@ca0@0_0', 'a0' + suffix]);
    sim.declareNet(['q@ca1@0_0', 'a1' + suffix]);
    sim.declareNet(['q@ca2@0_0', 'a2' + suffix]);
    sim.declareNet(['q@cdi0@0_0', 'di0' + suffix]);
    sim.declareNet(['q@cwe@0_0', 'we' + suffix]);
    sim.declareNet(['q@coe@0_0', 'oe' + suffix]);
    sim.declareProbe('do0', '@pdo0@0_0');
    sim.declareNet(['do0' + suffix, 'input@pdo0@0_0']);

    sim.compile();

    // Write 1 to address 5 (binary 101)
    sim.setConstValue(0, 1); // a0
    sim.setConstValue(1, 0); // a1
    sim.setConstValue(2, 1); // a2
    sim.setConstValue(3, 1); // di0
    sim.setConstValue(4, 1); // we
    sim.simulate(5);

    // Read back address 5
    sim.setConstValue(4, 0); // we off
    sim.simulate(5);
    assert(sim.getProbeValue('do0') === 1, `addr 5: expected 1, got ${sim.getProbeValue('do0')}`);

    // Read address 0 (should still be 0)
    sim.setConstValue(0, 0);
    sim.setConstValue(2, 0);
    sim.simulate(5);
    assert(sim.getProbeValue('do0') === 0, `addr 0: expected 0, got ${sim.getProbeValue('do0')}`);
});

test("getMemoryData / setMemoryData with packing", () => {
    const sim = createSimulationWithBackend('js');
    const suffix = '@rom0@0_0';
    declareMemory(sim, 'rom', 3, 4, '0A0B0C0D0E0F0102', suffix);
    // Minimal wiring to compile (need at least one net)
    sim.declareConst(0, '@ca0@0_0');
    sim.declareConst(1, '@coe@0_0');
    sim.declareNet(['q@ca0@0_0', 'a0' + suffix]);
    sim.declareNet(['q@coe@0_0', 'oe' + suffix]);
    for (let i = 1; i < 3; i++) {
        sim.declareConst(0, '@ca' + i + '@0_0');
        sim.declareNet(['q@ca' + i + '@0_0', 'a' + i + suffix]);
    }
    for (let i = 0; i < 4; i++) {
        sim.declareProbe('do' + i, '@pdo' + i + '@0_0');
        sim.declareNet(['do' + i + suffix, 'input@pdo' + i + '@0_0']);
    }
    sim.compile();

    // Verify all addresses via getMemoryData
    const expected = [0xA, 0xB, 0xC, 0xD, 0xE, 0xF, 0x1, 0x2];
    for (let addr = 0; addr < 8; addr++) {
        const val = sim.getMemoryData(0, addr);
        assert(val === expected[addr], `getMemoryData addr ${addr}: expected 0x${expected[addr].toString(16)}, got 0x${val.toString(16)}`);
    }

    // Modify and verify
    sim.setMemoryData(0, 3, 0x7);
    assert(sim.getMemoryData(0, 3) === 0x7, `setMemoryData addr 3: expected 0x7, got 0x${sim.getMemoryData(0, 3).toString(16)}`);
    // Neighbors should be unaffected
    assert(sim.getMemoryData(0, 2) === 0xC, `addr 2 unaffected: expected 0xC, got 0x${sim.getMemoryData(0, 2).toString(16)}`);
    assert(sim.getMemoryData(0, 4) === 0xE, `addr 4 unaffected: expected 0xE, got 0x${sim.getMemoryData(0, 4).toString(16)}`);
});

test("ROM output enable controls tri-state output", () => {
    const sim = createSimulationWithBackend('js');
    const suffix = '@rom0@0_0';
    declareMemory(sim, 'rom', 1, 4, '0A05', suffix);

    sim.declareConst(0, '@ca0@0_0');
    sim.declareConst(1, '@coe@0_0');
    sim.declareNet(['q@ca0@0_0', 'a0' + suffix]);
    sim.declareNet(['q@coe@0_0', 'oe' + suffix]);

    for (let i = 0; i < 4; i++) {
        sim.declareProbe('do' + i, '@pdo' + i + '@0_0');
        sim.declareNet(['do' + i + suffix, 'input@pdo' + i + '@0_0']);
    }

    sim.compile();

    const readData = () => {
        let v = 0;
        for (let i = 0; i < 4; i++) {
            const bit = sim.getProbeValue('do' + i);
            if (bit === 1) v |= (1 << i);
        }
        return v;
    };

    // OE=1: outputs should be driven with address 0 data (0xA)
    sim.setConstValue(0, 0);
    sim.setConstValue(1, 1); // OE on
    sim.simulate(5);
    assert(readData() === 0xA, `OE=1 addr 0: expected 0xA, got 0x${readData().toString(16)}`);

    // OE=0: outputs should be undriven (null)
    sim.setConstValue(1, 0); // OE off
    sim.simulate(5);
    for (let i = 0; i < 4; i++) {
        const v = sim.getProbeValue('do' + i);
        assert(v === null, `OE=0 do${i}: expected null (undriven), got ${v}`);
    }

    // OE=1 again: outputs should be driven again
    sim.setConstValue(1, 1); // OE on
    sim.simulate(5);
    assert(readData() === 0xA, `OE=1 again addr 0: expected 0xA, got 0x${readData().toString(16)}`);
});

console.log('\nWire compaction tests:');

test("T-junction produces 3 wires (WireJunction3)", () => {
    const { wireCount, wireNetIds } = loadCircuitWires('data/tests.stc', 'WireJunction3');
    assert(wireCount === 3, `expected 3 wires after compaction, got ${wireCount}`);
    // All three wires must share the same net (they form a connected junction).
    const ids = new Set(wireNetIds);
    assert(ids.size === 1, `expected all wires on 1 net, got ${ids.size} distinct net(s)`);
});

test("X-junction produces 4 wires (WireJunction4)", () => {
    const { wireCount, wireNetIds } = loadCircuitWires('data/tests.stc', 'WireJunction4');
    assert(wireCount === 4, `expected 4 wires after compaction, got ${wireCount}`);
    // All four wires must share the same net.
    const ids = new Set(wireNetIds);
    assert(ids.size === 1, `expected all wires on 1 net, got ${ids.size} distinct net(s)`);
});

test("crossing wires produce 2 unconnected wires (WireCrossing)", () => {
    const { wireCount, wireNetIds } = loadCircuitWires('data/tests.stc', 'WireCrossing');
    assert(wireCount === 2, `expected 2 wires after compaction, got ${wireCount}`);
    // The two wires must be on different nets (they cross but do not connect).
    const ids = new Set(wireNetIds);
    assert(ids.size === 2, `expected 2 distinct nets, got ${ids.size}`);
});

test("two touching horizontal wires merge into 1 (WireStraightH)", () => {
    const { wireCount, wireNetIds } = loadCircuitWires('data/tests.stc', 'WireStraightH');
    assert(wireCount === 1, `expected 1 wire after compaction, got ${wireCount}`);
    const ids = new Set(wireNetIds);
    assert(ids.size === 1, `expected 1 net, got ${ids.size}`);
});

test("two touching vertical wires merge into 1 (WireStraightV)", () => {
    const { wireCount, wireNetIds } = loadCircuitWires('data/tests.stc', 'WireStraightV');
    assert(wireCount === 1, `expected 1 wire after compaction, got ${wireCount}`);
    const ids = new Set(wireNetIds);
    assert(ids.size === 1, `expected 1 net, got ${ids.size}`);
});

console.log('\nSimulation timings:');

const simJsCounter = time("Many counters simulation (Javascript)",
    () => initSim('data/counters.json', 'js'),
    (sim) => sim.simulate(500_000)
);

/*time("Many counters simulation (Wasm)",
    () => initSim('data/counters.json', 'wasm'),
    (sim) => sim.simulate(500_000),
    simJsCounter
);*/

const simJsMinimal = time("Minimal static simulation (Javascript)",
    () => initSim('data/minimal.json', 'js'),
    (sim) => sim.simulate(50_000_000)
);

/*time("Minimal static simulation (Wasm)",
    () => initSim('data/minimal.json', 'wasm'),
    (sim) => sim.simulate(50_000_000),
    simJsMinimal
);*/

console.log('\nSummary:');
summary();