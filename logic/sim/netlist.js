"use strict";

// Net identification
class NetList {
    nets;
    unconnected;
    circuits;

    // Construct a new netlist.
    constructor(nets, unconnectedWires, unconnectedPorts) {
        this.nets = nets;
        this.unconnected = { wires: unconnectedWires, ports: unconnectedPorts };
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

    // Returns the netId of the given port.
    findPort(port) {
        assert.class(Port, port);
        for (let [ index, net ] of this.nets.entries()) {
            if (net !== null) { // some nets get set to null during identifyNets recursion // TODO: maybe refactor that, but might just be too inconvenient
                for (let netPort of net.ports) {
                    if (netPort.gid === port.gid) {
                        return index;
                    }
                }
            }
        }
    }

    // Creates a netlist from NetWires and NetPorts. Both wires and ports will be emptied during this process.
    static fromWires(wires, ports) {
        assert.array(wires, false, (i) => assert.class(NetWire, i));
        assert.array(ports, false, (i) => assert.class(NetPort, i));
        let nets = [];
        let unconnectedWires = [];
        while (wires.length > 0) {
            let prevFoundWires = [ wires.pop() ];
            let netWires = [];
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
        return new NetList(nets, unconnectedWires, ports);
    }

    static #endsIntersect(a, b) {
        return a[0].onLine(b) || a[1].onLine(b) || b[0].onLine(a) || b[1].onLine(a);
    }
}

// A port connected to a net.
class NetPort {
    point;
    name;
    gid;
    instance;
    subnet;
    constructor(point, name, gid, instance, subnet) {
        assert.class(Point, point);
        assert.string(name);
        assert.string(gid);
        assert.number(instance);
        assert.object(subnet, true);
        this.point = point;
        this.name = name;
        this.gid = gid;
        this.instance = instance;
        this.subnet = subnet;
    }
    get uniqueName() {
        return this.name + '@' + this.gid; // TODO: include instance
    }
}

// A wire in a net.
class NetWire {
    points;
    gid;
    constructor(points, gid) {
        assert.array(points, false, (i) => assert.class(Point, i));
        assert.string(gid);
        this.points = points;
        this.gid = gid;
    }
}
