"use strict";

// Single circuit
class Circuit {
    label;
    uid;
    data;
    ports;
    gridConfig;

    constructor(label, uid = null, data = [], ports = {}, gridConfig = {}) {
        assert.string(label),
        assert.string(uid, true);
        assert.array(data, false, (i) => assert.class(GridItem, i));
        assert.object(ports);
        assert.object(gridConfig);
        this.label = label;
        this.uid = uid ?? generateUID();
        this.data = data;
        this.ports = ports;
        this.gridConfig = gridConfig;
    }

    // Returns item by GID.
    itemByGID(gid) {
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
        return { label: this.label, uid: this.uid, data, ports: this.ports, gridConfig: this.gridConfig };
    }

    // Unserializes circuit from decoded JSON-object.
    static unserialize(circuit) {
        const components = circuit.data.map((i) => GridItem.unserialize(i));
        const uid = circuit.uid.includes('-') ? 'u' + circuit.uid.replaceAll('-', '') : circuit.uid; // LEGACY: convert legacy uid
        return new Circuit(circuit.label, uid, components, circuit.ports, circuit.gridConfig);
    }

    // Link simulation to circuit.
    attachSimulation(netList) {
        const tickListener = [];
        for (const net of netList.nets) {
            // create new net from connected gate i/o-ports
            let interactiveComponents = net.ports.map((p) => ({ portName: p.name, component: this.itemByGID(p.gid) })).filter((p) => p.component instanceof Interactive);
            tickListener.push(...interactiveComponents);
            // link ports on components
            for (const { name, gid } of net.ports) {
                const component = this.itemByGID(gid);
                if (component) {
                    const port = component.portByName(name);
                    port.netId = net.netId; // FIXME: port is sometimes undefined, figure out when/why. possibly after rename in subcomponent
                }
            }
            // link wires
            for (const { gid } of net.wires) {
                const component = this.itemByGID(gid);
                if (component) {
                    component.netId = net.netId;
                }
            }
        }
        return tickListener;
    }

    // Detaches all items from the simulation by unsetting the item's netId.
    detachSimulation() {
        for (let item of this.data) {
            item.detachSimulation();
        };
    }
}

// Handles loading/saving/selecting circuits and keeping the grid updated.
class Circuits {

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
        app.grid.updateCircuit();
        await writable.write(JSON.stringify(this.#serialize(), null, Circuits.STRINGIFY_SPACE));
        await writable.close();
    }

    // Saves circuits as a new file.
    async saveFileAs() {
        const all = this.list();
        const handle = await File.saveAs(this.#fileName ?? all[0][1]);
        const writable = await handle.createWritable();
        app.grid.updateCircuit();
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
        app.grid.updateCircuit();
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
        circuits.sort((a, b) => a[1] < b[1] ? -1 : (a[1] > b[1] ? 1 : 0));
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
    create() {
        // TODO: need proper input component
        const label = prompt('Circuit label', this.#generateName());
        this.#currentCircuit = this.#circuits.length;
        const circuit = new Circuit(label);
        this.#circuits.push(circuit);
        this.select(circuit.uid);
    }

    // Rename
    rename(uid) {
        const circuit = this.byUID(uid);
        circuit.label = prompt('Circuit label', circuit.label);
        app.grid.setCircuit(circuit);
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
            circuit.ports ??= CustomComponent.generateDefaultOutline(circuit.data);
            Wire.compact(circuit);
        }
        return newCircuitIndex;
    }

    // Returns a generated name if the given name is empty.
    #generateName(name) {
        return name || 'New circuit #' + (this.#circuits.length + 1);
    }
}
