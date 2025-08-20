// Net identification
class NetList {
    nets;
    unconnected;

    // Construct a new netlist.
    constructor(nets, unconnectedWires, unconnectedPorts) {
        this.nets = nets;
        this.unconnected = { wires: unconnectedWires, ports: unconnectedPorts };
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
                    if (NetList.#pointOnLine(ports[p][0], netWires[w])) {
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
        return NetList.#pointOnLine(a[0], b) || NetList.#pointOnLine(a[1], b) || NetList.#pointOnLine(b[0], a) || NetList.#pointOnLine(b[1], a);
    }

    static #pointOnLine(p, wire) {
        let [ w1, w2 ] = wire;
        if (w1.x === w2.x && w1.x === p.x) {
            if (w1.y > w2.y) {
                [ w2, w1 ] = [ w1, w2 ];
            }
            return w1.y <= p.y && w2.y >= p.y;
        } else if (w1.y === w2.y && w1.y === p.y) {
            if (w1.x > w2.x) {
                [ w2, w1 ] = [ w1, w2 ];
            }
            return w1.x <= p.x && w2.x >= p.x;
        } else {
            return false;
        }
    }
}


// A circuit is either a basic gate definition or a schematic for a component.
class Circuit {
    // External connections of this circuit.
    ports;
    // Name of this circuit.
    name;
    // Items in this circuit (wires, components)
    items;

    // Constructs a new circuit with the given name and ports. Name must be unique
    constructor(name, ports) {
        this.name = name;
        this.ports = { left: [], right: [], top: [], bottom: [], ...ports };
    }

    // Drops this circuit as a component onto the grid.
    createComponent(grid, x, y) {
        let component = new Component(grid, this.name, x, y, 0, this);
        return component;
    }

    // Creates the circuit on the given grid. Normally the grid should be cleared first.
    createSchematic(grid) {
        // TODO: how to recreate connections from here? nets need connections then
    }

    // Creates a circuit from the components on the given grid.
    static fromGrid(grid) {

    }
}