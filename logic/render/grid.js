class Grid {

    static DEBUG_COORDS = false;
    static ZOOM_LEVELS = [ 0.5, 0.65, 0.85, 1.0, 1.25, 1.50, 1.75, 2.0, 2.5, 3.0 ];
    static SPACING = 20;
    static STATUS_DELAY = 500;

    zoom = 1.25;
    offsetX = 0;
    offsetY = 0;

    #element;
    #status;
    #items = [];
    #statusMessage = null;
    #statusTimer = null;
    #statusLocked = false;
    #mouseX = 0;
    #mouseY = 0;
    #hotkeyTarget = null;

    constructor(parent) {
        this.#element = document.createElement('div');
        this.#element.classList.add('grid');
        this.#element.onmousedown = this.#handleDragStart.bind(this);
        this.#element.onwheel = this.#handleZoom.bind(this);

        this.#status = document.createElement('div');
        this.#status.classList.add('grid-status');
        this.#element.appendChild(this.#status);

        document.addEventListener('mousemove', this.#handleMouse.bind(this));
        parent.appendChild(this.#element);
        this.clearMessage();
        this.render();

        // TODO: may have to go to parent UI
        // TODO: GridElements currently register document.onmouse* temporarily. those should probably follow the same logic: register onmouse* here and then pass on to whichever element wants to have them
        document.addEventListener('keydown', this.#handleKeyDown.bind(this));
    }

    // Registers an item with the grids renderloop. Automatically done by GridItem constructor.
    registerItem(item) {
        this.#items.push(new WeakRef(item));
    }

    // Returns items that passed the given filter (c) => bool.
    getItems(filter) {
        return this.#items.map((c) => c.deref()).filter((c) => c !== null && filter(c));
    }

    // Adds a visual element for a grid item to the grid.
    addVisual(element) {
        this.#element.appendChild(element);
    }

    // Removes a visual element from the grid.
    removeVisual(element) {
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

    // Renders the grid and its components. If the optional reason is 'move' some render steps may be optimized out.
    render(reason) {

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

        // create background grid pattern
        let spacing = Grid.SPACING * this.zoom;
        let offsetX = this.offsetX * this.zoom;
        let offsetY = this.offsetY * this.zoom;
        this.#element.style.backgroundSize = spacing + 'px ' + spacing + 'px';
        this.#element.style.backgroundPositionX = (offsetX % spacing) + 'px';
        this.#element.style.backgroundPositionY = (offsetY % spacing) + 'px';

        // apply net colors to wires
        let [ netList ] = this.identifyNets();
        let color = 0;
        for (let net of netList.nets) {
            for (let wire of net.wires) {
                wire[2].color = color;
            }
            for (let port of net.ports) {
                let component = port[2];
                let portName = port[1].split(':')[1];
                component.portByName(portName)[1].color = color; // FIXME: don't override user set color
            }
            color = (color + 1) % 10;
        }
        for (let wire of netList.unconnected.wires) {
            wire[2].color = null;
        }
        for (let port of netList.unconnected.ports) {
            let component = port[2];
            let portName = port[1].split(':')[1];
            component.portByName(portName)[1].color = null;
        }

        // render components
        for (let i = 0; i < this.#items.length; ++i) {
            let item = this.#items[i].deref();
            if (item) {
                item.render(reason);
            } else {
                // remove from array by replacing with last entry. afterwards next iteration has to repeat this index.
                if (i < this.#items.length - 1) {
                    this.#items[i] = this.#items.pop();
                    --i;
                } else {
                    this.#items.pop()
                }
            }
        }
    }

    // Identifies nets on the grid and returns a [ NetList, Map<String, Component> ].
    identifyNets() {
        // get all individual wires
        let connections = this.getItems((i) => i instanceof Connection);
        let wires = [];
        for (let connection of connections) {
            let points = connection.getPoints();
            if (points.length >= 2) {
                wires.push([ points[0], points[1], connection ]); // TODO refactor to use class, e.g. NetWire(p1, p2, connection) where connection is arbitrary meta data since we need this for schematics that aren't currently on the grid too
            }
            if (points.length === 3) {
                wires.push([ points[1], points[2], connection ]);
            }
        }
        //console.log(wires.map((w) => [ w[0].x, w[0].y, w[1].x, w[1].y ]));
        // get all component ports
        let components = this.getItems((i) => i instanceof Component);
        let ports = [];
        let componentMap = new Map();
        for (let [c, component] of components.entries()) {
            let componentPrefix = 'c' + c + ':';
            componentMap.set(componentPrefix, component);
            for (let port of component.getPorts()) {
                ports.push([ new Point(port.x + component.x, port.y + component.y), componentPrefix + port.name, component ]); // TODO refactor to use class, e.g. NetPort(p, name, component) where component is arbitrary meta data since we need this for schematics that aren't currently on the grid too
            }
        }
        //console.log(ports.map((p) => [ p[0].x, p[0].y, p[2] ]));
        let netList = NetList.fromWires(wires.toReversed(), ports); /* toReversed just avoids complete net reassign on new wire. not required, just for testing */
        //console.log(netList.nets.map((n) => n.ports));
        return [ netList, componentMap ];
    }

    // Sets a status message. Pass null to unset and revert back to default status.
    setMessage(message, lock) {
        if (this.#statusLocked && !lock) {
            return;
        }
        this.#statusLocked = lock ?? false;
        if (this.#statusTimer) {
            clearTimeout(this.#statusTimer);
        }
        this.#statusMessage = String.isString(message) ? message : null;
        this.#status.innerHTML = this.#statusMessage ?? '';
        if (this.#statusMessage) {
            this.#status.classList.remove('grid-status-faded');
        } else if (!this.#statusMessage) {
            // set default help text when no status message has been set for a while
            this.#statusTimer = setTimeout(() => {
                if (!this.#statusMessage) {
                    this.#status.classList.remove('grid-status-faded');
                    this.#status.innerHTML = 'Grid. <i>LMB</i>: Drag component, <i>MMB</i>: Drag grid, <i>MW</i>: Zoom grid';
                }
            }, 1000);
        }
    }

    // Clears the current status message.
    clearMessage(unlock) {
        if (this.#statusLocked && !unlock) {
            return;
        }
        this.#statusLocked = false;
        if (this.#statusTimer) {
            clearTimeout(this.#statusTimer);
        }
        this.#status.classList.add('grid-status-faded');
        this.#statusTimer = setTimeout(() => this.setMessage(), Grid.STATUS_DELAY);
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

    // Called when a key is pressed and then repeatedly while being held.
    #handleKeyDown(e) {
        if (this.#hotkeyTarget) {
            let { gridElement, args } = this.#hotkeyTarget;
            gridElement.onHotkey(e.key, ...args);
        }
    }

    // Called on mouse move, updates mouse coordinates and tooltip.
    #handleMouse(e) {
        this.#mouseX = e.clientX;
        this.#mouseY = e.clientY;
        if (Grid.DEBUG_COORDS && this.#statusMessage === null && this.screenInBounds(this.#mouseX, this.#mouseY)) {
            let [ x, y ] = this.screenToGrid(this.#mouseX, this.#mouseY);
            this.#status.innerHTML = 'x: ' + Math.round(x) + ' y: ' + Math.round(y) + ' zoom: ' + this.zoom + '</b>';
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
}
