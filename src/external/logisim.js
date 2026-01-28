"use strict";

// Imports circuits from logisim .circ files.
class LogiSim {

    // Import logisim circuits. This is the bare minimum to be useful and likely will never be complete.
    static import(app, text) {

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
            const wire = new Wire(app, x1, y1, Grid.SPACING, 'h'); // temporary coords/length...
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
                circuit.addItem(new TextLabel(app, Grid.SPACING, Grid.SPACING, 0, 800, portExplainer, 'small', 3));
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
            app.circuits.add(circuit);
        }

        // convert circuits
        for (const rawCircuit of contents.circuit) {
            const circuit = app.circuits.byUID(circuitLookup[rawCircuit.name].uid);
            const portMap = {};
            // convert wires
            for (const rawWire of rawCircuit.wire ?? []) {
                const [ x1, y1 ] = parseLoc(rawWire.from);
                const [ x2, y2 ] = parseLoc(rawWire.to);
                const direction = x1 === x2 ? 'v' : 'h';
                const length = x1 === x2 ? y2 - y1 : x2 - x1;
                const wire = new Wire(app, x1, y1, length, direction);
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
                    const item = new CustomComponent(app, 0, 0, rot, meta.uid);
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
                    const item = new Tunnel(app, x, y, rotation(rawComp.facing));
                    offsetPort(item, '');
                    item.name = 'pin-' + (rawComp.label || crypto.randomUUID().replaceAll('-', '').slice(0, 8));
                    const pinRef = rawComp.loc.slice(1, -1);
                    portMap[pinRef] = { pin: pinRef, tunnelName: item.name, portName: rawComp.label ?? '' };
                    circuit.addItem(item);
                } else if (rawComp.name === 'Pin' && !rawCircuit.appear) {
                    // circuit has no custom appearance configuration and we don't support the logisim default appearances yet, place ports where the file indicates
                    const item = new Port(app, x, y, rotation(rawComp.facing));
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
                    const splitter = new Splitter(app, x, y, rotation(rawFacing) + 1, numSplits, 'none', orientation, ordering);
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
                        const wire = new Wire(app, x1, y1, Grid.SPACING, 'h'); // temporary coords/length...
                        wire.setEndpoints(x1, y1, x2, y2); // ... we use more convenient api instead
                        circuit.addItem(wire);
                    }
                } else if (rawComp.name === 'Tunnel') {
                    const item = new Tunnel(app, x, y, rotation(rawComp.facing ?? 'west'));
                    offsetPort(item, '');
                    item.name = rawComp.label ?? '';
                    circuit.addItem(item);
                } else if (rawComp.name === 'Pull Resistor') {
                    const direction = rawComp.pull === '1' ? 'up' : 'down';
                    const item = new PullResistor(app, x, y, rotation(rawComp.facing ?? 'south') + 3, direction);
                    offsetPort(item, 'q');
                    circuit.addItem(item);
                } else if (rawComp.name === 'Clock') {
                    const item = new Clock(app, x, y, rotation(rawComp.facing ?? 'east') + 3);
                    offsetPort(item, 'c');
                    circuit.addItem(item);
                } else if ([ 'NOT Gate', 'Buffer' ].includes(rawComp.name)) {
                    const item = new Gate(app, x, y, rotation(rawComp.facing ?? 'east') + 3, rawComp.name.split(' ', 1)[0].toLowerCase(), 1);
                    offsetPort(item, 'q');
                    circuit.addItem(item);
                    const helperDirection = gateHelperWire[rawComp.facing ?? 'east'];
                    const helperLength = (Number.parseInt(rawComp.size ?? '30') / 10) - 2 + (gateSizeMod[rawComp.name] ?? 0);
                    helperWire(circuit, item, 'a', helperDirection, helperLength);
                } else if ([ 'AND Gate', 'OR Gate', 'XOR Gate', 'NAND Gate', 'NOR Gate', 'XNOR Gate' ].includes(rawComp.name)) {
                    const inputs = Number.parseInt(rawComp.inputs ?? '2');
                    const item = new Gate(app, x, y, rotation(rawComp.facing ?? 'east') + 3, rawComp.name.split(' ', 1)[0].toLowerCase(), inputs);
                    offsetPort(item, 'q');
                    circuit.addItem(item);
                    const helperDirection = gateHelperWire[rawComp.facing ?? 'east'];
                    const helperLength = (Number.parseInt(rawComp.size ?? '50') / 10) - 2 + (gateSizeMod[rawComp.name] ?? 0);
                    for (const input of item.inputs) {
                        helperWire(circuit, item, input, helperDirection, helperLength);
                    }
                } else if (rawComp.name === 'Ground') {
                    const item = new Constant(app, x, y, rotation(rawComp.facing ?? 'south') + 2, 0);
                    offsetPort(item, 'c');
                    circuit.addItem(item);
                } else if (rawComp.name === 'Power') {
                    const item = new Constant(app, x, y, rotation(rawComp.facing ?? 'north') + 2, 1);
                    offsetPort(item, 'c');
                    circuit.addItem(item);
                } else if (rawComp.name === 'Constant') {
                    const item = new Constant(app, x, y, rotation(rawComp.facing ?? 'east'), rawComp.value === '0x1' ? 1 : 0);
                    offsetPort(item, 'c');
                    circuit.addItem(item);
                } else if ([ 'Controlled Buffer', 'Controlled Inverter' ].includes(rawComp.name)) {
                    const item = new Builtin(app, x, y, rotation(rawComp.facing ?? 'east') + 3, rawComp.name === 'Controlled Buffer' ? 'buffer3' : 'not3');
                    offsetPort(item, 'q');
                    circuit.addItem(item);
                } else if (rawComp.name === 'Text') {
                    const item = new TextLabel(app, x, y, rotation(rawComp.facing ?? 'east') + 3, 200, rawComp.text);
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
                            circuit.addItem(new TextLabel(app, Grid.SPACING * 40, -(yShift - layout.minY * scale) + errorPos * Grid.SPACING, 0, 800, `Port ${mapping.portName} could not be placed on the outline of the component.`, 'small', 4));
                            errorPos += 1;
                            continue;
                        }
                        const item = new Port(app, scale * rawPort.x - xShift, scale * rawPort.y - yShift, rotation + 1);
                        offsetPort(item, '');
                        item.name = mapping.portName;
                        circuit.addItem(item);
                    }
                }
                // fill in unoccupied positions with dummy ports (item.name='') on the component outline
                const occupied = new Set(layout.ports.map((p) => `${p.x},${p.y}`));
                const addDummy = (x, y, rotation) => {
                    if (!occupied.has(`${x},${y}`)) {
                        const item = new Port(app, scale * x - xShift, scale * y - yShift, rotation + 1);
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