"use strict";

// Circuit management. Handles loading/saving/selecting circuits.
class Circuits {

    static CREATE_DIALOG = [
        { name: 'label', label: 'Circuit label', type: 'string' },
        { name: 'visibleInLib', label: 'Visible when loaded as library', type: 'bool' },
        { separator: true, text: 'Default settings. These can be overriden per placed component.' },
        { name: 'spacing', label: 'Pin spacing', type: 'select', options: { 0: "None", 1: "One", 2: "Two" }, apply: (v, f) => Number.parseInt(v) },
        { name: 'parity', label: 'Side lengths', type: 'select', options: { auto: "Automatic", none: "Mixed (rotation snaps)", even: "Even", odd: "Odd" } },
        { name: 'gap', label: 'Pin gap (when lengths not mixed)', type: 'select', options: { start: "Top or left", middle: "Middle", end: "Bottom or right" } },
    ];

    static EDIT_DIALOG = [
        ...Circuits.CREATE_DIALOG,
        { separator: true, text: 'Optional comma-separated lists of custom port positions. Blank entries create gaps, e.g. <code>a,,b,c</code> creates a gap between a and b.' },
        { name: 'top', label: 'Top ports', type: 'string' },
        { name: 'right', label: 'Right ports ', type: 'string' },
        { name: 'bottom', label: 'Bottom ports', type: 'string' },
        { name: 'left', label: 'Left ports', type: 'string' },
    ];

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
        const config = await dialog("Create circuit", Circuits.CREATE_DIALOG, { label: this.#generateLabel(), spacing: '0', gap: 'middle', parity: 'automatic', visibleInLib: true });
        if (config) {
            const circuit = new Circuits.Circuit(this.#app, config.label);
            circuit.portConfig.spacing = config.spacing;
            circuit.portConfig.gap = config.gap;
            circuit.portConfig.parity = config.parity;
            circuit.visibleInLib = config.visibleInLib;
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
        const content = Circuits.#decodeJSON(await file.text());
        let fileLid = null;
        if (clear) {
            this.#clear();
        }
        if (asLibrary) {
            fileLid = this.addLibrary(content.label ?? file.name.replace(/\.stc/, ''));
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
            await infoDialog('File errors detected', '<b>Some components or component types used in the file are missing or unsupported.</b><br><br>Please check the the loaded circuits carefully as <b><u>you will lose the missing/unsupported components</u></b> if you save the file now. If you have unloaded packaged libraries (via CTRL+Close) the circuits might depend on those. Otherwise, if you are not on the latest version of Silicon Tracer updating might fix the issue.');
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
            await infoDialog('Unsupported file format', 'The file does not appear to be a valid LogiSim Evolution file.');
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
        return handle.name;
    }

    // Clears all circuits and closes the currently open file.
    closeFile(removeLibraries = false) {
        this.#fileHandle = null;
        this.#fileName = null;
        this.reset(removeLibraries);
    }

    // Creates a component preview handler that can be passed as onChange callback to a dialog.
    static makeComponentPreview(app, circuit) {
        // add component preview to right side of the dialog
        let previewContainer = null;
        let grid = null;
        return (blackout, data) => {
            // build/update preview grid
            if (!previewContainer) {
                previewContainer = html(blackout, 'div', 'circuit-preview');
                const dialogWindow = blackout.querySelector('.dialog-container');
                const fixedOffsetX = Math.floor(0.5 * dialogWindow.offsetWidth + 0.5 * previewContainer.offsetWidth)
                const fixedOffsetY = Math.floor(-0.5 * dialogWindow.offsetHeight + 0.5 * previewContainer.offsetHeight)
                previewContainer.style.transform = `translate(calc(-50% + ${fixedOffsetX}px), calc(-50% + ${fixedOffsetY}px))`;
                grid = new Grid(app, previewContainer, true);
                grid.setCircuit(new Circuits.Circuit(app, 'preview'));
            } else {
                const item = first(grid.circuit.items);
                grid.removeItem(item);
            }
            // data defaults (circuit vs component dialog have slightly different options)
            data.label ??= circuit.label;
            data.rotation ??= 0;
            // replace item on each dialog change, temporarily rename circuit to current value in dialog (bit of a hack but avoids special purpose changes to Circuit/CustomComponent)
            const backupLabel = circuit.label;
            const backupPlacement = circuit.portConfig.placement;
            circuit.label = data.label;
            if (data.top !== undefined) { // intentionally not defined in component edit
                circuit.portConfig.placement = { top: data.top, right: data.right, bottom: data.bottom, left: data.left };
            }
            grid.addItem(new CustomComponent(app, 3 * Grid.SPACING, 2 * Grid.SPACING, data.rotation, circuit.uid, data.parity, data.gap, Number.parseInt(data.spacing)));
            grid.render();
            if (data.top !== undefined) {
                circuit.portConfig.placement = backupPlacement;
            }
            circuit.label = backupLabel;
        };
    }

    // Configure circuit.
    async edit(uid) {
        const circuit = this.byUID(uid);
        const componentPreview = Circuits.makeComponentPreview(this.#app, circuit);
        // show configuration dialog and preview
        const result = await dialog("Configure circuit", Circuits.EDIT_DIALOG, {
            label: circuit.label,
            spacing: '' + circuit.portConfig.spacing,
            gap: circuit.portConfig.gap,
            parity: circuit.portConfig.parity,
            visibleInLib: circuit.visibleInLib,
            top: circuit.portConfig.placement.top,
            right: circuit.portConfig.placement.right,
            bottom: circuit.portConfig.placement.bottom,
            left: circuit.portConfig.placement.left,
        }, { onChange: componentPreview });
        if (result) {
            circuit.label = result.label;
            circuit.portConfig.spacing = Number.parseInt(result.spacing);
            circuit.portConfig.gap = result.gap;
            circuit.portConfig.parity = result.parity;
            circuit.visibleInLib = result.visibleInLib;
            circuit.portConfig.placement.top = result.top;
            circuit.portConfig.placement.right = result.right;
            circuit.portConfig.placement.bottom = result.bottom;
            circuit.portConfig.placement.left = result.left;
            this.#app.grid.setCircuitLabel(result.label);
            this.#app.grid.setSimulationLabel(result.label);
            this.#app.grid.trackAction('Edit circuit');
            return true;
        }
        return false;
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
        assert.class(Circuits.Circuit, circuit);
        this.#circuits[circuit.uid] = circuit;
    }

    // Returns a map(uid=>label) of loaded circuits or library circuits.
    list(lid = null) {
        assert.string(lid, true);
        const circuits = Object.values(this.#circuits).filter((c) => c.lid === lid && (lid === null || c.visibleInLib)).map((c) => [ c.uid, c.label ]);
        circuits.sort((a, b) => a[1].localeCompare(b[1], 'en', { numeric: true }));
        return circuits;
    }

    // Clear all circuits and create a new empty circuit (always need one for the grid).
    reset(removeLibraries = false) {
        assert.bool(removeLibraries);
        this.#clear(removeLibraries);
        this.#app.loadToolbarPins([]);
        const label = this.#generateLabel();
        const circuit = new Circuits.Circuit(this.#app, label);
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
            const fallback = (Object.values(this.#circuits).find((c) => c.lid === null)?.uid) ?? Object.keys(this.#circuits)[0] ?? null;
            if (fallback) {
                this.select(fallback);
            }
            return;
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

    // Generate a library id.
    static generateLID() {
        return 'l' + crypto.randomUUID().replaceAll('-', '');
    }

    // Serializes loaded circuits for saving to file.
    #serialize(label) {
        const packaged = pairs(this.#libraries).filter(([ lid, library ]) => library.packaged).map(([ lid, library ]) => lid).toArray();
        return {
            version: 4,
            label,
            currentUID: this.#currentCircuit,
            circuits: Object.values(this.#circuits).filter((c) => !packaged.includes(c.lid)).map((c) => c.serialize()),
            libraries: Object.map(Object.filter(this.#libraries, (k, v) => !v.packaged), (k, v) => v.label),
            toolbar: this.#app.toolbarPins,
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
                Circuits.Circuit.unserialize(this.#app, serialized, content.circuits, setLid, errors);
            }
        }
        // restore toolbar pins only when loading the primary file (not a library)
        if (setLid === null && !packaged) {
            this.#app.loadToolbarPins(content.toolbar ?? []);
        }
        return content.currentUID;
    }

    // Restores a circuit that was previously deleted (from a global undo snapshot).
    restoreDeletedCircuit(snapshot) {
        const errors = [];
        Circuits.Circuit.unserialize(this.#app, snapshot, [], null, errors);
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

// Single circuit, supports linking to grid and attaching to simulation.
Circuits.Circuit = class {
    label;
    uid;
    gridConfig;
    portConfig;
    visibleInLib;
    undoStack = new UndoStack();

    #app;
    #data;
    #gidLookup;
    #lid;

    constructor(app, label, uid = null, data = [], gridConfig = {}, portConfig = {}, lid = null, visibleInLib = true) {
        assert.class(Application, app);
        assert.string(label),
        assert.string(uid, true);
        assert.string(lid, true);
        assert.array(data, false, (i) => assert.class(GridItem, i));
        assert.object(gridConfig);
        assert.object(portConfig);
        this.#app = app;
        this.label = label;
        this.uid = uid ?? 'u' + crypto.randomUUID().replaceAll('-', '');
        this.#lid = lid;
        this.visibleInLib = visibleInLib;
        this.#data = data;
        this.gridConfig = Object.assign({}, { zoom: 1.25, offsetX: 0, offsetY: 0 }, gridConfig);
        this.portConfig = Object.assign({}, { spacing: 0, gap: "middle", parity: "auto" }, portConfig);
        this.portConfig.placement = Object.assign({}, { top: '', right: '', bottom: '', left: '' }, portConfig.placement ?? {});
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

    // Returns true if this circuit belongs to a packaged (read-only) library.
    get readonly() {
        return this.#app.circuits.isPackaged(this.#lid);
    }

    // Serializes the circuit for saving to file.
    serialize() {
        const data = this.#data.map((item) => item.serialize());
        return { label: this.label, uid: this.uid, data, gridConfig: this.gridConfig, portConfig: this.portConfig, lid: this.#lid, visibleInLib: this.visibleInLib };
    }

    // Serializes circuit state for undo tracking (excludes gridConfig, uid, lid, visibleInLib).
    serializeForUndo() {
        const grid = this.#app.grid;
        const selectedGids = new Set(grid.circuit === this ? grid.selection.map((i) => i.gid) : []);
        return {
            label: this.label,
            portConfig: JSON.parse(JSON.stringify(this.portConfig)),
            data: this.#data.map((item) => ({ ...item.serialize(), '#gid': item.gid, '#selected': selectedGids.has(item.gid) })),
        };
    }

    // Restores circuit state from an undo snapshot produced by serializeForUndo().
    // Re-links to the grid if this circuit is currently displayed.
    restoreFromUndo(snapshot) {
        const grid = this.#app.grid;
        const isDisplayed = grid.circuit === this;
        if (isDisplayed) this.unlink();
        this.#data = [];
        this.#gidLookup = new Map();
        this.label = snapshot.label;
        Object.assign(this.portConfig, snapshot.portConfig);
        this.portConfig.placement = Object.assign({}, snapshot.portConfig.placement);
        const selectedGids = new Set();
        for (const raw of snapshot.data) {
            const item = GridItem.unserialize(this.#app, raw, [], null, []);
            if (raw['#gid']) {
                item.restoreGid(raw['#gid']);
                if (raw['#selected']) selectedGids.add(raw['#gid']);
            }
            this.addItem(item);
        }
        Wire.compact(this);
        if (isDisplayed) {
            this.link(grid);
            grid.setCircuitLabel(this.label);
            grid.setSimulationLabel(this.label);
            grid.markDirty();
            // Restore selection: match items by their restored GIDs (wires re-created by Wire.compact won't match).
            const newSelection = this.#data.filter((item) => selectedGids.has(item.gid));
            newSelection.forEach((item) => item.selected = true);
            grid.setSelection(newSelection);
        }
    }

    // Unserializes circuit from decoded JSON-object and adds it to Circuits. Dependencies of CustomComponents will also be added.
    static unserialize(app, rawCircuit, rawOthers, setLid = null, errors = []) {
        assert.class(Application, app);
        assert.object(rawCircuit);
        assert.string(setLid, true);
        assert.array(errors);
        const items = rawCircuit.data.map((item) => GridItem.unserialize(app, item, rawOthers, setLid, errors));
        const circuit = new Circuits.Circuit(app, rawCircuit.label, rawCircuit.uid, items, rawCircuit.gridConfig, rawCircuit.portConfig, rawCircuit.lid ?? setLid, rawCircuit.visibleInLib ?? true);
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
            if (component instanceof SimulationComponent) {
                const id = simIds[component.gid];
                component.simId = Array.isArray(id) ? id[0] : (id ?? null); // null fallback required for disregarded components
            }
        }
        for (const net of netList.nets) {
            // link ports on components
            for (const { name, gid, instanceId } of net.ports) {
                if (subCircuitInstance === instanceId) {
                    const component = this.itemByGID(gid);
                    if (component) {
                        const port = component.portByName(name);
                        port.netIds ??= [];
                        if (net.netId !== null) {
                            port.netIds.push(net.netId);
                        }
                    }
                }
            }
            // link wires
            for (const { gid, instanceId } of net.wires) {
                if (subCircuitInstance === instanceId) {
                    const wire = this.itemByGID(gid);
                    if (wire) {
                        wire.netIds ??= [];
                        if (net.netId !== null) {
                            wire.netIds.push(net.netId);
                        }
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
        }
    }

    // Returns the circuit as lists of NetWires and Netports.
    netItems(instanceId) {
        assert.integer(instanceId);
        // get all individual wires
        const wires = this.#data
            .filter((i) => i instanceof Wire && !i.disregard())
            .map((w) => new NetList.NetWire([ new Point(w.x, w.y), new Point(w.x + w.width, w.y + w.height) ], w.gid, instanceId));
        // get all component ports
        const ports = [];
        for (const component of this.#data.filter((i) => ((i instanceof SimulationComponent) || (i instanceof VirtualComponent)) && !i.disregard())) {
            const uid = component instanceof CustomComponent ? component.uid : null;
            const type = component instanceof CustomComponent ? 'descend' : (component instanceof Port ? 'ascend' : (component instanceof Tunnel ? 'tunnel' : null));
            const allowUnnamedPorts = component instanceof Port || component instanceof Tunnel; // the component-port on these has no name but the component itself does
            for (const port of component.ports.filter((p) => allowUnnamedPorts || p.name !== '')) {
                const { x, y } = port.coords(component.width, component.height, component.rotation);
                const compareName = component instanceof Port || component instanceof Tunnel ? component.name : port.name;
                const portType = type ?? (component instanceof Splitter ? (port.name === Splitter.SINGLE_PORT_NAME ? '1-to-n' : 'n-to-1') : null);
                ports.push(new NetList.NetPort(new Point(x + component.x, y + component.y), portType, port.name, compareName, component.gid, instanceId, uid, port.numChannels, port.ioType));
            }
        }
        return { wires, ports };
    }
}
