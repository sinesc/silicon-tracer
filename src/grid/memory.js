"use strict";

// ROM or RAM memory component.
class Memory extends SimulationComponent {

    static VALID_DATA_WIDTHS = [ 1, 2, 4, 8, 16, 32 ];

    static #ROM_EDIT_DIALOG = [
        { name: 'addressWidth', label: 'Address width (bits)', type: 'int', postCheck: (v, f) => isFinite(v) && v >= 1 && v <= 24 },
        { name: 'dataWidth', label: 'Data width (bits)', type: 'select', options: { 1: "1", 2: "2", 4: "4", 8: "8", 16: "16", 32: "32" }, apply: (v) => parseInt(v) },
        { name: 'data', label: 'Initial data', type: 'textfile', extension: '.rom', apply: (txt) => Memory.decodeData(txt), restore: (a) => a.toHex(), filestatus: (d) => d === null ? '0 bytes' : `${d.length} bytes` },
        ...Component.EDIT_DIALOG,
    ];
    static #RAM_EDIT_DIALOG = [
        ...Memory.#ROM_EDIT_DIALOG,
        { name: 'combinedPorts', label: 'Combined data ports', type: 'bool' },
    ];

    #memType;
    #addressWidth;
    #dataWidth;
    #data;
    #combinedPorts;

    constructor(app, x, y, rotation, memType, addressWidth, dataWidth, data = null, combinedPorts = true) {
        assert.enum([ 'rom', 'ram' ], memType);
        assert.integer(addressWidth, false, 1, 24);
        assert.integer(dataWidth, false, 1, 32);
        assert((dataWidth & (dataWidth - 1)) === 0, `dataWidth must be a power of 2, got ${dataWidth}`);
        data = String.isString(data) ? Uint8Array.fromHex(data) : (data === null ? new Uint8Array() : data);
        assert.class(Uint8Array, data);

        const { left, right, top, bottom } = Memory.#generatePorts(memType, addressWidth, dataWidth, combinedPorts);
        const ioTypes = Memory.#generateIoTypes(memType, addressWidth, dataWidth);
        const shadowPorts = Memory.#generateShadowPorts(memType, dataWidth, combinedPorts);
        super(app, x, y, rotation, { left, right, top, bottom }, memType, 1, ioTypes);
        this.setPortsFromNames({ left, right, top, bottom }, 1, ioTypes, shadowPorts);

        this.#memType = memType;
        this.#addressWidth = addressWidth;
        this.#dataWidth = dataWidth;
        this.#data = data;
        this.#combinedPorts = combinedPorts;
        this.#relabelDataPorts();
    }

    get label() {
        return `${this.#memType.toUpperCase()} ${this.#addressWidth}x${this.#dataWidth}`;
    }

    get memType() { return this.#memType; }
    get addressWidth() { return this.#addressWidth; }
    get dataWidth() { return this.#dataWidth; }
    get data() { return this.#data; }
    set data(value) { this.#data = value; }
    get combinedPorts() { return this.#combinedPorts; }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.#memType, this.#addressWidth, this.#dataWidth, this.#data.toHex(), this.#combinedPorts ],
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
        const editDialog = this.#memType === 'ram' ? Memory.#RAM_EDIT_DIALOG : Memory.#ROM_EDIT_DIALOG;
        const config = await dialog(`Configure ${this.label}`, editDialog, { data: this.#data, addressWidth: this.#addressWidth, dataWidth: this.#dataWidth, combinedPorts: this.#combinedPorts, rotation: this.rotation });
        if (config) {
            if (config.addressWidth !== this.#addressWidth || config.dataWidth !== this.#dataWidth || config.combinedPorts !== this.#combinedPorts) {
                const grid = this.grid;
                this.unlink();
                const { left, right, top, bottom } = Memory.#generatePorts(this.#memType, config.addressWidth, config.dataWidth, config.combinedPorts);
                const ioTypes = Memory.#generateIoTypes(this.#memType, config.addressWidth, config.dataWidth);
                const shadowPorts = Memory.#generateShadowPorts(this.#memType, config.dataWidth, config.combinedPorts);
                this.#dataWidth = config.dataWidth;
                this.#combinedPorts = config.combinedPorts;
                this.#data = config.data;
                this.setPortsFromNames({ left, right, top, bottom }, 1, ioTypes, shadowPorts);
                this.#relabelDataPorts();
                this.#addressWidth = config.addressWidth;
                this.link(grid);
            }
            this.rotation = config.rotation;
            this.redraw();
            this.grid.trackAction('Edit memory');
            const defaultsKey = this.#memType;
            this.app.config.placementDefaults[defaultsKey].addressWidth = config.addressWidth;
            this.app.config.placementDefaults[defaultsKey].dataWidth = config.dataWidth;
            this.app.config.placementDefaults[defaultsKey].combinedPorts = config.combinedPorts;
            this.app.config.placementDefaults[defaultsKey].rotation = config.rotation;
        }
    }

    // Generates port layout for the memory component.
    static #generatePorts(memType, addressWidth, dataWidth, combinedPorts) {
        const left = [];
        for (let i = 0; i < addressWidth; i++) {
            left.push('a' + i);
        }
        left.push(null);
        left.push('oe');
        if (memType === 'ram') {
            left.push('we');
        }

        const right = [];
        for (let i = 0; i < dataWidth; i++) {
            right.push('do' + i);
        }

        const bottom = [];
        if (memType === 'ram' && !combinedPorts) {
            for (let i = 0; i < dataWidth; i++) {
                bottom.push('di' + i);
            }
        }

        return { left, right, top: [], bottom };
    }

    // Returns shadow ports structure for RAM with combined ports enabled: di ports co-located with do ports on the right side.
    static #generateShadowPorts(memType, dataWidth, combinedPorts) {
        if (memType !== 'ram' || !combinedPorts) return null;
        return { right: Array.from({ length: dataWidth }, (_, i) => 'di' + i) };
    }

    // Relabels do ports from 'do0' to 'd0' for display when ports are combined.
    #relabelDataPorts() {
        if (!this.#combinedPorts) return;
        for (let i = 0; i < this.#dataWidth; i++) {
            const port = this.portByName('do' + i);
            if (port) port.label = 'd' + i;
        }
    }

    // Generates IO type map for port declaration.
    static #generateIoTypes(memType, addressWidth, dataWidth) {
        const ioTypes = {};
        for (let i = 0; i < addressWidth; i++) {
            ioTypes['a' + i] = 'in';
        }
        ioTypes['oe'] = 'in';
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

    // Decodes a ROM data string (comma-separated decimals or non-comma-separated hex values).
    static decodeData(str) {
        assert.string(str, true);
        if (str === null) return null;
        if (str.includes(',')) {
            return decToU8(str);
        }
        const stripped = str.replace(/\s/g, '');
        if (/^[0-9]+$/.test(stripped) && stripped.length % 2 === 1) {
            return decToU8(str);
        }
        return hexToU8(str);
    }

    static fromDescriptor(app, desc) {
        const d = app.config.placementDefaults;
        const memType = desc['#t'];
        if (memType === 'rom') {
            return (grid, x, y) => grid.addItem(new Memory(app, x, y, d.rom.rotation, 'rom', d.rom.addressWidth, d.rom.dataWidth));
        } else if (memType === 'ram') {
            return (grid, x, y) => grid.addItem(new Memory(app, x, y, d.ram.rotation, 'ram', d.ram.addressWidth, d.ram.dataWidth, [], d.ram.combinedPorts));
        }
        return null;
    }
}

GridItem.CLASSES['Memory'] = Memory;
