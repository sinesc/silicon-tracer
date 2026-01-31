"use strict";

// An IO port to interface with other circuits.
class Port extends SimulationComponent {

    static EDIT_DIALOG = [
        { name: 'name', label: 'Name', type: 'string', check: function(v, f) { return v === '' || this.checkNameIsUnique(v, this.grid.circuit) } },
        ...Component.EDIT_DIALOG,
    ];

    #port;
    #labelElement;
    #state = null;
    name = '';

    constructor(app, x, y, rotation) {
        super(app, x, y, rotation, { 'top': [ '' ], 'left': [ null, null, null ] }, 'port');
        this.#port = this.portByName('');
    }

    // Link port to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => (this.name === '' ? 'Inactive port (needs a network name)' : `Port <b>${this.name}</b>`) +  `. <i>1</i> Set high, <i>2</i> Set low, <i>3</i> Unset, <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.#labelElement = element(this.element, 'div', 'port-name');
        this.element.classList.add('port', 'status-outline');
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

    // Declare component simulation item.
    declare(sim, config, suffix, instanceId) {
        return instanceId !== 0 ? null : sim.declareConst(this.state, '', suffix);
    }

    // Returns user-set component state.
    get state() {
        return this.#state;
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        if (super.onHotkey(key, what)) {
            return true;
        } else if (key >= '0' && key <= '3' && what.type === 'hover') {
            const prevState = this.#state;
            if (key === '1') {
                this.#state = 1;
            } else if (key === '2') {
                this.#state = 0;
            } else if (key === '3') {
                this.#state = null;
            }
            if (prevState !== this.#state) {
                const sim = this.app.simulations.current;
                if (this.simId !== null && sim) {
                    sim.engine.setConstValue(this.simId, this.#state);
                }
                this.dirty = true;
            }
            return true;
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure port", Port.EDIT_DIALOG, { name: this.name, rotation: this.rotation }, this);
        if (config) {
            this.name = config.name;
            this.rotation = config.rotation;
            // update ports on all custom components  // TODO: optimize by actually only updating those custom components that use this circuit
            for (const circuit of values(this.app.circuits.all)) {
                for (const component of circuit.items.filter((i) => i instanceof CustomComponent)) {
                    component.updatePorts();
                }
            }
            this.redraw();
        }
    }

    // Checks whether the given name is unique among ports in the circuit.
    checkNameIsUnique(name, circuit = null) {
        for (const port of values(circuit.items.filter((i) => i instanceof Port))) {
            if (port !== this && port.name === name) {
                return false;
            }
        }
        return true;
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