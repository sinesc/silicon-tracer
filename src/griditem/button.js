"use strict";

// A button component with toggle or momentary mode, driving an output to 0 or 1 directly.
class Button extends SimulationComponent {

    static TYPE_DESCRIPTION = 'Buttons generate an output based on the button-state.';

    static EDIT_DIALOG = [
        { name: 'name', label: 'Label', type: 'string' },
        { name: 'mode', label: 'Mode', type: 'select', options: { "toggle": "Toggle", "momentary": "Momentary" } },
        { name: 'defaultState', label: 'Default (momentary)', type: 'select', options: { "0": "Off", "1": "On" } },
        ...Component.EDIT_DIALOG,
    ];

    #output;
    #labelElement;
    #mode;
    #defaultState;
    #uiState = 0;
    name = ''; // TODO rename to label, names should have meaning in the circuit, e.g. same named tunnels connect, circuit-port names map to component-port names,...

    constructor(app, x, y, rotation, mode = 'toggle', defaultState = 0, uiState = 0) {
        super(app, x, y, rotation, { top: [ null ], left: [ null ], right: [ 'q' ] }, 'button');
        this.#output = this.portByName('q');
        this.#mode = mode;
        this.#defaultState = defaultState;
        this.#uiState = uiState;
    }

    // Link to a grid, enabling rendering.
    link(grid) {
        super.link(grid);
        const hotkeyHint = () => this.#mode === 'toggle'
            ? `<i>1</i> Close circuit, <i>2</i> Open circuit, <i>E</i> Edit, ${Component.HOTKEYS}.`
            : `<i>1</i> Hold to ${this.#defaultState === 0 ? 'close' : 'open'} circuit, <i>E</i> Edit, ${Component.HOTKEYS}.`;
        this.setHoverMessage(this.inner, () => `${this.typeLabel} <b>${this.name}</b>. ${hotkeyHint()}`, { type: 'hover' });
        this.#labelElement = html(this.element, 'div', 'port-name');
        this.element.classList.add('port', 'status-outline'); // reuse port lightbulb css here
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.#mode, this.#defaultState, this.#uiState ],
            name: this.name,
        };
    }

    // Returns the button's type label string.
    get typeLabel() {
        return this.#mode === 'toggle' ? 'Toggle button' : 'Momentary button';
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return sim.declareConst(this.#effectiveState, suffix);
    }

    // Returns the effective state passed to the simulation.
    get #effectiveState() {
        return this.#defaultState ^ this.#uiState;
    }

    // Sets uiState to produce the given effective state and updates the simulation.
    #setEffective(value) {
        this.#uiState = value ^ this.#defaultState;
        const sim = this.app.simulations.current;
        if (this.simIds.length > 0 && sim) {
            sim.engine.setConstValue(this.simIds[0], this.#effectiveState);
        }
        this.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;
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
                if (this.simIds.length > 0 && sim) {
                    sim.engine.setConstValue(this.simIds[0], this.#effectiveState);
                }
                this.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;
                return true;
            }
        }
    }

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    static editDialogConfig(descriptor, defaults = {}) {
        return {
            title: 'Configure button',
            fields: Button.EDIT_DIALOG,
            data: {
                name: defaults.name ?? '',
                rotation: defaults.rotation ?? 0,
                mode: descriptor['#t'] ?? defaults.mode ?? 'toggle',
                defaultState: String(defaults.defaultState ?? 0),
            },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.button;
    }

    // Updates the descriptor in-place from a completed dialog config (for mode changes).
    static updateDescriptorFromConfig(descriptor, config) {
        descriptor['#t'] = config.mode;
    }

    // Handle edit hotkey.
    async onEdit() {
        const { title, fields, data } = Button.editDialogConfig({ '#t': this.#mode }, {
            name: this.name,
            rotation: this.rotation,
            defaultState: this.#defaultState,
        });
        const config = await dialog(title, fields, data);
        if (config) {
            this.name = config.name;
            this.#mode = config.mode;
            this.#defaultState = Number.parseInt(config.defaultState);
            this.#uiState = 0; // reset runtime state when default changes
            this.rotation = config.rotation;
            const sim = this.app.simulations.current;
            if (this.simIds.length > 0 && sim) {
                sim.engine.setConstValue(this.simIds[0], this.#effectiveState);
            }
            this.redraw();
            this.grid.trackAction('Edit button');
        }
    }

    // Renders the button onto the grid.
    renderFull() {
        if (!super.renderFull()) {
            return false;
        }

        // render permanently visible label
        const side = ComponentPort.portSide(this.rotation, 'left');
        const labelCoords = ComponentPort.portCoords(this.width, this.height, side, 0, true);
        ComponentPort.renderLabel(this, this.#labelElement, side, labelCoords.x * this.grid.zoom, labelCoords.y * this.grid.zoom, this.name, false, true);

        // render effective state (lightbulb/circle thing)
        this.element.setAttribute('data-port-state', this.#effectiveState);

        return true;
    }

    // Updates effective state indicator.
    renderDetail() {
        super.renderDetail();
        this.element.setAttribute('data-port-state', this.#effectiveState);
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

    static descriptorInfo(desc) {
        if (desc['#t'] === 'toggle') {
            return { label: 'Toggle button', hoverMessage: `<b>Toggle button</b>. ${this.TYPE_DESCRIPTION ?? ''}` };
        } else if (desc['#t'] === 'momentary') {
            return { label: 'Momentary button', hoverMessage: `<b>Momentary button</b>. ${this.TYPE_DESCRIPTION ?? ''}` };
        }
        return super.descriptorInfo(desc);
    }

    static fromDescriptor(app, desc, overrideDefaults = {}) {
        const mode = desc['#t'];
        if (mode !== 'toggle' && mode !== 'momentary') return null;
        const d = app.config.placementDefaults;
        return (grid, x, y) => {
            const rotation = overrideDefaults.rotation ?? d.button.rotation;
            const defaultState = overrideDefaults.defaultState != null ? Number.parseInt(overrideDefaults.defaultState) : 0;
            const btn = new Button(app, x, y, rotation, mode, defaultState);
            if (overrideDefaults.name) btn.name = overrideDefaults.name;
            return grid.addItem(btn, false);
        };
    }
}

GridItem.CLASSES['Button'] = Button;
