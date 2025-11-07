"use strict";

// Net identification
class NetList {
    nets;
    unconnected;

    // Construct a new netlist.
    constructor(nets, unconnectedWires, unconnectedPorts) {
        this.nets = nets;
        this.unconnected = { wires: unconnectedWires, ports: unconnectedPorts };
    }

    // Returns the netId of the given wire.
    findWire(wire) {
        for (let [ index, net ] of this.nets.entries()) {
            for (let netWire of net.wires) {
                if (netWire.gid === wire.gid) {
                    return index;
                }
            }
        }
    }

    // Creates a netlist from NetWires and NetPorts. Both wires and ports will be emptied during this process.
    static fromWires(wires, ports, map) {
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
                nets.push({ wires: netWires, ports: foundPorts });
            } else {
                unconnectedWires.push(...netWires);
            }
        }
        return new NetList(nets, unconnectedWires, ports, map);
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
    constructor(point, name, gid) {
        assert.class(Point, point);
        assert.string(name);
        assert.string(gid);
        this.point = point;
        this.name = name;
        this.gid = gid;
    }
    get uniqueName() {
        return this.name + '@' + this.gid;
    }
}

// A wire in a net.
class NetWire {
    points;
    gid;
    constructor(points, gid) {
        assert.array(points);
        assert.string(gid);
        this.points = points;
        this.gid = gid;
    }
}
