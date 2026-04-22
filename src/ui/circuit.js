"use strict";

// Single circuit, supports linking to grid and attaching to simulation.
class Circuit {

    static CREATE_DIALOG = [
        { name: 'label', label: 'Circuit label', type: 'string' },
        { name: 'description', label: 'Optional description', type: 'string' },
        { name: 'visibleInLib', label: 'Visible when loaded as library', type: 'bool' },
        { separator: 'before', text: 'Default settings. These can be overriden per placed component.' },
        { name: 'spacing', label: 'Pin spacing', type: 'select', options: { 0: "None", 1: "One", 2: "Two" }, apply: (v, f) => Number.parseInt(v) },
        { name: 'parity', label: 'Side lengths', type: 'select', options: { auto: "Automatic", none: "Mixed (rotation snaps)", even: "Even", odd: "Odd" } },
        { name: 'gap', label: 'Pin gap (when lengths not mixed)', type: 'select', options: { start: "Top or left", middle: "Middle", end: "Bottom or right" } },
    ];

    static EDIT_DIALOG = [
        ...Circuit.CREATE_DIALOG,
        { separator: 'before', text: 'Optional comma-separated lists of custom port positions. Blank entries create gaps, e.g. <code>a,,b,c</code> creates a gap between a and b.' },
        { name: 'top', label: 'Top ports', type: 'string' },
        { name: 'left', label: 'Left ports', type: 'string' },
        { name: 'right', label: 'Right ports ', type: 'string' },
        { name: 'bottom', label: 'Bottom ports', type: 'string' },
    ];

    label;
    description = '';
    uid;
    gridConfig;
    portConfig;
    visibleInLib;
    undoStack = new UndoStack();

    #app;
    #data;
    #gidLookup;
    #lid;
    #gridListener = null; // Grid currently subscribed to this circuit's item changes.

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

    // Creates a new circuit.
    static async create(app, label) {
        const config = await dialog("Create circuit", Circuit.CREATE_DIALOG, { label, spacing: '0', gap: 'middle', parity: 'automatic', visibleInLib: true, description: '' });
        if (config) {
            const circuit = new Circuit(app, config.label);
            circuit.portConfig.spacing = config.spacing;
            circuit.portConfig.gap = config.gap;
            circuit.portConfig.parity = config.parity;
            circuit.visibleInLib = config.visibleInLib;
            circuit.description = config.description;
            return circuit;
        }
        return null;
    }

    // Configure circuit.
    async edit() {
        const componentPreview = this.makeComponentPreview();
        // show configuration dialog and preview
        const config = await dialog("Configure circuit", Circuit.EDIT_DIALOG, {
            label: this.label,
            description: this.description,
            spacing: '' + this.portConfig.spacing,
            gap: this.portConfig.gap,
            parity: this.portConfig.parity,
            visibleInLib: this.visibleInLib,
            top: this.portConfig.placement.top,
            right: this.portConfig.placement.right,
            bottom: this.portConfig.placement.bottom,
            left: this.portConfig.placement.left,
        }, { onChange: componentPreview });
        if (config) {
            this.label = config.label;
            this.description = config.description;
            this.portConfig.spacing = Number.parseInt(config.spacing);
            this.portConfig.gap = config.gap;
            this.portConfig.parity = config.parity;
            this.visibleInLib = config.visibleInLib;
            this.portConfig.placement.top = config.top;
            this.portConfig.placement.right = config.right;
            this.portConfig.placement.bottom = config.bottom;
            this.portConfig.placement.left = config.left;
            this.#app.grid.circuitOverlay.setLabel(config.label);
            this.#app.grid.simulationOverlay.setLabel(config.label);
            this.#app.grid.trackAction('Edit circuit');
            return true;
        }
        return false;
    }

    // Creates a component preview handler that can be passed as onChange callback to a dialog.
    makeComponentPreview() {
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
                grid = new Grid(this.#app, previewContainer, true);
                grid.setCircuit(new Circuit(this.#app, 'preview'));
            } else {
                const item = first(grid.circuit.items);
                grid.removeItem(item);
            }
            // data defaults (circuit vs component dialog have slightly different options)
            data.label ??= this.label;
            data.rotation ??= 0;
            // replace item on each dialog change, temporarily rename circuit to current value in dialog (bit of a hack but avoids special purpose changes to Circuit/CustomComponent)
            const backupLabel = this.label;
            const backupPlacement = this.portConfig.placement;
            this.label = data.label;
            if (data.top !== undefined) { // intentionally not defined in component edit
                this.portConfig.placement = { top: data.top, right: data.right, bottom: data.bottom, left: data.left };
            }
            grid.addItem(new CustomComponent(this.#app, 3 * Grid.SPACING, 2 * Grid.SPACING, data.rotation, this.uid, data.parity, data.gap, Number.parseInt(data.spacing)));
            grid.render();
            if (data.top !== undefined) {
                this.portConfig.placement = backupPlacement;
            }
            this.label = backupLabel;
        };
    }

    // Subscribes (or unsubscribes when null) a grid to receive item add/remove notifications.
    setGridListener(grid) {
        this.#gridListener = grid;
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
        this.#gridListener?.onCircuitItemAdded(item);
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
        this.#gridListener?.onCircuitItemRemoved(item);
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

    // Sets the library id of this circuit.
    set lid(value) {
        assert.string(value, true);
        this.#lid = value;
    }

    // Returns true if this circuit belongs to a packaged (read-only) library.
    get readonly() {
        return this.#app.circuits.isPackaged(this.#lid);
    }

    // Serializes the circuit for saving to file.
    serialize() {
        const data = this.#data.map((item) => item.serialize()).sort((a, b) => {
            const x = a['#a'][0] - b['#a'][0];
            if (x !== 0) return x;
            const y = a['#a'][1] - b['#a'][1];
            if (y !== 0) return y;
            if (a['#c'] === 'Wire' && b['#c'] === 'Wire') {
                return compare(a['#a'][3], b['#a'][3]); // compare by direction
            } else {
                return a['#c'] === 'Wire' ? -1 : (b['#c'] === 'Wire' ? 1 : compare(a['#c'], b['#c']));
            }
        });
        return { label: this.label, description: this.description, uid: this.uid, data, gridConfig: this.gridConfig, portConfig: this.portConfig, lid: this.#lid, visibleInLib: this.visibleInLib };
    }

    // Serializes circuit state for undo tracking (excludes gridConfig, uid, lid, visibleInLib).
    serializeForUndo() {
        const grid = this.#app.grid;
        const selectedGids = new Set(grid.circuit === this ? grid.selection.items.map((i) => i.gid) : []);
        return {
            label: this.label,
            description: this.description,
            portConfig: JSON.parse(JSON.stringify(this.portConfig)),
            data: this.#data.map((item) => ({ ...item.serialize(), '#gid': item.gid, '#selected': selectedGids.has(item.gid) })),
        };
    }

    // Restores circuit state from an undo snapshot produced by serializeForUndo().
    // Re-links to the grid if this circuit is currently displayed.
    restoreFromUndo(snapshot) {
        const grid = this.#app.grid;
        const isDisplayed = grid.circuit === this;
        if (isDisplayed) {
            this.unlink();
            this.setGridListener(null); // suppress circuit events during rebuild
        }
        this.#data = [];
        this.#gidLookup = new Map();
        this.label = snapshot.label;
        this.description = snapshot.description;
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
        if (isDisplayed) {
            this.setGridListener(grid); // restore listener before re-linking
            this.link(grid);
            grid.circuitOverlay.setLabel(this.label);
            grid.simulationOverlay.setLabel(this.label);
            grid.onSimulationRecompiled();
            // Restore selection: match items by their restored GIDs.
            const newSelection = this.#data.filter((item) => selectedGids.has(item.gid));
            newSelection.forEach((item) => item.selected = true);
            grid.selection.set(newSelection);
            grid.onWiresChanged(); // deferred compact runs next frame with correct selection context
        }
    }

    // Unserializes circuit from decoded JSON-object and adds it to Circuits. Dependencies of CustomComponents will also be added.
    static unserialize(app, rawCircuit, rawOthers = [], setLid = null, errors = []) {
        assert.class(Application, app);
        assert.object(rawCircuit);
        assert.array(rawOthers);
        assert.string(setLid, true);
        assert.array(errors);
        const items = rawCircuit.data.map((item) => GridItem.unserialize(app, item, rawOthers, setLid, errors));
        const circuit = new Circuit(app, rawCircuit.label, rawCircuit.uid, items, rawCircuit.gridConfig, rawCircuit.portConfig, rawCircuit.lid ?? setLid, rawCircuit.visibleInLib ?? true);
        circuit.description = rawCircuit.description ?? '';
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
                component.simIds = Array.isArray(id) ? id : (id != null ? [id] : []);
                component.instanceId = subCircuitInstance;
            }
        }
        for (const net of netList.nets) {
            // link ports on components
            for (const { name, gid, instanceId, channel } of net.ports) {
                if (subCircuitInstance === instanceId) {
                    const component = this.itemByGID(gid);
                    if (component) {
                        const port = component.portByName(name);
                        if (port) {
                            port.netIds ??= [];
                            if (net.netId !== null) {
                                port.netIds[channel] = net.netId;
                            }
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
        for (const component of this.#data.filter((i) => ((i instanceof SimulationComponent) || (i instanceof VirtualComponent)) && !i.disregard(instanceId))) {
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
