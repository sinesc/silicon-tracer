"use strict";

// Basic gate-like builtin component.
class Builtin extends Component {

    static EDIT_DIALOG = [
        ...Component.EDIT_DIALOG,
    ];

    inputs;
    outputs;
    gates;

    constructor(app, x, y, type) {

        // override inputs if gate requires it
        const inputs = Simulation.BUILTIN_MAP[type].inputs;
        const numInputs = inputs.length;
        const outputs = Object.keys(Simulation.BUILTIN_MAP[type].outputs);
        const numOutputs = outputs.length;

        // compute blank spots for symmetry
        let blankAfter = -1;
        let numSlots = numInputs;

        if (numInputs % 2 === 0) {
            blankAfter = numInputs / 2 - 1;
            numSlots += 1;
        }

        // inputs
        const left = [];
        for (let i = 0; i < numInputs; ++i) {
            left.push(inputs[i]);
            if (i === blankAfter) {
                left.push(null);
            }
        }

        // output
        const right = [];
        if (numOutputs === 1) {
            const outputAt = (numSlots - 1) / 2;
            for (let i = 0; i < numSlots; ++i) {
                right.push(i === outputAt ? outputs[0] : null);
            }
        } else {
            for (let i = 0; i < numOutputs; ++i) {
                right.push(outputs[i]);
                if (i === blankAfter) {
                    right.push(null);
                }
            }
        }

        super(app, x, y, { 'left': left, 'right': right }, type);

        this.inputs = inputs;
        this.outputs = outputs;
        this.gates = Simulation.BUILTIN_MAP[type].statsGates;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.type ]},
        };
    }

    // Link component to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.element.classList.add('builtin');
        this.setHoverMessage(this.inner, '<b>' + this.label + '</b>. <i>LMB</i>: Drag to move, <i>R</i>: Rotate, <i>DEL</i>: Delete, <i>E</i>: Edit, <i>SHIFT/CTRL+LMB</i>: Click to select/deselect', { type: 'hover' });
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog(`Configure ${this.label}`, Builtin.EDIT_DIALOG, { rotation: this.rotation });
        if (config) {
            this.rotation = config.rotation;
            this.redraw();
        }
    }
}