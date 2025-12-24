"use strict";

// Custom circuit represented as a component.
class CustomComponent extends Component {

    static EDIT_DIALOG = [
        //{ name: 'label', label: 'Component label', type: 'string' },
        ...Component.EDIT_DIALOG,
    ];

    // Circuit UID for the circuit represented by this custom component.
    uid;

    // Simulation instance of the represented sub-circuit.
    #instance = null;

    constructor(app, x, y, rotation, uid) {
        assert.integer(rotation);
        assert.string(uid);
        let circuit = app.circuits.byUID(uid) ?? {};
        super(app, x, y, circuit.ports ?? {}, circuit.label ?? '');
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
        let circuit = this.app.circuits.byUID(this.uid) ?? {};
        this.setPortsFromNames(circuit.ports);
        this.type = circuit.label;
        super.link(grid);
        this.element.classList.add('custom');
        this.setHoverMessage(this.inner, () => '<b>' + this.label + '</b>. <i>LMB</i>: Drag to move, <i>R</i>: Rotate, <i>DEL</i>: Delete, <i>E</i>: Edit, <i>SHIFT/CTRL+LMB</i>: Click to select/deselect, <i>W</i>:Switch to sub-circuit' + (this.app.simulations.current ? ' simulation' : ''), { type: 'hover' });
    }

    // Set the simulation instance of the represented sub-circuit.
    set instance(value) {
        assert.integer(value, true);
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
        if (super.onHotkey(key, what)) {
            return true;
        } else if (key === 'w' && what.type === 'hover') {
            const sim = this.app.simulations.current;
            if (sim && this.instance !== null) {
                // switch to subcomponent simulation instance
                sim.reattach(this.instance);
            } else {
                // switch to another component, optionally start simulation for that one
                this.app.circuits.select(this.uid);
                const circuit = this.app.circuits.byUID(this.uid);
                this.app.simulations.select(circuit, this.app.config.autoCompile);
            }
            return true;
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        let circuit = this.app.circuits.byUID(this.uid) ?? {};
        const result = await dialog("Configure custom component", CustomComponent.EDIT_DIALOG, { /*label: this.label || circuit.label,*/ rotation: this.rotation });
        if (result) {
            //const grid = this.grid;
            //this.unlink();
            //circuit.gapPosition = result.gapPosition;
            //circuit.label = result.label;
            //circuit.generateOutline();
            //this.link(grid);
            this.rotation = result.rotation;
            //this.type = result.label;
            this.redraw();
        }
    }
}