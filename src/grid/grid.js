"use strict";

// The circuit drawing grid.
class Grid {

    static SPACING = 20;
    static STATUS_DELAY = 500;

    static #ZOOM_LEVELS = [ 0.2, 0.3, 0.4, 0.55, 0.7, 0.85, 1.0, 1.25, 1.50, 1.75, 2.0 ];

    #app;
    #element;
    #worldElement;
    #trimBox;
    #selection;
    #savedSelections = new WeakMap(); // circuit -> saved selection items[]
    #junctionElements = new Map(); // "x:y" => { element: HTMLElement, wire: Wire }
    #hotkeyTarget = null;
    #keyboardHoverItem = null;
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
    animating = false;                  // set to true by grid items while animating, used to defer recompiles until after the animation is done
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
        this.#selection = new Selection(this, this.#element);
        this.#trimBox = new TrimBox(this, this.#element);
        this.#debugElement = html(this.#element, 'div', 'debug-info');
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
        const name = overlay.constructor.name;
        const overlayConfig = this.#app.config.overlays[name] ??= {};
        const node = html(this.#infoBoxElement, 'div');
        const entry = { interval, overlay, node, lastRenderTime: null, collapsed: overlayConfig.collapsed ?? false };
        node.classList.toggle('collapsed', entry.collapsed);
        node.addEventListener('click', e => {
            if (e.target.closest('.info-section')) {
                entry.collapsed = !entry.collapsed;
                overlayConfig.collapsed = entry.collapsed;
                node.classList.toggle('collapsed', entry.collapsed);
            }
        });
        this.#infoBoxSections.push(entry);
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
        this.#savedSelections.set(this.#circuit, this.#selection.items.slice());
        this.#selection.reset();
        this.#circuit.unlink();
        this.#circuit = null;
        this.#clearJunctions();
        if (this.circuitOverlay) {
            this.circuitOverlay.setLabel('');
            this.circuitOverlay.setInstanceId(null);
        }
        this.#clearKeyboardHover();
        this.#hotkeyTarget = null;
        this.#app.clearStatus(true);
    }

    // Sets current grid circuit.
    setCircuit(circuit) {
        assert.class(Circuit, circuit);
        this.unsetCircuit();
        this.#circuit = circuit;
        this.#circuit.link(this);
        if (this.circuitOverlay) {
            this.circuitOverlay.setLabel(circuit.label);
            this.circuitOverlay.setInstanceId(null);
        }
        this.#pending.bgPattern = true;
        this.#pending.netColors = true;
        this.#pending.junctionRebuild = true;
        for (const entry of this.#infoBoxSections) {
            entry.lastRenderTime = null;
        }
        this.#updateWorldTransform();
        if (!circuit.readonly && circuit.undoStack.currentSnapshot === null) {
            circuit.undoStack.init(this.#captureUndoState());
        }
        // restore selection
        const savedItems = this.#savedSelections.get(circuit);
        if (savedItems) {
            const validItems = savedItems.filter((item) => item.grid === this); // TODO: given that the grid is the only way to change circuits, is this really required?
            if (validItems.length > 0) {
                this.#selection.set(validItems);
            }
        }
    }

    // Adds an item to the grid. restart=false skips scheduling recompile (e.g. limbo wires in WireBuilder).
    addItem(item, restart = true) {
        assert.class(GridItem, item);
        assert.bool(restart);
        this.#circuit.addItem(item);
        item.link(this);
        this.#app.haveChanges = true;
        if (restart) {
            if (item instanceof Wire && !item.limbo) {
                this.#pending.wireCompact = true;
            }
            this.#pending.recompile = true;
            this.#pending.netColors = true;
            this.#pending.junctionRebuild = true;
        }
        return item;
    }

    // Removes an item from the grid and the current circuit. restart=false skips scheduling recompile.
    removeItem(item, restart = true) {
        assert.class(GridItem, item);
        assert.bool(restart);
        item.unlink();
        this.#circuit.removeItem(item);
        this.releaseHotkeyTarget(item);
        this.#app.haveChanges = true;
        if (restart) {
            if (item instanceof Wire) {
                this.#pending.wireCompact = true;
            }
            this.#selection.prune();
            this.#pending.recompile = true;
            this.#pending.netColors = true;
            this.#pending.junctionRebuild = true;
        }
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

    // Pans to bring item into the visible area.
    panToItem(item) {
        const gw = this.#element.offsetWidth;
        const gh = this.#element.offsetHeight;
        const zoom = this.zoom;
        const cx = item.x + item.width / 2;
        const cy = item.y + item.height / 2;
        const sx = (cx + this.offsetX) * zoom;
        const sy = (cy + this.offsetY) * zoom;
        const margin = Grid.SPACING * 4 * zoom;
        if (sx < margin || sx > gw - margin || sy < margin || sy > gh - margin) {
            this.offsetX = gw / (2 * zoom) - cx;
            this.offsetY = gh / (2 * zoom) - cy;
        }
    }

    // Renders the grid and its components.
    render() {

        if (!this.#passive) {
            // compact wires (must run before sim recompile to expose final wire topology)
            if (this.#pending.wireCompact && this.#circuit) {
                Wire.compact(this);
                this.#pending.wireCompact = false;
                this.#selection.prune();
                this.#selection.invalidate();
                this.#pending.recompile = true;
                this.#pending.netColors = true;
                this.#pending.junctionRebuild = true;
            }

            // trigger simulation recompile if topology changed, wait until potentially running animations are done
            if (this.#pending.recompile && !this.animating && this.#circuit) {
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
            const currentZoom = Math.round(this.zoom * 100);
            if (!this.#element.classList.contains('grid-zoom-' + currentZoom)) {
                for (const zoom of Grid.#ZOOM_LEVELS) {
                    const name = Math.round(zoom * 100);
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
            this.#element.setAttribute('data-zoom', currentZoom);

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
            if (this.#keyboardHoverItem && gridItem !== this.#keyboardHoverItem) {
                this.#keyboardHoverItem.keyboardFocused = false;
                this.#keyboardHoverItem = null;
            }
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

    // Clears keyboard hover state without affecting mouse-driven hotkeyTarget.
    #clearKeyboardHover() {
        if (!this.#keyboardHoverItem) {
            return;
        }
        this.#keyboardHoverItem.keyboardFocused = false;
        this.releaseHotkeyTarget(this.#keyboardHoverItem);
        this.#app.clearStatus();
        this.#keyboardHoverItem = null;
    }

    // Marks a component as keyboard-hovered, replacing any previous keyboard hover.
    #setKeyboardHover(item) {
        assert.class(Component, item);
        if (this.#keyboardHoverItem === item) {
            return;
        }
        this.#clearKeyboardHover();
        this.#keyboardHoverItem = item;
        item.keyboardFocused = true;
        this.requestHotkeyTarget(item, false, { type: 'hover' });
        this.#app.setStatus(item.hoverStatusMessage(), false, item);
    }

    // Returns the Component closest to the given direction from the current keyboard-hover item,
    // or closest to the visible center if no item is currently keyboard-hovered (direction ignored).
    #findClosestComponent(direction) {
        const components = [ ...this.#circuit.items ].filter(item => item instanceof Component);
        if (!components.length) {
            return null;
        }
        const current = this.#keyboardHoverItem;
        if (!current) {
            const cx = -this.offsetX + this.#element.clientWidth / 2 / this.zoom;
            const cy = -this.offsetY + this.#element.clientHeight / 2 / this.zoom;
            let best = null;
            let bestDist = Infinity;
            for (const c of components) {
                const dx = (c.x + c.width / 2) - cx;
                const dy = (c.y + c.height / 2) - cy;
                const dist = dx * dx + dy * dy;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = c;
                }
            }
            return best;
        }
        const cx = current.x + current.width / 2;
        const cy = current.y + current.height / 2;
        let best = null;
        let bestScore = Infinity;
        for (const c of components) {
            if (c === current) {
                continue;
            }
            const dx = (c.x + c.width / 2) - cx;
            const dy = (c.y + c.height / 2) - cy;
            if (direction === 'left' && dx >= 0) { continue; }
            if (direction === 'right' && dx <= 0) { continue; }
            if (direction === 'up' && dy >= 0) { continue; }
            if (direction === 'down' && dy <= 0) { continue; }
            const primary = (direction === 'left' || direction === 'right') ? Math.abs(dx) : Math.abs(dy);
            const secondary = (direction === 'left' || direction === 'right') ? Math.abs(dy) : Math.abs(dx);
            const score = primary + 2 * secondary;
            if (score < bestScore) {
                bestScore = score;
                best = c;
            }
        }
        return best;
    }

    // Schedules net color and junction updates.
    markSimulationRecompiled() {
        this.#pending.netColors = true;
        this.#pending.junctionRebuild = true;
        this.#pending.monitorRefresh = true;
    }

    // Schedules a wire compact and simulation recompile for the next frame.
    markWiresChanged() {
        this.#pending.wireCompact = true;
        this.#pending.recompile = true;
        this.#pending.netColors = true;
        this.#pending.junctionRebuild = true;
    }

    // Schedules a simulation recompile for the next frame.
    markTopologyChanged() {
        this.#pending.recompile = true;
        this.#pending.netColors = true;
    }

    // Schedules net color propagation to ports for the next frame.
    markNetColorsChanged() {
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

    get app() {
        return this.#app;
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

    // Captures circuit state and selection indices for undo tracking. Returns a JSON string.
    #captureUndoState() {
        const circuit = this.#circuit;
        const allItems = [...circuit.items];
        return JSON.stringify({
            label: circuit.label,
            description: circuit.description,
            portConfig: circuit.portConfig,
            data: allItems.map((i) => i.serialize()),
            selection: this.#selection.items.map((i) => allItems.indexOf(i)).filter((i) => i >= 0),
        });
    }

    // Restores the current circuit to a snapshot produced by #captureUndoState().
    restoreFromUndo(snapshot) {
        assert.string(snapshot);
        const circuit = this.#circuit;
        const parsed = JSON.parse(snapshot);
        this.#selection.reset(); // clear stale refs before unlink() nulls wire elements
        circuit.unlink();
        circuit.clearItems();
        circuit.label = parsed.label;
        circuit.description = parsed.description;
        Object.assign(circuit.portConfig, parsed.portConfig);
        circuit.portConfig.placement = Object.assign({}, parsed.portConfig.placement);
        for (const raw of parsed.data) {
            circuit.addItem(GridItem.unserialize(this.#app, raw, [], null, []));
        }
        circuit.link(this);
        this.circuitOverlay.setLabel(circuit.label);
        this.simulationOverlay.setLabel(circuit.label);
        this.markSimulationRecompiled();
        const allItems = [...circuit.items];
        const newSelection = (parsed.selection ?? []).map((i) => allItems[i]).filter(Boolean);
        this.#selection.set(newSelection);
        this.markWiresChanged(); // deferred compact runs next frame with correct selection context
    }

    // Logs an action to the undo system unless circuit is unchanged.
    trackAction(label) {
        assert.string(label);
        const circuit = this.#circuit;
        const before = circuit.undoStack.currentSnapshot;
        const after = this.#captureUndoState();
        if (before !== after) {
            circuit.undoStack.push(label, before, after, true);
            this.#app.haveChanges = true;
            this.#app.refreshUndoButtons();
        }
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
            this.trackAction('Select all');
        });
        this.#app.registerHotkey('ctrl+v', 'down', () => !this.readonly, () => Action.pasteSelection(this.#app));
        this.#app.registerHotkey('ctrl+c', 'down', () => !this.readonly && this.#selection.items.length > 0, () => Action.copySelection(this.#app));
        this.#app.registerHotkey('ctrl+x', 'down', () => !this.readonly && this.#selection.items.length > 0, () => Action.cutSelection(this.#app));
        this.#app.registerHotkey('r', 'down', () => !this.readonly && this.#selection.items.length > 0, () => Action.rotateSelection(this.#app));
        this.#app.registerHotkey('Delete', 'down', () => !this.readonly && this.#selection.items.length > 0, () => Action.deleteSelection(this.#app));

        // keyboard navigation between components
        const arrowCondition = () => !this.readonly && (!this.#hotkeyTarget || !this.#hotkeyTarget.locked);
        const arrowDirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
        this.#app.registerHotkey(Object.keys(arrowDirs), 'down', arrowCondition, (e) => {
            const n = this.#findClosestComponent(arrowDirs[e.key]);
            if (n) { this.#setKeyboardHover(n); }
        });

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
                this.#trimBox.show();
                this.#trimBox.renderBox(dragStartX, dragStartY, 0, 0);
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
                this.#trimBox.renderBox(dragStartX, dragStartY, deltaX, deltaY);
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
            this.#trimBox.clearOverlays();
            if (altDown) {
                // trim mode: remove wire segments inside the selection rectangle
                this.#trimBox.hide();
                const endX = e.clientX - this.#element.offsetLeft;
                const endY = e.clientY - this.#element.offsetTop;
                this.#trimBox.execute(dragStartX, dragStartY, endX - dragStartX, endY - dragStartY);
                this.trackAction('Trim wires');
            } else {
                // normal selection: set selected items
                this.#selection.removeBox();
                this.#selection.set(this.items.filter((c) => c.selected).toArray());
                this.trackAction(this.#selection.items.length > 0 ? 'Select items' : 'Clear selection');
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
