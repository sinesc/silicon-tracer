"use strict";

// An IO port to interface with other circuits.
class Port extends Interactive {

    static EDIT_DIALOG = [
        { name: 'name', label: 'Name', type: 'string' },
        ...Component.EDIT_DIALOG,
    ];

    #side;
    #port;
    #labelElement;
    #state = null;
    name = '';

    constructor(x, y, side) {
        assert.string(side);
        super(x, y, { 'top': [ '' ], 'left': [ null, null, null ] }, 'port');
        this.rotation = Component.SIDES.indexOf(side);
        this.updateDimensions();
        this.#side = side;
        this.#port = this.portByName('');
    }

    // Link port to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => 'Port <b>' + this.name + '</b>. <i>LMB</i>: Drag to move, <i>1</i>: Set high, <i>2</i>: Set low, <i>3</i>: Unset, <i>R</i>: Rotate, <i>DEL</i>: Delete, <i>E</i>: Edit', { type: 'hover' });
        this.#labelElement = document.createElement('div');
        this.#labelElement.classList.add('port-name');
        this.element.classList.add('port');
        this.element.appendChild(this.#labelElement);
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.#side ]},
            name: this.name,
        };
    }

    // Apply component state to simulation.
    applyState(port, sim) {
        if (this.#port.netId !== null) {
            if (this.#state !== null) {
                sim.setNetValue(this.#port.netId, this.#state);
            }
        }
    }

    // Hover hotkey actions
    async onHotkey(key, what) {
        super.onHotkey(key, what);
        if (what.type === 'hover') {
            let prevState = this.#state;
            if (key === '1') {
                this.#state = 1;
            } else if (key === '2') {
                this.#state = 0;
            } else if (key === '3') {
                this.#state = null;
            }
            if (prevState !== this.#state) {
                if (this.#port.netId !== null && app.sim) {
                    app.sim.engine.setNetValue(this.#port.netId, this.#state);
                }
                this.render();
            }
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure port", Port.EDIT_DIALOG, { name: this.name, rotation: this.rotation });
        if (config) {
            this.name = config.name;
            this.rotation = config.rotation;
            this.render();
        }
    }

    // Renders the port onto the grid.
    render() {
        if (this.element.classList.contains('component-rotate-animation')) {
            return;
        }

        super.render();

        // render permanently visible label
        let side = ComponentPort.portSide(this.rotation, 'bottom');
        let labelCoords = ComponentPort.portCoords(this.width, this.height, side, 0, true);
        this.renderLabel(this.#labelElement, side, labelCoords.x * this.grid.zoom, labelCoords.y * this.grid.zoom, this.name, false, true);

        // render user-set state (lightbulb/circle thing)
        this.element.setAttribute('data-port-state', this.#state ?? '');
    }

    // Renders/updates the current net state of the wire to the grid.
    renderNetState() {
        super.renderNetState();

        // render extra big state indicator around entire component
        let state = this.#port.netId !== null && app.sim ? '' + app.sim.engine.getNetValue(this.#port.netId) : '';
        if (this.element.getAttribute('data-net-state') !== state) {
            this.element.setAttribute('data-net-state', state);
        }
    }
}