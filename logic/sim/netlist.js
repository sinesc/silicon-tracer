"use strict";

// Net identification
class NetList {
    nets;
    unconnected;
    instances;

    // Construct a new netlist.
    constructor(nets, unconnectedWires, unconnectedPorts) {
        this.nets = nets;
        this.unconnected = { wires: unconnectedWires, ports: unconnectedPorts };
    }

    // Identifies nets in the given circuit and returns a netlist.
    static identify(circuit, recurse) {
        assert.class(Circuits.Circuit, circuit);
        assert.bool(recurse);
        return NetList.#identifyNets(circuit, recurse, []);
    }

    // Compiles a simulation and returns it.
    compileSimulation() {
        let sim = new Simulation();
        // declare gates from component map
        for (const [instance, { circuit }] of this.instances.entries()) {
            for (let component of circuit.data.filter((i) => !(i instanceof Wire))) {
                let suffix = '@' + component.gid + '@' + instance;
                if (component instanceof Gate) { // TODO: exclude unconnected gates via netList.unconnected.ports when all gate ports are listed as unconnected
                    sim.declareGate(component.type, component.inputs, component.output, suffix);
                } else if (component instanceof Builtin) {
                    sim.declareBuiltin(component.type, suffix);
                } else if (component instanceof Clock) {
                    sim.declareClock(component.frequency, app.config.targetTPS, true, suffix);
                }
            }
        }
        // declare nets
        for (let net of this.nets) {
            // create new net from connected gate i/o-ports
            let interactiveComponents = net.ports.filter((p) => this.instances[p.instance].circuit.itemByGID(p.gid) instanceof Interactive);
            let attachedPorts = net.ports.filter((p) => { const c = this.instances[p.instance].circuit.itemByGID(p.gid); return c instanceof Gate || c instanceof Builtin || c instanceof Clock; }).map((p) => p.uniqueName);
            net.netId = sim.declareNet(attachedPorts, interactiveComponents.map((p) => p.uniqueName));
        }
        // compile
        sim.compile();
        return sim;
    }

    // Returns the netId of the given wire.
    findWire(wire) {
        assert.class(Wire, wire);
        for (let [ index, net ] of this.nets.entries()) {
            for (let netWire of net.wires) {
                if (netWire.gid === wire.gid) {
                    return index;
                }
            }
        }
    }

    // Returns the netId of the given port or null.
    findPort(port) {
        assert.class(Port, port);
        for (let [ index, net ] of this.nets.entries()) {
            for (let netPort of net.ports) {
                if (netPort.gid === port.gid) {
                    return index;
                }
            }
        }
        return null;
    }

    // Identifies nets on the grid and returns a [ NetList, Map<String, Grid-less-Component> ].
    static #identifyNets(circuit, recurse, instances = [], parentInstance = null) {
        const instance = instances.length;
        const subInstances = { }; // maps CustomComponent gids in each instance to their sub-instance
        instances.push({ circuit, subInstances, parentInstance });
        // get all individual wires
        const wires = circuit.data.filter((i) => i instanceof Wire && !i.limbo).map((w) => {
            return new NetList.NetWire([ new Point(w.x, w.y), new Point(w.x + w.width, w.y + w.height) ], w.gid, instance);
        });
        // get all component ports
        const components = circuit.data.filter((i) => !(i instanceof Wire));
        const ports = [];
        const appendNets = []; // nets that are internal to custom components and just need to be added to the overall list of nets
        for (const component of components) {
            const mergeNets = { }; // nets that connect to external ports and need to be merged with parent component nets
            // get custom component inner nets and identify which need to be merged with the parent component nets
            if (recurse && component instanceof CustomComponent) {
                const subCircuit = app.circuits.byUID(component.uid);
                subInstances[component.gid] = instances.length; // the id of the upcoming recursion, clunky
                if (component.getPorts().length === 0) {
                    // TODO: ports are currenly only available after a grid link because we can't immediately set during unserialize (subcircuit might not have been unserialized yet)
                    //  instead of this, run second pass after unserialize to set all customcomponent ports
                    component.setPortsFromNames(subCircuit.ports);
                }
                const subPorts = subCircuit.data.filter((i) => i instanceof Port);
                const subNetlist = NetList.#identifyNets(subCircuit, recurse, instances, instance);
                const mergedIds = [];
                for (const componentExternalPort of subPorts) {
                    const netId = subNetlist.findPort(componentExternalPort);
                    if (netId !== null) {
                        mergeNets[componentExternalPort.name] = subNetlist.nets[netId];
                        //subNetlist.nets.splice(netId, 1);
                        mergedIds.push(netId);
                    }
                }
                for (const [ id, net ] of pairs(subNetlist.nets)) {
                    if (!mergedIds.includes(id)) {
                        appendNets.push(net);
                    }
                }
                //appendNets.push(...subNetlist.nets);
            }
            for (const port of component.getPorts()) {
                const { x, y } = port.coords(component.width, component.height, component.rotation);
                ports.push(new NetList.NetPort(new Point(x + component.x, y + component.y), port.name, component.gid, instance, mergeNets[port.name] ?? null));
            }
        }
        let netList = NetList.#fromWires(wires, ports);
        netList.nets.push(...appendNets);
        netList.instances = instances;
        return netList;
    }

    // Creates a netlist from NetWires and NetPorts. Both wires and ports will be emptied during this process.
    static #fromWires(wires, ports) {
        const nets = [];
        const unconnectedWires = [];
        while (wires.length > 0) {
            let prevFoundWires = [ wires.pop() ];
            const netWires = [];
            let foundWires;
            // each do-while iteration, check only the wires found in the previous iteration for more intersections (essentially flattened recursion)
            do {
                foundWires = [];
                for (let p = 0; p < prevFoundWires.length; ++p) {
                    for (let w = wires.length - 1; w >= 0; --w) {
                        if (NetList.#endsIntersect(prevFoundWires[p].points, wires[w].points)) {
                            foundWires.push(wires[w]);
                            wires.swapRemove(w);
                        }
                    }
                }
                netWires.push(...prevFoundWires);
                prevFoundWires = foundWires;
            } while (foundWires.length > 0);
            // find ports on net
            let foundPorts = [];
            for (let w = 0; w < netWires.length; ++w) {
                for (let p = ports.length - 1; p >= 0; --p) {
                    if (ports[p].point.onLine(netWires[w].points)) {
                        foundPorts.push(ports[p]);
                        ports.swapRemove(p);
                    }
                }
            }
            if (foundPorts.length > 0) {
                for (const foundPort of foundPorts) {
                    if (foundPort.subnet) {
                        // merge subnets
                        netWires.push(...foundPort.subnet.wires);
                        foundPorts.push(...foundPort.subnet.ports);
                    }
                }
                nets.push({ wires: netWires, ports: foundPorts });
            } else {
                unconnectedWires.push(...netWires);
            }
        }
        for (let i = 0; i < 10; i++) { //FIXME: hack, run until nets no longer change

            // merge nets that have been directly connected inside a subnet (custom-component with two+ ports of its circuit directly connected)
            // TODO if ports were an object mapping uniqueName => port it would be a lot easier to do this
            current: for (let c = nets.length - 1; c >= 1; --c) { // current: backwards from last to 1
                target: for (let t = 0; t < c; ++t) { // target: forwards from 0 to current -1
                    const currentPorts = nets[c].ports;
                    const targetPorts = nets[t].ports;
                    let haveCommonPorts = false;
                    // check if current and target share at least one port
                    for (const port of currentPorts) {
                        if (targetPorts.some((p) => p.uniqueName === port.uniqueName)) {
                            haveCommonPorts = true;
                            break;
                        }
                    }
                    // merge ports that aren't already in the target
                    if (haveCommonPorts) {
                        const currentWires = nets[c].wires;
                        const targetWires = nets[t].wires;
                        for (const port of currentPorts) {
                            if (!targetPorts.some((p) => p.uniqueName === port.uniqueName)) {
                                targetPorts.push(port);
                            }
                        }
                        for (const wire of currentWires) {
                            if (!targetWires.some((w) => w.gid === wire.gid)) {
                                targetWires.push(wire);
                            }
                        }
                        // dissolve current net
                        nets.pop();
                        break current;
                    }
                }
            }

        }
        return new NetList(nets, unconnectedWires, ports);
    }

    // Returns whether line-endpoints of one line intersect any point on the other line.
    static #endsIntersect(a, b) {
        return a[0].onLine(b) || a[1].onLine(b) || b[0].onLine(a) || b[1].onLine(a);
    }
}

// A port connected to a net.
NetList.NetPort = class {
    point;
    name;
    gid;
    instance;
    subnet;
    constructor(point, name, gid, instance, subnet) {
        assert.class(Point, point);
        assert.string(name);
        assert.string(gid);
        assert.integer(instance);
        assert.object(subnet, true);
        this.point = point;
        this.name = name;
        this.gid = gid;
        this.instance = instance;
        this.subnet = subnet;
    }
    get uniqueName() {
        return this.name + '@' + this.gid + '@' + this.instance;
    }
}

// A wire in a net.
NetList.NetWire = class {
    points;
    gid;
    instance;
    constructor(points, gid, instance) {
        assert.array(points, false, (i) => assert.class(Point, i));
        assert.string(gid);
        assert.integer(instance);
        this.points = points;
        this.gid = gid;
        this.instance = instance;
    }
}
