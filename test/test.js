const { assert, test, time, readJSON, summary, context: c } = require('./lib/runner');

function initSim(file, backend) {
    const sim = new c.Simulation(false, backend);
    sim.unserialize(readJSON(file));
    sim.compile();
    return sim;
}

console.log('Tests:');

test("fract", () => {
    const positive = c.Math.fract(2.3);
    assert(positive > 0.29 && positive < 0.31)
    const negative = c.Math.fract(-2.3);
    assert(negative < -0.29 && negative > -0.31)
});

console.log('\nTimings:');

const simJsCounter = time("Many counters simulation (Javascript)",
    () => initSim('data/counters.json', 'Javascript'),
    (sim) => sim.simulate(500_000)
);

time("Many counters simulation (Wasm)",
    () => initSim('data/counters.json', 'Wasm'),
    (sim) => sim.simulate(500_000),
    simJsCounter
);

const simJsMinimal = time("Minimal static simulation (Javascript)",
    () => initSim('data/minimal.json', 'Javascript'),
    (sim) => sim.simulate(50_000_000)
);

time("Minimal static simulation (Wasm)",
    () => initSim('data/minimal.json', 'Wasm'),
    (sim) => sim.simulate(50_000_000),
    simJsMinimal
);

console.log('\nSummary:');
summary();