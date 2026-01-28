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
            this.#importLogisim(text);
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
            if (!circuit.empty) {
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

    // Returns a list of loaded circuits.
    list() {
        const circuits = Object.values(this.#circuits).map((c) => [ c.uid, c.label ]);
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
        return { version: 2, currentUID: this.#currentCircuit, circuits: Object.values(this.#circuits).map((c) => c.serialize()) };
    }

    // Unserializes circuits from file.
    unserialize(content) {
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

    // Import logisim circuits. This is the bare minimum to be useful and likely will never be complete.
    #importLogisim(text) {

        const portExplainer = 'Scroll up. Import has replaced circuit pins with tunnels connected to the ports above to allow for placing the ports such that the resulting component shape matches the original shape and properly connects to existing circuits.';
        const facings = [ 'north', 'east', 'south', 'west' ];
        const splitterOffsets = {
            left: {
                east: { x: 0, y: 1 },
                south: { x: 0, y: 0 },
                west: { x: 1, y: 0 },
                north: { x: 1, y: 1 },
            },
            right: {
                east: { x: 0, y: 0 },
                south: { x: 1, y: 0 },
                west: { x: 1, y: 1 },
                north: { x: 0, y: 1 },
            },
            center: {
                east: { x: 0, y: 0.5 },
                south: { x: 0.5, y: 0 },
                west: { x: 1, y: 0.5 },
                north: { x: 0.5, y: 1 },
            },
        };
        const splitterHelperWire = {
            left: {
                east: { x: 0, y: 1 },
                south: { x: -1, y: 0 },
                west: { x: 0, y: -1 },
                north: { x: 1, y: 0 },
            },
            right: {
                east: { x: 0, y: -1 },
                south: { x: 1, y: 0 },
                west: { x: 0, y: 1 },
                north: { x: -1, y: 0 },
            },
            center: {
                east: { x: 0, y: 1 },
                south: null,
                west: null,
                north: { x: 1, y: 0 },
            },
        };
        const gateHelperWire = {
            east: { x: -1, y: 0 },
            south: { x: 0, y: -1 },
            west: { x: 1, y: 0 },
            north: { x: 0, y: 1 },
        };
        const gateSizeMod = {
            'XOR Gate': 1,
            'NAND Gate': 1,
            'NOR Gate': 1,
            'XNOR Gate': 2,
        };

        const rotation = (f) => facings.indexOf(f ?? 'east');
        const parseDim = (n) => Number.parseInt(n) / 10 * Grid.SPACING;
        const parseLoc = (l) => l.slice(1, -1).split(',').map(parseDim);
        const offsetPort = (item, name) => {
            const offset = item.portByName(name).coords(item.width, item.height, item.rotation);
            item.x -= offset.x;
            item.y -= offset.y;
        };
        const helperWire = (circuit, item, portName, direction, length) => {
            if (length <= 0) {
                return;
            }
            const portOffset = item.portByName(portName).coords(item.width, item.height, item.rotation);
            const x1 = item.x + portOffset.x;
            const y1 = item.y + portOffset.y;
            const x2 = x1 + direction.x * Grid.SPACING * length;
            const y2 = y1 + direction.y * Grid.SPACING * length;
            const wire = new Wire(this.#app, x1, y1, Grid.SPACING, 'h'); // temporary coords/length...
            wire.setEndpoints(x1, y1, x2, y2); // ... we use more convenient api instead
            circuit.addItem(wire);
        };
        const makeAttr = (x) => {
            for (const a of x.a ?? []) {
                x[a.name] = a.val;
            }
            delete x.a;
        };

        const contents = XML.parse(text).project;

        // create all circuits first as they might be included as subcomponents and this avoids dependency resolution.
        // also identify port layout bounding box (so that we can figure out which ports are on the left/right/top/bottom of the box).
        const circuitLookup = {};
        for (const rawCircuit of contents.circuit) {
            makeAttr(rawCircuit);
            const circuit = new Circuits.Circuit(rawCircuit.name, null, [], {}, { parity: "none" });
            const anchor = rawCircuit.appear?.[0]?.['circ-anchor']?.[0] ?? { x: 0, y: 0, facing: 'east' };
            circuitLookup[rawCircuit.name] = {
                uid: circuit.uid,
                offsetX: parseDim(anchor.x),
                offsetY: parseDim(anchor.y),
                facing: anchor.facing,
            };
            if (rawCircuit.appear?.[0]?.['circ-port']) {
                circuit.addItem(new TextLabel(this.#app, Grid.SPACING, Grid.SPACING, 0, 800, portExplainer, 'small', 3));
                const layout = circuitLookup[rawCircuit.name];
                const portLayout = rawCircuit.appear[0]['circ-port'].map((p) => ({
                    pin: p.pin,
                    x: parseDim(p.x),
                    y: parseDim(p.y),
                }));
                layout.minX = Math.min(...portLayout.map((p) => p.x));
                layout.minY = Math.min(...portLayout.map((p) => p.y));
                layout.maxX = Math.max(...portLayout.map((p) => p.x));
                layout.maxY = Math.max(...portLayout.map((p) => p.y));
                layout.ports = portLayout;
                for (const rect of rawCircuit.appear[0].rect ?? []) {
                    layout.minX = Math.min(layout.minX, Math.floor(parseDim(rect.x) / Grid.SPACING) * Grid.SPACING);
                    layout.minY = Math.min(layout.minY, Math.floor(parseDim(rect.y) / Grid.SPACING) * Grid.SPACING);
                    layout.maxX = Math.max(layout.maxX, Math.ceil((parseDim(rect.x) + parseDim(rect.width)) / Grid.SPACING) * Grid.SPACING);
                    layout.maxY = Math.max(layout.maxY, Math.ceil((parseDim(rect.y) + parseDim(rect.height)) / Grid.SPACING) * Grid.SPACING);
                }
                layout.offsetX -= layout.minX;
                layout.offsetY -= layout.minY;
                layout.width = layout.maxX - layout.minX;
                layout.height = layout.maxY - layout.minY;
            }
            this.add(circuit);
        }

        // convert circuits
        for (const rawCircuit of contents.circuit) {
            const circuit = this.#circuits[circuitLookup[rawCircuit.name].uid];
            const portMap = {};
            // convert wires
            for (const rawWire of rawCircuit.wire ?? []) {
                const [ x1, y1 ] = parseLoc(rawWire.from);
                const [ x2, y2 ] = parseLoc(rawWire.to);
                const direction = x1 === x2 ? 'v' : 'h';
                const length = x1 === x2 ? y2 - y1 : x2 - x1;
                const wire = new Wire(this.#app, x1, y1, length, direction);
                circuit.addItem(wire);
            }
            // convert components
            for (const rawComp of rawCircuit.comp ?? []) {
                makeAttr(rawComp);
                const [ x, y ] = parseLoc(rawComp.loc);
                if (rawComp.lib === undefined && circuitLookup[rawComp.name].uid) {
                    // custom component
                    const meta = circuitLookup[rawComp.name];
                    const rot = (rotation(rawComp.facing) + 3) & 3;
                    const item = new CustomComponent(this.#app, 0, 0, rot, meta.uid);
                    let vx, vy;
                    if (rot === 0) { // offset = vector from topleft corner
                        vx = meta.offsetX;
                        vy = meta.offsetY;
                    } else if (rot === 1) { // ... from bottom left
                        vx = meta.height - meta.offsetY;
                        vy = meta.offsetX;
                    }  else if (rot === 2) { // ... from bottom right
                        vx = meta.width - meta.offsetX;
                        vy = meta.height - meta.offsetY;
                    } else if (rot === 3) { // ... from top right
                        vx = meta.offsetY;
                        vy = meta.width - meta.offsetX;
                    }
                    item.x = x - vx - 0.5 * Grid.SPACING;
                    item.y = y - vy - 0.5 * Grid.SPACING;
                    circuit.addItem(item);
                } else if (rawComp.name === 'Pin' && rawCircuit.appear) {
                    // replace pins with tunnels leading to properly laid out ports to make CustomComponent outline match the logisim component
                    const item = new Tunnel(this.#app, x, y, rotation(rawComp.facing));
                    offsetPort(item, '');
                    item.name = 'pin-' + (rawComp.label || crypto.randomUUID().replaceAll('-', '').slice(0, 8));
                    const pinRef = rawComp.loc.slice(1, -1);
                    portMap[pinRef] = { pin: pinRef, tunnelName: item.name, portName: rawComp.label ?? '' };
                    circuit.addItem(item);
                } else if (rawComp.name === 'Pin' && !rawCircuit.appear) {
                    // circuit has no custom appearance configuration and we don't support the logisim default appearances yet, place ports where the file indicates
                    const item = new Port(this.#app, x, y, rotation(rawComp.facing));
                    offsetPort(item, '');
                    item.name = 'pin-' + rawComp.label;
                    circuit.addItem(item);
                } else if (rawComp.name === 'Splitter') {
                    // splitter
                    const numSplits = Number.parseInt(rawComp.fanout ?? 2);
                    const rawFacing = rawComp.facing ?? 'east';
                    const rawAppear = rawComp.appear ?? 'left';
                    const ordering = rawFacing === 'west' || rawFacing === 'north' ? 'rtl' : 'ltr';
                    const orientation = rawAppear === 'left' ? (ordering === 'ltr' ? 'end' : 'start') : (rawAppear === 'right' ? (ordering === 'ltr' ? 'start' : 'end') : 'middle');
                    const splitter = new Splitter(this.#app, x, y, rotation(rawFacing) + 1, numSplits, 'none', orientation, ordering);
                    const offsets = splitterOffsets[rawAppear][rawFacing];
                    splitter.x -= Math.ceil(splitter.width * offsets.x / Grid.SPACING) * Grid.SPACING;
                    splitter.y -= Math.ceil(splitter.height * offsets.y / Grid.SPACING) * Grid.SPACING;
                    circuit.addItem(splitter);
                    // helper wire to attach the 1-port
                    const helperDirection = splitterHelperWire[rawAppear][rawFacing] ?? null;
                    if (helperDirection) {
                        const singlePortOffset = splitter.portByName(Splitter.SINGLE_PORT_NAME).coords(splitter.width, splitter.height, splitter.rotation);
                        const x1 = splitter.x + singlePortOffset.x;
                        const y1 = splitter.y + singlePortOffset.y;
                        const x2 = x1 + helperDirection.x * Grid.SPACING;
                        const y2 = y1 + helperDirection.y * Grid.SPACING;
                        const wire = new Wire(this.#app, x1, y1, Grid.SPACING, 'h'); // temporary coords/length...
                        wire.setEndpoints(x1, y1, x2, y2); // ... we use more convenient api instead
                        circuit.addItem(wire);
                    }
                } else if (rawComp.name === 'Tunnel') {
                    const item = new Tunnel(this.#app, x, y, rotation(rawComp.facing ?? 'west'));
                    offsetPort(item, '');
                    item.name = rawComp.label ?? '';
                    circuit.addItem(item);
                } else if (rawComp.name === 'Pull Resistor') {
                    const direction = rawComp.pull === '1' ? 'up' : 'down';
                    const item = new PullResistor(this.#app, x, y, rotation(rawComp.facing ?? 'south') + 3, direction);
                    offsetPort(item, 'q');
                    circuit.addItem(item);
                } else if (rawComp.name === 'Clock') {
                    const item = new Clock(this.#app, x, y, rotation(rawComp.facing ?? 'east') + 3);
                    offsetPort(item, 'c');
                    circuit.addItem(item);
                } else if ([ 'NOT Gate', 'Buffer' ].includes(rawComp.name)) {
                    const item = new Gate(this.#app, x, y, rotation(rawComp.facing ?? 'east') + 3, rawComp.name.split(' ', 1)[0].toLowerCase(), 1);
                    offsetPort(item, 'q');
                    circuit.addItem(item);
                    const helperDirection = gateHelperWire[rawComp.facing ?? 'east'];
                    const helperLength = (Number.parseInt(rawComp.size ?? '30') / 10) - 2 + (gateSizeMod[rawComp.name] ?? 0);
                    helperWire(circuit, item, 'a', helperDirection, helperLength);
                } else if ([ 'AND Gate', 'OR Gate', 'XOR Gate', 'NAND Gate', 'NOR Gate', 'XNOR Gate' ].includes(rawComp.name)) {
                    const inputs = Number.parseInt(rawComp.inputs ?? '2');
                    const item = new Gate(this.#app, x, y, rotation(rawComp.facing ?? 'east') + 3, rawComp.name.split(' ', 1)[0].toLowerCase(), inputs);
                    offsetPort(item, 'q');
                    circuit.addItem(item);
                    const helperDirection = gateHelperWire[rawComp.facing ?? 'east'];
                    const helperLength = (Number.parseInt(rawComp.size ?? '50') / 10) - 2 + (gateSizeMod[rawComp.name] ?? 0);
                    for (const input of item.inputs) {
                        helperWire(circuit, item, input, helperDirection, helperLength);
                    }
                } else if (rawComp.name === 'Ground') {
                    const item = new Constant(this.#app, x, y, rotation(rawComp.facing ?? 'south') + 2, 0);
                    offsetPort(item, 'c');
                    circuit.addItem(item);
                } else if (rawComp.name === 'Power') {
                    const item = new Constant(this.#app, x, y, rotation(rawComp.facing ?? 'north') + 2, 1);
                    offsetPort(item, 'c');
                    circuit.addItem(item);
                } else if (rawComp.name === 'Constant') {
                    const item = new Constant(this.#app, x, y, rotation(rawComp.facing ?? 'east'), rawComp.value === '0x1' ? 1 : 0);
                    offsetPort(item, 'c');
                    circuit.addItem(item);
                } else if ([ 'Controlled Buffer', 'Controlled Inverter' ].includes(rawComp.name)) {
                    const item = new Builtin(this.#app, x, y, rotation(rawComp.facing ?? 'east') + 3, rawComp.name === 'Controlled Buffer' ? 'buffer3' : 'not3');
                    offsetPort(item, 'q');
                    circuit.addItem(item);
                } else if (rawComp.name === 'Text') {
                    const item = new TextLabel(this.#app, x, y, rotation(rawComp.facing ?? 'east') + 3, 200, rawComp.text);
                    circuit.addItem(item);
                }
            }
            // generate port compatibility outline
            const layout = circuitLookup[rawCircuit.name];
            if (layout.ports) {
                // shift ports above circuit and scale by factor 2 so that ports fit next to each other
                const scale = 2;
                const yShift = layout.maxY * scale + (10 * Grid.SPACING);
                const xShift = layout.minX * scale - (10 * Grid.SPACING);
                let errorPos = 0;
                for (const rawPort of layout.ports) {
                    // determine port rotation by position on bounding box
                    const mapping = portMap[rawPort.pin];
                    if (mapping) {
                        let rotation = 0;
                        if (rawPort.x === layout.minX && rawPort.y > 0 && rawPort.y < layout.maxY) { // on top line but not in corner
                            rotation = 0;
                        } else if (rawPort.y === layout.minY && rawPort.x > 0 && rawPort.x < layout.maxX) {
                            rotation = 1;
                        } else if (rawPort.x === layout.maxX && rawPort.y > 0 && rawPort.y < layout.maxY) {
                            rotation = 2;
                        } else if (rawPort.y === layout.maxY && rawPort.x > 0 && rawPort.x < layout.maxX) {
                            rotation = 3;
                        } else {
                            circuit.addItem(new TextLabel(this.#app, Grid.SPACING * 40, -(yShift - layout.minY * scale) + errorPos * Grid.SPACING, 0, 800, `Port ${mapping.portName} could not be placed on the outline of the component.`, 'small', 4));
                            errorPos += 1;
                            continue;
                        }
                        const item = new Port(this.#app, scale * rawPort.x - xShift, scale * rawPort.y - yShift, rotation + 1);
                        offsetPort(item, '');
                        item.name = mapping.portName;
                        circuit.addItem(item);
                    }
                }
                // fill in unoccupied positions with dummy ports (item.name='') on the component outline
                const occupied = new Set(layout.ports.map((p) => `${p.x},${p.y}`));
                const addDummy = (x, y, rotation) => {
                    if (!occupied.has(`${x},${y}`)) {
                        const item = new Port(this.#app, scale * x - xShift, scale * y - yShift, rotation + 1);
                        offsetPort(item, '');
                        item.name = '';
                        circuit.addItem(item);
                        occupied.add(`${x},${y}`);
                    }
                };
                for (let y = layout.minY + Grid.SPACING; y < layout.maxY; y += Grid.SPACING) {
                    addDummy(layout.minX, y, 0);
                }
                for (let x = layout.minX + Grid.SPACING; x < layout.maxX; x += Grid.SPACING) {
                    addDummy(x, layout.minY, 1);
                }
                for (let y = layout.minY + Grid.SPACING; y < layout.maxY; y += Grid.SPACING) {
                    addDummy(layout.maxX, y, 2);
                }
                for (let x = layout.minX + Grid.SPACING; x < layout.maxX; x += Grid.SPACING) {
                    addDummy(x, layout.maxY, 3);
                }
            }
        }
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

    constructor(label, uid = null, data = [], gridConfig = {}, portConfig = {}) {
        assert.string(label),
        assert.string(uid, true);
        assert.array(data, false, (i) => assert.class(GridItem, i));
        assert.object(gridConfig);
        assert.object(portConfig);
        this.label = label;
        this.uid = uid ?? Circuits.Circuit.generateUID();
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

    // Serializes a circuit for saving to file.
    serialize() {
        const data = this.#data.map((item) => item.serialize());
        return { label: this.label, uid: this.uid, data, gridConfig: this.gridConfig, portConfig: this.portConfig };
    }

    // Unserializes circuit from decoded JSON-object and adds it to Circuits. Dependencies of CustomComponents will also be added.
    static unserialize(app, rawCircuit, rawOthers) {
        assert.class(Application, app);
        assert.object(rawCircuit);
        const items = rawCircuit.data.map((item) => GridItem.unserialize(app, item, rawOthers));
        const circuit = new Circuits.Circuit(rawCircuit.label, rawCircuit.uid, items, rawCircuit.gridConfig, rawCircuit.portConfig);
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
