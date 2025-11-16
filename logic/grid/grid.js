"use strict";

// The circuit drawing grid.
class Grid {

    static DEBUG_COORDS = false;
    static ZOOM_LEVELS = [ 0.5, 0.65, 0.85, 1.0, 1.25, 1.50, 1.75, 2.0, 2.5, 3.0 ];
    static SPACING = 20;
    static STATUS_DELAY = 500;
    static DIRTY_NONE  = 0b0000;
    static DIRTY_OUTER = 0b0001;
    static DIRTY_INNER = 0b0010;

    #zoom = 1.25;
    #offsetX = 0;
    #offsetY = 0;
    #dirty = Grid.DIRTY_INNER | Grid.DIRTY_OUTER;

    #element;
    #infoElement;
    #infoCircuitLabel = null;
    #infoSimulationLabel = null;
    #selectionElement;
    #selection = [];
    #hotkeyTarget = null;
    #circuit;

    constructor(parent) {
        assert.class(Node, parent);
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

        if (Grid.DEBUG_COORDS) {
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

    // Unsets current grid circuit, saving changes to circuits.
    unsetCircuit() {
        if (!this.#circuit) {
            return;
        }
        for (let item of this.#circuit.data) {
            item.unlink();
        }
        this.#circuit.gridConfig = this.#serializeConfig();
        this.#circuit.ports = CustomComponent.generateDefaultOutline(this.#circuit);
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

    // Utility function to align given x/y to grid coordinates and return them.
    static align(x, y) {
        assert.number(x);
        assert.number(y);
        return [
            Math.ceil(x / Grid.SPACING) * Grid.SPACING - 0.5 * Grid.SPACING,
            Math.ceil(y / Grid.SPACING) * Grid.SPACING - 0.5 * Grid.SPACING
        ];
    }

    // Renders the grid and its components.
    render() {

        if (this.#dirty) {
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

            // create background grid pattern
            let spacing = Grid.SPACING * this.zoom;
            let offsetX = this.offsetX * this.zoom;
            let offsetY = this.offsetY * this.zoom;
            this.#element.style.backgroundSize = spacing + 'px ' + spacing + 'px';
            this.#element.style.backgroundPositionX = (offsetX % spacing) + 'px';
            this.#element.style.backgroundPositionY = (offsetY % spacing) + 'px';
        }

        if (this.#circuit) {

            // apply wire net colors to attached ports
            if (this.#dirty || this.#circuit.data.findIndex((item) => item.dirty) !== -1) {
                this.applyNetColors();
            }

            // render components
            for (let item of this.#circuit.data) {
                if (this.#dirty || item.dirty) {
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

        this.#dirty = Grid.DIRTY_NONE;
    }

    // Returns the next to be used net color.
    get nextNetColor() {
        let netList = NetList.identify(this.#circuit, false);
        return netList.nets.length % 10;
    }

    // Applies net colors to components on the grid. Returns next to be used color.
    applyNetColors() {
        let netList = NetList.identify(this.#circuit, false);
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
    markDirty(inner) {
        assert.bool(inner);
        this.#dirty |= inner ? Grid.DIRTY_INNER : Grid.DIRTY_OUTER;
    }

    // Sets the zoom factor.
    get zoom() {
        return this.#zoom;
    }

    // Gets the zoom factor.
    set zoom(value) {
        assert.number(value);
        this.#dirty |= this.#zoom !== value ? Grid.DIRTY_INNER : 0;
        this.#zoom = value;
    }

    // Sets grid x-offset.
    get offsetX() {
        return this.#offsetX;
    }

    // Gets grid x-offset.
    set offsetX(value) {
        assert.number(value);
        this.#dirty |= this.#offsetX !== value ? Grid.DIRTY_OUTER : 0;
        this.#offsetX = value;
    }

    // Sets grid y-offset.
    get offsetY() {
        return this.#offsetY;
    }

    // Gets grid y-offset.
    set offsetY(value) {
        assert.number(value);
        this.#dirty |= this.#offsetY !== value ? Grid.DIRTY_OUTER : 0;
        this.#offsetY = value;
    }

    // Gets the current zoom level index.
    get zoomLevel() {
        return Grid.ZOOM_LEVELS.findIndex((z) => z === this.zoom) ?? 0;
    }

    // Sets a new zoom level index.
    set zoomLevel(level) {
        assert.number(level);
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
            this.#infoElement.innerHTML = '<span>Circuit/Simulation</span><div class="circuit-label">' + this.#infoCircuitLabel + '</div>';
        } else {
            this.#infoElement.innerHTML = '<span>Circuit</span><div class="circuit-label">' + this.#infoCircuitLabel +
                '</div>' + (this.#infoSimulationLabel ? '<span>Simulation</span><div class="simulation-label">' + this.#infoSimulationLabel + '</div>' : '');
        }
    }

    // Called when a key is pressed and then repeatedly while being held.
    #handleKeyDown(e) {
        if (this.#hotkeyTarget) {
            let { gridItem, args } = this.#hotkeyTarget;
            gridItem.onHotkey(e.key, ...args);
        } else if (e.key === 'e') {
            app.circuits.rename(this.#circuit.uid);
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
            this.render('move');
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
