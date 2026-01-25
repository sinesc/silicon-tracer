"use strict";

// Basic logic gate component.
class Gate extends Component {

    static #START_LETTER = 97; // 65 for capitalized
    static #UNARY = Object.keys(Object.filter(Simulation.GATE_MAP, (k, v) => v.joinOp === null));

    static #UNARY_DIALOG = [
        { name: 'type', label: 'Logic function', type: 'select', options: Object.filter(Object.map(Simulation.GATE_MAP, (k, v) => k.toUpperFirst()), (k, v) => Gate.#UNARY.includes(k)) },
        ...Component.EDIT_DIALOG,
    ];
    static #XARY_DIALOG = [
        { name: 'numInputs', label: 'Number of inputs', type: 'select', options: { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8 }, apply: (v, f) => parseInt(v) },
        { name: 'type', label: 'Logic function', type: 'select', options: Object.filter(Object.map(Simulation.GATE_MAP, (k, v) => k.toUpperFirst()), (k, v) => !Gate.#UNARY.includes(k))  },
        ...Component.EDIT_DIALOG,
    ];

    inputs;
    output;
    #numChannels;

    constructor(app, x, y, rotation, type, numInputs, numChannels = 1) {
        assert.integer(numInputs);
        const { left, right, inputs, output } = Gate.#generatePorts(numInputs);
        const ioTypes = Object.fromEntries([ ...inputs.map((i) => [ i, 'in' ]), [ output, 'out'] ]);
        super(app, x, y, rotation, { 'left': left, 'right': right }, type, numChannels, ioTypes);
        this.inputs = inputs;
        this.output = output;
        this.#numChannels = numChannels;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.rotation, this.type, this.inputs.length ]},
        };
    }

    // Link gate to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.element.classList.add('gate');
        this.setHoverMessage(this.inner, `<b>${this.label}-Gate</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return sim.declareGate(this.type, this.inputs, this.output, suffix);
    }

    // Handle edit hotkey.
    async onEdit() {
        const unary = Gate.#UNARY.includes(this.type);
        const config = await dialog("Configure gate", unary ? Gate.#UNARY_DIALOG : Gate.#XARY_DIALOG, { numInputs: this.inputs.length, type: this.type, rotation: this.rotation });
        if (config) {
            const { left, right, inputs, output } = Gate.#generatePorts(config.numInputs ?? this.inputs.length);
            const grid = this.grid;
            this.unlink();
            this.setPortsFromNames({ 'left': left, 'right': right }, this.#numChannels);
            this.type = config.type;
            this.inputs = inputs;
            this.output = output;
            this.link(grid);
            this.rotation = config.rotation; // needs to be on grid for rotation to properly update x/y/width/height
            this.redraw();
        }
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
            const letter = String.fromCharCode(Gate.#START_LETTER + i);
            inputs.push(letter);
            left.push(letter);
            if (i === blankAfter) {
                left.push(null);
            }
        }

        // output
        const right = [];
        const output = String.fromCharCode(Gate.#START_LETTER + 16);
        for (let i = 0; i < numSlots; ++i) {
            right.push(i === outputAt ? output : null);
        }

        return { left, right, inputs, output };
    }
}