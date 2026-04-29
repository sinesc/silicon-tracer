"use strict";

// An IO port to interface with other circuits.
class Port extends SimulationComponent {

    static TYPE_LABEL = 'Port';
    static TYPE_LABEL_LONG = 'Component IO-Port';
    static TYPE_DESCRIPTION = 'Ports enable connections between circuits.';

    static EDIT_DIALOG = [
        { name: 'name', label: 'Name', type: 'string', check: function(v, f) { return v === '' || this.checkNameIsUnique(v, this.grid.circuit) } },
        ...Component.EDIT_DIALOG,
    ];

    #port;
    #labelElement;
    #state = null;
    name = '';

    constructor(app, x, y, rotation) {
        super(app, x, y, rotation, { 'top': [ 'q' ], 'left': [ null, null, null ] }, 'port');
        this.#port = this.portByName('q');
        this.#port.label = '';
    }

    // Link port to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => {
            const isRootCircuit = this.grid?.circuit?.uid === this.app.simulations.current?.uid;
            const label = this.name !== '' ? `Port <b>${this.name}</b>` : (isRootCircuit ? 'Port (no name)' : 'Inactive port (needs a network name)');
            return `${label}. <i>1</i> Set high, <i>2</i> Set low, <i>3</i> Unset, <i>E</i> Edit, ${Component.HOTKEYS}.`;
        }, { type: 'hover' });
        this.#labelElement = html(this.element, 'div', 'port-name');
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

    // Completely ignore this port if it doesn't have a name and is not in the root circuit.
    // Unnamed ports in the root circuit are allowed since there are no outside connections to name them for.
    disregard(instanceId = null) {
        return this.name === '' && instanceId !== 0;
    }

    // Declare component simulation item.
    declare(sim, config, suffix, instanceId) {
        return instanceId !== 0 ? null : sim.declareConst(this.state, suffix);
    }

    // Returns user-set component state.
    get state() {
        return this.#state;
    }

    // Returns true if the search string matches this port's name.
    match(string) {
        assert.string(string);
        return super.match(string) || this.name.toLowerCase().includes(string);
    }

    // Hover hotkey actions
    onHotkey(key, action, what) {
        if (action !== 'down') {
            return;
        }
        if (super.onHotkey(key, action, what)) {
            return true;
        } else if (key >= '0' && key <= '3' && what.type === 'hover') {
            if (this.#isSubcircuit()) {
                this.app.showNotice('Cannot change port state, currently controlled by simulation parent circuit', 3);
                return;
            }
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
                if (this.simIds.length > 0 && sim) {
                    sim.engine.setConstValue(this.simIds[0], this.#state);
                }
                this.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;
            }
            return true;
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure port", Port.EDIT_DIALOG, { name: this.name, rotation: this.rotation }, { context: this });
        if (config) {
            const previousName = this.name.trim();
            this.name = config.name.trim();
            this.rotation = config.rotation;
            // update ports on all custom components that are NOT on the grid (firstly because that unlinks them and secondly because the
            // circuit this port belongs to is the one being edited on the grid, so can't possibly have a component of itself on the grid
            for (const circuit of values(this.app.circuits.all)) {
                for (const component of circuit.items.filter((i) => i.grid === null && i instanceof CustomComponent)) {
                    component.updatePorts();
                }
            }
            // update port names in circuit placement overrides
            const placement = this.grid.circuit.portConfig.placement;
            for (const side of Component.SIDES) {
                placement[side] = placement[side].split(',').map((n) => n.trim() === previousName && previousName !== '' ? this.name : n).join(',');
            }
            this.redraw();
            this.app.grid.trackAction('Edit port');
        }
    }

    // Called after paste: ensures port name is unique in the circuit.
    onPaste() {
        if (this.name !== '') {
            this.name = this.makeUnique('name', this.name);
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
    renderFull() {
        if (!super.renderFull()) {
            return false;
        }

        // render permanently visible label
        const side = ComponentPort.portSide(this.rotation, 'bottom');
        const labelCoords = ComponentPort.portCoords(this.width, this.height, side, 0, true);
        ComponentPort.renderLabel(this, this.#labelElement, side, labelCoords.x * this.grid.zoom, labelCoords.y * this.grid.zoom, this.name, false, true);

        // render user-set state (lightbulb/circle thing)
        this.element.setAttribute('data-port-state', this.#isSubcircuit() ? '' : (this.#state ?? ''));

        return true;
    }

    // Updates user-set state indicator.
    renderDetail() {
        super.renderDetail();
        this.element.setAttribute('data-port-state', this.#isSubcircuit() ? '' : (this.#state ?? ''));
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

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    // Uses a simplified name field without the context-dependent uniqueness check (not applicable for toolbar defaults).
    static editDialogConfig(_descriptor, defaults = {}) {
        const fields = [
            { name: 'name', label: 'Name', type: 'string' },
            ...Component.EDIT_DIALOG,
        ];
        return {
            title: 'Configure port',
            fields,
            data: { name: defaults.name ?? '', rotation: defaults.rotation ?? 0 },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.port;
    }

    static fromDescriptor(app, _desc, overrideDefaults = {}) {
        const d = app.config.placementDefaults;
        return (grid, x, y) => {
            const port = new Port(app, x, y, overrideDefaults.rotation ?? d.port.rotation);
            if (overrideDefaults.name) port.name = overrideDefaults.name;
            grid.addItem(port, false);
            if (overrideDefaults.name) port.name = port.makeUnique('name', overrideDefaults.name);
            return port;
        };
    }

    #isSubcircuit() {
        return this.app.simulations.current && this.app.simulations.current.uid !== this.grid.circuit.uid;
    }
}

GridItem.CLASSES['Port'] = Port;
