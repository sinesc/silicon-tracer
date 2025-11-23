"use strict";

// Basic logic gate component.
class Gate extends Component {

    static EDIT_DIALOG = [
        { name: 'numInputs', label: 'Number of inputs', type: 'int' }
    ];

    static START_LETTER = 97; // 65 for capitalized
    static UNARY = [ 'not', 'buffer' ];
    static MAX_INPUTS = 8;

    inputs;
    output;

    constructor(x, y, type, numInputs) {
        assert.number(numInputs);
        const { left, right, inputs, output } = Gate.#generatePorts(numInputs);
        super(x, y, { 'left': left, 'right': right }, type);
        this.inputs = inputs;
        this.output = output;
    }

    // Generates gate port layout based on number of inputs.
    static #generatePorts(numInputs) {

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

        return { left, right, inputs, output };
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.type, this.inputs.length ]},
        };
    }

    // Link gate to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.element.classList.add('gate');
        const editable = !Gate.UNARY.includes(this.type);
        this.setHoverMessage(this.inner, `<b>${this.label}-Gate</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>D</i>: Delete` + (editable ? ', <i>E</i>: Edit inputs' : ''), { type: 'hover' });
    }

    // Hover hotkey actions.
    async onHotkey(key, what) {
        super.onHotkey(key, what);
        if (what.type === 'hover') {
            if (key === 'e' && !Gate.UNARY.includes(this.type)) {
                const config = await dialog("Configure gate", Gate.EDIT_DIALOG, { numInputs: this.inputs.length });
                if (config) {
                    const numInputs = Math.min(8, Math.max(2, config.numInputs));
                    const { left, right, inputs, output } = Gate.#generatePorts(numInputs);
                    const grid = this.grid;
                    this.unlink();
                    this.setPortsFromNames({ 'left': left, 'right': right });
                    this.inputs = inputs;
                    this.output = output;
                    this.link(grid);
                }
            }
        }
    }
}