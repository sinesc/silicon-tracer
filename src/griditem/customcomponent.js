"use strict";

// Custom circuit represented as a component.
class CustomComponent extends VirtualComponent {

    static EDIT_DIALOG = [
        ...Component.EDIT_DIALOG,
        { name: 'spacing', label: 'Pin spacing', type: 'select', options: { 0: "None", 1: "One", 2: "Two" } },
        { name: 'parity', label: 'Side lengths', type: 'select', options: { auto: "Automatic", none: "Mixed", even: "Even", odd: "Odd" } },
        { name: 'gap', label: 'Pin gap (when not mixed)', type: 'select', options: { start: "Top or left", middle: "Middle", end: "Bottom or right" } },
    ];

    // Circuit UID for the circuit represented by this custom component.
    uid;

    #portParity;
    #portGap;
    #portSpacing;

    // Simulation instance of the represented sub-circuit.
    #instanceId = null;

    constructor(app, x, y, rotation, uid, parity = null, gap = null, spacing = null) {
        assert.integer(rotation);
        assert.string(uid);
        assert.enum([ 'auto', 'none', 'even', 'odd' ], parity, true);
        assert.enum([ 'start', 'middle', 'end' ], gap, true);
        assert.integer(spacing, true);
        const circuit = app.circuits.byUID(uid) ?? {};
        parity ??= circuit.portConfig.parity;
        gap ??= circuit.portConfig.gap;
        spacing ??= circuit.portConfig.spacing;
        const ports = CustomComponent.#generatePorts(circuit, parity, gap, spacing);
        super(app, x, y, rotation, ports, circuit.label ?? '');
        this.uid = uid;
        this.#portParity = parity;
        this.#portGap = gap;
        this.#portSpacing = spacing;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.uid, this.#portParity, this.#portGap, this.#portSpacing ],
        };
    }

    // Link custom component to a grid, enabling it to be rendered.
    link(grid) {
        this.updatePorts();
        const circuit = this.app.circuits.byUID(this.uid) ?? {};
        this.type = circuit.label;
        super.link(grid);
        this.element.classList.add('custom');
        this.setHoverMessage(this.inner, () => `<b>${this.typeLabel}</b>. <i>E</i> Edit, <i>W</i> Switch to sub-circuit ${this.app.simulations.current ? ' simulation, ' : ', '} ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Override top-markings with component label.
    get typeLabel() {
        return `"${this.topMarkings}" component`;
    }

    // Update ports from circuit.
    updatePorts() {
        const circuit = this.app.circuits.byUID(this.uid) ?? {};
        const portNames = CustomComponent.#generatePorts(circuit, this.#portParity, this.#portGap, this.#portSpacing);
        this.setPortsFromNames(portNames);
    }

    // Set the simulation instance of the represented sub-circuit.
    set instanceId(value) {
        assert.integer(value, true);
        if (this.element) {
            this.element.classList.toggle('simulated', value !== null);
        }
        this.#instanceId = value;
    }

    // Get the simulation instance of the represented sub-circuit.
    get instanceId() {
        return this.#instanceId;
    }

    // Detach custom component from simulation.
    detachSimulation() {
        super.detachSimulation();
        this.instanceId = null;
    }

    // Hover hotkey actions
    onHotkey(key, action, what) {
        if (action !== 'down') {
            return;
        }
        if (super.onHotkey(key, action, what)) {
            return true;
        } else if (key === 'w' && what.type === 'hover') {
            const sim = this.app.simulations.current;
            if (sim && this.instanceId !== null) {
                // switch to subcomponent simulation instance
                sim.reattach(this.instanceId);
            } else {
                // switch to another component, optionally start simulation for that one
                this.app.circuits.select(this.uid);
                const circuit = this.app.circuits.byUID(this.uid);
                this.app.simulations.select(circuit, this.app.config.autoCompile);
                this.app.history.record();
            }
            return true;
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        const circuit = this.app.circuits.byUID(this.uid) ?? {};
        const componentPreview = circuit.makeComponentPreview();
        const config = await dialog("Configure custom component", CustomComponent.EDIT_DIALOG, { spacing: '' + this.#portSpacing, gap: this.#portGap, parity: this.#portParity, rotation: this.rotation }, { onChange: componentPreview });
        if (config) {
            const grid = this.grid;
            this.unlink();
            this.#portSpacing = Number.parseInt(config.spacing);
            this.#portGap = config.gap;
            this.#portParity = config.parity;
            this.link(grid);
            this.rotation = config.rotation;
            this.redraw();
            this.grid.trackAction('Edit custom component');
        }
    }

    // Generates port outline for the circuit's component representation.
    static #generatePorts(circuit, parity, gap, spacing) {
        const SIDE_MAP = Component.SIDE_MAP;
        const SIDES = Component.SIDES;
        // pre-populate outline with custom placed ports
        const usedPorts = new Set();
        const validPorts = circuit.items.filter((p) => p instanceof Port && p.name !== '').map((p) => p.name).toArray();
        const outline = Object.map(SIDE_MAP, () => []);
        for (const side of SIDES) {
            const customPortList = circuit.portConfig.placement[side].trim();
            if (customPortList !== '') {
                const portNames = customPortList.split(',').map((s) => s.trim());
                for (const name of portNames) {
                    if (name !== '') {
                        if (usedPorts.has(name) || !validPorts.includes(name)) {
                            continue;
                        }
                        usedPorts.add(name);
                    }
                    outline[side].push(name);
                }
            }
        }
        // collect remaining ports into their default sides
        for (const item of circuit.items) {
            if (item instanceof Port && !usedPorts.has(item.name)) {
                if (item.name === '') continue;
                usedPorts.add(item.name);
                // side of the component-port on port-components is opposite of where the port-component is facing
                const side = SIDES[(item.rotation + 2) % 4];
                // keep track of position so we can arrange ports on component by position in schematic
                const sort = item[SIDE_MAP[side].axis];
                outline[side].push([ sort, item.name ]);
            }
        }
        // determine if edges need to be even or odd length (for rotation to work properly, edges need to be either all odd or all even length)
        const size = {
            height: Math.max(1, outline.left.length, outline.right.length),
            width: Math.max(1, outline.top.length, outline.bottom.length),
        };
        const even = parity === 'auto' ? Math.max(size.width, size.height) % 2 === 0 : parity === 'even';
        // adjust width and height to both be either even or odd
        if (parity !== 'none') {
            size.height += even !== (size.height % 2 === 0) ? 1 : 0;
            size.width += even !== (size.width % 2 === 0) ? 1 : 0;
        }
        // also ensure minimum allowed component size is met
        size.height = Math.max(even ? 2 : 1, size.height);
        size.width = Math.max(even ? 2 : 1, size.width);
        // arrange ports as specified
        for (const side of Object.keys(outline)) {
            let ports = outline[side];
            // separate custom ports (strings) from auto-ports ([ position, name ])
            const customSidePorts = [];
            const autoPorts = [];
            for (const p of ports) {
                if (typeof p === 'string') {
                    customSidePorts.push(p !== '' ? p : null);
                } else if (p[1] !== '') {
                    autoPorts.push(p);
                }
            }
            // sort auto ports by position
            autoPorts.sort(([a,], [b,]) => a - b);
            const autoPortsOnly = autoPorts.map(([sort, label]) => label);
            // determine expected length of side (number of required ports) and actual number of ports
            const totalPorts = customSidePorts.length + autoPortsOnly.length;
            //const length = side === 'left' || side === 'right' ? size.height : size.width;
            const length = size[SIDE_MAP[side].length];
            const available = length - totalPorts;
            // prepare additional ports to insert on the outside and/or center (or wherever configured) of the side
            const edgePorts = (new Array(Math.floor(available / 2))).fill(null);
            const centerPorts = available % 2 === 1 ? [ null ] : [];
            // insert ports according to configured position
            const combined = [ ...customSidePorts, ...autoPortsOnly ];
            const result = [ ...edgePorts, ...combined, ...edgePorts ];
            const position = gap === 'middle' ? result.length / 2 : (gap === 'start' ? 0 : result.length);
            result.splice(position, 0, ...centerPorts);
            // insert spacing
            if (spacing > 0) {
                const spaced = [];
                for (let i = 0; i < result.length; ++i) {
                    spaced.push(result[i]);
                    if (i < result.length - 1) {
                        for (let s = 0; s < spacing; ++s) {
                            spaced.push(null);
                        }
                    }
                }
                ports = spaced;
            } else {
                ports = result;
            }
            outline[side] = ports;
        }
        // reverse left/bottom due to the way we enumerate ports for easier rotation
        outline['left'].reverse();
        outline['bottom'].reverse();
        return outline;
    }

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    static editDialogConfig(_descriptor, defaults = {}) {
        return {
            title: 'Configure custom component',
            fields: CustomComponent.EDIT_DIALOG,
            data: {
                rotation: defaults.rotation ?? 0,
                spacing: String(defaults.spacing ?? 0),
                parity: defaults.parity ?? 'auto',
                gap: defaults.gap ?? 'start',
            },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(_app, _descriptor) {
        return {};
    }

    static descriptorInfo(desc) {
        const uid = desc['#u'];
        const circuit = app.circuits.byUID(uid);
        if (!circuit) {
            return super.descriptorInfo(desc);
        }
        return { label: circuit.label, hoverMessage: `<b>${circuit.label}</b>${circuit.description ? " (" + circuit.description + ")." : "."}` };
    }

    static fromDescriptor(app, desc, overrideDefaults = {}) {
        const uid = desc['#u'];
        if (!app.circuits.byUID(uid)) return null;
        return (grid, x, y) => grid.addItem(new CustomComponent(
            app,
            x,
            y,
            overrideDefaults.rotation ?? 0,
            uid,
            overrideDefaults.parity ?? null,
            overrideDefaults.gap ?? null,
            overrideDefaults.spacing != null ? Number.parseInt(overrideDefaults.spacing) : null
        ), false);
    }
}

GridItem.CLASSES['CustomComponent'] = CustomComponent;
