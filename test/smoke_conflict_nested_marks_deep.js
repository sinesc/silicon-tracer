// Ad-hoc smoke test: conflict marks follow a conflict through more than one sub-circuit level.
// A copy of `Outer` (from data/conflict-nesting.stc) is instantiated in a synthetic root circuit; two extra
// circuit ports are added to `Outer` so the conflict net ascends from InnerConflict to the root level.
// Run with: node test/smoke_conflict_nested_marks_deep.js
const { context } = require('./lib/runner');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const code = `
    const content = JSON.parse(JSON.stringify(CIRCUIT_JSON));
    const app = new Application();
    app.circuits.unserialize(content, null, false, []);
    const outer = app.circuits.byLabel('Outer');

    const connectionPoint = (component, portName) => {
        const c = component.portByName(portName).coords(component.width, component.height, component.rotation);
        return { x: c.x + component.x, y: c.y + component.y };
    };
    // Places a circuit port so that its connection point is exactly 'target' (connects without a wire).
    const addPortAt = (circuit, name, target, rotation = 3) => {
        const probe = new Port(app, 0, 0, rotation);
        probe.name = name;
        const off = connectionPoint(probe, 'q');
        const port = new Port(app, target.x - off.x, target.y - off.y, rotation);
        port.name = name;
        circuit.addItem(port);
    };

    // route the conflict out of InnerConflict and out of Outer (both new ports connect by grid colocation)
    const ccInner = outer.items.filter((i) => i instanceof CustomComponent && app.circuits.byUID(i.uid).label === 'InnerConflict').toArray()[0];
    const portO = outer.items.filter((i) => i instanceof Port && i.name === 'o').toArray()[0];
    addPortAt(outer, 'p1', connectionPoint(ccInner, 'q'));
    addPortAt(outer, 'p2', connectionPoint(portO, 'q'));

    const root = new Circuit(app, 'Root', 'u_test_root', []);
    root.addItem(new CustomComponent(app, 100, 100, 0, outer.uid));

    const netList = NetList.identify(root, app.circuits.all);
    const [ engine ] = netList.compileSimulation(null, {
        backend: 'js', checkNetConflicts: true, breakOnConflict: false, breakConditions: [], targetTPS: 10000, debug: false,
    });
    engine.simulate(5);

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
                result.push((item instanceof CustomComponent ? app.circuits.byUID(item.uid).label : (item.label ?? item.type)) + '.' + port.name);
            }
        }
        result.sort();
        return result;
    };
    const expect = (actual, expected, message) => {
        if (actual.join(',') !== expected.join(',')) throw new Error(message + ' (expected [' + expected + '], got [' + actual + '])');
    };

    assert(engine.resolveNetConflictDrivers().size === 2, 'expected two conflict drivers in the innermost sub-circuit');

    // the mark chain leads through every level: Outer's port p1 (root level) -> InnerConflict.q -> the driving outputs
    mark(0);
    expect(markedPorts(root), [ 'Outer.p1' ], 'root circuit should mark only the port leading to the conflict');
    mark(instanceOf('Outer'));
    expect(markedPorts(outer), [ 'InnerConflict.q' ], 'outer circuit should mark only InnerConflict.q');
    mark(instanceOf('InnerConflict'));
    expect(markedPorts(app.circuits.byLabel('InnerConflict')), [ 'buffer3.q', 'not3.q' ], 'InnerConflict should mark both driving outputs');
    mark(instanceOf('InnerOk'));
    expect(markedPorts(app.circuits.byLabel('InnerOk')), [], 'InnerOk must not be marked');
    'smoke_conflict_nested_marks_deep: ok';
`;
context.CIRCUIT_JSON = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/conflict-nesting.stc'), 'utf-8').replace(/^loadFiles\.push\(\s*(.+)\)\s*$/s, '$1'));
console.log(vm.runInContext(code, context));
