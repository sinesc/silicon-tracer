"use strict";

// The circuit drawing grid.
class Grid {

    static SPACING = 20;
    static STATUS_DELAY = 500;

    static #RAD90 = Math.PI / 2; // 90°
    static #ZOOM_LEVELS = [ 0.5, 0.65, 0.85, 1.0, 1.25, 1.50, 1.75, 2.0, 2.5, 3.0 ];

    #app;
    #element;
    #worldElement;
    #trimElement;
    #selection;
    #selectionCenter = null;
    #junctionElements = new Map(); // "x:y" => { element: HTMLElement, wire: Wire }
    #trimOverlays = [];
    #hotkeyTarget = null;
    #circuit;
    #netColor = 1;
    #debugElement;
    #passive;

    #pending = {
        wireCompact: false,             // wire(s) added/removed/repositioned - compact before next compile
        recompile: false,               // topology changed -> sim.compile on next render
        netColors: true,                // net topology/colors changed -> applyNetColors on next render
        junctionRebuild: true,          // wire topology changed -> rebuildJunctions on next render
        junctionPositionUpdate: false,  // zoom changed -> reposition junction elements on next render
        bgPattern: true,                // zoom or pan changed -> CSS background update on next render
        viewportUpdate: false,          // zoom changed -> propagate NEEDS_FULL_RENDER to all items
        monitorRefresh: false,          // simulation recompiled, need to update probes
    };
    #suppressCircuitEvents = false;     // true while Wire.compact runs inside render()
    #infoBoxElement = null;
    #infoBoxSections = [];              // Array<{ id, interval, overlay, node, lastRenderTime }>
    #searchBar = null;

    constructor(app, parent, passive = false) {
        assert.class(Application, app);
        assert.class(Node, parent);
        this.#app = app;
        this.#element = html(parent, 'div', 'grid');
        this.#worldElement = html(this.#element, 'div', 'grid-world');
        this.#infoBoxElement = html(this.#element, 'div', 'grid-info');
        const selectionElement = html(this.#element, 'div', 'grid-selection hidden');
        this.#trimElement = html(this.#element, 'div', 'grid-selection grid-selection-trim hidden');
        this.#debugElement = html(this.#element, 'div', 'debug-info');
        this.#selection = new Selection(this, selectionElement, (isEmpty, hadWires) => {
            this.#selectionCenter = null;
            // Selected wires were deferred from compaction; now that selection is cleared, compact them.
            // TODO: cleanup, callback arguments specific to callback implementation (hadWires)
            if (isEmpty && hadWires) {
                this.#pending.wireCompact = true;
                this.#pending.recompile = true;
                this.#pending.netColors = true;
                this.#pending.junctionRebuild = true;
            }
        });
        this.#passive = passive;
        if (!passive) {
            this.#initHotkeys();
            this.#element.onmousedown = this.#handleDragStart.bind(this);
            this.#element.onwheel = this.#handleZoom.bind(this);
            document.addEventListener('mousemove', this.#debugHandleMouse.bind(this));
            this.circuitOverlay = this.registerOverlay(1000, new CircuitOverlay(app));
            this.dependentsOverlay = this.registerOverlay(-1, new DependentsOverlay(app));
            this.simulationOverlay = this.registerOverlay(1000, new SimulationOverlay(app));
            this.monitorOverlay = this.registerOverlay(100, new MonitorOverlay(app));
            this.graphOverlay = this.registerOverlay(1000, new GraphOverlay(app));
            this.#searchBar = new SearchBar(app, this.#element);
        }
    }

    // Registers an overlay section, refreshed every interval ms. Use -1 to only re-render on circuit switch.
    registerOverlay(interval, overlay) {
        assert.integer(interval);
        assert.class(Overlay, overlay);
        const node = html(this.#infoBoxElement, 'div');
        this.#infoBoxSections.push({ interval, overlay, node, lastRenderTime: null });
        return overlay;
    }

    // Removes a registered overlay section.
    deleteOverlay(overlay) {
        assert.class(Overlay, overlay);
        const idx = this.#infoBoxSections.findIndex(o => o.overlay === overlay);
        if (idx < 0) return;
        this.#infoBoxSections[idx].node.remove();
        this.#infoBoxSections.splice(idx, 1);
    }

    // Returns the circuit currently on the grid.
    get circuit() {
        return this.#circuit;
    }

    // Unsets current grid circuit.
    unsetCircuit() {
        if (!this.#circuit) {
            return;
        }
        this.#circuit.setGridListener(null);
        this.#circuit.unlink();
        this.#circuit = null;
        this.#clearJunctions();
        if (this.circuitOverlay) {
            this.circuitOverlay.setLabel('');
            this.circuitOverlay.setInstanceId(null);
        }
        this.#hotkeyTarget = null;
        this.#app.clearStatus(true);
    }

    // Sets current grid circuit.
    setCircuit(circuit) {
        assert.class(Circuit, circuit);
        this.unsetCircuit();
        this.#circuit = circuit;
        this.#circuit.link(this);
        this.#circuit.setGridListener(this);
        if (this.circuitOverlay) {
            this.circuitOverlay.setLabel(circuit.label);
            this.circuitOverlay.setInstanceId(null);
        }
        this.#pending.bgPattern = true;
        this.#pending.netColors = true;
        this.#pending.junctionRebuild = true;
        for (const entry of this.#infoBoxSections) entry.lastRenderTime = null;
        this.#updateWorldTransform();
        if (!circuit.readonly && circuit.undoStack.currentSnapshot === null) {
            circuit.undoStack.init(circuit.serializeForUndo());
        }
    }

    // Adds an item to the grid. Automatically done by GridItem constructor.
    // restart=false suppresses circuit events (e.g. for temporary limbo wires in WireBuilder).
    addItem(item, restart = true) {
        assert.class(GridItem, item);
        assert.bool(restart);
        if (!restart) this.#suppressCircuitEvents = true;
        this.#circuit.addItem(item); // fires onCircuitItemAdded unless suppressed
        if (!restart) this.#suppressCircuitEvents = false;
        item.link(this);
        this.#app.haveChanges = true;
        return item;
    }

    // Removes an item from the grid and the current circuit.
    // restart=false suppresses circuit events (e.g. for temporary limbo wires in WireBuilder).
    removeItem(item, restart = true) {
        assert.class(GridItem, item);
        assert.bool(restart);
        item.unlink();
        if (!restart) this.#suppressCircuitEvents = true;
        this.#circuit.removeItem(item); // fires onCircuitItemRemoved unless suppressed
        if (!restart) this.#suppressCircuitEvents = false;
        this.releaseHotkeyTarget(item);
        this.#app.haveChanges = true;
        return item;
    }

    // Returns iterator over current circuit items.
    get items() {
        return this.#circuit.items;
    }

    // Adds a visual element for a grid item to the grid.
    addVisual(element) {
        assert.class(Node, element);
        this.#worldElement.appendChild(element);
    }

    // Removes a visual element from the grid.
    removeVisual(element) {
        assert.class(Node, element);
        element.remove();
    }

    // Returns whether the given screen coordinates are within the bounds of the grid.
    screenInBounds(x, y) {
        assert.number(x);
        assert.number(y);
        const ex1 = this.#element.offsetLeft;
        const ey1 = this.#element.offsetTop;
        return x >= ex1 && y >= ey1 && x <= ex1 + this.#element.offsetWidth && y <= ey1 + this.#element.offsetHeight;
    }

    // Converts screen coordinates to in-simulation/on-grid coordinates.
    screenToGrid(x, y) {
        assert.number(x);
        assert.number(y);
        // mouse pixel coordinates within grid view element
        const mouseX = x - this.#element.offsetLeft;
        const mouseY = y - this.#element.offsetTop;
        // compute mouse on-grid coordinates
        const mouseGridX = -this.offsetX + mouseX / this.zoom;
        const mouseGridY = -this.offsetY + mouseY / this.zoom;
        return [ mouseGridX, mouseGridY ];
    }

    // Renders the grid and its components.
    render() {

        if (!this.#passive) {
            // compact wires (must run before sim recompile to expose final wire topology)
            if (this.#pending.wireCompact && this.#circuit) {
                this.#suppressCircuitEvents = true;
                Wire.compact(this);
                this.#suppressCircuitEvents = false;
                this.#pending.wireCompact = false;
                this.pruneSelection();
                this.invalidateSelection();
                this.#pending.recompile = true;
                this.#pending.netColors = true;
                this.#pending.junctionRebuild = true;
            }

            // trigger simulation recompile if topology changed
            if (this.#pending.recompile && this.#circuit) {
                this.#app.simulations.markDirty(this.#circuit);
                this.#pending.recompile = false;
            }

            // recompile sim if dirty - skip this render frame to avoid stale net-state flash
            const sim = this.#app.simulations.current;
            if (sim && sim.checkDirty()) {
                return;
            }

            if (this.#pending.monitorRefresh) {
                this.monitorOverlay.refresh();
                this.#pending.monitorRefresh = false;
            }

            // Info box overlay - check each registered section at its configured interval.
            const now = performance.now();
            for (const entry of this.#infoBoxSections) {
                const intervalElapsed = entry.lastRenderTime === null || entry.interval === 0 || (entry.interval > 0 && now - entry.lastRenderTime >= entry.interval);
                if (intervalElapsed) {
                    if (entry.interval !== 0) entry.lastRenderTime = now;
                    if (entry.overlay.dirty()) {
                        entry.overlay.render(entry.node);
                    }
                }
            }
        }

        // CSS background grid pattern (zoom or pan changed)
        if (this.#pending.bgPattern) {

            // add below/above/current zoom level classes to grid to enable zoom based styling
            if (!this.#element.classList.contains('grid-zoom-' + (this.zoom * 100))) {
                for (const zoom of Grid.#ZOOM_LEVELS) {
                    const name = zoom * 100;
                    this.#element.classList.remove('grid-zoom-above-' + name);
                    this.#element.classList.remove('grid-zoom-' + name);
                    this.#element.classList.remove('grid-zoom-below-' + name);
                    if (this.zoom > zoom) {
                        this.#element.classList.add('grid-zoom-above-' + name);
                    } else if (this.zoom < zoom) {
                        this.#element.classList.add('grid-zoom-below-' + name);
                    } else {
                        this.#element.classList.add('grid-zoom-' + name);
                    }
                }
            }

            this.#element.setAttribute('data-zoom', this.zoom * 100);

            // create background grid pattern
            const spacing = Grid.SPACING * this.zoom;
            const offsetX = this.offsetX * this.zoom;
            const offsetY = this.offsetY * this.zoom;
            this.#element.style.backgroundSize = spacing + 'px ' + spacing + 'px';
            this.#element.style.backgroundPositionX = (offsetX % spacing) + 'px';
            this.#element.style.backgroundPositionY = (offsetY % spacing) + 'px';
            this.#pending.bgPattern = false;
        }

        if (this.#circuit) {

            // zoom -> propagate NEEDS_FULL_RENDER to all items
            if (this.#pending.viewportUpdate) {
                for (const item of this.#circuit.items) {
                    item.renderFlags = GridItem.NEEDS_FULL_RENDER;
                }
                this.#pending.viewportUpdate = false;
            }

            // apply wire net colors to attached ports
            if (this.#pending.netColors) {
                this.#applyNetColors();
                this.#pending.netColors = false;
            }

            // render items
            for (const item of this.#circuit.items) {
                const flags = item.renderFlags;
                if (flags !== 0) {
                    if (flags & GridItem.NEEDS_FULL_RENDER) {
                        item.renderFull();
                    } else if (flags & GridItem.NEEDS_DETAIL_RENDER) {
                        item.renderDetail();
                    } else {
                        item.renderPosition();
                    }
                    item.renderFlags = 0;
                }
                item.renderNetState();
            }

            // rebuild junction dots after topology changes, or just reposition after pan/zoom
            if (this.#pending.junctionRebuild) {
                this.#rebuildJunctions();
                this.#pending.junctionRebuild = false;
                this.#pending.junctionPositionUpdate = false;
            } else if (this.#pending.junctionPositionUpdate) {
                this.#updateJunctionPositions();
                this.#pending.junctionPositionUpdate = false;
            }
            this.#updateJunctionNetStates();
        }
    }

    // Makes given grid item become the hotkey-target and when locked also prevents hover events from stealing hotkey focus until released.
    requestHotkeyTarget(gridItem, lock = false, ...args) {
        assert.class(GridItem, gridItem);
        assert.bool(lock);
        if (!this.#hotkeyTarget || !this.#hotkeyTarget.locked) {
            this.#hotkeyTarget = { gridItem, args, locked: lock, keysDown: { } };
        }
    }

    // Releases hotkey focus and lock if given element matches current lock holder.
    releaseHotkeyTarget(gridItem, unlock = false) {
        assert.class(GridItem, gridItem);
        assert.bool(unlock);
        if (this.#hotkeyTarget && this.#hotkeyTarget.gridItem === gridItem && (!this.#hotkeyTarget.locked || unlock)) {
            this.#hotkeyTarget = null;
        }
    }

    // Called by Simulation after a recompile or attach/detach. Schedules net color and junction updates.
    onSimulationRecompiled() {
        this.#pending.netColors = true;
        this.#pending.junctionRebuild = true;
        this.#pending.monitorRefresh = true;
    }

    // Called by Circuit when an item is added. Schedules wire compact and simulation recompile as needed.
    onCircuitItemAdded(item) {
        if (this.#suppressCircuitEvents) return;
        if (item instanceof Wire && !item.limbo) {
            this.#pending.wireCompact = true;
        }
        this.#pending.recompile = true;
        this.#pending.netColors = true;
        this.#pending.junctionRebuild = true;
    }

    // Called by Circuit when an item is removed. Schedules wire compact, simulation recompile, and selection pruning.
    onCircuitItemRemoved(item) {
        if (this.#suppressCircuitEvents) return;
        if (item instanceof Wire) {
            this.#pending.wireCompact = true;
        }
        this.pruneSelection();
        this.#pending.recompile = true;
        this.#pending.netColors = true;
        this.#pending.junctionRebuild = true;
    }

    // Signals that wires have structurally changed (moved, built, trimmed).
    // Schedules a wire compact and simulation recompile for the next frame.
    onWiresChanged() {
        this.#pending.wireCompact = true;
        this.#pending.recompile = true;
        this.#pending.netColors = true;
        this.#pending.junctionRebuild = true;
    }

    // Signals that circuit topology has changed without a structural wire change (rotation, move-stop).
    // Schedules a simulation recompile for the next frame.
    onTopologyChanged() {
        this.#pending.recompile = true;
        this.#pending.netColors = true;
    }

    // Signals that wire colors changed without a topology change.
    // Schedules net color propagation to ports for the next frame.
    onNetColorsChanged() {
        this.#pending.netColors = true;
    }

    // Returns the current default net color for new wires.
    get netColor() {
        return this.#netColor;
    }

    // Returns the grids default status message.
    defaultStatusMessage() {
        const netColor = `<span data-net-color="${this.#netColor}">default net color</span>`;
        const sim = this.#app.simulations.current;
        const hasParent = sim && sim.instanceId > 0;
        return 'Grid. <i>Drag</i> Select area, <i>SHIFT/CTRL+Drag</i> Add/subtract selection, <i>ALT+Drag</i> Trim wires, <i>Drag (middle)</i> Pan grid, <i>MW</i> Zoom grid, <i>E</i> Configure circuit, <i>0</i> - <i>9</i> Set ' + netColor + ', ' + (hasParent ? '' : '<u>') + '<i>W</i> Switch to parent simulation' + (hasParent ? '' : '</u>');
    }

    // Sets the zoom factor.
    get zoom() {
        return this.#circuit.gridConfig.zoom;
    }

    // Sets the zoom factor.
    set zoom(value) {
        assert.number(value);
        if (this.#circuit.gridConfig.zoom !== value) {
            this.#circuit.gridConfig.zoom = value;
            this.#pending.bgPattern = true;
            this.#pending.viewportUpdate = true;
            this.#pending.junctionPositionUpdate = true;
            this.#updateWorldTransform();
        }
    }

    // Sets grid x-offset.
    get offsetX() {
        return this.#circuit.gridConfig.offsetX;
    }

    // Gets grid x-offset.
    set offsetX(value) {
        assert.number(value);
        if (this.#circuit.gridConfig.offsetX !== value) {
            this.#circuit.gridConfig.offsetX = value;
            this.#pending.bgPattern = true;
            this.#updateWorldTransform();
        }
    }

    // Sets grid y-offset.
    get offsetY() {
        return this.#circuit.gridConfig.offsetY;
    }

    // Gets grid y-offset.
    set offsetY(value) {
        assert.number(value);
        if (this.#circuit.gridConfig.offsetY !== value) {
            this.#circuit.gridConfig.offsetY = value;
            this.#pending.bgPattern = true;
            this.#updateWorldTransform();
        }
    }

    // Gets the current zoom level index.
    get zoomLevel() {
        return Grid.#ZOOM_LEVELS.findIndex((z) => z === this.zoom) ?? 0;
    }

    // Sets a new zoom level index.
    set zoomLevel(level) {
        assert.integer(level);
        level = level < 0 ? 0 : (level >= Grid.#ZOOM_LEVELS.length ? Grid.#ZOOM_LEVELS.length - 1 : level);
        this.zoom = Grid.#ZOOM_LEVELS[level];
    }

    // Returns the current Selection instance.
    get selection() {
        return this.#selection;
    }

    // Utility function to align given x/y to grid coordinates and return them.
    static align(x, y) {
        assert.number(x);
        assert.number(y);
        return [
            Math.ceil(x / Grid.SPACING) * Grid.SPACING - 0.5 * Grid.SPACING,
            Math.ceil(y / Grid.SPACING) * Grid.SPACING - 0.5 * Grid.SPACING
        ];
    }

    // Returns whether grid editing is disabled.
    get passive() {
        return this.#passive;
    }

    // Returns true when the current circuit is read-only (belongs to a packaged library).
    get readonly() {
        return this.#circuit?.readonly ?? false;
    }

    // Invalidates the current selection, recomputing center point on next use.
    invalidateSelection() {
        this.#selection.invalidate();
    }

    // Replaces the current selection. Called by Circuit.restoreFromUndo() to reinstate selection after undo/redo.
    setSelection(items) {
        this.#selection.set(items);
    }

    // Updates the current undo snapshot to reflect the latest selection state.
    #snapshotSelection() {
        if (!this.readonly) {
            this.#circuit.undoStack.updateCurrentSnapshot(this.#circuit.serializeForUndo());
        }
    }

    // Logs an action to the undo system unless circuit is unchanged.
    trackAction(label) {
        assert.string(label);
        const circuit = this.#circuit;
        const before = circuit.undoStack.currentSnapshot;
        const after = circuit.serializeForUndo();
        if (JSON.stringify(before) !== JSON.stringify(after)) {
            circuit.undoStack.push(label, before, after, true);
            this.#app.haveChanges = true;
            this.#app.refreshUndoButtons();
        }
    }

    // Cuts the current selection and copies it to the clipboard.
    async actionCutSelection() {
        if (this.readonly) return;
        await this.copySelection();
        this.#deleteSelection();
        this.trackAction('Cut selection');
    }

    // Deletes selected items.
    actionDeleteSelection() {
        if (this.readonly) return;
        this.#deleteSelection();
        this.trackAction('Delete selection');
    }

    // Pastes items from clipboard.
    async actionPasteSelection() {
        if (this.readonly) return;
        const serialized = JSON.parse(await navigator.clipboard.readText());
        const items = serialized.map((item) => GridItem.unserialize(this.#app, item));
        // offset items a bit to help user visually identify the pasted selection
        for (const item of items) {
            item.x += 2 * Grid.SPACING;
            item.y += 2 * Grid.SPACING;
        }
        // clear selected flag on all circuit items
        for (const item of this.#circuit.items) {
            item.selected = false;
        }
        // add pasted items
        for (const item of items) {
            this.addItem(item);
            item.onPaste();
        }
        // select pasted items
        this.#selection.set(items);
        // Wire compact, simulation recompile, and selection pruning are triggered automatically
        // via onCircuitItemAdded events fired during addItem above.
        this.#app.haveChanges = true;
        this.trackAction('Paste selection');
    }

    // Copies selected items to clipboard.
    copySelection() {
        return navigator.clipboard.writeText(JSON.stringify(this.#selection.items.map((item) => item.serialize())));
    }

    // Deletes selected items.
    #deleteSelection() {
        this.#circuit.detachSimulation();
        for (const item of this.#selection.items) {
            this.removeItem(item); // fires onCircuitItemRemoved -> schedules compact/recompile/prune
        }
        this.#selection.clear();
        // Wire compact, simulation recompile, and selection pruning handled automatically by circuit events.
        this.#app.haveChanges = true;
    }

    // Removes unlinked items from selection (deleted items that are now only referenced by the selection).
    pruneSelection() {
        this.#selection.prune();
    }

    // Applies net colors to component ports on the grid.
    #applyNetColors() {
        const netList = NetList.identify(this.#circuit);
        // match port colors with attached wire colors, ensure consistent color across entire net
        for (const net of netList.nets) {
            // find net color (when dragging from unconnected wire to connected wire the new wire will have color null)
            const applyColor = net.wires.values().map((nw) => this.#circuit.itemByGID(nw.gid)).find((w) => w.color !== null)?.color ?? this.#netColor;
            for (const { gid } of net.wires) {
                const wire = this.#circuit.itemByGID(gid);
                wire.color = applyColor;
                wire.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;
            }
            for (const port of net.ports) {
                const component = this.#circuit.itemByGID(port.gid);
                const portName = port.name;
                const p = component.portByName(portName);
                if (p.color !== applyColor) {
                    p.color = applyColor;
                    component.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;
                }
            }
        }
        // clear color of unconnected wires
        for (const netWire of netList.unconnected.wires) {
            const wire = this.#circuit.itemByGID(netWire.gid);
            wire.color = null;
        }
        // clear color of unconnected ports
        for (const port of netList.unconnected.ports) {
            const component = this.#circuit.itemByGID(port.gid);
            const portName = port.name;
            const p = component.portByName(portName);
            if (p.color !== null) {
                p.color = null;
                component.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;
            }
        }
    }

    // Rebuilds junction dot elements for all T- and X-junction coordinates.
    // A junction exists wherever 3 or more wire endpoints share the same grid coordinate.
    #rebuildJunctions() {
        const coordMap = new Map(); // "x:y" => { x, y, wires: Wire[] }
        for (const item of this.#circuit.items) {
            if (!(item instanceof Wire) || item.disregard()) continue;
            for (const pt of item.points()) {
                const key = pt.c;
                if (!coordMap.has(key)) {
                    coordMap.set(key, { x: pt.x, y: pt.y, wires: [] });
                }
                coordMap.get(key).wires.push(item);
            }
        }

        // Remove stale junction elements for coordinates that are no longer junctions.
        for (const [key, { element }] of this.#junctionElements) {
            if (!coordMap.has(key) || coordMap.get(key).wires.length < 3) {
                element.remove();
                this.#junctionElements.delete(key);
            }
        }

        // Create or update junction elements for junction coordinates (3+ endpoints).
        for (const [key, { x, y, wires }] of coordMap) {
            if (wires.length < 3) continue;
            const wire = wires[0];
            const vx = x * this.zoom;
            const vy = y * this.zoom;
            const isBus = (wire.netIds?.length ?? 0) > 1;

            let entry = this.#junctionElements.get(key);
            if (!entry) {
                const element = html(null, 'div', 'wire-junction');
                this.#worldElement.appendChild(element);
                entry = { element, wire, wires, x, y };
                this.#junctionElements.set(key, entry);
            } else {
                entry.wire = wire;
                entry.wires = wires;
            }

            entry.element.classList.toggle('wire-bus', isBus);
            entry.element.setAttribute('data-net-color', wire.color ?? '');
            entry.element.style.left = vx + 'px';
            entry.element.style.top = vy + 'px';
        }
    }

    // Applies the current pan offset as a CSS transform on the world container.
    #updateWorldTransform() {
        const tx = this.offsetX * this.zoom;
        const ty = this.offsetY * this.zoom;
        this.#worldElement.style.transform = `translate(${tx}px, ${ty}px)`;
    }

    // Updates only the visual positions of existing junction elements after a pan or zoom.
    #updateJunctionPositions() {
        for (const { element, x, y } of this.#junctionElements.values()) {
            element.style.left = x * this.zoom + 'px';
            element.style.top = y * this.zoom + 'px';
        }
    }

    // Updates the net-state and net-color attributes on all junction dot elements (called every frame).
    #updateJunctionNetStates() {
        for (const { element, wire, wires } of this.#junctionElements.values()) {
            const hidden = wires.some((w) => w.selected);
            element.style.display = hidden ? 'none' : '';
            if (hidden) continue;
            const state = wire.getNetState(wire.netIds);
            if (element.getAttribute('data-net-state') !== state) {
                element.setAttribute('data-net-state', state);
            }
            const color = wire.color ?? '';
            if (element.getAttribute('data-net-color') !== String(color)) {
                element.setAttribute('data-net-color', color);
            }
        }
    }

    // Removes all junction dot elements from the DOM.
    #clearJunctions() {
        for (const { element } of this.#junctionElements.values()) {
            element.remove();
        }
        this.#junctionElements.clear();
    }

    // Registers required grid hotkeys with application.
    #initHotkeys() {

        // global hotkeys, override hover target hotkeys
        this.#app.registerHotkey('ctrl+f', 'down', null, () => this.#searchBar.toggle());
        this.#app.registerHotkey('ctrl+a', 'down', () => !this.readonly, async () => {
            this.#selection.set([ ...this.#circuit.items ]);
            this.#snapshotSelection();
        });
        this.#app.registerHotkey('ctrl+v', 'down', () => !this.readonly, () => this.actionPasteSelection());
        this.#app.registerHotkey('ctrl+c', 'down', () => !this.readonly && this.#selection.items.length > 0, () => this.copySelection());
        this.#app.registerHotkey('ctrl+x', 'down', () => !this.readonly && this.#selection.items.length > 0, () => this.actionCutSelection());
        this.#app.registerHotkey('r', 'down', () => !this.readonly && this.#selection.items.length > 0, () => this.#actionRotateSelection());
        this.#app.registerHotkey('Delete', 'down', () => !this.readonly && this.#selection.items.length > 0, () => this.actionDeleteSelection());

        // send to hover target
        this.#app.registerHotkey(null, 'press', () => !this.readonly && this.#hotkeyTarget, (e) => {
            if (e.type === 'keydown') {
                // handle target specific hotkeys
                const { gridItem, args, keysDown } = this.#hotkeyTarget;
                keysDown[e.key] = true;
                gridItem.onHotkey(e.key, 'down', ...args);
            } else {
                // only send up if target previously received down
                if (this.#hotkeyTarget && this.#hotkeyTarget.keysDown[e.key]) {
                    const { gridItem, args, keysDown } = this.#hotkeyTarget;
                    keysDown[e.key] = false;
                    gridItem.onHotkey(e.key, 'up', ...args);
                }
            }
        });

        // below hotkeys only trigger when there is no hover target
        this.#app.registerHotkey('e', 'down', () => !this.readonly, (e) => {
            this.#circuit.edit();
        });
        this.#app.registerHotkey('w', 'down', () => this.#app.simulations.current, (e) => {
            // switch to parent simulation instance
            const sim = this.#app.simulations.current;
            const parentInstanceId = sim.parentInstanceId;
            if (parentInstanceId !== null) {
                sim.reattach(parentInstanceId);
            }
        });
        this.#app.registerHotkey(null, 'down', (e) => e.key >= '0' && e.key <= '9', (e) => {
            this.#netColor = parseInt(e.key);
            this.#app.updateStatus();
        });
    }

    // Called on mouse wheel change, updates zoom level.
    #handleZoom(e) {
        if (this.#infoBoxElement.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        // compute mouse on-grid coordinates
        const [ mouseGridX, mouseGridY ] = this.screenToGrid(e.clientX, e.clientY);
        // pick next zoom level
        this.zoomLevel = this.zoomLevel + (e.deltaY > 0 ? -1 : 1);
        // compute new mouse on-grid coordinates after the zoom
        const [ mouseGridXAfter, mouseGridYAfter ] = this.screenToGrid(e.clientX, e.clientY);
        // move grid to compensate so that the point we zoomed into is still at the cursor
        this.offsetX -= mouseGridX - mouseGridXAfter;
        this.offsetY -= mouseGridY - mouseGridYAfter;
    }

    // Compute selection center point for rotation.
    #computeSelectionCenter() {
        // find bounding box
        let bounds = { x1: Number.MAX_SAFE_INTEGER, y1: Number.MAX_SAFE_INTEGER, x2: Number.MIN_SAFE_INTEGER, y2: Number.MIN_SAFE_INTEGER };
        for (const item of this.#selection.items) {
            bounds.x1 = Math.min(item.x, bounds.x1);
            bounds.y1 = Math.min(item.y, bounds.y1);
            bounds.x2 = Math.max(item.x + item.width, bounds.x2);
            bounds.y2 = Math.max(item.y + item.height, bounds.y2);
        }
        // compute a rotation center, ensure exact grid snapping
        const width = bounds.x2 - bounds.x1;
        const height = bounds.y2 - bounds.y1;
        const centerX = bounds.x1 + (width / 2);
        const centerY = bounds.y1 + (height / 2);
        const roundX = Math.round(centerX / Grid.SPACING) * Grid.SPACING;
        const roundY = Math.round(centerY / Grid.SPACING) * Grid.SPACING;
        return point(roundX, roundY);
    }

    // Rotates the current selection 90° around its center.
    #actionRotateSelection() {
        const center = this.#selectionCenter ??= this.#computeSelectionCenter();
        // rotate items around center
        for (const item of this.#selection.items) {
            if (item instanceof Component || item instanceof TextLabel) {
                // component.rotation causes a rotation around the component center, so we have to use that as our basis
                const xc = item.x + (item.width / 2);
                const yc = item.y + (item.height / 2);
                const offset = point(xc, yc).rotateAround(center, Grid.#RAD90).round();
                // offset item by difference so we don't have to compute with center again
                item.x += offset.x - xc;
                item.y += offset.y - yc;
                item.rotation += 1;
            } else if (item instanceof Wire) {
                const start = point(item.x, item.y).rotateAround(center, Grid.#RAD90).round();
                const end = point(item.x + item.width, item.y + item.height).rotateAround(center, Grid.#RAD90).round();
                item.setEndpoints(start.x, start.y, end.x, end.y);
            }
        }
        this.onTopologyChanged();
        this.trackAction('Rotate selection');
    }

    // Normalizes a rectangle given as (x, y, w, h) where w/h may be negative, returning top-left + positive dimensions.
    static #normalizeRect(x, y, w, h) {
        if (w < 0) { x += w; w = -w; }
        if (h < 0) { y += h; h = -h; }
        return [ x, y, w, h ];
    }

    // Renders a trim-mode selection box and updates wire-segment trim overlays.
    #renderTrimBox(x, y, width, height) {
        [ x, y, width, height ] = Grid.#normalizeRect(x, y, width, height);
        this.#trimElement.style.left = x + "px";
        this.#trimElement.style.top = y + "px";
        this.#trimElement.style.width = width + "px";
        this.#trimElement.style.height = height + "px";
        const gx1 = x / this.zoom - this.offsetX;
        const gy1 = y / this.zoom - this.offsetY;
        this.#updateTrimOverlays(gx1, gy1, gx1 + width / this.zoom, gy1 + height / this.zoom);
    }

    // Iterates over wire segments that fall inside [gx1,gy1]–[gx2,gy2] with inward-snapped boundaries.
    // Calls callback(wire, fixed, wireStart, wireEnd, trimA, trimB, dir) for each affected segment.
    // fixed = the perpendicular coordinate; wireStart/End = full wire span; trimA/B = trimmed span; dir = 'h'|'v'.
    #forEachTrimSegment(gx1, gy1, gx2, gy2, callback) {
        const s = Grid.SPACING / 2;
        const snapIn  = (v) => Math.ceil( (v + s) / Grid.SPACING) * Grid.SPACING - s;
        const snapOut = (v) => Math.floor((v + s) / Grid.SPACING) * Grid.SPACING - s;
        const snapX1 = snapIn(gx1),  snapX2 = snapOut(gx2);
        const snapY1 = snapIn(gy1),  snapY2 = snapOut(gy2);
        for (const wire of this.items) {
            if (!(wire instanceof Wire)) continue;
            const [ p1, p2 ] = wire.points();
            if (wire.width !== 0) {
                const wy = p1.y;
                if (wy < gy1 || wy > gy2) continue;
                const wx1 = Math.min(p1.x, p2.x), wx2 = Math.max(p1.x, p2.x);
                const trimLeft = Math.max(wx1, snapX1), trimRight = Math.min(wx2, snapX2);
                if (trimLeft < trimRight) callback(wire, wy, wx1, wx2, trimLeft, trimRight, 'h');
            } else {
                const wx = p1.x;
                if (wx < gx1 || wx > gx2) continue;
                const wy1 = Math.min(p1.y, p2.y), wy2 = Math.max(p1.y, p2.y);
                const trimTop = Math.max(wy1, snapY1), trimBottom = Math.min(wy2, snapY2);
                if (trimTop < trimBottom) callback(wire, wx, wy1, wy2, trimTop, trimBottom, 'v');
            }
        }
    }

    // Creates/updates overlay divs highlighting the wire segments that will be trimmed.
    #updateTrimOverlays(gx1, gy1, gx2, gy2) {
        for (const el of this.#trimOverlays) el.remove();
        this.#trimOverlays = [];
        const thickness = 3 * this.zoom, t = thickness / 2;
        this.#forEachTrimSegment(gx1, gy1, gx2, gy2, (wire, fixed, _ws, _we, trimA, trimB, dir) => {
            const div = document.createElement('div');
            div.className = 'wire-trim-overlay';
            if (dir === 'h') {
                div.style.left   = (trimA + this.offsetX) * this.zoom - t + 'px';
                div.style.top    = (fixed + this.offsetY) * this.zoom - t + 'px';
                div.style.width  = (trimB - trimA) * this.zoom + thickness + 'px';
                div.style.height = thickness + 'px';
            } else {
                div.style.left   = (fixed + this.offsetX) * this.zoom - t + 'px';
                div.style.top    = (trimA + this.offsetY) * this.zoom - t + 'px';
                div.style.width  = thickness + 'px';
                div.style.height = (trimB - trimA) * this.zoom + thickness + 'px';
            }
            this.#element.appendChild(div);
            this.#trimOverlays.push(div);
        });
    }

    // Removes the portions of wires inside the given grid-space rectangle [gx1,gy1]–[gx2,gy2].
    #executeTrim(gx1, gy1, gx2, gy2) {
        const segments = [];
        this.#forEachTrimSegment(gx1, gy1, gx2, gy2, (...args) => segments.push(args));
        if (segments.length === 0) return;
        for (const [ wire, fixed, wireStart, wireEnd, trimA, trimB, dir ] of segments) {
            this.removeItem(wire, false);
            if (wireStart < trimA)
                this.addItem(new Wire(this.#app, dir === 'h' ? wireStart : fixed, dir === 'h' ? fixed : wireStart, trimA - wireStart, dir, wire.color), false);
            if (trimB < wireEnd)
                this.addItem(new Wire(this.#app, dir === 'h' ? trimB : fixed, dir === 'h' ? fixed : trimB, wireEnd - trimB, dir, wire.color), false);
        }
        this.pruneSelection();
        this.onWiresChanged();
    }

    // Removes all active trim overlay elements.
    #clearTrimOverlays() {
        for (const el of this.#trimOverlays) el.remove();
        this.#trimOverlays = [];
    }

    // Called when mouse drag starts.
    #handleDragStart(e) {
        e.preventDefault();
        e.stopPropagation();
        const dragStartX = e.clientX - this.#element.offsetLeft;
        const dragStartY = e.clientY - this.#element.offsetTop;
        const shiftDown = e.shiftKey;
        const ctrlDown = e.ctrlKey;
        const altDown = e.altKey;
        if (e.which === 1 && this.readonly) {
            return;
        }
        if (e.which === 1) {
            if (altDown) {
                // trim mode: show trim box only, do not modify selection
                this.#trimElement.classList.remove('hidden');
                this.#renderTrimBox(dragStartX, dragStartY, 0, 0);
            } else {
                // normal selection mode
                if (!shiftDown && !ctrlDown) {
                    this.#selection.clear();
                }
                this.#selection.renderBox(dragStartX, dragStartY, 0, 0, shiftDown);
            }
        } else if (e.which > 2) {
            return;
        }
        document.onmousemove = this.#handleDragMove.bind(this, dragStartX, dragStartY, this.offsetX, this.offsetY, !ctrlDown, altDown);
        document.onmouseup = this.#handleDragStop.bind(this, dragStartX, dragStartY, altDown);
    }

    // Called on mouse drag, moves the grid or selects area.
    #handleDragMove(dragStartX, dragStartY, gridOffsetX, gridOffsetY, addSelection, trimSelection, e) {
        e.preventDefault();
        e.stopPropagation();
        const deltaX = (e.clientX - this.#element.offsetLeft) - dragStartX;
        const deltaY = (e.clientY - this.#element.offsetTop) - dragStartY;
        if (e.which === 1) {
            if (trimSelection) {
                this.#renderTrimBox(dragStartX, dragStartY, deltaX, deltaY);
            } else {
                // select area
                this.#selection.renderBox(dragStartX, dragStartY, deltaX, deltaY, addSelection);
            }
        } else if (e.which === 2) {
            // drag grid
            this.offsetX = gridOffsetX + deltaX / this.zoom;
            this.offsetY = gridOffsetY + deltaY / this.zoom;
        }
    }

    // Called when mouse drag ends.
    #handleDragStop(dragStartX, dragStartY, altDown, e) {
        if (e.which === 1) {
            this.#clearTrimOverlays();
            if (altDown) {
                // trim mode: remove wire segments inside the selection rectangle
                this.#trimElement.classList.add('hidden');
                const endX = e.clientX - this.#element.offsetLeft;
                const endY = e.clientY - this.#element.offsetTop;
                const [ x, y, w, h ] = Grid.#normalizeRect(dragStartX, dragStartY, endX - dragStartX, endY - dragStartY);
                const gx1 = x / this.zoom - this.offsetX;
                const gy1 = y / this.zoom - this.offsetY;
                const gx2 = gx1 + w / this.zoom;
                const gy2 = gy1 + h / this.zoom;
                this.#executeTrim(gx1, gy1, gx2, gy2);
                this.trackAction('Trim wires');
            } else {
                // normal selection: set selected items
                this.#selection.removeBox();
                this.#selection.set(this.items.filter((c) => c.selected).toArray());
                this.#snapshotSelection();
            }
        }
        document.onmouseup = null;
        document.onmousemove = null;
    }

    // Called on mouse move, updates mouse coordinates and tooltip.
    #debugHandleMouse(e) {
        if (this.#app.config.debugShowCoords) {
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            if (this.screenInBounds(mouseX, mouseY)) {
                const [ x, y ] = this.screenToGrid(mouseX, mouseY);
                this.#debugElement.innerHTML = 'x: ' + Math.round(x) + ' y: ' + Math.round(y) + ' zoom: ' + this.zoom;
            }
        }
    }

    // adds a debug marker at the given location
    debugPoint(point, i = 0, existingElement = null) {
        const element = existingElement ?? document.createElement('div');
        if (point === null) {
            element.style.display = 'none';
        } else {
            const vx = (point.x + this.offsetX) * this.zoom;
            const vy = (point.y + this.offsetY) * this.zoom;
            element.style.display = 'block';
            element.style.left = (vx - 6) + 'px';
            element.style.top = (vy - 6) + 'px';
        }
        if (!existingElement) {
            element.classList.add('debug-point', 'debug-point' + i);
            this.addVisual(element);
        }
        return element;
    }
}
