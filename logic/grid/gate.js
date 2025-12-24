"use strict";

// Basic logic gate component.
class Gate extends Component {

    static START_LETTER = 97; // 65 for capitalized
    static UNARY = Object.keys(Simulation.GATE_MAP.filter((k, v) => v.joinOp === null));
    static MAX_INPUTS = 8;

    static UNARY_DIALOG = [
        { name: 'type', label: 'Logic function', type: 'select', options: Simulation.GATE_MAP.map((k, v) => k.toUpperFirst()).filter((k, v) => Gate.UNARY.includes(k)) },
        ...Component.EDIT_DIALOG,
    ];
    static XARY_DIALOG = [
        { name: 'numInputs', label: 'Number of inputs', type: 'select', options: { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8 }, apply: (v, f) => parseInt(v) },
        { name: 'type', label: 'Logic function', type: 'select', options: Simulation.GATE_MAP.map((k, v) => k.toUpperFirst()).filter((k, v) => !Gate.UNARY.includes(k))  },
        ...Component.EDIT_DIALOG,
    ];

    inputs;
    output;

    constructor(app, x, y, type, numInputs) {
        assert.integer(numInputs);
        const { left, right, inputs, output } = Gate.#generatePorts(numInputs);
        super(app, x, y, { 'left': left, 'right': right }, type);
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
        this.setHoverMessage(this.inner, `<b>${this.label}-Gate</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Handle edit hotkey.
    async onEdit() {
        const unary = Gate.UNARY.includes(this.type);
        const config = await dialog("Configure gate", unary ? Gate.UNARY_DIALOG : Gate.XARY_DIALOG, { numInputs: this.inputs.length, type: this.type, rotation: this.rotation });
        if (config) {
            const { left, right, inputs, output } = Gate.#generatePorts(config.numInputs ?? this.inputs.length);
            const grid = this.grid;
            this.unlink();
            this.setPortsFromNames({ 'left': left, 'right': right });
            this.type = config.type;
            this.inputs = inputs;
            this.output = output;
            this.link(grid);
            this.rotation = config.rotation; // needs to be on grid for rotation to properly update x/y/width/height
            this.redraw();
        }
    }
}