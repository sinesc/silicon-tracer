"use strict";

// Custom circuit represented as a component.
class CustomComponent extends Component {

    // Circuit UID for the circuit represented by this custom component.
    uid;

    // Simulation instance of the represented sub-circuit.
    #instance = null;

    constructor(x, y, rotation, uid) {
        assert.number(rotation);
        assert.string(uid);
        let circuit = app.circuits.byUID(uid) ?? {};
        super(x, y, circuit.ports ?? {}, circuit.label ?? '');
        this.rotation = rotation;
        this.uid = uid;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.rotation, this.uid ]},
        };
    }

    // Link custom component to a grid, enabling it to be rendered.
    link(grid) {
        let circuit = app.circuits.byUID(this.uid) ?? {};
        this.setPortsFromNames(circuit.ports);
        this.type = circuit.label;
        super.link(grid);
        this.element.classList.add('custom');
        this.setHoverMessage(this.inner, () => '<b>' + this.label + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>D</i>: Delete, ' + (app.sim ? '' : '<u>') + '<i>Q</i>:Switch to sub-circuit simulation' + (app.sim ? '' : '</u>'), { type: 'hover' });
    }

    // Set the simulation instance of the represented sub-circuit.
    set instance(value) {
        assert.number(value, true);
        if (this.element) {
            this.element.classList.toggle('simulated', value !== null);
        }
        this.#instance = value;
    }

    // Get the simulation instance of the represented sub-circuit.
    get instance() {
        return this.#instance;
    }

    // Detach custom component from simulation.
    detachSimulation() {
        super.detachSimulation();
        this.instance = null;
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        super.onHotkey(key, what);
        if (key === 'q' && what.type === 'hover') {
            // switch to subcomponent simulation instance
            let circuit = app.circuits.byUID(this.uid);
            if (app.sim && circuit) {
                let simulation = app.sim;
                simulation.instance = this.instance;
                this.grid.setCircuit(circuit);
                simulation.tickListener = circuit.attachSimulation(simulation.netList, simulation.instance);
            }
        }
    }

    // Generates default port outline for the given circuits component representation.
    static generateDefaultOutline(circuit) {
        // get ports from serialized circuit
        let ports = circuit.data.filter((i) => i instanceof Port);
        let outline = { 'left': [], 'right': [], 'top': [], 'bottom': [] };
        for (let item of ports) {
            // side of the component-port on port-components is opposite of where the port-component is facing
            let side = Component.SIDES[(item.rotation + 2) % 4];
            // keep track of position so we can arrange ports on component by position in schematic
            let sort = side === 'left' || side === 'right' ? item.y : item.x;
            outline[side].push([ sort, item.name ]);
        }
        let height = Math.nearestOdd(Math.max(1, outline.left.length, outline.right.length));
        let width = Math.nearestOdd(Math.max(1, outline.top.length, outline.bottom.length));
        // arrange ports nicely
        for (let side of Object.keys(outline)) {
            // sort by position
            outline[side].sort(([a,], [b,]) => a - b);
            outline[side] = outline[side].map(([sort, label]) => label);
            // insert spacers for symmetry
            let length = side === 'left' || side === 'right' ? height : width;
            let available = length - outline[side].length;
            let insertEdges = (new Array(Math.floor(available / 2))).fill(null);
            let insertCenter = available % 2 ? [ null ] : [];
            outline[side] = [ ...insertEdges, ...outline[side], ...insertEdges ];
            outline[side].splice(outline[side].length / 2, 0, ...insertCenter);
        }
        // reverse left/bottom due to the way we enumerate ports for easier rotation
        outline['left'].reverse();
        outline['bottom'].reverse();
        return outline;
    }
}