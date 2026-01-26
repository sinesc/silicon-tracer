"use strict";

// A toggleable button with saved state.
class Toggle extends SimulationComponent {

    static EDIT_DIALOG = [
        { name: 'name', label: 'Label', type: 'string' },
        { name: 'state', label: 'State', type: 'select', options: { "-1": "Unset", "0": "Low", "1": "High" } },
        ...Component.EDIT_DIALOG,
    ];

    #port;
    #labelElement;
    #state = null;
    name = '';

    constructor(app, x, y, rotation, state = null) {
        super(app, x, y, rotation, { 'top': [ '' ], 'left': [ null ] }, 'toggle');
        this.#port = this.portByName('');
        this.#state = state;
    }

    // Link port to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => `Toggle button <b>${this.name}</b>. <i>1</i> Set high, <i>2</i> Set low, <i>3</i> Unset, <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.#labelElement = element(this.element, 'div', 'port-name');
        this.element.classList.add('port', 'status-outline'); // reuse port lightbulb css here
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.rotation, this.#state ]},
            name: this.name,
        };
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return sim.declareConst(this.state, '', suffix);
    }

    // Returns user-set component state.
    get state() {
        return this.#state;
    }

    // Sets toggle button state.
    set state(value) {
        assert.integer(value, true);
        if (this.#state !== value) {
            this.#state = value;
            const sim = this.app.simulations.current;
            if (this.simId !== null && sim) {
                sim.engine.setConstValue(this.simId, this.#state);
            }
            this.dirty = true;
        }
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        if (super.onHotkey(key, what)) {
            return true;
        } else if (key >= '0' && key <= '3' && what.type === 'hover') {
            if (key === '1') {
                this.state = 1;
            } else if (key === '2') {
                this.state = 0;
            } else if (key === '3') {
                this.state = null;
            }
            return true;
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure button", Toggle.EDIT_DIALOG, { name: this.name, rotation: this.rotation, state: this.#state === null ? '-1' : this.#state }, this);
        if (config) {
            this.name = config.name;
            this.rotation = config.rotation;
            this.state = config.state === '-1' ? null : Number.parseInt(config.state);
            this.redraw();
        }
    }

    // Renders the toggle onto the grid.
    render() {
        if (!super.render()) {
            return false;
        }

        // render permanently visible label
        const side = ComponentPort.portSide(this.rotation, 'bottom');
        const labelCoords = ComponentPort.portCoords(this.width, this.height, side, 0, true);
        ComponentPort.renderLabel(this, this.#labelElement, side, labelCoords.x * this.grid.zoom, labelCoords.y * this.grid.zoom, this.name, false, true);

        // render user-set state (lightbulb/circle thing)
        this.element.setAttribute('data-port-state', this.#state ?? '');

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