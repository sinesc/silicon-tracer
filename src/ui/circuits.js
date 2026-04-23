"use strict";

// Circuit management. Handles loading/saving/selecting circuits.
class Circuits {

    static COMPAT_VERSION = 4;
    static STRINGIFY_SPACE = "\t";

    #app;
    #circuits;
    #currentCircuit;
    #fileHandle = null;
    #fileName = null;
    #libraries = {};
    #globalUndoStack = new UndoStack();

    constructor(app) {
        assert.class(Application, app);
        this.#app = app;
        this.#globalUndoStack.init(null);
    }

    get globalUndoStack() { return this.#globalUndoStack; }

    // Creates a new circuit.
    async create() {
        const circuit = await Circuit.create(this.#app, this.#generateLabel());
        if (circuit) {
            this.#circuits[circuit.uid] = circuit;
            this.select(circuit.uid);
            return true;
        }
        return false;
    }

    // Loads circuits from file, returning the filename if circuits was previously empty.
    async loadFile(clear, switchTo = true, asLibrary = false) {
        assert.bool(clear);
        assert.bool(switchTo);
        const haveCircuits = !this.allEmpty();
        const [ handle ] = await File.open(this.#fileHandle);
        const file = await handle.getFile();
        let content;
        try {
            content = Circuits.#decodeJSON(await file.text());
        } catch (e) {
            content = null;
        }
        if (!content || !Array.isArray(content.circuits) || content.circuits.length === 0) {
            await errorDialog('Cannot load file', `The file <b>${file.name}</b> is corrupt or not a Silicon Tracer circuits file.`);
            return;
        }
        if ((content.version ?? 0) > Circuits.COMPAT_VERSION) {
            const ok = await confirmDialog('Newer file version', `The file <b>${file.name}</b> was created with a newer version of Silicon Tracer and may get corrupted by loading it. Load anyway?`);
            if (!ok) return;
        }
        if (!clear) {
            const duplicates = (content.circuits ?? []).filter((c) => this.#circuits[c.uid]);
            if (duplicates.length > 0) {
                const list = duplicates.map((c) => `<li>${c.label}</li>`).join('');
                await errorDialog('Cannot load file', `The file <b>${file.name}</b> contains the following already loaded circuits and cannot be ${asLibrary ? 'included' : 'merged'}:<ul>${list}</ul>`);
                return;
            }
        }
        let fileLid = null;
        if (clear) {
            this.#clear();
        }
        if (asLibrary) {
            fileLid = this.addLibrary(content.label ?? file.name.replace(/\.stc/, ''));
            this.#app.showNotice(`Library "${content.label}" has been added to the 'Component' menu.`);
        }
        const errors = [];
        const newCircuitUID = this.unserialize(content, fileLid, false, errors);
        if (switchTo) {
            this.select(newCircuitUID);
        }
        if (clear || !haveCircuits) {
            // no other circuits loaded, make this the new file handle
            this.#fileHandle = handle;
            if (!asLibrary) {
                this.#fileName = file.name;
            }
        }
        if (errors.length > 0) {
            await errorDialog('Circuit issues detected', '<b>Some components or component types used in the file are missing or unsupported.</b><br><br>Please check the the loaded circuits carefully as <b><u>you will lose the missing/unsupported components</u></b> if you save the file now. If you have unloaded packaged libraries (via CTRL+Close) the circuits might depend on those. Otherwise, if you are not on the latest version of Silicon Tracer updating might fix the issue.');
        }
    }

    // Import file and add circuits to loaded circuits.
    async importFile() {
        const [ handle ] = await File.open(this.#fileHandle, '.circ');
        const file = await handle.getFile();
        const text = await file.text();
        if (text.includes('This file is intended to be loaded by Logisim')) {
            await LogiSim.import(this.#app, handle, text);
        } else {
            await errorDialog('Unsupported file format', 'The file does not appear to be a valid LogiSim Evolution file.');
        }
    }

    // Saves circuits to previously opened file. Will fall back to file dialog if necessary.
    async saveFile() {
        let writable;
        let name;
        if (!this.#fileHandle || !File.verifyPermission(this.#fileHandle)) {
            const handle = await File.saveAs();
            name = handle.name;
            writable = await handle.createWritable();
        } else {
            name = this.#fileHandle.name;
            writable = await this.#fileHandle.createWritable();
        }
        await writable.write(Circuits.#encodeJSON(this.#serialize(File.makeLabel(name))));
        await writable.close();
        this.#app.showNotice(`File "${name}" has been saved.`);
    }

    // Saves circuits as a new file.
    async saveFileAs() {
        const all = this.list();
        const handle = await File.saveAs(this.#fileName ?? all[0][1]);
        const writable = await handle.createWritable();
        await writable.write(Circuits.#encodeJSON(this.#serialize(File.makeLabel(handle.name))));
        await writable.close();
        // make this the new file handle
        this.#fileHandle = handle;
        this.#fileName = handle.name;
        this.#app.showNotice(`File "${handle.name}" has been saved.`);
        return handle.name;
    }

    // Clears all circuits and closes the currently open file.
    closeFile(removeLibraries = false) {
        this.#fileHandle = null;
        this.#fileName = null;
        this.reset(removeLibraries);
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

    // Returns circuit by label (and LID).
    byLabel(label, lid = null) {
        assert.string(label);
        assert.string(lid, true);
        for (const circuit of values(this.#circuits)) {
            if (circuit.label === label && circuit.lid === lid) {
                return circuit;
            }
        }
        return null;
    }

    // Adds a circuit.
    add(circuit) {
        assert.class(Circuit, circuit);
        this.#circuits[circuit.uid] = circuit;
    }

    // Returns a map(uid=>label) of loaded circuits or library circuits.
    list(lid = null) {
        assert.string(lid, true);
        const circuits = Object.values(this.#circuits).filter((c) => c.lid === lid && (lid === null || c.visibleInLib)).map((c) => [ c.uid, c.label, c.description ]);
        circuits.sort((a, b) => a[1].localeCompare(b[1], 'en', { numeric: true }));
        return circuits;
    }

    // Clear all circuits and create a new empty circuit (always need one for the grid).
    reset(removeLibraries = false) {
        assert.bool(removeLibraries);
        this.#clear(removeLibraries);
        this.#app.toolbar.loadPins(Application.DEFAULT_TOOLBAR_PINS);
        const label = this.#generateLabel();
        const circuit = new Circuit(this.#app, label);
        this.#circuits[circuit.uid] = circuit;
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
            this.#selectFallbackCircuit();
        }
    }

    // Add library identifier.
    addLibrary(label, lid = null, packaged = false) {
        assert.string(label);
        assert.string(lid, true);
        lid ??= Circuits.generateLID();
        this.#libraries[lid] = { label, packaged };
        return lid;
    }

    // Returns a set of lids (including null for main circuits) that contain circuits depending on circuits in the given library.
    libraryDependents(lid) {
        assert.string(lid);
        const libCircuitUids = new Set(Object.values(this.#circuits).filter((c) => c.lid === lid).map((c) => c.uid));
        const dependentLids = new Set();
        for (const circuit of Object.values(this.#circuits)) {
            if (circuit.lid === lid) continue;
            for (const item of circuit.items) {
                if (item instanceof CustomComponent && libCircuitUids.has(item.uid)) {
                    dependentLids.add(circuit.lid);
                    break;
                }
            }
        }
        return dependentLids;
    }

    // Returns a Set of UIDs of circuits that directly or indirectly depend on the given circuit uid.
    circuitDependents(uid) {
        assert.string(uid);
        const dependentUids = new Set([uid]);
        const result = new Set();
        let changed = true;
        while (changed) {
            changed = false;
            for (const circuit of Object.values(this.#circuits)) {
                if (result.has(circuit.uid)) continue;
                for (const item of circuit.items) {
                    if (item instanceof CustomComponent && dependentUids.has(item.uid)) {
                        result.add(circuit.uid);
                        dependentUids.add(circuit.uid);
                        changed = true;
                        break;
                    }
                }
            }
        }
        return result;
    }

    // Recursively collects transitive non-packaged library lids that the given library depends on into visited.
    #collectLibraryDependencies(lid, visited = new Set()) {
        for (const circuit of Object.values(this.#circuits)) {
            if (circuit.lid !== lid) continue;
            for (const item of circuit.items) {
                if (item instanceof CustomComponent) {
                    const refLid = this.#circuits[item.uid]?.lid;
                    if (refLid && refLid !== lid && !this.#libraries[refLid]?.packaged && !visited.has(refLid)) {
                        visited.add(refLid);
                        this.#collectLibraryDependencies(refLid, visited);
                    }
                }
            }
        }
        return visited;
    }

    // Returns whether the given library ID belongs to a packaged library.
    isPackaged(lid) {
        return this.#libraries[lid]?.packaged ?? false;
    }

    // Finds packaged library by its label and returns the LID.
    packagedLibraryByLabel(label) {
        const result = pairs(this.#libraries).find(([ lid, library ]) => library.label === label && library.packaged);
        return result?.[0] ?? null;
    }

    // Returns a map(lid=>label) of libraries.
    get libraries() {
        return pairs(Object.map(this.#libraries, (k, v) => v.label));
    }

    // Serializes circuits belonging to the given library for file export (resets lid to null).
    serializeLibrary(lid) {
        assert.string(lid);
        const label = this.#libraries[lid].label;
        const depLids = this.#collectLibraryDependencies(lid);
        const circuits = [];
        for (const circuit of Object.values(this.#circuits)) {
            if (circuit.lid === lid) {
                const s = circuit.serialize();
                s.lid = null;
                circuits.push(s);
            } else if (depLids.has(circuit.lid)) {
                circuits.push(circuit.serialize());
            }
        }
        const libraries = {};
        for (const depLid of depLids) {
            libraries[depLid] = this.#libraries[depLid].label;
        }
        return { version: Circuits.COMPAT_VERSION, label, currentUID: circuits[0]?.uid ?? null, circuits, libraries };
    }

    // Saves circuits from the given library to a user-chosen file.
    async extractLibrary(lid) {
        assert.string(lid);
        const label = this.#libraries[lid].label;
        const handle = await File.saveAs(label);
        const writable = await handle.createWritable();
        await writable.write(Circuits.#encodeJSON(this.serializeLibrary(lid)));
        await writable.close();
        this.#app.showNotice(`Library "${label}" has been saved to "${handle.name}".`);
    }

    // Generate a library id.
    static generateLID() {
        return 'l' + crypto.randomUUID().replaceAll('-', '');
    }

    // Removes a non-packaged library and all circuits belonging to it from memory.
    removeLibrary(lid) {
        assert.string(lid);
        for (const [ uid, circuit ] of Object.entries(this.#circuits)) {
            if (circuit.lid === lid) {
                delete this.#circuits[uid];
            }
        }
        delete this.#libraries[lid];
        if (!this.#circuits[this.#currentCircuit]) {
            this.#selectFallbackCircuit();
        }
    }

    // Serializes loaded circuits for saving to file.
    #serialize(label) {
        const packaged = pairs(this.#libraries).filter(([ lid, library ]) => library.packaged).map(([ lid, library ]) => lid).toArray();
        return {
            version: Circuits.COMPAT_VERSION,
            label,
            currentUID: this.#currentCircuit,
            circuits: Object.values(this.#circuits).filter((c) => !packaged.includes(c.lid)).map((c) => c.serialize()),
            libraries: Object.map(Object.filter(this.#libraries, (k, v) => !v.packaged), (k, v) => v.label),
            toolbar: this.#app.toolbar.toolbarPins,
        };
    }

    // Unserializes circuits from file.
    unserialize(content, setLid = null, packaged = false, errors = []) {
        assert.object(content);
        assert.string(setLid, true);
        assert.bool(packaged);
        assert.array(errors);
        for (const [ lid, label ] of pairs(content.libraries ?? {})) {
            this.#libraries[lid] = { label, packaged };
        }
        for (const serialized of content.circuits) {
            // skip circuits that were already unserialized recursively by GridItem's dependency check for CustomComponents.
            if (!this.#circuits[serialized.uid]) {
                Circuit.unserialize(this.#app, serialized, content.circuits, setLid, errors);
            }
        }
        // restore toolbar pins only when loading the primary file (not a library)
        if (setLid === null && !packaged && Array.isArray(content.toolbar)) {
            this.#app.toolbar.loadPins(content.toolbar);
        }
        return content.currentUID;
    }

    // Restores a circuit that was previously deleted (from a global undo snapshot).
    restoreDeletedCircuit(snapshot) {
        const errors = [];
        snapshot = JSON.parse(snapshot);
        Circuit.unserialize(this.#app, snapshot, [], null, errors);
        this.select(snapshot.uid);
        this.#app.simulations.select(this.current, this.#app.config.autoCompile);
        this.#app.haveChanges = true;
    }

    // Returns a list of subcircuit uids contained directly or indirectly within this ciruit.
    subcircuitUIDs(uid) {
        assert.string(uid);
        let foundUIDs = new Set();
        const circuit = this.#circuits[uid];
        for (const item of circuit.items) {
            if (item instanceof CustomComponent && !foundUIDs.has(item.uid)) {
                foundUIDs.add(item.uid);
                foundUIDs = foundUIDs.union(this.subcircuitUIDs(item.uid));
            }
        }
        return foundUIDs;
    }

    // Selects a fallback circuit (e.g. when the current one no longer exists), prefers non-library circuits.
    #selectFallbackCircuit() {
        const fallback = (Object.values(this.#circuits).find((c) => c.lid === null)?.uid) ?? Object.keys(this.#circuits)[0] ?? null;
        if (fallback) {
            this.select(fallback);
        }
    }

    // Clear all circuits/libraries (except packaged).
    #clear(removeLibraries = false) {
        // remove all circuits except for those defined in packaged libraries
        this.#circuits ??= {};
        for (const [ uid, circuit ] of pairs(this.#circuits)) {
            if (removeLibraries || circuit.lid === null || !this.#libraries[circuit.lid].packaged) {
                delete this.#circuits[uid];
            }
        }
        // remove all non-packaged libraries
        this.#libraries ??= {};
        for (const [ lid, library ] of pairs(this.#libraries)) {
            if (removeLibraries || !library.packaged) {
                delete this.#libraries[lid];
            }
        }
    }

    // Decode optionally JSON-P wrapped JSON.
    static #decodeJSON(text) {
        return JSON.parse(text.replace(/^loadFiles.push\(\s*(.+)\)\s*$/s, "$1"));
    }

    // Encode as JSON-P so that the saved files can also be loaded via script tag (for library inclusion).
    static #encodeJSON(object) {
        const json = JSON.stringify(object, null, Circuits.STRINGIFY_SPACE);
        return `loadFiles.push(\n${json}\n)`;
    }

    // Returns a generated circuit label.
    #generateLabel() {
        let id = 1;
        let name;
        while (this.byLabel(name = `New circuit #${id}`, null) !== null) {
            ++id;
        }
        return name;
    }
}
