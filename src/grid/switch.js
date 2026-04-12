"use strict";

// A switch component with toggle or momentary mode.
class Switch extends SimulationComponent {

    static EDIT_DIALOG = [
        { name: 'name', label: 'Label', type: 'string' },
        { name: 'mode', label: 'Mode', type: 'select', options: { "toggle": "Toggle", "momentary": "Momentary" } },
        { name: 'defaultState', label: 'Default state', type: 'select', options: { "0": "Open", "1": "Closed" } },
        { name: 'hasInput', label: 'Has input port', type: 'bool' },
        ...Component.EDIT_DIALOG,
    ];

    #output;
    #labelElement;
    #mode;
    #defaultState;
    #hasInput;
    #uiState = 0;
    name = '';

    constructor(app, x, y, rotation, mode = 'toggle', defaultState = 0, hasInput = true) {
        super(app, x, y, rotation, Switch.#makePorts(hasInput), 'switch');
        this.#output = this.portByName('output');
        this.#mode = mode;
        this.#defaultState = defaultState;
        this.#hasInput = hasInput;
    }

    // Link to a grid, enabling rendering.
    link(grid) {
        super.link(grid);
        const hotkeyHint = () => this.#mode === 'toggle'
            ? `<i>1</i> Close circuit, <i>2</i> Open circuit, <i>E</i> Edit, ${Component.HOTKEYS}.`
            : `<i>1</i> Hold to ${this.#defaultState === 0 ? 'close' : 'open'} circuit, <i>E</i> Edit, ${Component.HOTKEYS}.`;
        const modeLabel = () => this.#mode === 'toggle' ? 'Toggle switch' : 'Momentary switch';
        this.setHoverMessage(this.inner, () => `${modeLabel()} <b>${this.name}</b>. ${hotkeyHint()}`, { type: 'hover' });
        this.#labelElement = html(this.element, 'div', 'port-name');
        this.element.classList.add('port', 'status-outline'); // reuse port lightbulb css here
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.#mode, this.#defaultState, this.#hasInput ],
            name: this.name,
        };
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        sim.declareBuiltin('switch', suffix); // use a switch component to allow/block signal passing
        const c = sim.declareConst(this.#effectiveState, suffix); // use const to store switch state (open/closed)
        sim.declareNet(['close' + suffix, 'q' + suffix]); // connect controllable const (output q) with switch control
        if (!this.#hasInput) {
            sim.declareConst(1, suffix + '_i'); // tie switch input to constant 1 (note we could also use only a constant and no switch but that would require renaming the port)
            sim.declareNet(['input' + suffix, 'q' + suffix + '_i']);
        }
        return c;
    }

    // Returns the port layout based on whether the input port is enabled.
    static #makePorts(hasInput) {
        return { top: [ null ], left: [ hasInput ? 'input' : null ], right: [ 'output' ] };
    }

    // Returns the effective state passed to the simulation.
    get #effectiveState() {
        return this.#defaultState ^ this.#uiState;
    }

    // Sets uiState to produce the given effective state and updates the simulation.
    #setEffective(value) {
        this.#uiState = value ^ this.#defaultState;
        const sim = this.app.simulations.current;
        if (this.simId !== null && sim) {
            sim.engine.setConstValue(this.simId, this.#effectiveState);
        }
        this.dirty = true;
    }

    // Hover hotkey actions.
    onHotkey(key, action, what) {
        if (super.onHotkey(key, action, what)) {
            return true;
        }
        if (what.type !== 'hover') return;
        if (this.#mode === 'toggle') {
            if (action !== 'down') return;
            if (key === '1') {
                this.#setEffective(1); // close circuit
                return true;
            } else if (key === '2') {
                this.#setEffective(0); // open circuit
                return true;
            }
        } else { // momentary
            if (key === '1') {
                this.#uiState = action === 'up' ? 0 : 1;
                const sim = this.app.simulations.current;
                if (this.simId !== null && sim) {
                    sim.engine.setConstValue(this.simId, this.#effectiveState);
                }
                this.dirty = true;
                return true;
            }
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure switch", Switch.EDIT_DIALOG, {
            name: this.name,
            rotation: this.rotation,
            mode: this.#mode,
            defaultState: this.#defaultState,
            hasInput: this.#hasInput,
        });
        if (config) {
            this.name = config.name;
            this.#mode = config.mode;
            this.#defaultState = Number.parseInt(config.defaultState);
            this.#uiState = 0; // reset runtime state when default changes
            if (config.hasInput !== this.#hasInput) {
                this.#hasInput = config.hasInput;
                const grid = this.grid;
                this.unlink();
                this.setPortsFromNames(Switch.#makePorts(this.#hasInput), 1);
                this.#output = this.portByName('output');
                this.link(grid);
            }
            this.rotation = config.rotation;
            const sim = this.app.simulations.current;
            if (this.simId !== null && sim) {
                sim.engine.setConstValue(this.simId, this.#effectiveState);
            }
            this.dirty = true;
            this.redraw();
            this.grid.trackAction('Edit switch');
        }
    }

    // Renders the switch onto the grid.
    render() {
        if (!super.render()) {
            return false;
        }

        // render permanently visible label
        const side = ComponentPort.portSide(this.rotation, 'bottom');
        const labelCoords = ComponentPort.portCoords(this.width, this.height, side, 0, true);
        ComponentPort.renderLabel(this, this.#labelElement, side, labelCoords.x * this.grid.zoom, labelCoords.y * this.grid.zoom, this.name, false, true);

        // render effective state (lightbulb/circle thing)
        this.element.setAttribute('data-port-state', this.#effectiveState);

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

    static toolbarMeta(desc) {
        if (desc['#t'] === 'toggle') {
            return { label: 'Toggle switch', hoverMessage: '<b>Toggle switch</b> with permanently saved state. <i>LMB</i> Drag to move onto grid.' };
        }
        if (desc['#t'] === 'momentary') {
            return { label: 'Momentary switch', hoverMessage: '<b>Momentary switch</b>. <i>LMB</i> Drag to move onto grid.' };
        }
        return null;
    }

    static fromDescriptor(app, desc) {
        const mode = desc['#t'];
        if (mode !== 'toggle' && mode !== 'momentary') return null;
        const d = app.config.placementDefaults;
        return (grid, x, y) => grid.addItem(new Switch(app, x, y, d.switch.rotation, mode));
    }
}

GridItem.CLASSES['Switch'] = Switch;
