"use strict";

// Custom circuit represented as a component.
class CustomComponent extends Component {

    static EDIT_DIALOG = [
        //{ name: 'label', label: 'Component label', type: 'string' },
        ...Component.EDIT_DIALOG,
        { name: 'gap', label: 'Pin gap', type: 'select', options: { start: "Top or left", middle: "Middle", end: "Bottom or right" } },
        { name: 'parity', label: 'Side lengths', type: 'select', options: { auto: "Automatic", none: "Mixed (rotation snaps)", even: "Even", odd: "Odd" } },
    ];

    // Circuit UID for the circuit represented by this custom component.
    uid;

    #portParity;
    #portGap;

    // Simulation instance of the represented sub-circuit.
    #instanceId = null;

    constructor(app, x, y, rotation, uid, parity = null, gap = null) {
        assert.integer(rotation);
        assert.string(uid);
        assert.enum([ 'auto', 'none', 'even', 'odd' ], parity, true);
        assert.enum([ 'start', 'middle', 'end' ], gap, true);
        const circuit = app.circuits.byUID(uid) ?? {};
        parity ??= circuit.portConfig.parity;
        gap ??= circuit.portConfig.gap;
        const ports = CustomComponent.#generatePorts(circuit, parity, gap);
        super(app, x, y, ports, circuit.label ?? '');
        this.rotation = rotation;
        this.uid = uid;
        this.#portParity = parity;
        this.#portGap = gap;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.rotation, this.uid, this.#portParity, this.#portGap ]},
        };
    }

    // Link custom component to a grid, enabling it to be rendered.
    link(grid) {
        this.updatePorts();
        const circuit = this.app.circuits.byUID(this.uid) ?? {};
        this.type = circuit.label;
        super.link(grid);
        this.element.classList.add('custom');
        this.setHoverMessage(this.inner, () => `<b>${this.label}</b>. <i>E</i> Edit, <i>W</i> Switch to sub-circuit ${this.app.simulations.current ? ' simulation, ' : ', '} ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Update ports from circuit.
    updatePorts() {
        const circuit = this.app.circuits.byUID(this.uid) ?? {};
        const portNames = CustomComponent.#generatePorts(circuit, this.#portParity, this.#portGap);
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
    onHotkey(key, what) {
        if (super.onHotkey(key, what)) {
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
            }
            return true;
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        const circuit = this.app.circuits.byUID(this.uid) ?? {};
        const result = await dialog("Configure custom component", CustomComponent.EDIT_DIALOG, { gap: this.#portGap ?? circuit.portConfig.gap, parity: this.#portParity ?? circuit.portConfig.parity, rotation: this.rotation });
        if (result) {
            const grid = this.grid;
            this.unlink();
            this.#portGap = result.gap;
            this.#portParity = result.parity;
            this.link(grid);
            this.rotation = result.rotation;
            this.redraw();
        }
    }

    // Generates port outline for the circuit's component representation.
    static #generatePorts(circuit, parity, gap) {
        // get ports from circuit
        const ports = circuit.items.filter((i) => i instanceof Port);
        const outline = { 'left': [], 'right': [], 'top': [], 'bottom': [] };
        for (const item of ports) {
            // side of the component-port on port-components is opposite of where the port-component is facing
            const side = Component.SIDES[(item.rotation + 2) % 4];
            // keep track of position so we can arrange ports on component by position in schematic
            const sort = side === 'left' || side === 'right' ? item.y : item.x;
            outline[side].push([ sort, item.name ]);
        }
        // determine if edges need to be even or odd length (for rotation to work properly, edges need to be either all odd or all even length)
        let height = Math.max(1, outline.left.length, outline.right.length);
        let width = Math.max(1, outline.top.length, outline.bottom.length);
        const even = parity === 'auto' ? Math.max(width, height) % 2 === 0 : parity === 'even';
        // adjust width and height to both be either even or odd
        if (parity !== 'none') {
            height += even !== (height % 2 === 0) ? 1 : 0;
            width += even !== (width % 2 === 0) ? 1 : 0;
        }
        // also ensure minimum allowed component size is met
        height = Math.max(even ? 2 : 1, height);
        width = Math.max(even ? 2 : 1, width);
        // arrange ports as specified
        for (const side of Object.keys(outline)) {
            // sort by position
            outline[side].sort(([a,], [b,]) => a - b);
            outline[side] = outline[side].map(([sort, label]) => label);
            // determine expected length of side (number of required ports) and actual number of ports
            const length = side === 'left' || side === 'right' ? height : width;
            const available = length - outline[side].length;
            // prepare additional ports to insert on the outside and/or center (or wherever configured) of the side
            const edgePorts = (new Array(Math.floor(available / 2))).fill(null);
            const centerPorts = available % 2 === 1 ? [ null ] : [];
            // insert ports according to configured position
            outline[side] = [ ...edgePorts, ...outline[side], ...edgePorts ];
            const position = gap === 'middle' ? outline[side].length / 2 : (gap === 'start' ? 0 : outline[side].length);
            outline[side].splice(position, 0, ...centerPorts);
        }
        // reverse left/bottom due to the way we enumerate ports for easier rotation
        outline['left'].reverse();
        outline['bottom'].reverse();
        return outline;
    }
}