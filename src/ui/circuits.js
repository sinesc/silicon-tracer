"use strict";

// Circuit management. Handles loading/saving/selecting circuits.
class Circuits {

    static EDIT_DIALOG = [
        { name: 'label', label: 'Circuit label', type: 'string' },
        { name: 'gap', label: 'Default pin gap', type: 'select', options: { start: "Top or left", middle: "Middle", end: "Bottom or right" } },
        { name: 'parity', label: 'Default side lengths', type: 'select', options: { auto: "Automatic", none: "Mixed (rotation snaps)", even: "Even", odd: "Odd" } },
    ];

    static STRINGIFY_SPACE = "\t";

    #app;
    #circuits;
    #currentCircuit;
    #fileHandle = null;
    #fileName = null;
    #libraries = {};

    constructor(app) {
        assert.class(Application, app);
        this.#app = app;
    }

    // Loads circuits from file, returning the filename if circuits was previously empty.
    async loadFile(clear, switchTo = true) {
        assert.bool(clear);
        assert.bool(switchTo);
        const haveCircuits = !this.allEmpty();
        const [ handle ] = await File.openFile(this.#fileHandle);
        const file = await handle.getFile();
        const content = JSON.parse(await file.text());
        if (clear) {
            this.#circuits = {};
        }
        const newCircuitUID = this.unserialize(content);
        if (switchTo) {
            this.select(newCircuitUID);
        }
        if (clear || !haveCircuits) {
            // no other circuits loaded, make this the new file handle
            this.#fileHandle = handle;
            this.#fileName = file.name;
            return file.name;
        } else {
            return null;
        }
    }

    // Import file and add circuits to loaded circuits.
    async importFile() {
        const [ handle ] = await File.importFile(this.#fileHandle);
        const file = await handle.getFile();
        const text = await file.text();
        if (text.includes('This file is intended to be loaded by Logisim')) {
            LogiSim.import(this.#app, handle, text);
        } else {
            alert('Unsupported file format'); // lame
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
    allEmpty() {
        for (const circuit of values(this.#circuits)) {
            if (circuit.lid === null && !circuit.empty) { // TODO: decide whether to consider libs or not
                return false;
            }
        }
        return true;
    }

    // Returns map of all contained circuits.
    get all() {
        return this.#circuits;
    }

    // Returns circuit by UID.
    byUID(uid) {
        assert.string(uid);
        return this.#circuits[uid] ?? null;
    }

    // Adds a circuit.
    add(circuit) {
        assert.class(Circuits.Circuit, circuit);
        this.#circuits[circuit.uid] = circuit;
    }

    // Returns a map(uid=>label) of loaded circuits or library circuits.
    list(lid = null) {
        const circuits = Object.values(this.#circuits).filter((c) => c.lid === lid).map((c) => [ c.uid, c.label ]);
        circuits.sort((a, b) => a[1].toLowerCase() < b[1].toLowerCase() ? -1 : (a[1].toLowerCase() > b[1].toLowerCase() ? 1 : 0));
        return circuits;
    }

    // Clear all circuits and create a new empty circuit (always need one for the grid).
    clear() {
        this.#circuits = {};
        const label = this.#generateName();
        const circuit = new Circuits.Circuit(label);
        this.#circuits[circuit.uid] = circuit;
        this.#currentCircuit = circuit.uid;
        this.select(circuit.uid);
    }

    // Selects a circuit by UID.
    select(uid) {
        assert.string(uid);
        if (this.#circuits[uid]) {
            this.#currentCircuit = uid;
            this.#app.grid.setCircuit(this.#circuits[uid]);
            return;
        }
        throw new Error('Could not find circuit ' + uid);
    }

    // Remove circuit by UID.
    delete(uid) {
        assert.string(uid);
        delete this.#circuits[uid];
        if (uid === this.#currentCircuit) {
            const fallback = Object.keys(this.#circuits)[0] ?? null;
            if (fallback) {
                this.select(fallback);
            }
            return;
        }
    }

    // Add library identifier.
    addLibrary(label, lid = null) {
        assert.string(label);
        assert.string(lid, true);
        lid ??= Circuits.generateLID();
        this.#libraries[lid] = label;
        return lid;
    }

    // Returns a map(lid=>label) of libraries.
    get libraries() {
        return pairs(this.#libraries);
    }

    // Generate a library id.
    static generateLID() {
        return 'l' + crypto.randomUUID().replaceAll('-', '');
    }

    // Creates a new circuit.
    async create() {
        const config = await dialog("Create circuit", Circuits.EDIT_DIALOG, { label: this.#generateName(), gap: 'middle', parity: 'automatic' });
        if (config) {
            const circuit = new Circuits.Circuit(config.label);
            this.#circuits[circuit.uid] = circuit;
            this.select(circuit.uid);
            return true;
        }
        return false;
    }

    // Rename
    async edit(uid) {
        const circuit = this.byUID(uid);
        const result = await dialog("Configure circuit", Circuits.EDIT_DIALOG, { label: circuit.label, gap: circuit.portConfig.gap, parity: circuit.portConfig.parity });
        if (result) {
            circuit.label = result.label;
            circuit.portConfig.gap = result.gap;
            circuit.portConfig.parity = result.parity;
            this.#app.grid.setCircuitLabel(result.label);
            this.#app.grid.setSimulationLabel(result.label);
            return true;
        }
        return false;
    }

    // Serializes loaded circuits for saving to file.
    #serialize() {
        return { version: 3, currentUID: this.#currentCircuit, circuits: Object.values(this.#circuits).map((c) => c.serialize()), libraries: this.#libraries };
    }

    // Unserializes circuits from file.
    unserialize(content) {
        for (const [ lid, label ] of pairs(content.libraries ?? {})) {
            this.#libraries[lid] = label;
        }
        for (const serialized of content.circuits) {
            // skip circuits that were already unserialized recursively by GridItem's dependency check for CustomComponents.
            if (!this.#circuits[serialized.uid]) {
                Circuits.Circuit.unserialize(this.#app, serialized, content.circuits);
            }
        }
        return content.currentUID;
    }

    // Returns a generated name if the given name is empty.
    #generateName(name) {
        return name || 'New circuit #' + (count(this.#circuits) + 1);
    }
}

// Single circuit, supports linking to grid and attaching to simulation.
Circuits.Circuit = class {
    label;
    uid;
    gridConfig;
    portConfig;

    #data;
    #gidLookup;
    #lid;

    constructor(label, uid = null, data = [], gridConfig = {}, portConfig = {}, lid = null) {
        assert.string(label),
        assert.string(uid, true);
        assert.string(lid, true);
        assert.array(data, false, (i) => assert.class(GridItem, i));
        assert.object(gridConfig);
        assert.object(portConfig);
        this.label = label;
        this.uid = uid ?? Circuits.Circuit.generateUID();
        this.#lid = lid;
        this.#data = data;
        this.gridConfig = Object.assign({}, { zoom: 1.25, offsetX: 0, offsetY: 0 }, gridConfig);
        this.portConfig = Object.assign({}, { gap: "middle", parity: "auto" }, portConfig);
        this.#gidLookup = new Map(data.map((v) => [ v.gid, new WeakRef(v) ]));
    }

    // Returns item by GID.
    itemByGID(gid) {
        assert.string(gid);
        const ref = this.#gidLookup.get(gid);
        return ref?.deref() ?? null;
    }

    // Adds an item to the circuit.
    addItem(item) {
        assert.class(GridItem, item);
        this.#data.push(item);
        this.#gidLookup.set(item.gid, new WeakRef(item));
        return item;
    }

    // Removes an item from the circuit.
    removeItem(item) {
        assert.class(GridItem, item);
        this.#gidLookup.delete(item.gid);
        const index = this.#data.indexOf(item);
        if (index > -1) {
            this.#data.splice(index, 1);
        } else {
            throw new Error('Failed to find item');
        }
        return item;
    }

    // Returns whether at least one item in the circuit passes the filter function.
    hasItem(filter) {
        return this.#data.some(filter);
    }

    // Returns an iterable generator over the circuit items.
    get items() {
        return values(this.#data);
    }

    // Returns whether the circuit is empty.
    get empty() {
        return this.#data.length === 0;
    }

    // Return the library id of this circuit, if any, or null.
    get lid() {
        return this.#lid;
    }

    // Serializes a circuit for saving to file.
    serialize() {
        const data = this.#data.map((item) => item.serialize());
        return { label: this.label, uid: this.uid, data, gridConfig: this.gridConfig, portConfig: this.portConfig, lid: this.#lid };
    }

    // Unserializes circuit from decoded JSON-object and adds it to Circuits. Dependencies of CustomComponents will also be added.
    static unserialize(app, rawCircuit, rawOthers) {
        assert.class(Application, app);
        assert.object(rawCircuit);
        const items = rawCircuit.data.map((item) => GridItem.unserialize(app, item, rawOthers));
        const circuit = new Circuits.Circuit(rawCircuit.label, rawCircuit.uid, items, rawCircuit.gridConfig, rawCircuit.portConfig, rawCircuit.lid);
        Wire.compact(circuit);
        app.circuits.add(circuit);
    }

    // Link circuit to the grid, creating DOM elements for the circuit's components. Ensures the item is detached.
    link(grid) {
        assert.class(Grid, grid);
        for (const item of this.#data) {
            item.detachSimulation();
            item.link(grid);
        }
    }

    // Unlink circuit from the grid, deleting DOM elements of the circuit's components.
    unlink() {
        for (const item of this.#data) {
            item.unlink();
        }
    }

    // Attach a simulation to the circuit. Also detaches previous simulation.
    attachSimulation(netList, subCircuitInstance) {
        assert.class(NetList, netList);
        assert.integer(subCircuitInstance);
        // link components to their simulation id (e.g. a clock id)
        const simIds = netList.instances[subCircuitInstance].simIds;
        for (const component of this.#data) {
            component.detachSimulation();
            component.simId = simIds[component.gid] ?? null; // TODO: throw error here
        }
        for (const net of netList.nets) {
            // link ports on components
            for (const { name, gid, instanceId } of net.ports) {
                if (subCircuitInstance === instanceId) {
                    const component = this.itemByGID(gid);
                    if (component) {
                        const port = component.portByName(name);
                        port.netIds ??= [];
                        port.netIds.push(net.netId);
                    }
                }
            }
            // link wires
            for (const { gid, instanceId } of net.wires) {
                if (subCircuitInstance === instanceId) {
                    const wire = this.itemByGID(gid);
                    if (wire) {
                        wire.netIds ??= [];
                        wire.netIds.push(net.netId);
                    }
                }
            }
        }
        // set simulation instance on custom components to allow for "zooming"/navigating into the correct instance of the circuit they represent
        for (const [ gid, instanceId ] of Object.entries(netList.instances[subCircuitInstance].subInstances)) {
            const component = this.itemByGID(gid);
            if (component) {
                component.instanceId = instanceId;
            }
        }
    }

    // Detaches all items from the simulation by unsetting the item's netId.
    detachSimulation() {
        for (const item of this.#data) {
            item.detachSimulation();
        };
    }

    // Generate a circuit id.
    static generateUID() {
        return 'u' + crypto.randomUUID().replaceAll('-', '');
    }

    // Returns the circuit as lists of NetWires and Netports.
    netItems(instanceId) {
        assert.integer(instanceId);
        // get all individual wires
        const wires = this.#data
            .filter((i) => i instanceof Wire && !i.limbo)
            .map((w) => new NetList.NetWire([ new Point(w.x, w.y), new Point(w.x + w.width, w.y + w.height) ], w.gid, instanceId));
        // get all component ports
        const ports = [];
        for (const component of this.#data.filter((i) => (i instanceof SimulationComponent) || (i instanceof VirtualComponent))) {
            const uid = component instanceof CustomComponent ? component.uid : null;
            const type = component instanceof CustomComponent ? 'descend' : (component instanceof Port ? 'ascend' : (component instanceof Tunnel ? 'tunnel' : null));
            const allowUnnamed = component instanceof Port || component instanceof Tunnel;
            for (const port of component.ports.filter((p) => allowUnnamed || p.name !== '')) {
                const { x, y } = port.coords(component.width, component.height, component.rotation);
                const compareName = component instanceof Port || component instanceof Tunnel ? component.name : port.name;
                const portType = type ?? (component instanceof Splitter ? (port.name === Splitter.SINGLE_PORT_NAME ? '1-to-n' : 'n-to-1') : null);
                ports.push(new NetList.NetPort(new Point(x + component.x, y + component.y), portType, port.name, compareName, component.gid, instanceId, uid, port.numChannels, port.ioType));
            }
        }
        return { wires, ports };
    }
}
