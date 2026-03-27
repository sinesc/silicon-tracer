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

console.log('\nSummary:');
summary();