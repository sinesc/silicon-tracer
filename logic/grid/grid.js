"use strict";

// The circuit drawing grid.
class Grid {

    static ZOOM_LEVELS = [ 0.5, 0.65, 0.85, 1.0, 1.25, 1.50, 1.75, 2.0, 2.5, 3.0 ];
    static DEFAULT_ZOOM_LEVEL = 4;
    static SPACING = 20;
    static STATUS_DELAY = 500;
    static DIRTY_NONE       = 0b0000;
    static DIRTY_OUTER      = 0b0001;
    static DIRTY_INNER      = 0b0010;
    static DIRTY_OVERLAY    = 0b0100;

    #app;
    #dirty = Grid.DIRTY_INNER | Grid.DIRTY_OUTER | Grid.DIRTY_OVERLAY;
    #element;
    #infoElement;
    #infoCircuitLabel = null;
    #infoSimulationLabel = null;
    #infoSimulationDetails = null;
    #infoFPSCount = { current: 0, last: 0 };
    #selectionElement;
    #selection = [];
    #hotkeyTarget = null;
    #circuit;
    #netColor = 1;

    constructor(app, parent) {
        assert.class(Application, app);
        assert.class(Node, parent);
        this.#app = app;
        this.#element = document.createElement('div');
        this.#element.classList.add('grid');
        this.#element.onmousedown = this.#handleDragStart.bind(this);
        this.#element.onwheel = this.#handleZoom.bind(this);

        this.#infoElement = document.createElement('div');
        this.#infoElement.classList.add('grid-info');
        this.#element.appendChild(this.#infoElement);
        this.#infoElement.innerHTML = '';

        this.#selectionElement = document.createElement('div');
        this.#selectionElement.classList.add('grid-selection', 'hidden');
        this.#element.appendChild(this.#selectionElement);

        parent.appendChild(this.#element);

        if (app.config.debugShowCoords) {
            this.debug = document.createElement('div');
            this.debug.classList.add('debug-info');
            this.#element.appendChild(this.debug);
            document.addEventListener('mousemove', this.#debugHandleMouse.bind(this));
        }

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
        this.#circuit.detachSimulation();
        this.#circuit.generateOutline();
        this.#circuit = null;
        this.#infoCircuitLabel = '';
        this.#dirty |= Grid.DIRTY_OVERLAY;
        this.#hotkeyTarget = null;
        this.#app.clearStatus(true);
    }

    // Sets current grid circuit.
    setCircuit(circuit) {
        assert.class(Circuits.Circuit, circuit);
        this.unsetCircuit();
        circuit.gridConfig.zoom ??= Grid.ZOOM_LEVELS[Grid.DEFAULT_ZOOM_LEVEL];
        circuit.gridConfig.offsetX ??= 0;
        circuit.gridConfig.offsetY ??= 0;
        this.#circuit = circuit;
        this.#circuit.link(this);
        this.#infoCircuitLabel = circuit.label;
        this.#dirty |= Grid.DIRTY_INNER | Grid.DIRTY_OUTER | Grid.DIRTY_OVERLAY;
    }

    // Sets the simulation label displayed on the grid.
    setSimulationLabel(label) {
        this.#dirty |= this.#infoSimulationLabel !== label ? Grid.DIRTY_OVERLAY : 0;
        this.#infoSimulationLabel = label;
    }

    // Sets the simulation details displayed on the grid.
    setSimulationDetails(details) {
        this.#dirty |= this.#infoSimulationDetails !== details ? Grid.DIRTY_OVERLAY : 0;
        this.#infoSimulationDetails = details;
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

    // Returns items that passed the given filter (c) => bool.
    filterItems(filter) {
        return this.#circuit.filterItems(filter);
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
        let ex1 = this.#element.offsetLeft;
        let ey1 = this.#element.offsetTop;
        return x >= ex1 && y >= ey1 && x <= ex1 + this.#element.offsetWidth && y <= ey1 + this.#element.offsetHeight;
    }

    // Converts screen coordinates to in-simulation/on-grid coordinates.
    screenToGrid(x, y) {
        assert.number(x);
        assert.number(y);
        // mouse pixel coordinates within grid view element
        let mouseX = x - this.#element.offsetLeft;
        let mouseY = y - this.#element.offsetTop;
        // compute mouse on-grid coordinates
        let mouseGridX = -this.offsetX + mouseX / this.zoom;
        let mouseGridY = -this.offsetY + mouseY / this.zoom;
        return [ mouseGridX, mouseGridY ];
    }

    // Renders the grid and its components.
    render() {

        if (this.#dirty & Grid.DIRTY_OVERLAY) {
            this.#infoElement.innerHTML = '<div class="info-section">Circuit</div><div class="info-title">' + this.#infoCircuitLabel + '</div>' +
                (!this.#infoSimulationLabel ? '' : '<div class="info-section">Simulation</div><div class="info-title">' + this.#infoSimulationLabel + '</div>') +
                (!this.#infoSimulationDetails ? '' : '<div class="info-details">' + this.#infoSimulationDetails + '</div>');
        }

        if (this.#dirty & (Grid.DIRTY_OUTER | Grid.DIRTY_INNER)) {

            // add below/above/current zoom level classes to grid to enable zoom based styling
            if (!this.#element.classList.contains('grid-zoom-' + (this.zoom * 100))) {
                for (let zoom of Grid.ZOOM_LEVELS) {
                    let name = zoom * 100;
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
            let spacing = Grid.SPACING * this.zoom;
            let offsetX = this.offsetX * this.zoom;
            let offsetY = this.offsetY * this.zoom;
            this.#element.style.backgroundSize = spacing + 'px ' + spacing + 'px';
            this.#element.style.backgroundPositionX = (offsetX % spacing) + 'px';
            this.#element.style.backgroundPositionY = (offsetY % spacing) + 'px';
        }

        if (this.#circuit) {

            const dirtyGrid = this.#dirty & (Grid.DIRTY_OUTER | Grid.DIRTY_INNER);

            // apply wire net colors to attached ports
            if (dirtyGrid || this.#circuit.data.findIndex((item) => item.dirty) !== -1) {
                this.applyNetColors();
            }

            // render components
            for (let item of this.#circuit.data) {
                if (dirtyGrid || item.dirty) {
                    // optionally require full redraw from the item
                    if (this.#dirty & Grid.DIRTY_INNER) {
                        item.dirty = true;
                    }
                    item.render();
                    item.dirty = false;
                }

                item.renderNetState();
            }
        }

        this.#infoFPSCount.current += 1;
        this.#dirty = Grid.DIRTY_NONE;
    }

    // Returns the current default net color.
    get netColor() {
        return this.#netColor;
    }

    // Applies net colors to component ports on the grid.
    applyNetColors() {
        let netList = NetList.identify(this.#circuit, false);
        // match port colors with attached wire colors, ensure consistent color across entire net
        for (let net of netList.nets) {
            // find net color (when dragging from unconnected wire to connected wire the new wire will have color null)
            let applyColor = net.wires.values().map((nw) => this.#circuit.itemByGID(nw.gid)).find((w) => w.color !== null)?.color ?? this.netColor;
            for (let { gid } of net.wires) {
                let wire = this.#circuit.itemByGID(gid);
                wire.color = applyColor;
            }
            for (let port of net.ports) {
                let component = this.#circuit.itemByGID(port.gid);
                let portName = port.name;
                component.portByName(portName).color = applyColor;
            }
        }
        // clear color of unconnected wires
        for (let netWire of netList.unconnected.wires) {
            let wire = this.#circuit.itemByGID(netWire.gid);
            wire.color = null;
        }
        // clear color of unconnected ports
        for (let port of netList.unconnected.ports) {
            let component = this.#circuit.itemByGID(port.gid);
            let portName = port.name;
            component.portByName(portName).color = null;
        }
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

    // Mark grid as dirty (require redraw). Set inner to also redraw component inner elements.
    markDirty(inner = false) {
        assert.bool(inner);
        this.#dirty |= inner ? Grid.DIRTY_INNER : Grid.DIRTY_OUTER;
    }

    // Sets the zoom factor.
    get zoom() {
        return this.#circuit.gridConfig.zoom;
    }

    // Sets the zoom factor.
    set zoom(value) {
        assert.number(value);
        this.#dirty |= this.#circuit.gridConfig.zoom !== value ? Grid.DIRTY_INNER : 0;
        this.#circuit.gridConfig.zoom = value;
    }

    // Sets grid x-offset.
    get offsetX() {
        return this.#circuit.gridConfig.offsetX;
    }

    // Gets grid x-offset.
    set offsetX(value) {
        assert.number(value);
        this.#dirty |= this.#circuit.gridConfig.offsetX !== value ? Grid.DIRTY_OUTER : 0;
        this.#circuit.gridConfig.offsetX = value;
    }

    // Sets grid y-offset.
    get offsetY() {
        return this.#circuit.gridConfig.offsetY;
    }

    // Gets grid y-offset.
    set offsetY(value) {
        assert.number(value);
        this.#dirty |= this.#circuit.gridConfig.offsetY !== value ? Grid.DIRTY_OUTER : 0;
        this.#circuit.gridConfig.offsetY = value;
    }

    // Gets the current zoom level index.
    get zoomLevel() {
        return Grid.ZOOM_LEVELS.findIndex((z) => z === this.zoom) ?? 0;
    }

    // Sets a new zoom level index.
    set zoomLevel(level) {
        assert.integer(level);
        level = level < 0 ? 0 : (level >= Grid.ZOOM_LEVELS.length ? Grid.ZOOM_LEVELS.length - 1 : level);
        this.zoom = Grid.ZOOM_LEVELS[level];
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

    // Returns the grids default status message.
    defaultStatusMessage() {
        const netColor = `<span data-net-color="${this.netColor}">default net color</span>`;
        const sim = this.#app.simulations.current;
        const hasParent = sim && sim.instance > 0;
        return 'Grid. <i>LMB</i>: Select area, <i>SHIFT+LMB</i>: Add to selection, <i>MMB</i>: Drag grid, <i>MW</i>: Zoom grid, <i>E</i>: Rename circuit, <i>0</i> - <i>9</i>: Set ' + netColor + ', ' + (hasParent ? '' : '<u>') + '<i>W</i>: Switch to parent simulation' + (hasParent ? '' : '</u>');
    }

    // Called when a key is pressed and then repeatedly while being held.
    #handleKeyDown(e) {
        const sim = this.#app.simulations.current;
        if (this.#hotkeyTarget) {
            let { gridItem, args } = this.#hotkeyTarget;
            if (gridItem.onHotkey(e.key, ...args)) {
                e.preventDefault();
            }
        } else if (e.key === 'e') {
            this.#app.circuits.edit(this.#circuit.uid);
            this.#dirty |= Grid.DIRTY_OVERLAY;
            e.preventDefault();
        } else if (e.key === 'w' && sim) {
            // switch to parent simulation instance // TODO: when not simulating this should switch to the previous circuit. this requires adding a navigation history
            const parentInstance = sim.parentInstance;
            if (parentInstance !== null) {
                sim.reattach(parentInstance);
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
        let [ mouseGridX, mouseGridY ] = this.screenToGrid(e.clientX, e.clientY);
        // pick next zoom level
        this.zoomLevel = this.zoomLevel + (e.deltaY > 0 ? -1 : 1);
        // compute new mouse on-grid coordinates after the zoom
        let [ mouseGridXAfter, mouseGridYAfter ] = this.screenToGrid(e.clientX, e.clientY);
        // move grid to compensate so that the point we zoomed into is still at the cursor
        this.offsetX -= mouseGridX - mouseGridXAfter;
        this.offsetY -= mouseGridY - mouseGridYAfter;
    }

    // Renders a selection box in grid-div-relative coordinates.
    #renderSelection(x, y, width, height, join) {
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
        for (const c of this.#circuit.data) {
            const currentlySelected = this.#selection.indexOf(c) > -1;
            if (c.x + m >= sX && c.y + m >= sY && c.x + c.width - m <= sX + sWidth && c.y + c.height - m <= sY + sHeight) {
                c.selected = !currentlySelected || join;
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
        if (e.which === 1) {
            // start selection
            this.#selectionElement.classList.remove('hidden');
            if (!shiftDown) {
                this.#selection = [];
            }
            this.#renderSelection(dragStartX, dragStartY, 0, 0, shiftDown);
        } else if (e.which > 2) {
            return;
        }
        document.onmousemove = this.#handleDragMove.bind(this, dragStartX, dragStartY, this.offsetX, this.offsetY, shiftDown);
        document.onmouseup = this.#handleDragStop.bind(this);
    }

    // Called on mouse drag, moves the grid or selects area.
    #handleDragMove(dragStartX, dragStartY, gridOffsetX, gridOffsetY, shiftDown, e) {
        e.preventDefault();
        e.stopPropagation();
        const deltaX = (e.clientX - this.#element.offsetLeft) - dragStartX;
        const deltaY = (e.clientY - this.#element.offsetTop) - dragStartY;
        if (e.which === 1) {
            // select area
            this.#renderSelection(dragStartX, dragStartY, deltaX, deltaY, shiftDown);
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
            this.#selection = this.filterItems((c) => c.selected);
        }
        document.onmouseup = null;
        document.onmousemove = null;
    }

    // Called on mouse move, updates mouse coordinates and tooltip.
    #debugHandleMouse(e) {
        let mouseX = e.clientX;
        let mouseY = e.clientY;
        if (this.screenInBounds(mouseX, mouseY)) {
            let [ x, y ] = this.screenToGrid(mouseX, mouseY);
            this.debug.innerHTML = 'x: ' + Math.round(x) + ' y: ' + Math.round(y) + ' zoom: ' + this.zoom;
        }
    }

    // adds a debug marker at the given location
    #debugPoint(x, y, i = 0) {
        let element = document.createElement('div');
        element.classList.add('wirebuilder-debug-point', 'wirebuilder-debug-point' + i);
        let vx = (x + this.offsetX) * this.zoom;
        let vy = (y + this.offsetY) * this.zoom;
        element.style.display = 'block';
        element.style.left = (vx - 6) + 'px';
        element.style.top = (vy - 6) + 'px';
        this.addVisual(element);
    }
}
