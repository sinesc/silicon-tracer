"use strict";

// A network tunnel connecting all tunnels of the same name/circuit.
class Tunnel extends VirtualComponent {

    static TYPE_LABEL = 'Tunnel';
    static TYPE_LABEL_LONG = 'Network tunnel';
    static TYPE_DESCRIPTION = 'Tunnels of the same name connect.';

    static EDIT_DIALOG = [
        { name: 'name', label: 'Network name', type: 'string' /*, check: (v, f) => v !== '' */ },
        ...Component.EDIT_DIALOG,
    ];

    #port;
    #labelElement;
    name = '';

    constructor(app, x, y, rotation) {
        super(app, x, y, rotation, { 'top': [ '' ], 'left': [ null, ] }, 'tunnel');
        this.#port = this.portByName('');
    }

    // Link port to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => (this.name === '' ? 'Inactive tunnel (needs a network name)' : `Tunnel <b>${this.name}</b>`) + `. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.#labelElement = html(this.element, 'div', 'port-name');
        this.element.classList.add('tunnel');
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation ],
            name: this.name,
        };
    }

    // Completely ignore this port if it doesn't have a name.
    disregard() {
        return this.name === '';
    }

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    static editDialogConfig(_descriptor, defaults = {}) {
        return {
            title: 'Configure tunnel',
            fields: Tunnel.EDIT_DIALOG,
            data: { name: defaults.name ?? '', rotation: defaults.rotation ?? 0 },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.tunnel;
    }

    // Handle edit hotkey.
    async onEdit() {
        const { title, fields, data } = Tunnel.editDialogConfig({}, { name: this.name, rotation: this.rotation });
        const config = await dialog(title, fields, data);
        if (config) {
            this.name = config.name;
            this.rotation = config.rotation;
            this.redraw();
            this.grid.trackAction('Edit tunnel');
        }
    }

    // Returns true if the search string matches this tunnel's name.
    match(string) {
        assert.string(string);
        return this.name.toLowerCase().includes(string);
    }

    // Overrides method to disable top-markings.
    get topMarkings() {
        return '';
    }

    // Renders the tunnel onto the grid.
    renderFull() {
        if (!super.renderFull()) {
            return false;
        }

        // render permanently visible label
        const side = ComponentPort.portSide(this.rotation, 'bottom');
        const labelCoords = ComponentPort.portCoords(this.width, this.height, side, 0, true);
        ComponentPort.renderLabel(this, this.#labelElement, side, labelCoords.x * this.grid.zoom, labelCoords.y * this.grid.zoom, this.name, false, true);
        return true;
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

    static fromDescriptor(app, _desc, overrideDefaults = {}) {
        const d = app.config.placementDefaults;
        return (grid, x, y) => {
            const tunnel = new Tunnel(app, x, y, overrideDefaults.rotation ?? d.tunnel.rotation);
            if (overrideDefaults.name) tunnel.name = overrideDefaults.name;
            return grid.addItem(tunnel, false);
        };
    }
}

GridItem.CLASSES['Tunnel'] = Tunnel;
