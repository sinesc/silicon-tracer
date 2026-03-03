const { assert, test, time, readJSON, summary, context: c } = require('./runner');

time("Simulation",
    () => { 
        const sim = new c.Simulation();
        sim.unserialize(readJSON('data/counters.json'));
        sim.compile();
        return sim;
    },
    (sim) => {
        sim.simulate(1000);
    }
);

test("fract", () => {
    const positive = c.Math.fract(2.3);
    assert(positive > 0.29 && positive < 0.31)
    const negative = c.Math.fract(-2.3);
    assert(negative < -0.29 && negative > -0.31)
});

summary();