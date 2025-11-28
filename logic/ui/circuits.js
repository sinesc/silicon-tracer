"use strict";

// Single circuit
class Circuit {
    label;
    uid;
    data;
    ports;
    gridConfig;
    portConfig;

    constructor(label, uid = null, data = [], ports = {}, gridConfig = {}, portConfig = {}) {
        assert.string(label),
        assert.string(uid, true);
        assert.array(data, false, (i) => assert.class(GridItem, i));
        assert.object(ports);
        assert.object(gridConfig);
        assert.object(portConfig);
        this.label = label;
        this.uid = uid ?? Circuit.generateUID();
        this.data = data;
        this.ports = ports;
        this.gridConfig = gridConfig;
        this.portConfig = portConfig;
    }

    // Returns item by GID.
    itemByGID(gid) {
        assert.string(gid);
        return this.data.find((c) => c.gid === gid) ?? null;
    }

    // Adds an item to the circuit.
    addItem(item) {
        assert.class(GridItem, item);
        this.data.push(item);
        return item;
    }

    // Removes an item from the circuit.
    removeItem(item) {
        assert.class(GridItem, item);
        let index = this.data.indexOf(item);
        if (index > -1) {
            this.data.splice(index, 1);
        } else {
            throw new Error('Failed to find item');
        }
        return item;
    }

    // Returns items that passed the given filter (c) => bool.
    filterItems(filter) {
        assert.function(filter);
        return this.data.filter((c) => c !== null && filter(c));
    }

    // Serializes a circuit for saving to file.
    serialize() {
        let data = this.data.map((item) => item.serialize());
        return { label: this.label, uid: this.uid, data, ports: this.ports, gridConfig: this.gridConfig, portConfig: this.portConfig };
    }

    // Unserializes circuit from decoded JSON-object.
    static unserialize(circuit) {
        assert.object(circuit);
        const components = circuit.data.map((i) => GridItem.unserialize(i));
        const uid = circuit.uid.includes('-') ? 'u' + circuit.uid.replaceAll('-', '') : circuit.uid; // LEGACY: convert legacy uid
        return new Circuit(circuit.label, uid, components, circuit.ports, circuit.gridConfig, circuit.portConfig);
    }

    // Link circuit to the grid, creating DOM elements for the circuit's components.
    link(grid) {
        assert.class(Grid, grid);
        for (let item of this.data) {
            item.link(grid);
        }
    }

    // Unlink circuit from the grid, deleting DOM elements of the circuit's components.
    unlink() {
        for (let item of this.data) {
            item.unlink();
        }
    }

    // Attach a simulation to the circuit.
    attachSimulation(netList, subCircuitInstance) {
        assert.class(NetList, netList);
        assert.number(subCircuitInstance);
        const tickListener = [];
        for (const net of netList.nets) {
            // collect list of interactive components in circuit
            let interactiveComponents = net.ports.map((p) => ({ portName: p.name, component: this.itemByGID(p.gid) })).filter((p) => p.component instanceof Interactive); // TODO: filter instance?
            tickListener.push(...interactiveComponents);
            // link ports on components
            for (const { name, gid, instance } of net.ports) {
                if (subCircuitInstance === instance) {
                    const component = this.itemByGID(gid);
                    if (component) {
                        const port = component.portByName(name);
                        port.netId = net.netId; // FIXME: port is sometimes undefined, figure out when/why. possibly after rename in subcomponent
                    }
                }
            }
            // link wires
            for (const { gid, instance } of net.wires) {
                if (subCircuitInstance === instance) {
                    const component = this.itemByGID(gid);
                    if (component) {
                        component.netId = net.netId;
                    }
                }
            }
        }
        // link circuits inside custom components to their corresponding simulation instance
        for (const [ gid, instance ] of Object.entries(netList.instances[subCircuitInstance].subInstances)) {
            const component = this.itemByGID(gid);
            component.instance = instance;
        }
        return tickListener;
    }

    // Detaches all items from the simulation by unsetting the item's netId.
    detachSimulation() {
        for (let item of this.data) {
            item.detachSimulation();
        };
    }

    // Generates port outline for the circuit's component representation.
    generateOutline() {
        // get ports from circuit
        let ports = this.data.filter((i) => i instanceof Port);
        let outline = { 'left': [], 'right': [], 'top': [], 'bottom': [] };
        for (let item of ports) {
            // side of the component-port on port-components is opposite of where the port-component is facing
            let side = Component.SIDES[(item.rotation + 2) % 4];
            // keep track of position so we can arrange ports on component by position in schematic
            let sort = side === 'left' || side === 'right' ? item.y : item.x;
            outline[side].push([ sort, item.name ]);
        }
        // determine if edges need to be even or odd length (for rotation to work properly, edges need to be either all odd or all even length)
        let height = Math.max(1, outline.left.length, outline.right.length);
        let width = Math.max(1, outline.top.length, outline.bottom.length);
        const parity = this.portConfig.parity ?? 'auto';
        const even = parity === 'auto' ? Math.max(width, height) % 2 === 0 : parity === 'even';
        // adjust width and height to both be either even or odd
        height += even !== (height % 2 === 0) ? 1 : 0;
        width += even !== (width % 2 === 0) ? 1 : 0;
        // also ensure minimum allowed component size is met
        height = Math.max(even ? 2 : 1, height);
        width = Math.max(even ? 2 : 1, width);
        // arrange ports as specified
        for (let side of Object.keys(outline)) {
            // sort by position
            outline[side].sort(([a,], [b,]) => a - b);
            outline[side] = outline[side].map(([sort, label]) => label);
            // determine expected length of side (number of required ports) and actual number of ports
            let length = side === 'left' || side === 'right' ? height : width;
            let available = length - outline[side].length;
            // prepare additional ports to insert on the outside and/or center (or wherever configured) of the side
            let edgePorts = (new Array(Math.floor(available / 2))).fill(null);
            let centerPorts = available % 2 === 1 ? [ null ] : [];
            // insert ports according to configured position
            outline[side] = [ ...edgePorts, ...outline[side], ...edgePorts ];
            let position = this.portConfig.gap === 'middle' ? outline[side].length / 2 : (this.portConfig.gap === 'start' ? 0 : outline[side].length);
            outline[side].splice(position, 0, ...centerPorts);
        }
        // reverse left/bottom due to the way we enumerate ports for easier rotation
        outline['left'].reverse();
        outline['bottom'].reverse();
        this.ports = outline;
    }

    // Generate a circuit id.
    static generateUID() {
        return 'u' + crypto.randomUUID().replaceAll('-', '');
    }
}

// Handles loading/saving/selecting circuits and keeping the grid updated.
class Circuits {

    static EDIT_DIALOG = [
        { name: 'label', label: 'Circuit label', type: 'string' },
        { name: 'gap', label: 'Pin gap', type: 'select', options: { start: "Top or left", middle: "Middle", end: "Bottom or right" } },
        { name: 'parity', label: 'Side lengths', type: 'select', options: { auto: "Automatic", even: "Even", odd: "Odd" } },
    ];

    static STRINGIFY_SPACE = "\t";

    #circuits;
    #currentCircuit;
    #fileHandle = null;
    #fileName = null;

    // Loads circuits from file, returning the filename if circuits was previously empty.
    async loadFile(clear) {
        const haveCircuits = !this.allEmpty;
        const [ handle ] = await File.openFile(this.#fileHandle);
        const file = await handle.getFile();
        const content = JSON.parse(await file.text());
        if (clear) {
            this.#circuits = [ ];
        }
        const newCircuitIndex = this.#unserialize(content);
        this.select(this.#circuits[newCircuitIndex].uid);
        if (clear || !haveCircuits) {
            // no other circuits loaded, make this the new file handle
            this.#fileHandle = handle;
            this.#fileName = file.name;
            return file.name;
        } else {
            return null;
        }
    }

    // Saves circuits to previously opened file. Will fall back to file dialog if necessary.
    async saveFile() {
        let writable;
        if (!this.#fileHandle || !File.verifyPermission(this.#fileHandle)) {
            const handle = await File.saveAs();
            writable = await handle.createWritable();
        } else {
            writable = await this.#fileHandle.createWritable();
        }
        await writable.write(JSON.stringify(this.#serialize(), null, Circuits.STRINGIFY_SPACE));
        await writable.close();
    }

    // Saves circuits as a new file.
    async saveFileAs() {
        const all = this.list();
        const handle = await File.saveAs(this.#fileName ?? all[0][1]);
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(this.#serialize(), null, Circuits.STRINGIFY_SPACE));
        await writable.close();
        // make this the new file handle
        this.#fileHandle = handle;
        this.#fileName = handle.name;
        return handle.name;
    }

    // Clears all circuits and closes the currently open file.
    closeFile() {
        this.#fileHandle = null;
        this.#fileName = null;
        this.clear();
    }

    // Returns name of currently opened file.
    get fileName() {
        return this.#fileName;
    }

    // Returns current circuit.
    get current() {
        return this.#circuits[this.#currentCircuit];
    }

    // Returns true while all existing circuits are empty.
    get allEmpty() {
        for (let circuit of this.#circuits) {
            if (circuit.data.length > 0) {
                return false;
            }
        }
        return true;
    }

    // Returns circuit by UID.
    byUID(uid) {
        return this.#circuits.find((c) => c.uid === uid) ?? null;
    }

    // Returns a list of loaded circuits.
    list() {
        let circuits = this.#circuits.map((c) => [ c.uid, c.label ]);
        circuits.sort((a, b) => a[1].toLowerCase() < b[1].toLowerCase() ? -1 : (a[1].toLowerCase() > b[1].toLowerCase() ? 1 : 0));
        return circuits;
    }

    // Clear all circuits and create a new empty circuit (always need one for the grid).
    clear() {
        this.#circuits = [ ];
        const label = this.#generateName();
        this.#circuits.push(new Circuit(label));
        this.#currentCircuit = 0;
        this.select(this.current.uid);
    }

    // Selects a circuit by UID.
    select(uid) {
        const index = this.#circuits.findIndex((c) => c.uid === uid);
        if (index > -1) {
            this.#currentCircuit = index;
            const circuit = this.#circuits[index];
            app.grid.setCircuit(circuit);
            return;
        }
        throw new Error('Could not find circuit ' + uid);
    }

    // Creates a new circuit.
    async create() {
        const config = await dialog("Configure circuit", Circuits.EDIT_DIALOG, { label: this.#generateName() });
        if (config) {
            this.#currentCircuit = this.#circuits.length;
            const circuit = new Circuit(config.label);
            this.#circuits.push(circuit);
            this.select(circuit.uid);
        }
    }

    // Rename
    async edit(uid) {
        const circuit = this.byUID(uid);
        const result = await dialog("Configure circuit", Circuits.EDIT_DIALOG, { label: circuit.label, gap: circuit.portConfig.gap, parity: circuit.portConfig.parity });
        if (result) {
            circuit.label = result.label;
            circuit.portConfig.gap = result.gap;
            circuit.portConfig.parity = result.parity;
            app.grid.setCircuit(circuit);
        }
    }

    // Serializes loaded circuits for saving to file.
    #serialize() {
        return { version: 1, circuits: this.#circuits.map((c) => c.serialize()) };
    }

    // Unserializes circuits from file.
    #unserialize(content) {
        const newCircuitIndex = this.#circuits.length;
        let unserialized = content.circuits.map((c) => Circuit.unserialize(c));
        this.#circuits.push(...unserialized);
        for (let circuit of this.#circuits) {
            circuit.generateOutline();
            Wire.compact(circuit);
        }
        return newCircuitIndex;
    }

    // Returns a generated name if the given name is empty.
    #generateName(name) {
        return name || 'New circuit #' + (this.#circuits.length + 1);
    }
}
