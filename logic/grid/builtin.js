"use strict";

// Basic gate-like builtin component.
class Builtin extends Component {

    inputs;
    output;

    constructor(x, y, type) {

        // override inputs if gate requires it
        const inputs = Simulation.BUILTIN_MAP[type].inputs;
        const numInputs = inputs.length;
        const output = Simulation.BUILTIN_MAP[type].output;

        // compute blank spots for symmetry
        let blankAfter = -1;
        let numSlots = numInputs;

        if (numInputs % 2 === 0) {
            blankAfter = numInputs / 2 - 1;
            numSlots += 1;
        }

        const outputAt = (numSlots - 1) / 2;

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
        for (let i = 0; i < numSlots; ++i) {
            right.push(i === outputAt ? output : null);
        }

        super(x, y, { 'left': left, 'right': right }, type);

        this.inputs = inputs;
        this.output = output;
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
        this.setHoverMessage(this.inner, '<b>' + this.label + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>D</i>: Delete', { type: 'hover' });
    }
}