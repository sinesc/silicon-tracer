"use strict";

// A momentary switch.
class Momentary extends SimulationComponent {

    static EDIT_DIALOG = [
        { name: 'name', label: 'Label', type: 'string' },
        { name: 'defaultState', label: 'Default state', type: 'select', options: { "0": "Open", "1": "Closed" } },
        ...Component.EDIT_DIALOG,
    ];

    #output;
    #labelElement;
    #defaultState;
    #state;
    name = '';

    constructor(app, x, y, rotation, default_state = 0) {
        super(app, x, y, rotation, { top: [ null ], left: [ 'input' ], right: [ 'output' ] }, 'toggle');
        this.#output = this.portByName('output');
        this.#defaultState = default_state;
        this.#state = default_state;
    }

    // Link port to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        const action = () => this.#defaultState === 0 ? 'Open' : 'Close';
        this.setHoverMessage(this.inner, () => `Momentary switch <b>${this.name}</b>. <i>1</i> Hold to ${action()} circuit, <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.#labelElement = element(this.element, 'div', 'port-name');
        this.element.classList.add('port', 'status-outline'); // reuse port lightbulb css here
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.#defaultState ],
            name: this.name,
        };
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        sim.declareBuiltin('switch', suffix); // use a switch component to allow/block signal passing
        const c = sim.declareConst(this.state, 'q', suffix); // use const to store toggle button state (open/closed)
        sim.declareNet(['close' + suffix, 'q' + suffix]); // connect controllable const with switch control
        return c;
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
    onHotkey(key, action, what) {
        if (super.onHotkey(key, action, what)) {
            return true;
        } else if (key === '1' && what.type === 'hover') {
            this.state = action === 'up' ? this.#defaultState : (this.#defaultState === 0 ? 1 : 0);
            return true;
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure momentary switch", Momentary.EDIT_DIALOG, { name: this.name, rotation: this.rotation, defaultState: this.#defaultState });
        if (config) {
            this.name = config.name;
            this.rotation = config.rotation;
            this.#defaultState = Number.parseInt(config.defaultState);
            this.state = this.#defaultState;
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
        const state = this.getNetState(this.#output.netIds);
        if (this.element.getAttribute('data-net-state') !== state) {
            this.element.setAttribute('data-net-state', state);
        }
    }
}