"use strict";

// Imports circuits from logisim .circ files.
class LogiSim {

    #app;
    #layouts = {};
    #fileHandle;
    #numImported = 0;

    static async import(app, fileHandle, text) {
        const instance = new LogiSim();
        instance.#app = app;
        instance.#fileHandle = fileHandle;
        const project = XML.parse(text).project;
        await instance.#importFile(null, project, 'Your project');
        infoDialog('Import complete', `Your project has been imported. ${instance.#numImported} circuits have been added to the Circuit and/or Component menus.`);
    }

    // Recursively imports the file and dependencies.
    async #importFile(lid, project, whoNeedsIt) {
        // import libraries used in the given project (recursively)
        const libs = [];
        for (const lib of project.lib) {
            const [ type, fileName ] = lib.desc.split('#');
            if (type === 'file') {
                const fileProject = await this.#openFile(fileName, whoNeedsIt);
                if (fileProject) {
                    const fileLid = app.circuits.addLibrary(fileName.replace(/\.circ$/, ''));
                    await this.#importFile(fileLid, fileProject, `The library <b><code>${fileName}</code></b>`);
                    libs.push(fileLid);
                }
            } else {
                libs.push(null);
            }
        }
        // import project
        this.#processFile(lid, project, libs);
    }

    // Converts circuits in the given logisim project to tracer circuits.
    #processFile(lid, project, libs) {
        // convert funky "a" tag to properties
        const makeAttr = (x) => {
            for (const a of x.a ?? []) {
                x[a.name] = a.val;
            }
            delete x.a;
        };
        // create all circuits first as they might be included as subcomponents and this avoids dependency resolution.
        // also identify port layout bounding box (so that we can figure out which ports are on the left/right/top/bottom of the box).
        for (const rawCircuit of project.circuit) {
            makeAttr(rawCircuit);
            const circuit = this.#createCircuit(lid, rawCircuit);
            this.#app.circuits.add(circuit);
        }
        // convert circuits
        for (const rawCircuit of project.circuit) {
            for (const rawComp of rawCircuit.comp ?? []) {
                makeAttr(rawComp);
            }
            const portMap = this.#convertCircuitComponents(lid, libs, rawCircuit);
            // generate port compatibility outline
            const layout = this.#layouts[lid + ':' + rawCircuit.name];
            if (layout.ports) {
                const circuit = this.#app.circuits.byUID(this.#layouts[lid + ':' + rawCircuit.name].uid);
                this.#convertCircuitLayout(circuit, portMap, layout)
            }
            // count total number of imported circuits
            this.#numImported += 1
        }
    }

    // Ask user to open library file for us.
    async #openFile(filename, whoNeedsIt) {
        const ok = await confirmDialog(`Open dependency ${filename}`, `${whoNeedsIt} depends on <b><code>${filename}</code></b>.<br>Due to browser safety restrictions this application cannot open this file on its own.<br>Click ok to select the file <b><code>${filename}</code></b> or cancel to skip this dependency.`);
        if (!ok) {
            return null;
        }
        [ this.#fileHandle ] = await File.importFile(this.#fileHandle);
        const file = await this.#fileHandle.getFile();
        const text = await file.text();
        return XML.parse(text).project;
    }

    // Convert LogiSim scale.
    static #parseDim(n) {
        return Number.parseInt(n) / 10 * Grid.SPACING;
    }

    // Offset given component by the position of the named port. (Logisim component coordinates are often the coordinate of one of its ports.)
    static #offsetPort(component, name) {
        assert.class(Component, component);
        const offset = component.portByName(name).coords(component.width, component.height, component.rotation);
        component.x -= offset.x;
        component.y -= offset.y;
    }

    // Returns a direction vector for the given rotation id.
    static #direction(r) {
        assert.integer(r);
        const directions = [
            { x: 0, y: -1 }, // rotation 0: up
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
        ];
        return directions[r & 3];
    }

    // Adds a helper wire to adapt larger logisim components to their smaller size in tracer.
    #addHelperWire = (circuit, item, portName, direction, length) => {
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
    }

    // Creates a blank tracer circuit for the given logisim circuit and generates layout information about the circuits outline (when used as a component).
    #createCircuit(lid, rawCircuit) {
        const parseDim = LogiSim.#parseDim;
        const circuit = new Circuits.Circuit(rawCircuit.name, null, [], {}, { parity: "none" }, lid);
        const anchor = rawCircuit.appear?.[0]?.['circ-anchor']?.[0] ?? { x: 0, y: 0, facing: 'east' };
        this.#layouts[lid + ':' + rawCircuit.name] = {
            uid: circuit.uid,
            offsetX: parseDim(anchor.x),
            offsetY: parseDim(anchor.y),
            facing: anchor.facing,
        };
        if (rawCircuit.appear?.[0]?.['circ-port']) {
            const layout = this.#layouts[lid + ':' + rawCircuit.name];
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
        return circuit;
    }

    // Converts circuit components, returns a map of ports used by the circuit.
    #convertCircuitComponents(lid, libs, rawCircuit) {
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
        const gateSizeMod = {
            'XOR Gate': 1,
            'NAND Gate': 1,
            'NOR Gate': 1,
            'XNOR Gate': 2,
        };
        const facings = [ 'north', 'east', 'south', 'west' ];
        const rotation = (f) => facings.indexOf(f ?? 'east');
        const parseLoc = (l) => l.slice(1, -1).split(',').map(LogiSim.#parseDim);
        const offsetPort = LogiSim.#offsetPort;
        const direction = LogiSim.#direction;

        const circuit = this.#app.circuits.byUID(this.#layouts[lid + ':' + rawCircuit.name].uid);
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
            const [ x, y ] = parseLoc(rawComp.loc);
            const isLogiSimBuiltIn = rawComp.lib !== undefined && libs[rawComp.lib] === null;
            const libLid = rawComp.lib === undefined ? lid : (libs[rawComp.lib] ?? 'missing');
            const layoutId = libLid !== 'missing' ? libLid + ':' + rawComp.name : null;
            if (!isLogiSimBuiltIn && layoutId !== null && this.#layouts[layoutId].uid) {
                // custom component
                const meta = this.#layouts[layoutId];
                const rot = (rotation(rawComp.facing) + 3) & 3;
                const item = new CustomComponent(this.#app, 0, 0, rot, meta.uid);
                let vx, vy;
                if (rot === 0) { // offset = vector from topleft corner
                    vx = meta.offsetX;
                    vy = meta.offsetY;
                } else if (rot === 1) { // ... from bottom left
                    vx = meta.height - meta.offsetY;
                    vy = meta.offsetX;
                } else if (rot === 2) { // ... from bottom right
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
                    this.#addHelperWire(circuit, splitter, Splitter.SINGLE_PORT_NAME, helperDirection, 1);
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
                const helperDirection = direction(rotation(rawComp.facing ?? 'east') + 2);
                const helperLength = (Number.parseInt(rawComp.size ?? '30') / 10) - 2 + (gateSizeMod[rawComp.name] ?? 0);
                this.#addHelperWire(circuit, item, 'a', helperDirection, helperLength);
            } else if ([ 'AND Gate', 'OR Gate', 'XOR Gate', 'NAND Gate', 'NOR Gate', 'XNOR Gate' ].includes(rawComp.name)) {
                const inputs = Number.parseInt(rawComp.inputs ?? '2');
                const item = new Gate(this.#app, x, y, rotation(rawComp.facing ?? 'east') + 3, rawComp.name.split(' ', 1)[0].toLowerCase(), inputs);
                offsetPort(item, 'q');
                circuit.addItem(item);
                const helperDirection = direction(rotation(rawComp.facing ?? 'east') + 2);
                const helperLength = (Number.parseInt(rawComp.size ?? '50') / 10) - 2 + (gateSizeMod[rawComp.name] ?? 0);
                for (const input of item.inputs) {
                    this.#addHelperWire(circuit, item, input, helperDirection, helperLength);
                }
            } else if ([ 'D Flip-Flop', 'T Flip-Flop', 'J-K Flip-Flop', 'S-R Flip-Flop' ].includes(rawComp.name)) {
                const mapping = {
                    'D Flip-Flop' : {
                        'rising'    : { type: 'adflipflop', trigger: 'clock', input: 'data' },
                        'falling'   : { type: 'adflipflop', trigger: 'clock', input: 'data' }, // FIXME
                        'high'      : { type: 'adlatch', trigger: 'load', input: 'data' },
                        'low'       : { type: 'adlatch', trigger: 'load', input: 'data' },     // FIXME
                    },
                    'T Flip-Flop' : {
                        'rising'    : { type: 'tflipflop', trigger: 'clock', input: 't' },
                        'falling'   : { type: 'tflipflop', trigger: 'clock', input: 't' }, // FIXME
                    },
                    'J-K Flip-Flop' : {
                        'rising'    : { type: 'jkflipflop', trigger: 'clock', input: 'j', input2: 'k' },
                        'falling'   : { type: 'jkflipflop', trigger: 'clock', input: 'j', input2: 'k' }, // FIXME
                    },
                    'S-R Flip-Flop' : {
                        'rising'    : { type: 'srflipflop', trigger: 'clock', input: 's', input2: 'r' },
                        'falling'   : { type: 'srflipflop', trigger: 'clock', input: 's', input2: 'r' }, // FIXME
                    }
                };
                const mapped = mapping[rawComp.name][rawComp.trigger ?? 'rising'];
                const item = new Builtin(this.#app, x, y, 0, mapped.type);
                item.x += Grid.SPACING;
                item.y += Grid.SPACING;
                circuit.addItem(item);
                if (mapped.type.slice(0, 1) === 'a') { // FIXME support set/reset for all
                    this.#addHelperWire(circuit, item, 'set', direction(0), 1);
                    this.#addHelperWire(circuit, item, 'reset', direction(2), 1);
                }
                this.#addHelperWire(circuit, item, mapped.input, direction(3), 2);
                if (mapped.input2) {
                    this.#addHelperWire(circuit, item, mapped.input2, direction(3), 2);
                }
                this.#addHelperWire(circuit, item, mapped.trigger, direction(3), 2);
                this.#addHelperWire(circuit, item, 'q', direction(1), 1);
                const buffer = new Gate(this.#app, x + 3 * Grid.SPACING, y + 1 * Grid.SPACING, 3, 'buffer', 1);
                const inverter = new Gate(this.#app, x + 3 * Grid.SPACING, y + 3 * Grid.SPACING, 1, 'not', 1);
                circuit.addItem(buffer);
                circuit.addItem(inverter);
                this.#addHelperWire(circuit, buffer, 'q', direction(1), 1);
                this.#addHelperWire(circuit, inverter, 'q', direction(1), 1);
                circuit.addItem(new Wire(this.#app, x - Grid.SPACING, y + Grid.SPACING, Grid.SPACING, 'v'));
                circuit.addItem(new Wire(this.#app, x - Grid.SPACING, y + 4 * Grid.SPACING, Grid.SPACING, 'v'));
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
            } else {
                const item = new TextLabel(this.#app, x, y, rotation(rawComp.facing ?? 'east') + 3, 200, rawComp.name, 'medium', 4);
                circuit.addItem(item);
                //console.log(rawComp);
            }
        }
        return portMap;
    }

    // Generates ports and dummy ports for a circuit to reproduce the shape of the original logisim circuit outline.
    #convertCircuitLayout(circuit, portMap, layout) {
        // shift ports above circuit and scale by factor 2 so that ports fit next to each other
        const scale = 2;
        const expansion = 3;
        const globalOffsetY = layout.maxY * scale + (10 * Grid.SPACING);
        const globalOffsetX = layout.minX * scale - (10 * Grid.SPACING);
        const direction = LogiSim.#direction;
        const expandX = (r) => direction(r).x * Grid.SPACING * expansion; // expand ports outwards to make room for the tunnels
        const expandY = (r) => direction(r).y * Grid.SPACING * expansion;
        const offsetPort = LogiSim.#offsetPort;
        let errorPos = 0;
        for (const layoutPort of layout.ports) {
            // determine port rotation by position on bounding box
            const mapping = portMap[layoutPort.pin];
            if (mapping) {
                let rotation = 0;
                if (layoutPort.x === layout.minX && layoutPort.y > 0 && layoutPort.y < layout.maxY) { // on top line but not in corner
                    rotation = 0;
                } else if (layoutPort.y === layout.minY && layoutPort.x > 0 && layoutPort.x < layout.maxX) {
                    rotation = 1;
                } else if (layoutPort.x === layout.maxX && layoutPort.y > 0 && layoutPort.y < layout.maxY) {
                    rotation = 2;
                } else if (layoutPort.y === layout.maxY && layoutPort.x > 0 && layoutPort.x < layout.maxX) {
                    rotation = 3;
                } else {
                    circuit.addItem(new TextLabel(this.#app, Grid.SPACING * 40, -(globalOffsetY - layout.minY * scale) + errorPos * Grid.SPACING, 0, 800, `Port ${mapping.portName} could not be placed on the outline of the component.`, 'small', 4));
                    errorPos += 1;
                    continue;
                }
                // port
                const port = new Port(this.#app, scale * layoutPort.x - globalOffsetX - expandX(rotation + 1), scale * layoutPort.y - globalOffsetY - expandY(rotation + 1), rotation + 1);
                offsetPort(port, '');
                port.name = mapping.portName;
                circuit.addItem(port);
                // wire between port and tunnel
                const tunnelOffsetDir = direction(port.rotation);
                this.#addHelperWire(circuit, port, '', tunnelOffsetDir, 1);
                const tunnelOffsetX = tunnelOffsetDir.x * Grid.SPACING;
                const tunnelOffsetY = tunnelOffsetDir.y * Grid.SPACING;
                // tunnel
                const tunnel = new Tunnel(this.#app, scale * layoutPort.x - globalOffsetX + tunnelOffsetX - expandX(rotation + 1), scale * layoutPort.y - globalOffsetY + tunnelOffsetY - expandY(rotation + 1), rotation + 1 + 2);
                offsetPort(tunnel, '');
                tunnel.name = mapping.tunnelName;
                circuit.addItem(tunnel);
            }
        }
        // fill in unoccupied positions with dummy ports (item.name='') on the component outline
        const occupied = new Set(layout.ports.map((p) => `${p.x},${p.y}`));
        const addDummy = (x, y, rotation) => {
            if (!occupied.has(`${x},${y}`)) {
                const item = new Port(this.#app, scale * x - globalOffsetX - expandX(rotation + 1), scale * y - globalOffsetY - expandY(rotation + 1), rotation + 1);
                offsetPort(item, '');
                item.name = '';
                circuit.addItem(item);
                occupied.add(`${x},${y}`);
            }
        };
        for (let y = layout.minY + Grid.SPACING; y < layout.maxY; y += Grid.SPACING) {
            addDummy(layout.minX, y, 0);
            addDummy(layout.maxX, y, 2);
        }
        for (let x = layout.minX + Grid.SPACING; x < layout.maxX; x += Grid.SPACING) {
            addDummy(x, layout.minY, 1);
            addDummy(x, layout.maxY, 3);
        }
        // add a note about how the outline works
        const portExplainer = '^^^ Scroll up ^^^ Import has replaced circuit pins with tunnels connected to the ports above to allow for placing the ports such that the resulting component shape matches the original shape and properly connects to existing circuits.';
        circuit.addItem(new TextLabel(this.#app, Grid.SPACING, Grid.SPACING, 0, 800, portExplainer, 'small', 3));
    }

}