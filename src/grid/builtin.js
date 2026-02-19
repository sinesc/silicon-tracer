"use strict";

// Basic gate-like builtin component.
class Builtin extends SimulationComponent {

    static EDIT_DIALOG = [
        ...Component.EDIT_DIALOG,
    ];

    static #LEGACY_RENAME = {
        flipflop: 'dflipflop',
        latch: 'dlatch',
    };

    static META_INFO = {
        dlatch: { label: 'D latch', gateCount: 4, layoutOverride: null },
        adlatch: { label: 'D latch, async. reset', gateCount: 8, layoutOverride: { left: [ 'load', null, 'data' ], right: [ null, 'q', null ], top: [ 'set' ], bottom: [ 'reset' ] } },
        dflipflop: { label: 'D flip-flop', gateCount: 6, layoutOverride: null },
        adflipflop: { label: 'D flip-flop, async. reset', gateCount: 10, layoutOverride: { left: [ 'clock', null, 'data' ], right: [ null, 'q', null ], top: [ 'set' ], bottom: [ 'reset' ] } },
        jkflipflop: { label: 'JK flip-flop', gateCount: 11, layoutOverride: null },
        ajkflipflop: { label: 'JK flip-flop, async. reset', gateCount: 14, layoutOverride: { left: [ 'clock', 'k', 'j' ], right: [ null, 'q', null ], top: [ 'set' ], bottom: [ 'reset' ] } },
        tflipflop: { label: 'T flip-flop', gateCount: 11, layoutOverride: null },
        atflipflop: { label: 'T flip-flop, async. reset', gateCount: 14, layoutOverride: { left: [ 'clock', null, 't' ], right: [ null, 'q', null ], top: [ 'set' ], bottom: [ 'reset' ] } },
        srflipflop: { label: 'SR flip-flop', gateCount: 9, layoutOverride: null },
        asrflipflop: { label: 'SR flip-flop, async. reset', gateCount: 12, layoutOverride: { left: [ 'clock', 'r', 's' ], right: [ null, 'q', null ], top: [ 'set' ], bottom: [ 'reset' ] } },
        switch: { label: 'Switch', gateCount: 0, layoutOverride: { left: [ 'data' ], right: [ 'q' ], top: [ null ], bottom: [ 'close' ] } },
        buffer3: { label: 'Tri-state buffer', gateCount: 1, layoutOverride: { left: [ 'data' ], right: [ 'q' ], top: [ null ], bottom: [ 'enable' ] } },
        not3: { label: 'Tri-state inverter', gateCount: 1, layoutOverride: { left: [ 'data' ], right: [ 'q' ], top: [ null ], bottom: [ 'enable' ] } },
        adder: { label: 'Full adder', gateCount: 5, layoutOverride: null },
        mux: { label: 'Multiplexer', gateCount: 5, layoutOverride: null },
        mux3: { label: 'Tri-state mux', gateCount: 5, layoutOverride: { left: [ 'select', 'a', 'b' ], right: [ null, 'q', null ], top: [ null ], bottom: [ 'enable' ] } },
        demux: { label: 'Demultiplexer', gateCount: 4, layoutOverride: null },
        demux3: { label: 'Tri-state demux', gateCount: 4, layoutOverride: { left: [ 'select', null, 'data' ], right: [ 'qa', null, 'qb' ], top: [ null ], bottom: [ 'enable' ] } },
    };

    gates;
    #numChannels;

    constructor(app, x, y, rotation, type, numChannels = 1) {
        type = Builtin.#LEGACY_RENAME[type] ?? type;
        const { left, right, inputs, outputs } = Builtin.#generatePorts(type);
        const ioTypes = Object.fromEntries([ ...inputs.map((i) => [ i, 'in' ]), ...outputs.map((o) => [ o, 'out' ]) ]);
        const meta = Builtin.META_INFO[type];
        super(app, x, y, rotation, meta?.layoutOverride ?? { 'left': left, 'right': right }, type, numChannels, ioTypes);
        this.#numChannels = numChannels;
        this.gates = meta.gateCount ?? 0;
    }

    // Returns the builtin's label string.
    get label() {
        return Builtin.META_INFO[this.type]?.label ?? this.type.toUpperFirst();
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