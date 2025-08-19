// Net identification
class NetList {
    nets;

    // Construct a new netlist.
    constructor(nets) {
        this.nets = nets;
    }

    // Creates a netlist from wires.
    static fromWires(wires, pins) {

        let nets = [];

        while (wires.length > 0) {
            let prevFoundWires = [ wires.pop() ];
            let newNet = [];
            let foundWires;
            // each iteration, check only the wires found in the previous iteration for more intersections
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
                newNet.push(...prevFoundWires);
                prevFoundWires = foundWires;
            } while (foundWires.length > 0);
            nets.push(newNet);
        }

        return new NetList(nets);
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
    // Nets contained in the circuit. // TODO: or lines? need wire coords, not just nets
    nets;
    // Other circuits contained in this circuit.
    circuits;

    // or maybe just
    items; // contains wires+circuits and nets are computed on demand

    // Constructs a new circuit with the given name and ports. Name must be unique
    constructor(name, ports) {
        this.name = name;
        this.ports = { left: [], right: [], top: [], bottom: [], ...ports };
    }
    // Drops this circuit as a component onto the grid.
    createComponent(grid, x, y) {
        let component = new Component(grid, this.name, x, y, /*Math.floor(Math.random() * 4)*/0, this);
        return component;
    }
    // Creates the circuit on the given grid. Normally the grid should be cleared first.
    createSchematic(grid) {
        // TODO: how to recreate connections from here? nets need connections then
    }
}

class Gate {
    type;
    constructor(type) {
        this.type = type;
    }
}