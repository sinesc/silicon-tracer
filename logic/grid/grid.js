"use strict";

// The circuit drawing grid.
class Grid {

    static DEBUG_COORDS = false;
    static ZOOM_LEVELS = [ 0.5, 0.65, 0.85, 1.0, 1.25, 1.50, 1.75, 2.0, 2.5, 3.0 ];
    static SPACING = 20;
    static STATUS_DELAY = 500;

    zoom = 1.25;
    offsetX = 0;
    offsetY = 0;

    #element;
    #info;
    #infoCircuitLabel = null;
    #infoSimulationLabel = null;
    #hotkeyTarget = null;
    #circuit;
    #netCache = null;

    constructor(parent) {
        assert.class(Node, parent);
        this.#element = document.createElement('div');
        this.#element.classList.add('grid');
        this.#element.onmousedown = this.#handleDragStart.bind(this);
        this.#element.onwheel = this.#handleZoom.bind(this);

        this.#info = document.createElement('div');
        this.#info.classList.add('grid-info');
        this.#element.appendChild(this.#info);
        this.#info.innerHTML = '';

        parent.appendChild(this.#element);
        this.render();

        if (Grid.DEBUG_COORDS) {
            this.debug = document.createElement('div');
            this.debug.classList.add('debug-info');
            this.#element.appendChild(this.debug);
            document.addEventListener('mousemove', this.#debugHandleMouse.bind(this));
        }

        // TODO: may have to go to parent UI
        // TODO: GridElements currently register document.onmouse* temporarily. those should probably follow the same logic: register onmouse* here and then pass on to whichever element wants to have them
        document.addEventListener('keydown', this.#handleKeyDown.bind(this));
    }

    // Returns the circuit currently on the grid.
    get circuit() {
        return this.#circuit;
    }

    // Unsets current grid circuit, saving changes to circuits.
    unsetCircuit() {
        if (!this.#circuit) {
            return;
        }
        for (let item of this.#circuit.data) {
            item.unlink();
        }
        this.#circuit.gridConfig = this.#serializeConfig();
        this.#circuit = null;
        this.#infoCircuitLabel = '';
        //this.#updateInfo();
    }

    // Updates current circuit from grid state.
    updateCircuit() {
        if (!this.#circuit) {
            return;
        }
        this.#circuit.gridConfig = this.#serializeConfig();
    }

    // Sets current grid circuit.
    setCircuit(circuit) {
        assert.class(Circuit, circuit);
        this.unsetCircuit();
        this.zoom = circuit.gridConfig.zoom ?? this.zoom;
        this.offsetX = circuit.gridConfig.offsetX ?? 0;
        this.offsetY = circuit.gridConfig.offsetY ?? 0;
        for (let item of circuit.data) {
            item.link(this);
        }
        this.#circuit = circuit;
        this.#infoCircuitLabel = circuit.label;
        this.#updateInfo();
    }

    // Sets the simulation label displayed on the grid.
    setSimulationLabel(label) {
        this.#infoSimulationLabel = label;
        this.#updateInfo();
    }

    // Adds an item to the grid. Automatically done by GridItem constructor.
    addItem(item) {
        assert.class(GridItem, item);
        item.gid ??= generateGID();
        this.#circuit.addItem(item);
        item.link(this);
        this.invalidate();
        return item;
    }

    // Removes an item from the grid and the current circuit.
    removeItem(item) {
        assert.class(GridItem, item);
        item.unlink();
        this.#circuit.removeItem(item);
        this.invalidate();
        return item;
    }

    // Invalidate nets and restart any running simulation.
    invalidate() {
        //this.#circuit.invalidateNets();
        this.#circuit.detachSimulation();
        app.restartSimulation();
    }

    // Returns items that passed the given filter (c) => bool.
    filterItems(filter) {
        assert.function(filter);
        return this.#circuit.data.filter((c) => c !== null && filter(c));
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
        let ex1 = this.#element.offsetLeft;
        let ey1 = this.#element.offsetTop;
        return x >= ex1 && y >= ey1 && x <= ex1 + this.#element.offsetWidth && y <= ey1 + this.#element.offsetHeight;
    }

    // Converts screen coordinates to in-simulation/on-grid coordinates.
    screenToGrid(x, y) {
        // mouse pixel coordinates within grid view element
        let mouseX = x - this.#element.offsetLeft;
        let mouseY = y - this.#element.offsetTop;
        // compute mouse on-grid coordinates
        let mouseGridX = -this.offsetX + mouseX / this.zoom;
        let mouseGridY = -this.offsetY + mouseY / this.zoom;
        return [ mouseGridX, mouseGridY ];
    }

    // Utility function to align given x/y to grid coordinates and return them.
    static align(x, y) {
        return [
            Math.ceil(x / Grid.SPACING) * Grid.SPACING - 0.5 * Grid.SPACING,
            Math.ceil(y / Grid.SPACING) * Grid.SPACING - 0.5 * Grid.SPACING
        ];
    }

    // Renders the grid and its components. If the optional reason is 'move' some render steps may be optimized out.
    render(reason) {

        if (!this.#element.classList.contains('grid-zoom-' + (this.zoom * 100))) {
            // add below/above/current zoom level classes to grid to enable zoom based styling
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

        // create background grid pattern
        let spacing = Grid.SPACING * this.zoom;
        let offsetX = this.offsetX * this.zoom;
        let offsetY = this.offsetY * this.zoom;
        this.#element.style.backgroundSize = spacing + 'px ' + spacing + 'px';
        this.#element.style.backgroundPositionX = (offsetX % spacing) + 'px';
        this.#element.style.backgroundPositionY = (offsetY % spacing) + 'px';

        if (this.#circuit) {
            // compact overlapping wires and apply net colors to wires if the nets have changed
            //if (!this.#netCache) { // FIXME
                //Wire.compact(this);
                this.applyNetColors();
            //}

            // render components
            for (let item of this.#circuit.data) {
                item.render(reason);
            }
        }
    }

    // Returns the next to be used net color.
    get nextNetColor() {
        let netList = this.#circuit.identifyNets(false);
        return netList.nets.length % 10;
    }

    // Applies net colors to components on the grid. Returns next to be used color.
    applyNetColors() {
        let netList = this.#circuit.identifyNets(false);
        let color = 0;
        for (let net of netList.nets) {
            let applyColor = null;
            for (let { gid } of net.wires) {
                let wire = this.#circuit.itemByGID(gid);
                applyColor ??= wire.color ?? color;
                wire.color = applyColor;
            }
            for (let port of net.ports) {
                let component = this.#circuit.itemByGID(port.gid);
                let portName = port.name;
                component.portByName(portName).color = applyColor;
            }
            color = (color + 1) % 10;
        }
        for (let netWire of netList.unconnected.wires) {
            let wire = this.#circuit.itemByGID(netWire.gid);
            wire.color = null;
        }
        for (let port of netList.unconnected.ports) {
            let component = this.#circuit.itemByGID(port.gid);
            let portName = port.name;
            component.portByName(portName).color = null;
        }
        return color;
    }

    // Makes given gridelement become the hotkey-target and when locked also prevents hover events from stealing hotkey focus until released.
    requestHotkeyTarget(gridElement, lock, ...args) {
        lock ??= false;
        if (!this.#hotkeyTarget || !this.#hotkeyTarget.locked) {
            this.#hotkeyTarget = { gridElement, args, locked: lock };
        }
    }

    // Releases hotkey focus and lock if given element matches current lock holder.
    releaseHotkeyTarget(gridElement, unlock) {
        if (this.#hotkeyTarget && this.#hotkeyTarget.gridElement === gridElement && (!this.#hotkeyTarget.locked || unlock)) {
            this.#hotkeyTarget = null;
        }
    }

    // Gets the current zoom level index.
    get zoomLevel() {
        return Grid.ZOOM_LEVELS.findIndex((z) => z === this.zoom) ?? 0;
    }

    // Sets a new zoom level index.
    set zoomLevel(level) {
        level = level < 0 ? 0 : (level >= Grid.ZOOM_LEVELS.length ? Grid.ZOOM_LEVELS.length - 1 : level);
        this.zoom = Grid.ZOOM_LEVELS[level];
    }

    // Serializes the grid config to the current circuit.
    #serializeConfig() {
        return { zoom: this.zoom, offsetX: Math.round(this.offsetX), offsetY: Math.round(this.offsetY) };
    }

    // Updates info overlay text.
    #updateInfo() {
        if (this.#infoCircuitLabel === this.#infoSimulationLabel) {
            this.#info.innerHTML = '<span>Circuit/Simulation</span><div class="circuit-label">' + this.#infoCircuitLabel + '</div>';
        } else {
            this.#info.innerHTML = '<span>Circuit</span><div class="circuit-label">' + this.#infoCircuitLabel +
                '</div>' + (this.#infoSimulationLabel ? '<span>Simulation</span><div class="simulation-label">' + this.#infoSimulationLabel + '</div>' : '');
        }
    }

    // Called when a key is pressed and then repeatedly while being held.
    #handleKeyDown(e) {
        if (this.#hotkeyTarget) {
            let { gridElement, args } = this.#hotkeyTarget;
            gridElement.onHotkey(e.key, ...args);
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
        this.render();
    }

    // Called when mouse drag starts.
    #handleDragStart(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.which !== 2) {
            return;
        }
        document.onmousemove = this.#handleDragMove.bind(this, e.clientX, e.clientY, this.offsetX, this.offsetY);
        document.onmouseup = this.#handleDragStop.bind(this);
    }

    // Called on mouse drag, moves the grid.
    #handleDragMove(dragStartX, dragStartY, originalX, originalY, e) {
        e.preventDefault();
        e.stopPropagation();
        let deltaX = e.clientX - dragStartX;
        let deltaY = e.clientY - dragStartY;
        this.offsetX = originalX + deltaX / this.zoom;
        this.offsetY = originalY + deltaY / this.zoom;
        this.render('move');
    }

    // Called when mouse drag ends.
    #handleDragStop(e) {
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
