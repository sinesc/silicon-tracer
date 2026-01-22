"use strict";

// Net identification
class NetList {
    nets;
    unconnected;
    instances;

    // Construct a new netlist.
    constructor(nets, unconnectedWires, unconnectedPorts, instances) {
        assert.array(nets);
        assert.array(unconnectedWires);
        assert.array(unconnectedPorts);
        assert.array(instances);
        this.nets = nets;
        this.unconnected = { wires: unconnectedWires, ports: unconnectedPorts };
        this.instances = instances;
    }

    // Identifies nets in the given circuit and returns a netlist, recursively if a uid=>circuit map of circuits is provided
    static identify(circuit, circuits = null) {
        assert.class(Circuits.Circuit, circuit);
        assert.object(circuits, true);
        const instances = NetList.#buildInstanceTree(circuit, circuits);
        const nets = [];
        for (const instance of instances) {
            let port;
            while (port = instance.netItems.ports.pop()) {
                const net = NetList.#assembleNet(port, instance.netItems.wires, instance.netItems.ports, instances, circuits !== null);
                nets.push(net);
            }
        }
        let unconnectedWires = []; // TODO possibly move out of here to keep this code simple
        let unconnectedPorts = [];
        return new NetList(nets, unconnectedWires, unconnectedPorts, instances);
    }

    // Returns a port suffix for the given gid and instance.
    static suffix(gid, instanceId) {
        return '@' + gid + '@' + instanceId;
    }

    // Compiles a simulation and returns it.
    compileSimulation(rawMem, config) {
        assert.object(rawMem, true, (o) => {
            assert.class(Uint8Array, o.mem8);
            assert.class(Int32Array, o.mem32);
        });
        assert.object(config, false, (o) => {
            assert.bool(o.checkNetConflicts);
            assert.integer(o.targetTPS);
            assert.bool(o.debugCompileComments);
        });
        const sim = new Simulation(config.debugCompileComments, config.checkNetConflicts);
        // declare items
        for (const [instanceId, { circuit, simIds }] of this.instances.entries()) {
            for (const component of circuit.items.filter((i) => !(i instanceof Wire))) {
                const suffix = NetList.suffix(component.gid, instanceId);
                if (this.#isConnected(component, suffix)) {
                    simIds[component.gid] = component.declare(sim, config, suffix);
                }
            }
        }
        // declare nets
        for (const net of this.nets) {
            // create new net from connected gate i/o-ports
            const debugPortComponents = net.ports.filter((p) => this.instances[p.instanceId].circuit.itemByGID(p.gid) instanceof Port).map((p) => p.uniqueName);
            const attachedPorts = net.ports.filter((p) => { const c = this.instances[p.instanceId].circuit.itemByGID(p.gid); return (c instanceof Component) && !(c instanceof CustomComponent) && !(c instanceof Splitter); }).map((p) => p.uniqueName);
            net.netId = sim.declareNet(attachedPorts, debugPortComponents);
        }
        // compile
        sim.compile(rawMem);
        return sim;
    }

    // Returns a string representation of this netlist. Used to compare netlists and check if nets changed.
    toString() {
        // FIXME: this needs to be ordered. internally order not stable and irrelevant but unordered output can't easily be compared for changes.
        return JSON.stringify(this.nets);
    }

    // Returns the netId of the given wire.
    findWire(wire) {
        assert.class(Wire, wire);
        for (const [ index, net ] of this.nets.entries()) {
            for (const netWire of net.wires) {
                if (netWire.gid === wire.gid) {
                    return index;
                }
            }
        }
    }

    // Returns the netId of the given port or null.
    findPort(port) {
        assert.class(Port, port);
        for (const [ index, net ] of this.nets.entries()) {
            for (const netPort of net.ports) {
                if (netPort.gid === port.gid) {
                    return index;
                }
            }
        }
        return null;
    }

    // Returns whether the given component is connected to a net with at least one port.
    #isConnected(component, suffix) {
        let connected = false;
        for (const port of component.ports) {
            const uniqueName = port.name + suffix;
            if (!this.unconnected.ports.find((p) => p.uniqueName === uniqueName)) {
                connected = true;
                break;
            }
        }
        return connected;
    }

    // Creates a tree of nested component instances within the given circuit.
    static #buildInstanceTree(circuit, circuits, gid, instances = [], parentInstanceId = null) {
        const instanceId = instances.length;
        const subInstances = { }; // maps CustomComponent gids in each instance to their sub-instance
        const netItems = circuit.netItems(instanceId);
        instances.push({ circuit, netItems, gid, subInstances, parentInstanceId, simIds: {} });
        if (circuits) {
            for (const component of circuit.items.filter((i) => i instanceof CustomComponent)) {
                const subCircuit = circuits[component.uid];
                assert.class(Circuits.Circuit, subCircuit);
                subInstances[component.gid] = instances.length; // the id of the upcoming recursion, clunky
                NetList.#buildInstanceTree(subCircuit, circuits, component.gid, instances, instanceId);
            }
        }
        return instances;
    }

    // Finds wires and ports attached to given port. Removes found ports/wires from remainingPorts/Wires
    static #assembleNet(port, remainingWires, remainingPorts, instances, recurse) {
        // find single wire attached to port
        const wire = NetList.#findWireOnPort(port, remainingWires);
        // find more wires connected to initially found wire (result includes initial wire)
        const wires = wire === null ? [] : NetList.#findConnectedWires(wire, remainingWires);
        // find all ports on the wires and return along with initial port
        const ports = wire === null ? [] : NetList.#findPortsOnWires(wires, remainingPorts);
        ports.push(port);
        // traverse subcomponents
        if (recurse) {
            for (const netPort of ports) {
                if (netPort.type === 'descend' || netPort.type === 'ascend') {
                    const subNet = NetList.#recurseNet(netPort, instances);
                    ports.push(...subNet.ports);
                    wires.push(...subNet.wires);
                }
            }
        }
        return { wires, ports };
    }

    // Follow wires attached to port in and out of subcomponents to trace out the entire net.
    static #recurseNet(port, instances) {
        let matchingPort;
        let instance;
        if (port.type === 'descend') {
            // this is a port on the outside of a component, descend into the component
            const instanceId = instances[port.instanceId].subInstances[port.gid];
            instance = instances[instanceId];
            matchingPort = instance.netItems.ports.swapRemoveWith((p) => p.type === 'ascend' && p.compareName === port.compareName);
        } else if (port.type === 'ascend') {
            // this is a port inside a component, ascend to parent component
            const gid = instances[port.instanceId].gid;
            const instanceId = instances[port.instanceId].parentInstanceId;
            if (instanceId === null) {
                // we reached the root, ports here lead nowhere
                return { wires: [], ports: [] };
            }
            instance = instances[instanceId];
            matchingPort = instance.netItems.ports.swapRemoveWith((p) => p.type === 'descend' && p.gid === gid && p.compareName === port.compareName);
        }
        if (matchingPort === undefined) {
            // port already visited
            return { wires: [], ports: [] };
        }
        return NetList.#assembleNet(matchingPort, instance.netItems.wires, instance.netItems.ports, instances, true);
    }

    // Find wires connected to the given wire and returns them and the initial wire. Removes found wires from remainingWires.
    static #findConnectedWires(wire, remainingWires) {
        const netWires = [];
        let prevFoundWires = [ wire ];
        let foundWires;
        // each do-while iteration, check only the wires found in the previous iteration for more intersections (essentially flattened recursion)
        do {
            foundWires = [];
            for (let p = 0; p < prevFoundWires.length; ++p) {
                for (let w = remainingWires.length - 1; w >= 0; --w) {
                    if (NetList.#endsIntersect(prevFoundWires[p].points, remainingWires[w].points)) {
                        foundWires.push(remainingWires[w]);
                        remainingWires.swapRemove(w);
                         // TODO should be more efficient to now retry this index again after swap because the swapped in wire might also be connected
                    }
                }
            }
            netWires.push(...prevFoundWires);
            prevFoundWires = foundWires;
        } while (foundWires.length > 0);
        return netWires;
    }

    // Finds a wire attached to a port. Removes found wire from remainingWires. (Further wires can be found using findConnectedWires on the wire).
    static #findWireOnPort(port, remainingWires) {
        for (let w = 0; w < remainingWires.length; ++w) {
            if (port.point.onLine(remainingWires[w].points)) {
                return remainingWires.swapRemove(w);
            }
        }
        return null;
    }

    // Find ports connected to the given list of wires. Removes found ports from remainingPorts.
    static #findPortsOnWires(wires, remainingPorts) {
        const netPorts = [];
        for (let w = 0; w < wires.length; ++w) {
            for (let p = remainingPorts.length - 1; p >= 0; --p) {
                if (remainingPorts[p].point.onLine(wires[w].points)) {
                    netPorts.push(remainingPorts[p]);
                    remainingPorts.swapRemove(p);
                    // TODO should be more efficient to now retry this index again after swap because the swapped in port might also be connected
                }
            }
        }
        return netPorts;
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
    compareName;
    gid;
    instanceId;
    type;
    uid;
    constructor(point, type, name, compareName, gid, instanceId, uid) {
        assert.class(Point, point);
        assert.enum([ 'ascend', 'descend', 'n-to-1', '1-to-n' ], type, true);
        assert.string(name);
        assert.string(compareName); // TODO: add a random port id (like a gid)
        assert.string(gid);
        assert.integer(instanceId);
        assert.string(uid, true);
        this.point = point;
        this.name = name;
        this.compareName = compareName;
        this.gid = gid;
        this.instanceId = instanceId;
        this.type = type;
        this.uid = uid;
    }
    get uniqueName() {
        return this.name + NetList.suffix(this.gid, this.instanceId);
    }
}

// A wire in a net.
NetList.NetWire = class {
    points;
    gid;
    instanceId;
    constructor(points, gid, instanceId) {
        assert.array(points, false, (i) => assert.class(Point, i));
        assert.string(gid);
        assert.integer(instanceId);
        this.points = points;
        this.gid = gid;
        this.instanceId = instanceId;
    }
}
