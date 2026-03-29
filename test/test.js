const args = process.argv.slice(2);
const debug = args.includes('--debug');

const { assert, test, time, readJSON, summary, context: c, createSimulationWithBackend, compileCircuit } = require('./lib/runner');

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