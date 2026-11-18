// Ad-hoc smoke test: Simulation.resolveNetDriversByNet() and Circuit.markDrivers mark output ports currently
// driving their net (Hi-Z outputs and pull resistors excluded, conflicted nets use the conflict marks instead),
// including descend path ports of CustomComponents whose sub-circuit contains the driver.
// Run with: node test/smoke_net_driver_marks.js
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
    const compile = (app, circuit, checkNetConflicts) => {
        const netList = NetList.identify(circuit, app.circuits.all);
        const [ engine ] = netList.compileSimulation(null, {
            backend: 'js', checkNetConflicts, breakOnConflict: false, breakConditions: [], targetTPS: 10000, debug: false,
        });
        return [ netList, engine ];
    };
    // mirrors Simulations.Simulation.updateMarks() in single-step mode (conflict marks only when checkNetConflicts)
    const mark = (netList, instanceId, engine, checkNetConflicts) => {
        for (const instance of netList.instances) {
            instance.circuit.clearNetConflicts();
            instance.circuit.clearNetDrivers();
        }
        const circuit = netList.instances[instanceId].circuit;
        if (checkNetConflicts) circuit.markNetConflicts(netList, instanceId, engine.resolveNetConflictDriversByNet());
        circuit.markDrivers(netList, instanceId, engine.resolveNetDriversByNet());
    };
    const portMarks = (circuit, field) => {
        const result = [];
        for (const item of circuit.items) {
            for (const port of (item.ports ?? [])) {
                if (port[field]) result.push(item.gid + '.' + port.name);
            }
        }
        return result.sort();
    };
    const netIdOfItem = (netList, instanceId, item, portName) => {
        const net = netList.nets.find((net) => net.ports.some((p) => p.instanceId === instanceId && p.gid === item.gid && p.name === portName));
        assert(net !== undefined, 'no net for ' + item.gid + '.' + portName);
        return net.netId;
    };
    const expect = (actual, expected, message) => {
        const e = expected.slice().sort();
        if (actual.join(',') !== e.join(',')) throw new Error(message + ' (expected [' + e + '], got [' + actual + '])');
    };

    // Outer: button a -> InnerConflict.a (enables buffer3), button b -> InnerConflict.b (enables not3), both buffers drive the
    // shared InnerConflict.q output net (also connected to InnerOk.a); InnerOk's not gate always drives InnerOk.q output net.
    {
        const app = load(NEST_JSON);
        const outer = app.circuits.byLabel('Outer');
        const inner = app.circuits.byLabel('InnerConflict');
        const [ netList, engine ] = compile(app, outer, true);
        const instConflict = netList.instances.findIndex((i) => i.circuit.label === 'InnerConflict');
        const ccConflict = outer.items.filter((i) => i instanceof CustomComponent && i.type === 'InnerConflict').toArray()[0];
        const ccOk = outer.items.filter((i) => i instanceof CustomComponent && i.type === 'InnerOk').toArray()[0];
        const buttons = outer.items.filter((i) => i instanceof Button).toArray().sort((a, b) => a.y - b.y);
        const [ btnA, btnB ] = buttons; // btnA (y=210) drives the buffer3 enable, btnB the not3 enable
        const buffer3 = inner.items.filter((i) => i instanceof Builtin && i.type === 'buffer3').toArray()[0];
        const setButton = (item, value) => engine.setConstValue(netList.instances[0].simIds[item.gid], value);
        const outNetId = netIdOfItem(netList, instConflict, buffer3, 'q');

        // exactly one tri-state driver on the output net -> driver mark, no conflict
        setButton(btnA, 1);
        setButton(btnB, 0);
        engine.simulate(5);
        assert(engine.resolveNetConflictDriversByNet().size === 0, 'expected no conflict with a single driver');
        const drivers = engine.resolveNetDriversByNet();
        expect(Array.from(drivers.get(outNetId) ?? []), [ 'q@' + buffer3.gid + '@' + instConflict + '_0' ], 'expected buffer3 to be the only driver of the InnerConflict output net');
        assert(engine.resolveNetDrivers().size > 0, 'expected non-empty flat driver set');
        mark(netList, 0, engine, true);
        expect(portMarks(outer, 'netDriver'), [ btnA.gid + '.q', btnB.gid + '.q', ccConflict.gid + '.q', ccOk.gid + '.q' ], 'driver buttons and sub-circuit path ports of Outer must be marked');
        expect(portMarks(outer, 'conflictDriver'), [], 'no conflict marks expected with a single driver');

        // both tri-state buffers enabled -> the output net conflicts, driver highlight gives way to the conflict outline
        setButton(btnB, 1);
        engine.simulate(5);
        assert(engine.resolveNetConflictDriversByNet().has(outNetId), 'expected a conflict on the InnerConflict output net');
        assert(!engine.resolveNetDriversByNet().has(outNetId), 'conflicted net must not appear in the driver map');
        mark(netList, 0, engine, true);
        expect(portMarks(outer, 'netDriver'), [ btnA.gid + '.q', btnB.gid + '.q', ccOk.gid + '.q' ], 'path port InnerConflict.q must lose the driver mark on conflict');
        expect(portMarks(outer, 'conflictDriver'), [ ccConflict.gid + '.q' ], 'conflict path port must be marked instead (takes precedence)');

        // inside the sub-circuit instance: only the driving buffer port is marked, the high-impedance one is not
        setButton(btnB, 0);
        engine.simulate(5);
        mark(netList, instConflict, engine, true);
        expect(portMarks(netList.instances[instConflict].circuit, 'netDriver'), [ buffer3.gid + '.q' ], 'only the driving buffer3 port must be marked in the sub-circuit');
        expect(portMarks(netList.instances[instConflict].circuit, 'conflictDriver'), [], 'no conflict marks inside the sub-circuit');

        // no driver at all (both buffers high-impedance): the net is not in the driver map and nothing is marked in it
        setButton(btnA, 0);
        engine.simulate(5);
        assert(!engine.resolveNetDriversByNet().has(outNetId), 'undriven net must not appear in the driver map');
        mark(netList, instConflict, engine, true);
        expect(portMarks(netList.instances[instConflict].circuit, 'netDriver'), [], 'no driver marks without a driver');
    }

    // compiled without net conflict checking: a conflicting net is reported as normally driven (both buffers appear as drivers)
    {
        const app = load(NEST_JSON);
        const outer = app.circuits.byLabel('Outer');
        const inner = app.circuits.byLabel('InnerConflict');
        const [ netList, engine ] = compile(app, outer, false);
        const instConflict = netList.instances.findIndex((i) => i.circuit.label === 'InnerConflict');
        const ccConflict = outer.items.filter((i) => i instanceof CustomComponent && i.type === 'InnerConflict').toArray()[0];
        const ccOk = outer.items.filter((i) => i instanceof CustomComponent && i.type === 'InnerOk').toArray()[0];
        const buttons = outer.items.filter((i) => i instanceof Button).toArray().sort((a, b) => a.y - b.y);
        const not3 = inner.items.filter((i) => i instanceof Builtin && i.type === 'not3').toArray()[0];
        const buffer3 = inner.items.filter((i) => i instanceof Builtin && i.type === 'buffer3').toArray()[0];
        for (const btn of buttons) engine.setConstValue(netList.instances[0].simIds[btn.gid], 1);
        engine.simulate(5);
        const outNetId = netIdOfItem(netList, instConflict, buffer3, 'q');
        expect(Array.from(engine.resolveNetDriversByNet().get(outNetId) ?? []).sort(),
            [ 'q@' + buffer3.gid + '@' + instConflict + '_0', 'q@' + not3.gid + '@' + instConflict + '_0' ],
            'both buffers must be reported as drivers when conflicts are not compiled');
        mark(netList, 0, engine, false);
        expect(portMarks(outer, 'conflictDriver'), [], 'no conflict marks without conflict checking');
        expect(portMarks(outer, 'netDriver'), [ buttons[0].gid + '.q', buttons[1].gid + '.q', ccOk.gid + '.q', ccConflict.gid + '.q' ], 'path port must stay marked with both buffers driving');
    }
    'smoke_net_driver_marks: ok';
`;
const strip = (p) => JSON.parse(fs.readFileSync(path.resolve(__dirname, p), 'utf-8').replace(/^loadFiles\.push\(\s*(.+)\)\s*$/s, '$1'));
context.NEST_JSON = strip('data/conflict-nesting.stc');
console.log(vm.runInContext(code, context));
