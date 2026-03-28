const args = process.argv.slice(2);
const debug = args.includes('--debug');

const { assert, test, time, readJSON, summary, context: c, createSimulationWithBackend } = require('./lib/runner');

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

console.log('Simulation tests:');

test("reset functionality", () => {
    const sim = initSim('data/minimal.json', 'js');
    // Set a constant value
    sim.setConstValue(2, 1);
    // Run a few ticks
    sim.simulate(10);
    // Check that nets have been set
    const net0Value = sim.getNetValue(0);
    assert(net0Value === 0 || net0Value === 1, `Net 0 should be driven, got ${net0Value}`);
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

test("net conflicts", () => {
    const sim = initSim('data/conflict.json', 'js');
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

console.log('\nSummary:');
summary();