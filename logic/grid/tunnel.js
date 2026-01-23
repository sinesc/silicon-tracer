"use strict";

// A network tunnel connecting all tunnels of the same name/circuit.
class Tunnel extends Component {

    static EDIT_DIALOG = [
        { name: 'name', label: 'Name', type: 'string', check: (v, f) => v !== '' },
        ...Component.EDIT_DIALOG,
    ];

    #side;
    #port;
    #labelElement;
    name = '';

    constructor(app, x, y, side) {
        assert.string(side);
        super(app, x, y, { 'top': [ '' ], 'left': [ null, ] }, 'tunnel');
        this.rotation = Component.SIDES.indexOf(side);
        this.updateDimensions();
        this.#side = side;
        this.#port = this.portByName('');
    }

    // Link port to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => `Tunnel <b>${this.name}</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.#labelElement = element(this.element, 'div', 'port-name');
        this.element.classList.add('tunnel');
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.#side ]},
            name: this.name,
        };
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return null;
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure tunnel", Tunnel.EDIT_DIALOG, { name: this.name, rotation: this.rotation }, this);
        if (config) {
            this.name = config.name;
            this.rotation = config.rotation;
            this.redraw();
        }
    }

    // Renders the port onto the grid.
    render() {
        if (!super.render()) {
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
}