"use strict";

// ROM or RAM memory component.
class Memory extends SimulationComponent {

    static VALID_DATA_WIDTHS = [ 1, 2, 4, 8, 16, 32 ];

    static #EDIT_DIALOG = [
        { name: 'addressWidth', label: 'Address width (bits)', type: 'int', check: (v) => { const p = Number.parseSI(v, true); return isFinite(p) && p >= 1 && p <= 24; } },
        { name: 'dataWidth', label: 'Data width (bits)', type: 'select', options: { 1: "1", 2: "2", 4: "4", 8: "8", 16: "16", 32: "32" }, apply: (v) => parseInt(v) },
        ...Component.EDIT_DIALOG,
    ];

    #memType;
    #addressWidth;
    #dataWidth;
    #data;

    constructor(app, x, y, rotation, memType, addressWidth, dataWidth, data = []) {
        assert.enum([ 'rom', 'ram' ], memType);
        assert.integer(addressWidth, false, 1, 24);
        assert.integer(dataWidth, false, 1, 32);
        assert((dataWidth & (dataWidth - 1)) === 0, `dataWidth must be a power of 2, got ${dataWidth}`);

        const { left, right, top, bottom } = Memory.#generatePorts(memType, addressWidth, dataWidth);
        const ioTypes = Memory.#generateIoTypes(memType, addressWidth, dataWidth);
        super(app, x, y, rotation, { left, right, top, bottom }, memType, 1, ioTypes);

        this.#memType = memType;
        this.#addressWidth = addressWidth;
        this.#dataWidth = dataWidth;
        this.#data = data;
    }

    get label() {
        return `${this.#memType.toUpperCase()} ${this.#addressWidth}x${this.#dataWidth}`;
    }

    get memType() { return this.#memType; }
    get addressWidth() { return this.#addressWidth; }
    get dataWidth() { return this.#dataWidth; }
    get data() { return this.#data; }
    set data(value) { this.#data = value; }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.#memType, this.#addressWidth, this.#dataWidth, this.#data ],
        };
    }

    // Link component to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.element.classList.add('memory');
        this.setHoverMessage(this.inner, `<b>${this.label}</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return sim.declareMemory(this.#memType, this.#addressWidth, this.#dataWidth, this.#data, suffix);
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog(`Configure ${this.label}`, Memory.#EDIT_DIALOG, { addressWidth: this.#addressWidth, dataWidth: this.#dataWidth, rotation: this.rotation });
        if (config) {
            if (config.addressWidth !== this.#addressWidth || config.dataWidth !== this.#dataWidth) {
                const grid = this.grid;
                this.unlink();
                const { left, right, top, bottom } = Memory.#generatePorts(this.#memType, config.addressWidth, config.dataWidth);
                const ioTypes = Memory.#generateIoTypes(this.#memType, config.addressWidth, config.dataWidth);
                this.setPortsFromNames({ left, right, top, bottom }, 1, ioTypes);
                this.#addressWidth = config.addressWidth;
                this.#dataWidth = config.dataWidth;
                this.link(grid);
            }
            this.rotation = config.rotation;
            this.redraw();
            const defaultsKey = this.#memType;
            this.app.config.placementDefaults[defaultsKey].addressWidth = config.addressWidth;
            this.app.config.placementDefaults[defaultsKey].dataWidth = config.dataWidth;
            this.app.config.placementDefaults[defaultsKey].rotation = config.rotation;
        }
    }

    // Generates port layout for the memory component.
    static #generatePorts(memType, addressWidth, dataWidth) {
        const left = [];
        for (let i = 0; i < addressWidth; i++) {
            left.push('a' + i);
        }
        if (memType === 'ram') {
            left.push(null);
            left.push('we');
        }

        const right = [];
        for (let i = 0; i < dataWidth; i++) {
            right.push('do' + i);
        }

        const bottom = [];
        if (memType === 'ram') {
            for (let i = 0; i < dataWidth; i++) {
                bottom.push('di' + i);
            }
        }

        return { left, right, top: [], bottom };
    }

    // Generates IO type map for port declaration.
    static #generateIoTypes(memType, addressWidth, dataWidth) {
        const ioTypes = {};
        for (let i = 0; i < addressWidth; i++) {
            ioTypes['a' + i] = 'in';
        }
        for (let i = 0; i < dataWidth; i++) {
            ioTypes['do' + i] = 'out';
        }
        if (memType === 'ram') {
            for (let i = 0; i < dataWidth; i++) {
                ioTypes['di' + i] = 'in';
            }
            ioTypes['we'] = 'in';
        }
        return ioTypes;
    }
}
