// Ad-hoc smoke test: Circuit.markNetConflicts marks the driving output ports of a conflicted net.
// Run with: node test/smoke_conflict_marks.js
const { context } = require('./lib/runner');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const code = `
    const content = JSON.parse(JSON.stringify(CIRCUIT_JSON));
    const app = new Application();
    app.circuits.unserialize(content, null, false, []);
    const circuit = Object.values(app.circuits.all).find((c) => c.label === 'ConflictBuffer');
    const netList = NetList.identify(circuit, app.circuits.all);
    const [ engine ] = netList.compileSimulation(null, {
        backend: 'js', checkNetConflicts: true, breakOnConflict: false, breakConditions: [], targetTPS: 10000, debug: false,
    });
    circuit.attachSimulation(netList, 0);

    const cInput   = engine.getConstId('cInput');
    const cEnable1 = engine.getConstId('cEnable1');
    const cEnable2 = engine.getConstId('cEnable2');
    const netOutput = engine.getProbeNetIds('pOutput')[0];

    const applyMarks = (instanceId) => {
        netList.instances[instanceId].circuit.clearNetConflicts();
        netList.instances[instanceId].circuit.markNetConflicts(netList, instanceId, engine.resolveNetConflictDriversByNet());
    };

    // Conflict: both buffers driving the pOutput net
    engine.setConstValue(cInput, 1);
    engine.setConstValue(cEnable1, 1);
    engine.setConstValue(cEnable2, 1);
    engine.simulate(5);
    if (engine.getNetValue(netOutput) !== -1) throw new Error('expected net conflict');
    applyMarks(0);
    let marked = [];
    for (const item of circuit.items) {
        for (const port of (item.ports ?? [])) {
            if (port.conflictDriver) marked.push(item.constructor.name + '.' + port.name);
        }
    }
    marked.sort();
    if (marked.length !== 2 || !marked.every((m) => m === 'Builtin.q')) {
        throw new Error('expected exactly 2 marked Builtin.q ports, got ' + JSON.stringify(marked));
    }

    // Non-driver ports on the conflicted net (probe input) must not be marked
    for (const item of circuit.items) {
        for (const port of (item.ports ?? [])) {
            if (item.label === 'pOutput' && port.conflictDriver) throw new Error('probe input port must not be marked');
        }
    }

    // Conflict resolved: marks disappear after re-marking
    engine.setConstValue(cEnable1, 0);
    engine.setConstValue(cEnable2, 0);
    engine.simulate(5);
    applyMarks(0);
    for (const item of circuit.items) {
        for (const port of (item.ports ?? [])) {
            if (port.conflictDriver) throw new Error('marks should be cleared after conflict resolution, leftover on ' + item.label + '.' + port.name);
        }
    }
    'smoke_conflict_marks: ok';
`;
context.CIRCUIT_JSON = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/tests.stc'), 'utf-8').replace(/^loadFiles\.push\(\s*(.+)\)\s*$/s, '$1'));
console.log(vm.runInContext(code, context));
