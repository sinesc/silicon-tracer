"use strict";

// Basic gate-like builtin component.
class Builtin extends SimulationComponent {

    static EDIT_DIALOG = [
        ...Component.EDIT_DIALOG,
    ];

    static LABELS = {
        latch: 'D latch',
        flipflop: 'D flip-flip',
        buffer3: 'Tri-state buffer',
        not3: 'Tri-state inverter',
        mux3: 'Tri-state mux',
        demux3: 'Tri-state demux',
        adder: 'Full adder',
    };

    static LAYOUT_OVERRIDES = {
        buffer3: { left: [ 'data' ], right: [ 'q' ], top: [ null ], bottom: [ 'enable' ] },
        not3: { left: [ 'data' ], right: [ 'q' ], top: [ null ], bottom: [ 'enable' ] },
        mux3: { left: [ 'select', 'a', 'b'  ], right: [ null, 'q', null ], top: [ null ], bottom: [ 'enable' ] },
        demux3: { left: [ 'select', null, 'data'  ], right: [ 'qa', null, 'qb' ], top: [ null ], bottom: [ 'enable' ] },
    };

    gates;
    #numChannels;

    constructor(app, x, y, rotation, type, numChannels = 1) {
        const { left, right, inputs, outputs } = Builtin.#generatePorts(type);
        const ioTypes = Object.fromEntries([ ...inputs.map((i) => [ i, 'in' ]), ...outputs.map((o) => [ o, 'out' ]) ]);
        super(app, x, y, rotation, Builtin.LAYOUT_OVERRIDES[type] ?? { 'left': left, 'right': right }, type, numChannels, ioTypes);
        this.#numChannels = numChannels;
        this.gates = Simulation.BUILTIN_MAP[type].statsGates;
    }

    // Returns the builtin's label string.
    get label() {
        return Builtin.LABELS[this.type] ?? this.type.toUpperFirst();
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.type ],
        };
    }

    // Link component to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.element.classList.add('builtin');
        this.setHoverMessage(this.inner, `<b>${this.label}</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return sim.declareBuiltin(this.type, suffix);
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog(`Configure ${this.label}`, Builtin.EDIT_DIALOG, { rotation: this.rotation });
        if (config) {
            this.rotation = config.rotation;
            this.redraw();
        }
    }

    // Generates builtin port layout based on number of inputs.
    static #generatePorts(type) {
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

        return { left, right, inputs, outputs };
    }
}