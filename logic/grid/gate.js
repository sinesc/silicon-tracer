"use strict";

// Basic logic gate component.
class Gate extends Component {

    static START_LETTER = 97; // 65 for capitalized

    type;
    inputs = [];
    output;

    constructor(grid, x, y, type, numInputs) {

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
        const inputs = [];
        for (let i = 0; i < numInputs; ++i) {
            let letter = String.fromCharCode(Gate.START_LETTER + i);
            inputs.push(letter);
            left.push(letter);
            if (i === blankAfter) {
                left.push(null);
            }
        }

        // output
        const right = [];
        const output = String.fromCharCode(Gate.START_LETTER + 16);
        for (let i = 0; i < numSlots; ++i) {
            right.push(i === outputAt ? output : null);
        }

        const name = type.toUpperFirst();
        super(grid, x, y, { 'left': left, 'right': right }, name);

        this.element.classList.add('gate');
        this.inputs = inputs;
        this.output = output;
        this.type = type;
        this.setHoverMessage(this.inner, '<b>' + name + '-Gate</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>D</i>: Delete', { type: 'hover' });
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.type, this.inputs.length ]},
        };
    }
}