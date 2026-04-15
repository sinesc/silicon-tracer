"use strict";

// A probe component that displays the state of a net it is attached to.
class Probe extends SimulationComponent {

    static DISPLAY_FORMATS = { 'auto': 'Auto', 'hex': 'Hex', 'dec': 'Decimal', 'bin': 'Binary' };

    static EDIT_DIALOG = [
        { name: 'name', label: 'Name', type: 'string', check: (v) => /^\w+$/.test(v) },
        { name: 'displayFormat', label: 'Display format', type: 'select', options: Probe.DISPLAY_FORMATS },
        ...Component.EDIT_DIALOG,
    ];

    #input;
    #labelElement;
    #prevLabel = null;
    name = '';
    displayFormat = 'auto';

    constructor(app, x, y, rotation, name = null) {
        assert.string(name, true);
        super(app, x, y, rotation, { 'top': [ 'input' ], 'left': [ null ] }, 'probe');
        this.#input = this.portByName('input');
        this.#input.label = '';
        this.name = name ?? '';
    }

    // Link port to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => `Probe <b>${this.name}</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.#labelElement = html(this.element, 'div', 'port-name');
        this.element.classList.add('probe', 'status-outline');
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.name ],
            displayFormat: this.displayFormat,
        };
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return sim.declareProbe(this.name, suffix);
        // FIXME: probes in subcircuits that are used multiple times will have the same name.
        // those will still display correctly here, but sim.getProbeValue() will return the last set value
        // a possible solution might be to have labeled subcomponents and then make probes accessible by path
        // e.g. main/primaryAdder/theprobe.
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure probe", Probe.EDIT_DIALOG, { name: this.name, displayFormat: this.displayFormat, rotation: this.rotation });
        if (config) {
            this.name = config.name;
            this.displayFormat = config.displayFormat;
            this.rotation = config.rotation;
            this.#prevLabel = null;
            this.redraw();
            this.grid.trackAction('Edit probe');
        }
    }

    // Computes the display label from the current net state of all attached nets.
    // For single-bit nets: '0', '1', '-1' (conflict), or '~' (undriven).
    // For multi-bit nets: formatted integer value, '!' (conflict), or '~' (undriven).
    get label() {
        const netIds = this.#input.netIds;
        if (!netIds || netIds.length === 0) return '~';

        if (netIds.length === 1) {
            const state = this.getNetState(netIds);
            return state === 'null' ? '~' : state;
        }

        // Multi-bit: read each bit directly from the simulation engine.
        const engine = this.app.simulations?.current?.engine;
        if (!engine) return '~';

        let value = 0;
        let anyDriven = false;
        for (let i = 0; i < netIds.length; i++) {
            const bit = engine.getNetValue(netIds[i]);
            if (bit === -1) return '!';
            if (bit !== null) {
                anyDriven = true;
                value |= (bit << i);
            }
        }
        if (!anyDriven) return '~';

        const fmt = this.displayFormat === 'auto' ? 'hex' : this.displayFormat;
        if (fmt === 'hex') return '0x' + value.toString(16).toUpperCase();
        if (fmt === 'dec') return '' + value;
        // bin
        return value.toString(2);
    }

    // Renders the probe onto the grid.
    renderFull() {
        if (!super.renderFull()) {
            return false;
        }

        // Render permanently visible label
        const side = ComponentPort.portSide(this.rotation, 'bottom');
        const labelCoords = ComponentPort.portCoords(this.width, this.height, side, 0, true);
        ComponentPort.renderLabel(this, this.#labelElement, side, labelCoords.x * this.grid.zoom, labelCoords.y * this.grid.zoom, this.name, false, true);

        return true;
    }

    // Renders/updates the current net state of the wire to the grid.
    renderNetState() {
        super.renderNetState();

        // Render the current state of the input net(s).
        const state = this.getNetState(this.#input.netIds);
        const currentLabel = this.label;
        if (this.element.getAttribute('data-net-state') !== state || this.#prevLabel !== currentLabel) {
            this.element.setAttribute('data-net-state', state);
            this.inner.innerHTML = '<span>' + currentLabel + '</span>';
            this.#prevLabel = currentLabel;
        }
    }

    static toolbarMeta(_desc) {
        return { label: 'Probe', hoverMessage: '<b>Net state probe</b>. Displays the state of attached net. <i>LMB</i> Drag to move onto grid.' };
    }

    static fromDescriptor(app, _desc) {
        const d = app.config.placementDefaults;
        return (grid, x, y) => grid.addItem(new Probe(app, x, y, d.probe.rotation));
    }
}

GridItem.CLASSES['Probe'] = Probe;
