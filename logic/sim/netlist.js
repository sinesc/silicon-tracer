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
            for (let [ , , netWire ] of net.wires) {
                if (netWire === wire) {
                    return index;
                }
            }
        }
    }

    // Creates a netlist from wires and ports. Both wires and ports will be emptied during this process.
    static fromWires(wires, ports) {
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
                        if (NetList.#endsIntersect(prevFoundWires[p], wires[w])) {
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
                    if (ports[p].point.onLine(netWires[w])) {
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
        return new NetList(nets, unconnectedWires, ports);
    }

    static #endsIntersect(a, b) {
        return a[0].onLine(b) || a[1].onLine(b) || b[0].onLine(a) || b[1].onLine(a);
    }
}

// A port connected to a net.
class NetPort {
    point;
    uniqueName;
    component;
    constructor(point, prefix, portName, component) {
        this.point = point;
        this.uniqueName = prefix + portName;
        this.component = component;
    }
    static prefix(id) {
        return 'c' + id + ':';
    }
    get name() {
        return this.uniqueName.split(':')[1];
    }
    get prefix() {
        return this.uniqueName.split(':')[0];
    }
}
