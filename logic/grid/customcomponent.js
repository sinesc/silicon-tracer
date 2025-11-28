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
        this.setHoverMessage(this.inner, () => '<b>' + this.label + '</b>. <i>LMB</i>: Drag to move, <i>R</i>: Rotate, <i>DEL</i>: Delete, <i>E</i>: Edit, <i>W</i>:Switch to sub-circuit' + (app.sim ? ' simulation' : ''), { type: 'hover' });
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
        if (key === 'w' && what.type === 'hover') {
            let circuit = app.circuits.byUID(this.uid);
            if (circuit) {
                if (app.sim) {
                    // switch to subcomponent simulation instance
                    let simulation = app.sim;
                    simulation.instance = this.instance;
                    this.grid.setCircuit(circuit);
                    simulation.tickListener = circuit.attachSimulation(simulation.netList, simulation.instance);
                } else {
                    // switch to another component, optionally start simulation for that one
                    app.circuits.select(this.uid);
                    if (app.config.autoCompile) {
                        app.startSimulation();
                    }
                }
            }
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        let circuit = app.circuits.byUID(this.uid) ?? {};
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
        }
    }
}