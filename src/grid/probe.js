"use strict";

// A probe component that displays the state of a net it is attached to.
class Probe extends SimulationComponent {

    static EDIT_DIALOG = [
        { name: 'name', label: 'Name', type: 'string', check: (v) => /^\w+$/.test(v) },
        ...Component.EDIT_DIALOG,
    ];

    #input;
    #labelElement;
    name = '';

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
        const config = await dialog("Configure probe", Probe.EDIT_DIALOG, { name: this.name, rotation: this.rotation });
        if (config) {
            this.name = config.name;
            this.rotation = config.rotation;
            this.redraw();
            this.grid.trackAction('Edit probe');
        }
    }

    // Override inner component label to show net state.
    get label() {
        const state = this.getNetState(this.#input.netIds);
        return state === 'null' ? '~' : state;
    }

    // Renders the probe onto the grid.
    render() {
        if (!super.render()) {
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

        // Render the current state of the input net
        const state = this.getNetState(this.#input.netIds);
        if (this.element.getAttribute('data-net-state') !== state) {
            this.element.setAttribute('data-net-state', state);
            this.inner.innerHTML = '<span>' + this.label + '</span>';
        }
    }
}