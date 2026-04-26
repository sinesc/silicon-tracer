"use strict";

// A probe component that displays the state of a net it is attached to.
class Probe extends DisplayComponent {

    static TYPE_LABEL = 'Probe';
    static TYPE_LABEL_LONG = 'Network probe';
    static TYPE_DESCRIPTION = 'Displays the state of the attached net.';

    static EDIT_DIALOG = [
        { name: 'name', label: 'Name', type: 'string', check: function(v) { return v === '' || (/^\w+$/.test(v) && this.checkNameIsUnique(v, this.grid.circuit)); } },
        { name: 'displayFormat', label: 'Display format', type: 'select', options: DisplayComponent.DISPLAY_FORMATS },
        ...Component.EDIT_DIALOG,
    ];

    #input;
    #labelElement;
    #prevLabel = null;
    #prevLeftCount = 1;
    name = '';
    displayFormat = 'auto';

    constructor(app, x, y, rotation, name = null, leftCount = 1) {
        assert.string(name, true);
        assert.integer(leftCount);
        super(app, x, y, rotation, { 'top': [ 'input' ], 'left': Array(leftCount).fill(null) }, 'probe');
        this.#input = this.portByName('input');
        this.#input.label = '';
        this.name = name ?? '';
        this.#prevLeftCount = leftCount;
    }

    // Link port to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        const sim = this.app.simulations;
        this.setHoverMessage(this.inner, () => `<b>${this.typeLabel}</b> <b>${this.#displayName(this.instanceId)}</b>. <i>E</i> Edit, ${sim.current ? '' : '<u>'}<i>M</i> Monitor, <i>SHIFT+M</i> Monitor all instances${sim.current ? '' : '</u>'}, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.#labelElement = html(this.element, 'div', 'port-name');
        this.element.classList.add('probe', 'status-outline');
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.name, this.#prevLeftCount ],
            displayFormat: this.displayFormat,
        };
    }

    // Declare component simulation item.
    declare(sim, config, suffix, instanceId) {
        return sim.declareProbe(this.#displayName(instanceId), suffix);
    }

    // Called after paste: ensures probe name is unique in the circuit.
    onPaste() {
        if (this.name !== '') {
            this.name = this.makeUnique('name', this.name);
        }
    }

    // Checks whether the given name is unique among probes in the circuit.
    checkNameIsUnique(name, circuit = null) {
        for (const probe of values(circuit.items.filter((i) => i instanceof Probe))) {
            if (probe !== this && probe.name === name) {
                return false;
            }
        }
        return true;
    }

    // Handle hover hotkeys.
    onHotkey(key, action, what) {
        if (super.onHotkey(key, action, what)) return true;
        if (action !== 'down' || what.type !== 'hover' || !this.app.simulations.current) return;
        if (key === 'm') {
            this.grid.monitorOverlay.toggleProbe(this);
            return true;
        } else if (key === 'M') {
            this.grid.monitorOverlay.addProbesByName(this.name);
            return true;
        }
    }

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    static editDialogConfig(_descriptor, defaults = {}) {
        return {
            title: 'Configure probe',
            fields: Probe.EDIT_DIALOG,
            data: { name: defaults.name ?? '', displayFormat: defaults.displayFormat ?? 'auto', rotation: defaults.rotation ?? 0 },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.probe;
    }

    // Handle edit hotkey.
    async onEdit() {
        const { title, fields, data } = Probe.editDialogConfig({}, { name: this.name, displayFormat: this.displayFormat, rotation: this.rotation });
        const config = await dialog(title, fields, data, { context: this });
        if (config) {
            this.name = config.name;
            this.rotation = config.rotation;
            this.displayFormat = config.displayFormat;
            // Re-check size in case display format changed the desired left count.
            const channels = this.#input.netIds?.length ?? 1;
            this.#resizeToChannels(channels);
            this.#prevLabel = null;
            this.redraw(config._changed.some((c) => c === 'name' || c === 'rotation' || c === 'displayFormat'));
            this.grid.trackAction('Edit probe');
        }
    }

    // Returns true if the search string matches this probe's name.
    match(string) {
        assert.string(string);
        return this.name.toLowerCase().includes(string);
    }

    // Computes the top-markings from the current net state of all attached nets.
    // For single-bit nets: '0', '1', 'E' (conflict), or '~' (undriven).
    // For multi-bit nets: formatted integer value, 'E' (conflict), or '~' (undriven).
    get topMarkings() {
        const netIds = this.#input.netIds;
        if (!netIds || netIds.length === 0) return '~';
        const engine = this.app.simulations?.current?.engine;
        if (!engine) return '~';
        return Probe.#displayValue(engine, netIds, this.displayFormat);
    }

    // Returns the formatted value for a named probe. Probe component is not required to be linked.
    static getDisplayValue(engine, probeName, displayFormat) {
        assert.class(Simulation, engine);
        assert.string(probeName);
        assert.string(displayFormat);
        return Probe.#displayValue(engine, engine.getProbeNetIds(probeName), displayFormat);
    }

    // Returns formatted probe value.
    static #displayValue(engine, netIds, displayFormat) {
        if (!netIds || netIds.length === 0) return '~';
        if (netIds.length === 1) {
            const v = netIds[0] !== undefined ? engine.getNetValue(netIds[0]) : null;
            return v === null ? '~' : v === -1 ? '<span class="warning">E</span>' : String(v);
        }
        let bigValue = 0n, bigDriven = 0n;
        for (let i = 0; i < netIds.length; i++) {
            const bit = netIds[i] !== undefined ? engine.getNetValue(netIds[i]) : null;
            if (bit === -1) return '<span class="warning">E</span>';
            if (bit !== null) {
                const pos = BigInt(i);
                bigDriven |= (1n << pos);
                if (bit === 1) bigValue |= (1n << pos);
            }
        }
        return bigDriven === 0n ? '~' : DisplayComponent.formatValue(bigValue, bigDriven, netIds.length, displayFormat);
    }

    // Renders the probe onto the grid.
    renderFull() {
        if (!super.renderFull()) {
            return false;
        }

        // Render permanently visible label
        const side = ComponentPort.portSide(this.rotation, 'bottom');
        const labelCoords = ComponentPort.portCoords(this.width, this.height, side, 0, true);
        ComponentPort.renderLabel(this, this.#labelElement, side, labelCoords.x * this.grid.zoom, labelCoords.y * this.grid.zoom, this.#displayName(this.instanceId), false, true);

        return true;
    }

    // Renders/updates the current net state of the wire to the grid.
    renderNetState() {
        super.renderNetState();

        // Auto-resize to fit connected channel count.
        const channels = this.#input.netIds?.length ?? 1;
        const desiredCount = DisplayComponent.lookupSize(channels, this.#effectiveDisplayFormat(channels));
        if (desiredCount !== this.#prevLeftCount) {
            this.#resizeToChannels(channels);
            this.grid?.markTopologyChanged();
            return;
        }

        // Render the current state of the input net(s).
        const state = this.getNetState(this.#input.netIds);
        const currentLabel = this.topMarkings;
        if (this.element.getAttribute('data-net-state') !== state || this.#prevLabel !== currentLabel) {
            this.element.setAttribute('data-net-state', state);
            this.inner.innerHTML = '<span>' + currentLabel + '</span>';
            this.#prevLabel = currentLabel;
        }
    }

    static fromDescriptor(app, _desc, overrideDefaults = {}) {
        const d = app.config.placementDefaults;
        return (grid, x, y) => {
            const rotation = overrideDefaults.rotation ?? d.probe.rotation;
            const name = overrideDefaults.name ?? '';
            const probe = new Probe(app, x, y, rotation, name);
            if (overrideDefaults.displayFormat) probe.displayFormat = overrideDefaults.displayFormat;
            grid.addItem(probe, false);
            if (name) probe.name = probe.makeUnique('name', name);
            return probe;
        };
    }

    // Returns the probe name with instance suffix appended when inside a non-root circuit instance.
    #displayName(instanceId) {
        return instanceId && this.name ? `${this.name}@${instanceId}` : this.name;
    }

    // Returns the effective display format for SIZE_MAP lookup given a channel count.
    #effectiveDisplayFormat(channels) {
        return DisplayComponent.resolveFormat(this.displayFormat, channels);
    }

    // Resizes the component to fit the given channel count, preserving the 'input' port's absolute position.
    #resizeToChannels(channels) {
        const count = DisplayComponent.lookupSize(channels, this.#effectiveDisplayFormat(channels));
        if (count === this.#prevLeftCount) return;
        const portSide = ComponentPort.portSide(this.rotation, 'top');
        const oldCoords = ComponentPort.portCoords(this.width, this.height, portSide, 0);
        const grid = this.grid;
        this.unlink();
        this.setPortsFromNames({ 'top': [ 'input' ], 'left': Array(count).fill(null) });
        this.#input = this.portByName('input');
        this.#input.label = '';
        const newCoords = ComponentPort.portCoords(this.width, this.height, portSide, 0);
        this.x += oldCoords.x - newCoords.x;
        this.y += oldCoords.y - newCoords.y;
        this.link(grid);
        this.renderFull();
        this.#prevLeftCount = count;
    }
}

GridItem.CLASSES['Probe'] = Probe;
