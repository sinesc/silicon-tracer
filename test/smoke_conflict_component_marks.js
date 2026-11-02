// Ad-hoc smoke test: Circuit.markNetConflicts marks CustomComponents whose sub-circuit contains a net conflict
// (component outline via Component.containsConflict), including conflicts that reach none of the component's ports.
// Run with: node test/smoke_conflict_component_marks.js
const { context } = require('./lib/runner');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const code = `
    const load = (json) => {
        const app = new Application();
        app.circuits.unserialize(JSON.parse(JSON.stringify(json)), null, false, []);
        return app;
    };
    const compile = (app, circuit) => {
        const netList = NetList.identify(circuit, app.circuits.all);
        const [ engine ] = netList.compileSimulation(null, {
            backend: 'js', checkNetConflicts: true, breakOnConflict: false, breakConditions: [], targetTPS: 10000, debug: false,
        });
        return [ netList, engine ];
    };
    const mark = (netList, instanceId, engine) => {
        for (const instance of netList.instances) instance.circuit.clearNetConflicts();
        netList.instances[instanceId].circuit.markNetConflicts(netList, instanceId, engine.resolveNetConflictDriversByNet());
    };
    const markedComponents = (circuit) => {
        const result = [];
        for (const item of circuit.items) {
            if (item instanceof CustomComponent && item.containsConflict) result.push(item.type); // CustomComponent type is the represented circuit's label
        }
        return result.sort();
    };
    const markedPorts = (circuit) => {
        const result = [];
        for (const item of circuit.items) {
            for (const port of (item.ports ?? [])) {
                if (port.conflictDriver) result.push((item instanceof CustomComponent ? item.type : (item.label ?? item.type)) + '.' + port.name);
            }
        }
        return result.sort();
    };
    const expect = (actual, expected, message) => {
        if (actual.join(',') !== expected.join(',')) throw new Error(message + ' (expected [' + expected + '], got [' + actual + '])');
    };

    // A conflict fully internal to a sub-circuit: ConflictBuffer has no circuit ports at all, so the conflicted net
    // touches no CustomComponent port and no port highlight would be possible at the parent level.
    {
        const app = load(TESTS_JSON);
        const root = new Circuit(app, 'Root', 'u_test_root', []);
        root.addItem(new CustomComponent(app, 100, 100, 0, app.circuits.byLabel('ConflictBuffer').uid));
        const [ netList, engine ] = compile(app, root);
        for (const c of engine.consts) engine.setConstValue(c.id, 1);
        engine.simulate(5);
        assert(engine.resolveNetConflictDriversByNet().size === 1, 'expected one conflicted net with both buffers enabled');
        mark(netList, 0, engine);
        expect(markedComponents(root), [ 'ConflictBuffer' ], 'hidden conflict must mark the containing component');
        expect(markedPorts(root), [], 'no port can be marked for a conflict that touches no component port');

        for (const c of engine.consts) engine.setConstValue(c.id, 0);
        engine.simulate(5);
        assert(engine.resolveNetConflictDriversByNet().size === 0, 'expected no conflicted net with all inputs low');
        mark(netList, 0, engine);
        expect(markedComponents(root), [], 'component mark must be gone after resolving the conflict');
    }

    // Only sub-circuits that contribute a driver are marked, sub-circuits merely attached to the conflicted net are not.
    {
        const app = load(NEST_JSON);
        const outer = app.circuits.byLabel('Outer');
        const [ netList, engine ] = compile(app, outer);
        engine.simulate(5);
        assert(engine.resolveNetConflictDriversByNet().size === 1, 'expected one conflicted net');
        mark(netList, 0, engine);
        expect(markedComponents(outer), [ 'InnerConflict' ], 'only the sub-circuit driving the conflict must be marked');
        expect(markedPorts(outer), [ 'InnerConflict.q' ], 'the path port of the marked component must stay marked');

        // enable the switch inside InnerOk -> its subtree now drives the conflicted net as well
        const instOk = netList.instances.findIndex((i) => i.circuit.label === 'InnerOk');
        const switchItem = netList.instances[instOk].circuit.items.filter((i) => i instanceof Switch).toArray()[0];
        engine.setConstValue(netList.instances[instOk].simIds[switchItem.gid], 1);
        engine.simulate(5);
        mark(netList, 0, engine);
        expect(markedComponents(outer), [ 'InnerConflict', 'InnerOk' ], 'both driving sub-circuits must be marked');

        // a conflict inside the displayed circuit marks ports, not components
        const instConflict = netList.instances.findIndex((i) => i.circuit.label === 'InnerConflict');
        mark(netList, instConflict, engine);
        expect(markedComponents(netList.instances[instConflict].circuit), [], 'no component mark for a conflict in the displayed circuit');
        expect(markedPorts(netList.instances[instConflict].circuit), [ 'buffer3.q', 'not3.q' ], 'the driving ports must be marked in the sub-circuit');
    }
    'smoke_conflict_component_marks: ok';
`;
const strip = (p) => JSON.parse(fs.readFileSync(path.resolve(__dirname, p), 'utf-8').replace(/^loadFiles\.push\(\s*(.+)\)\s*$/s, '$1'));
context.TESTS_JSON = strip('data/tests.stc');
context.NEST_JSON = strip('data/conflict-nesting.stc');
console.log(vm.runInContext(code, context));
