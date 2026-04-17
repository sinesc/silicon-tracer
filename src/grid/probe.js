"use strict";

// A probe component that displays the state of a net it is attached to.
class Probe extends DisplayComponent {

    static EDIT_DIALOG = [
        { name: 'name', label: 'Name', type: 'string', check: (v) => v ==='' || /^\w+$/.test(v) },
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
        this.setHoverMessage(this.inner, () => `Probe <b>${this.#displayName(this.instanceId)}</b>. <i>E</i> Edit, <i>M</i> Monitor, ${Component.HOTKEYS}.`, { type: 'hover' });
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

    // Handle hover hotkeys.
    onHotkey(key, action, what) {
        if (super.onHotkey(key, action, what)) return true;
        if (action !== 'down' || what.type !== 'hover') return;
        if (key === 'm') {
            this.grid.monitorOverlay.toggleItem(this);
            return true;
        }
        if (key === 'M') {
            const items = this.app.simulations.current?.probeInstances(this.name) ?? [];
            this.grid.monitorOverlay.setItems(items);
            return true;
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure probe", Probe.EDIT_DIALOG, { name: this.name, displayFormat: this.displayFormat, rotation: this.rotation });
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

    // Computes the display label from the current net state of all attached nets.
    // For single-bit nets: '0', '1', '-1' (conflict), or '~' (undriven).
    // For multi-bit nets: formatted integer value, '!' (conflict), or '~' (undriven).
    get label() {
        const netIds = this.#input.netIds;
        if (!netIds || netIds.length === 0) return '~';
        const engine = this.app.simulations?.current?.engine;
        if (!engine) return '~';
        return Probe.#labelFromNetIds(engine, netIds, this.displayFormat);
    }

    // Returns the formatted label for a named probe, reading net values directly from the engine.
    // Use this in preference to Probe.label when UI-level netIds may not be attached (e.g. monitor overlay).
    static getProbeLabel(engine, probeName, displayFormat) {
        assert.class(Simulation, engine);
        assert.string(probeName);
        assert.string(displayFormat);
        return Probe.#labelFromNetIds(engine, engine.getProbeNetIds(probeName), displayFormat);
    }

    // Shared label computation from a net ID array and a simulation engine.
    static #labelFromNetIds(engine, netIds, displayFormat) {
        if (!netIds || netIds.length === 0) return '~';
        if (netIds.length === 1) {
            const v = netIds[0] !== undefined ? engine.getNetValue(netIds[0]) : null;
            return v === null ? '~' : v === -1 ? '-1' : String(v);
        }
        let bigValue = 0n, bigDriven = 0n;
        for (let i = 0; i < netIds.length; i++) {
            const bit = netIds[i] !== undefined ? engine.getNetValue(netIds[i]) : null;
            if (bit === -1) return '!';
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
            this.grid?.onTopologyChanged();
            return;
        }

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

    // Returns the probe name with instance suffix appended when inside a non-root circuit instance.
    #displayName(instanceId) {
        return instanceId != null && instanceId !== 0 ? `${this.name}@${instanceId}` : this.name;
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
