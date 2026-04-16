"use strict";

// A constant output component that drives a configurable value onto the circuit.
class Constant extends DisplayComponent {

    static EDIT_DIALOG = [
        { name: 'name', label: 'Label', type: 'string' },
        { name: 'dataWidth', label: 'Data width (bits)', type: 'select', options: { 1: '1', 2: '2', 4: '4', 8: '8', 16: '16', 32: '32' }, apply: (v) => parseInt(v) },
        { name: 'value', label: 'Value', type: 'string',
            check: (v) => /^[0-9]+$/.test(v) || /^0x[0-9a-fA-F]+$/i.test(v) || /^0b[01~]+$/.test(v) || v === '~',
            apply: (v) => Constant.#parseValue(v),
        },
        { text: 'Accepted formats: decimal (42), hex (0xFF), binary (0b1~01). Use ~ for high-impedance bits (binary only), or ~ alone for fully undriven.' },
        { name: 'displayFormat', label: 'Display format', type: 'select', options: DisplayComponent.DISPLAY_FORMATS },
        ...Component.EDIT_DIALOG,
    ];

    #port;
    #labelElement;
    #value = 0;
    #driven = 0;
    #dataWidth = 1;
    inputFormat = 'dec';
    #displayFormat = 'auto';
    name = '';

    constructor(app, x, y, rotation, value = 0, driven = 1, dataWidth = 1, displayFormat = 'dec') {
        assert.integer(value);
        assert.integer(driven);
        assert.integer(dataWidth);
        assert.string(displayFormat);
        const leftCount = DisplayComponent.lookupSize(dataWidth, displayFormat);
        super(app, x, y, rotation, { 'top': [ 'q' ], 'left': Array(leftCount).fill(null) }, 'toggle');
        this.#port = this.portByName('q');
        this.#port.label = '';
        this.#port.numChannels = dataWidth > 1 ? dataWidth : null;
        this.#value = value;
        this.#driven = driven;
        this.#dataWidth = dataWidth;
        this.#displayFormat = displayFormat;
    }

    // Returns the effective display format for SIZE_MAP lookup ('bin', 'hex', or 'dec').
    #effectiveDisplayFormat() {
        return DisplayComponent.resolveFormat(this.#displayFormat, this.#dataWidth);
    }

    // Updates the hidden 'left' padding ports based on SIZE_MAP, dataWidth, and display format.
    #resizeToChannels() {
        const count = DisplayComponent.lookupSize(this.#dataWidth, this.#effectiveDisplayFormat());
        const portSide = ComponentPort.portSide(this.rotation, 'top');
        const oldCoords = ComponentPort.portCoords(this.width, this.height, portSide, 0);
        const grid = this.grid;
        this.unlink();
        this.setPortsFromNames({ 'top': [ 'q' ], 'left': Array(count).fill(null) });
        this.#port = this.portByName('q');
        this.#port.label = '';
        this.#port.numChannels = this.#dataWidth > 1 ? this.#dataWidth : null;
        const newCoords = ComponentPort.portCoords(this.width, this.height, portSide, 0);
        this.x += oldCoords.x - newCoords.x;
        this.y += oldCoords.y - newCoords.y;
        this.link(grid);
    }

    // Link port to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => `Constant value <b>${this.name}</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.#labelElement = html(this.element, 'div', 'port-name');
        this.element.classList.add('constant', 'status-outline');
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.#value, this.#driven, this.#dataWidth, this.#displayFormat ],
            name: this.name,
            inputFormat: this.inputFormat,
        };
    }

    // Declare component simulation item. Called once per channel for multi-bit constants.
    declare(sim, config, suffix) {
        const ch = parseInt(suffix.slice(suffix.lastIndexOf('_') + 1));
        const bit = (this.#driven >> ch) & 1 ? (this.#value >> ch) & 1 : null;
        return sim.declareConst(bit, suffix, ch === 0 ? (this.name || null) : null);
    }

    // Override inner component label.
    get label() {
        return DisplayComponent.formatValue(this.#value, this.#driven, this.#dataWidth, this.#displayFormat);
    }

    // Parses a value string and returns { value, driven, inputFormat }.
    static #parseValue(str) {
        if (str === '~') {
            return { value: 0, driven: 0, inputFormat: 'bin' };
        } else if (/^[0-9]+$/.test(str)) {
            const v = parseInt(str, 10);
            return { value: v, driven: 0xFFFFFFFF, inputFormat: 'dec' };
        } else if (/^0x[0-9a-fA-F]+$/i.test(str)) {
            const v = parseInt(str, 16);
            return { value: v, driven: 0xFFFFFFFF, inputFormat: 'hex' };
        } else {
            // binary: 0b[01~]+, parse right-to-left
            const bits = str.slice(2);
            let value = 0, driven = 0;
            for (let i = 0; i < bits.length; i++) {
                const pos = bits.length - 1 - i;
                const c = bits[pos];
                if (c === '1') { value |= (1 << i); driven |= (1 << i); }
                else if (c === '0') { driven |= (1 << i); }
                // '~': driven bit stays 0 (high-impedance)
            }
            return { value, driven, inputFormat: 'bin' };
        }
    }

    // Applies new value/driven state with live simulation update.
    #applyState(value, driven) {
        const mask = this.#dataWidth === 32 ? 0xFFFFFFFF : (1 << this.#dataWidth) - 1;
        this.#value = value & mask;
        this.#driven = driven & mask;
        const sim = this.app.simulations.current;
        if (sim) {
            const ids = this.simIds;
            for (let ch = 0; ch < this.#dataWidth; ch++) {
                const id = ids[ch];
                if (id !== null && id !== undefined) {
                    const bit = (this.#driven >> ch) & 1 ? (this.#value >> ch) & 1 : null;
                    sim.engine.setConstValue(id, bit);
                }
            }
        }
        this.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure constant", Constant.EDIT_DIALOG, {
            name: this.name,
            dataWidth: String(this.#dataWidth),
            value: DisplayComponent.formatValue(this.#value, this.#driven, this.#dataWidth, this.inputFormat),
            displayFormat: this.#displayFormat,
            rotation: this.rotation,
        });
        if (config) {
            const dataWidthChanged = config.dataWidth !== this.#dataWidth;
            const sizeChanged = dataWidthChanged || config.displayFormat !== this.#displayFormat;
            this.name = config.name;
            this.rotation = config.rotation;
            this.#displayFormat = config.displayFormat;
            this.inputFormat = config.value.inputFormat;
            this.#dataWidth = config.dataWidth;
            if (sizeChanged) {
                this.#resizeToChannels();
            } else {
                this.#port.numChannels = this.#dataWidth > 1 ? this.#dataWidth : null;
            }
            this.#applyState(config.value.value, config.value.driven);
            this.redraw(sizeChanged || config._changed.some((c) => c === 'name' || c === 'rotation'));
            this.grid.trackAction('Edit constant');
        }
    }

    // Renders the constant onto the grid.
    renderFull() {
        if (!super.renderFull()) {
            return false;
        }

        // render permanently visible label
        const side = ComponentPort.portSide(this.rotation, 'bottom');
        const labelCoords = ComponentPort.portCoords(this.width, this.height, side, 0, true);
        ComponentPort.renderLabel(this, this.#labelElement, side, labelCoords.x * this.grid.zoom, labelCoords.y * this.grid.zoom, this.name, false, true);

        // render user-set state indicator (single-bit only)
        this.element.setAttribute('data-port-state', this.#dataWidth === 1 ? ((this.#driven & 1) ? String(this.#value & 1) : '') : '');

        return true;
    }

    // Updates user-set state indicator.
    renderDetail() {
        super.renderDetail();
        this.element.setAttribute('data-port-state', this.#dataWidth === 1 ? ((this.#driven & 1) ? String(this.#value & 1) : '') : '');
    }

    // Renders/updates the current net state of the wire to the grid.
    renderNetState() {
        super.renderNetState();

        // render extra big state indicator around entire component
        const state = this.getNetState(this.#port.netIds);
        if (this.element.getAttribute('data-net-state') !== state) {
            this.element.setAttribute('data-net-state', state);
        }
    }

    static toolbarMeta(_desc) {
        return { label: 'Constant', hoverMessage: '<b>Constant value</b>. <i>LMB</i> Drag to move onto grid.' };
    }

    static fromDescriptor(app, _desc) {
        const d = app.config.placementDefaults;
        return (grid, x, y) => grid.addItem(new Constant(app, x, y, d.constant.rotation));
    }
}

GridItem.CLASSES['Constant'] = Constant;
