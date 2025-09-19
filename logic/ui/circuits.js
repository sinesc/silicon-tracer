"use strict";

// Handles loading/saving/selecting circuits and keeping the grid updated.
class Circuits {

    static STRINGIFY_SPACE = "\t";

    #circuits;
    #currentCircuit;
    #grid;
    #fileHandle = null;
    #fileName = null;

    constructor(grid) {
        this.#grid = grid;
        this.#reset();
    }

    // Loads circuits from file, returning the filename if circuits was previously empty.
    async loadFile(clear) {
        const haveCircuits = !this.allEmpty;
        const [ handle ] = await File.openFile(this.#fileHandle);
        const file = await handle.getFile();
        const content = JSON.parse(await file.text());
        if (clear) {
            this.clear();
        }
        this.#unserialize(content);
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
        this.#saveGrid();
        for (let circuit of this.#circuits) {
            if (circuit.data.length > 1 || circuit.data.filter((i) => i['_']['c'] !== 'Grid').length > 0) {
                return false;
            }
        }
        return true;
    }

    // Returns circuit by UID.
    byUID(uid) {
        for (let circuit of this.#circuits) {
            if (circuit.uid == uid) {
                return circuit;
            }
        }
        return null;
    }

    // Returns a list of loaded circuits.
    list() {
        let circuits = this.#circuits.map((c) => [ c.uid, c.label ]);
        circuits.sort((a, b) => {
            if (a[1] < b[1]) {
                return -1;
            } else if (a[1] > b[1]) {
                return 1;
            } else {
                return 0;
            }
        });
        return circuits;
    }

    // Clear all circuits and create a new empty circuit (always need one for the grid).
    clear() {
        this.#reset();
        this.#grid.clear();
        this.#grid.render();
    }

    // Selects a circuit by UID.
    select(newCircuitUID) {
        this.#saveGrid();
        this.#setGrid(newCircuitUID);
        this.#grid.render();
    }

    // Creates a new circuit.
    create() {
        this.#saveGrid();
        this.#grid.clear();
        this.#currentCircuit = this.#circuits.length;
        // TODO: need proper input component
        const name = prompt('Circuit name', this.#generateName()); // TBD: maybe not have the prompt here? but need public generateName then
        this.#circuits.push({ label: name, data: [] });
        this.#grid.render();
    }

    // Reset circuit entries
    #reset() {
        this.#circuits = [ ];
        let label = this.#generateName();
        this.#circuits.push({ label: label, uid: crypto.randomUUID(), data: [], ports: [] });
        this.#currentCircuit = 0;
        this.#grid.setCircuitLabel(label);
    }

    // Serializes loaded circuits for saving to file.
    #serialize() {
        this.#saveGrid();
        return { version: 1, circuits: this.#circuits };
    }

    // Unserializes circuits from file.
    #unserialize(content) {
        this.#saveGrid();
        this.#pruneEmpty();
        const newCircuitIndex = this.#circuits.length;
        this.#circuits.push(...content.circuits);
        // LEGACY: set UID for legacy circuits
        for (let circuit of this.#circuits) {
            circuit.uid ??= crypto.randomUUID();
            circuit.ports ??= CustomComponent.generateDefaultOutline(circuit.data);
        }
        this.#setGrid(this.#circuits[newCircuitIndex].uid);
        this.#grid.render();
    }

    // Returns a generated name if the given name is empty.
    #generateName(name) {
        return name || 'New circuit #' + (this.#circuits.length + 1);
    }

    // Saves current grid contents to current circuit.
    #saveGrid() {
        if (this.#currentCircuit !== -1) {
            this.#circuits[this.#currentCircuit].data = this.#grid.serialize();
        }
    }

    // Replaces the current grid contents with the given circuit. Does NOT save current contents.
    #setGrid(newCircuitUID) {
        for (let [ index, circuit ] of this.#circuits.entries()) {
            if (circuit.uid == newCircuitUID) {
                this.#grid.clear();
                this.#grid.unserialize(circuit.data);
                this.#grid.setCircuitLabel(circuit.label);
                this.#grid.setSimulationLabel(null);
                this.#currentCircuit = index;
                return;
            }
        }
        throw 'Could not find circuit ' + newCircuitUID;
    }

    // Prunes empty circuits (app starts with one empty circuit and loading appends by default, so the empty circuit should be pruned).
    #pruneEmpty() {
        for (let i = this.#circuits.length - 1; i >= 0; --i) {
            // TODO: don't prune user created empty circuits
            if (this.#circuits[i].data.length <= 1 && this.#circuits[i].data.filter((i) => i['_']['c'] !== 'Grid').length === 0) {
                this.#circuits.splice(i, 1);
                if (this.#currentCircuit === i) {
                    this.#currentCircuit = -1;
                }
            }
        }
    }
}
