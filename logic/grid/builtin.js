"use strict";

// Basic gate-like builtin component.
class Builtin extends Component {

    type;
    inputs = [];
    output;

    constructor(grid, x, y, type) {

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

        const name = type.toUpperFirst();
        super(grid, x, y, { 'left': left, 'right': right }, name);

        if (this.grid) {
            this.element.classList.add('builtin');
            this.inputs = inputs;
            this.output = output;
            this.type = type;
            this.setHoverMessage(this.inner, '<b>' + name + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>D</i>: Delete', { type: 'hover' });
        }
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.type ]},
        };
    }
}