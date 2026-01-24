"use strict";

// The circuit drawing grid.
class Grid {

    static SPACING = 20;
    static STATUS_DELAY = 500;

    static #RAD90 = Math.PI / 2; // 90°
    static #ZOOM_LEVELS = [ 0.5, 0.65, 0.85, 1.0, 1.25, 1.50, 1.75, 2.0, 2.5, 3.0 ];
    static #DIRTY_NONE      = 0b0000;
    static #DIRTY_OUTER     = 0b0001;
    static #DIRTY_INNER     = 0b0010;
    static #DIRTY_OVERLAY   = 0b0100;

    #app;
    #dirty = Grid.#DIRTY_INNER | Grid.#DIRTY_OUTER | Grid.#DIRTY_OVERLAY;
    #element;
    #selectionElement;
    #selection = [];
    #selectionCenter = null;
    #hotkeyTarget = null;
    #circuit;
    #netColor = 1;
    #debugElement;

    #infoBox = {
        element: null,
        circuitLabel: null,
        circuitDetails: null,
        simulationLabel: null,
        simulationDetails: null,
        FPSCount: { current: 0, last: 0 },
    };

    constructor(app, parent) {
        assert.class(Application, app);
        assert.class(Node, parent);
        this.#app = app;
        this.#element = element(parent, 'div', 'grid');
        this.#element.onmousedown = this.#handleDragStart.bind(this);
        this.#element.onwheel = this.#handleZoom.bind(this);
        this.#infoBox.element = element(this.#element, 'div', 'grid-info', '');
        this.#selectionElement = element(this.#element, 'div', 'grid-selection hidden');
        this.#debugElement = element(this.#element, 'div', 'debug-info');
        document.addEventListener('mousemove', this.#debugHandleMouse.bind(this));
        // TODO: may have to go to parent UI
        // TODO: GridItems currently register document.onmouse* temporarily. those should probably follow the same logic: register onmouse* here and then pass on to whichever element wants to have them
        document.addEventListener('keydown', this.#handleKeyDown.bind(this));
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
        this.#circuit.unlink();
        this.#circuit = null;
        this.#infoBox.circuitLabel = '';
        this.#dirty |= Grid.#DIRTY_OVERLAY;
        this.#hotkeyTarget = null;
        this.#app.clearStatus(true);
    }

    // Sets current grid circuit.
    setCircuit(circuit) {
        assert.class(Circuits.Circuit, circuit);
        this.unsetCircuit();
        this.#circuit = circuit;
        this.#circuit.link(this);
        this.#infoBox.circuitLabel = circuit.label;
        this.#dirty |= Grid.#DIRTY_INNER | Grid.#DIRTY_OUTER | Grid.#DIRTY_OVERLAY;
    }

    // Update circuit label in infobox.
    setCircuitLabel(label) {
        this.#dirty |= this.#infoBox.circuitLabel !== label ? Grid.#DIRTY_OVERLAY : 0;
        this.#infoBox.circuitLabel = label;
    }

    // Update circuit details in infobox.
    setCircuitDetails(details) {
        this.#dirty |= this.#infoBox.circuitDetails !== details ? Grid.#DIRTY_OVERLAY : 0;
        this.#infoBox.circuitDetails = details;
    }

    // Sets the simulation label displayed on the grid.
    setSimulationLabel(label) {
        this.#dirty |= this.#infoBox.simulationLabel !== label ? Grid.#DIRTY_OVERLAY : 0;
        this.#infoBox.simulationLabel = label;
    }

    // Sets the simulation details displayed on the grid.
    setSimulationDetails(details) {
        this.#dirty |= this.#infoBox.simulationDetails !== details ? Grid.#DIRTY_OVERLAY : 0;
        this.#infoBox.simulationDetails = details;
    }

    // Adds an item to the grid. Automatically done by GridItem constructor.
    addItem(item, restart = true) {
        assert.class(GridItem, item);
        assert.bool(restart);
        item.gid ??= Grid.generateGID();
        this.#circuit.addItem(item);
        item.link(this);
        if (restart) {
            this.#app.simulations.markDirty(this.#circuit);
        }
        return item;
    }

    // Removes an item from the grid and the current circuit.
    removeItem(item, restart = true) {
        assert.class(GridItem, item);
        assert.bool(restart);
        item.unlink();
        this.#circuit.removeItem(item);
        this.releaseHotkeyTarget(item);
        if (restart) {
            this.#app.simulations.markDirty(this.#circuit);
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
        this.#element.appendChild(element);
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

        if (this.#dirty & Grid.#DIRTY_OVERLAY) {
            this.#infoBox.element.innerHTML = '<div class="info-section">Circuit</div><div class="info-title">' + this.#infoBox.circuitLabel + '</div>' +
                (!this.#infoBox.circuitDetails ? '' : '<div class="info-details">' + this.#infoBox.circuitDetails + '</div>') +
                (!this.#infoBox.simulationLabel ? '' : '<div class="info-section">Simulation</div><div class="info-title">' + this.#infoBox.simulationLabel + '</div>') +
                (!this.#infoBox.simulationDetails ? '' : '<div class="info-details">' + this.#infoBox.simulationDetails + '</div>');
        }

        if (this.#dirty & (Grid.#DIRTY_OUTER | Grid.#DIRTY_INNER)) {

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
        }

        if (this.#circuit) {

            const dirtyGrid = this.#dirty & (Grid.#DIRTY_OUTER | Grid.#DIRTY_INNER);

            // apply wire net colors to attached ports
            if (dirtyGrid || this.#circuit.hasItem((item) => item.dirty)) {
                this.#applyNetColors();
            }

            // render components
            for (const item of this.#circuit.items) {
                if (dirtyGrid || item.dirty) {
                    // optionally require full redraw from the item
                    if (this.#dirty & Grid.#DIRTY_INNER) {
                        item.dirty = true;
                    }
                    item.render();
                    item.dirty = false;
                }

                item.renderNetState();
            }
        }

        this.#infoBox.FPSCount.current += 1;
        this.#dirty = Grid.#DIRTY_NONE;
    }

    // Makes given grid item become the hotkey-target and when locked also prevents hover events from stealing hotkey focus until released.
    requestHotkeyTarget(gridItem, lock, ...args) {
        lock ??= false;
        assert.class(GridItem, gridItem);
        assert.bool(lock);
        if (!this.#hotkeyTarget || !this.#hotkeyTarget.locked) {
            this.#hotkeyTarget = { gridItem, args, locked: lock };
        }
    }

    // Releases hotkey focus and lock if given element matches current lock holder.
    releaseHotkeyTarget(gridItem, unlock) {
        unlock ??= false;
        assert.class(GridItem, gridItem);
        assert.bool(unlock);
        if (this.#hotkeyTarget && this.#hotkeyTarget.gridItem === gridItem && (!this.#hotkeyTarget.locked || unlock)) {
            this.#hotkeyTarget = null;
        }
    }

    // Mark grid as dirty (require redraw).
    markDirty() {
        this.#dirty |= Grid.#DIRTY_INNER | Grid.#DIRTY_OUTER;
    }

    // Returns the grids default status message.
    defaultStatusMessage() {
        const netColor = `<span data-net-color="${this.#netColor}">default net color</span>`;
        const sim = this.#app.simulations.current;
        const hasParent = sim && sim.instanceId > 0;
        return 'Grid. <i>LMB</i> Drag to select area, <i>SHIFT/CTRL+LMB</i> Drag to add/subtract selection, <i>MMB</i> Drag grid, <i>MW</i> Zoom grid, <i>E</i> Rename circuit, <i>0</i> - <i>9</i> Set ' + netColor + ', ' + (hasParent ? '' : '<u>') + '<i>W</i> Switch to parent simulation' + (hasParent ? '' : '</u>');
    }

    // Sets the zoom factor.
    get zoom() {
        return this.#circuit.gridConfig.zoom;
    }

    // Sets the zoom factor.
    set zoom(value) {
        assert.number(value);
        this.#dirty |= this.#circuit.gridConfig.zoom !== value ? Grid.#DIRTY_INNER : 0;
        this.#circuit.gridConfig.zoom = value;
    }

    // Sets grid x-offset.
    get offsetX() {
        return this.#circuit.gridConfig.offsetX;
    }

    // Gets grid x-offset.
    set offsetX(value) {
        assert.number(value);
        this.#dirty |= this.#circuit.gridConfig.offsetX !== value ? Grid.#DIRTY_OUTER : 0;
        this.#circuit.gridConfig.offsetX = value;
    }

    // Sets grid y-offset.
    get offsetY() {
        return this.#circuit.gridConfig.offsetY;
    }

    // Gets grid y-offset.
    set offsetY(value) {
        assert.number(value);
        this.#dirty |= this.#circuit.gridConfig.offsetY !== value ? Grid.#DIRTY_OUTER : 0;
        this.#circuit.gridConfig.offsetY = value;
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

    // Returns the currently selected grid items, if any.
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

    // Generate a grid id.
    static generateGID() {
        return 'g' + crypto.randomUUID().replaceAll('-', '');
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
            }
            for (const port of net.ports) {
                const component = this.#circuit.itemByGID(port.gid);
                const portName = port.name;
                component.portByName(portName).color = applyColor;
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
            component.portByName(portName).color = null;
        }
    }

    // Called when a key is pressed and then repeatedly while being held.
    async #handleKeyDown(e) {
        const sim = this.#app.simulations.current;
        if (e.ctrlKey && e.key === 'v') {
            // check paste hotkey before item hotkeys
            const serialized = JSON.parse(await navigator.clipboard.readText());
            const items = serialized.map((item) => GridItem.unserialize(this.#app, item));
            for (const item of items) {
                this.addItem(item);
                item.selected = true;
            }
            this.#selection = items;
            this.invalidateSelection();
            this.#app.simulations.markDirty(this.#circuit);
        } else if (this.#selection.length > 0) {
            // check selection hotkeys before item hotkeys
            if (e.key === 'Delete' || (e.ctrlKey && [ 'x', 'c' ].includes(e.key))) {
                // CTRL+C/X/V checked before hotkey target specific keys
                if (e.key === 'c' || e.key === 'x') {
                    await navigator.clipboard.writeText(JSON.stringify(this.#selection.map((item) => item.serialize())));
                }
                if (e.key === 'Delete' || e.key === 'x') {
                    this.#circuit.detachSimulation();
                    for (const item of this.#selection) {
                        this.removeItem(item, false);
                    }
                    this.#selection = [];
                    this.invalidateSelection();
                    this.#app.simulations.markDirty(this.#circuit);
                }
            } else if (e.key === 'r') {
                this.#rotateSelection();
                this.#app.simulations.markDirty(this.#circuit);
            }
        } else if (this.#hotkeyTarget) {
            // handle target specific hotkeys
            const { gridItem, args } = this.#hotkeyTarget;
            if (gridItem.onHotkey(e.key, ...args)) {
                e.preventDefault();
            }
        } else if (e.key === 'e') {
            this.#app.circuits.edit(this.#circuit.uid);
            this.#dirty |= Grid.#DIRTY_OVERLAY;
            e.preventDefault();
        } else if (e.key === 'w' && sim) {
            // switch to parent simulation instance // TODO: when not simulating this should switch to the previous circuit. this requires adding a navigation history
            const parentInstanceId = sim.parentInstanceId;
            if (parentInstanceId !== null) {
                sim.reattach(parentInstanceId);
            }
            e.preventDefault();
        } else if (e.key >= '0' && e.key <= '9') {
            this.#netColor = parseInt(e.key);
            this.#app.updateStatus();
            e.preventDefault();
        }
    }

    // Called on mouse wheel change, updates zoom level.
    #handleZoom(e) {
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

    invalidateSelection() {
        this.#selectionCenter = null;
    }

    #computeSelectionCenter() {
        // find bounding box
        let bounds = { x1: Number.MAX_SAFE_INTEGER, y1: Number.MAX_SAFE_INTEGER, x2: Number.MIN_SAFE_INTEGER, y2: Number.MIN_SAFE_INTEGER };
        for (const item of this.#selection) {
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
    #rotateSelection() {
        const center = this.#selectionCenter ??= this.#computeSelectionCenter();
        // rotate items around center
        for (const item of this.#selection) {
            if (item instanceof Component) {
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
    }

    // Renders a selection box in grid-div-relative coordinates and sets 'selected' property on components
    #renderSelection(x, y, width, height, addSelection) {
        // render box
        if (width < 0) {
            x += width;
            width *= -1;
        }
        if (height < 0) {
            y += height;
            height *= -1;
        }
        this.#selectionElement.style.left = x + "px";
        this.#selectionElement.style.top = y + "px";
        this.#selectionElement.style.width = width + "px";
        this.#selectionElement.style.height = height + "px";
        // compute grid internal coordinates
        const sX = x / this.zoom - this.offsetX;
        const sY = y / this.zoom - this.offsetY;
        const sWidth = width / this.zoom;
        const sHeight = height / this.zoom;
        const m = 5; // component margin, subtracted during selection to more accurately select the component
        // update selection status on components
        for (const c of this.#circuit.items) {
            const currentlySelected = this.#selection.indexOf(c) > -1;
            if (c.x + m >= sX && c.y + m >= sY && c.x + c.width - m <= sX + sWidth && c.y + c.height - m <= sY + sHeight) {
                c.selected = addSelection;
            } else {
                c.selected = currentlySelected;
            }
        }
    }

    // Called when mouse drag starts.
    #handleDragStart(e) {
        e.preventDefault();
        e.stopPropagation();
        const dragStartX = e.clientX - this.#element.offsetLeft;
        const dragStartY = e.clientY - this.#element.offsetTop;
        const shiftDown = e.shiftKey;
        const ctrlDown = e.ctrlKey;
        if (e.which === 1) {
            // start selection
            this.#selectionElement.classList.remove('hidden');
            if (!shiftDown && !ctrlDown) {
                this.#selection = [];
                this.invalidateSelection();
            }
            this.#renderSelection(dragStartX, dragStartY, 0, 0, shiftDown);
        } else if (e.which > 2) {
            return;
        }
        document.onmousemove = this.#handleDragMove.bind(this, dragStartX, dragStartY, this.offsetX, this.offsetY, !ctrlDown);
        document.onmouseup = this.#handleDragStop.bind(this);
    }

    // Called on mouse drag, moves the grid or selects area.
    #handleDragMove(dragStartX, dragStartY, gridOffsetX, gridOffsetY, addSelection, e) {
        e.preventDefault();
        e.stopPropagation();
        const deltaX = (e.clientX - this.#element.offsetLeft) - dragStartX;
        const deltaY = (e.clientY - this.#element.offsetTop) - dragStartY;
        if (e.which === 1) {
            // select area
            this.#renderSelection(dragStartX, dragStartY, deltaX, deltaY, addSelection);
        } else if (e.which === 2) {
            // drag grid
            this.offsetX = gridOffsetX + deltaX / this.zoom;
            this.offsetY = gridOffsetY + deltaY / this.zoom;
        }
    }

    // Called when mouse drag ends.
    #handleDragStop(e) {
        if (e.which === 1) {
            // remove selection box, set selected items
            this.#selectionElement.classList.add('hidden');
            this.#selection = this.items.filter((c) => c.selected).toArray();
            this.invalidateSelection();
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
