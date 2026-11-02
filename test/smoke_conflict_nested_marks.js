// Ad-hoc smoke test: conflict marks follow a conflict into sub-circuits (Circuit.markNetConflicts marks
// CustomComponent ports whose subtree contains drivers of a conflicted net).
// Run with: node test/smoke_conflict_nested_marks.js
const { context } = require('./lib/runner');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const code = `
    const content = JSON.parse(JSON.stringify(CIRCUIT_JSON));
    const app = new Application();
    app.circuits.unserialize(content, null, false, []);
    const outer = app.circuits.byLabel('Outer');
    const netList = NetList.identify(outer, app.circuits.all);
    const [ engine ] = netList.compileSimulation(null, {
        backend: 'js', checkNetConflicts: true, breakOnConflict: false, breakConditions: [], targetTPS: 10000, debug: false,
    });
    outer.attachSimulation(netList, 0);

    // instance ids of the sub-circuits (instance 0 is the root circuit)
    const instanceOf = (label) => netList.instances.findIndex((i) => i.circuit.label === label);
    const mark = (instanceId) => {
        for (const instance of netList.instances) instance.circuit.clearNetConflicts();
        netList.instances[instanceId].circuit.markNetConflicts(netList, instanceId, engine.resolveNetConflictDriversByNet());
    };
    const markedPorts = (circuit) => {
        const result = [];
        for (const item of circuit.items) {
            for (const port of (item.ports ?? [])) {
                if (!port.conflictDriver) continue;
                // CustomComponents are identified by the label of the circuit they represent
                const label = item instanceof CustomComponent ? app.circuits.byUID(item.uid).label : (item.label ?? item.type);
                result.push(label + '.' + port.name);
            }
        }
        result.sort();
        return result;
    };
    const expect = (actual, expected, message) => {
        if (actual.join(',') !== expected.join(',')) throw new Error(message + ' (expected [' + expected + '], got [' + actual + '])');
    };

    engine.simulate(5);

    // While viewing 'Outer': the output port of the conflicting sub-circuit is marked, the (undriven) input side is not
    mark(0);
    expect(markedPorts(outer), [ 'InnerConflict.q' ], 'outer circuit should mark only InnerConflict.q');

    // While viewing the sub-circuit that contains the conflict: both driving outputs are marked
    mark(instanceOf('InnerConflict'));
    expect(markedPorts(app.circuits.byLabel('InnerConflict')), [ 'buffer3.q', 'not3.q' ], 'InnerConflict should mark both driving outputs');

    // The sub-circuit on the receiving side has no drivers on the conflicted net -> nothing marked
    mark(instanceOf('InnerOk'));
    expect(markedPorts(app.circuits.byLabel('InnerOk')), [], 'InnerOk must not be marked');

    // Conflict resolved (both Outer buttons off): re-marking clears all marks
    for (const button of outer.items.filter((i) => i instanceof Button)) engine.setConstValue(button.simIds[0], 0);
    engine.simulate(5);
    for (const [ instanceId ] of netList.instances.entries()) {
        mark(instanceId);
        expect(markedPorts(netList.instances[instanceId].circuit), [], 'marks must be gone after resolving the conflict (instance ' + instanceId + ')');
    }
    'smoke_conflict_nested_marks: ok';
`;
context.CIRCUIT_JSON = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/conflict-nesting.stc'), 'utf-8').replace(/^loadFiles\.push\(\s*(.+)\)\s*$/s, '$1'));
console.log(vm.runInContext(code, context));
