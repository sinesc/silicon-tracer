class Grid {

    // would be static if they weren't so inconvenient to access
    debugCoords = false;
    spacing = 20;
    zoomLevels = [ 0.5, 0.65, 0.85, 1.0, 1.25, 1.50, 1.75, 2.0, 2.5, 3.0 ];
    statusDelay = 500;

    zoom = 1.25;
    offsetX = 0;
    offsetY = 0;
    hoverStatusListener;

    #element;
    #status;
    #components = [];
    #statusMessage = null;
    #statusTimer = null;
    #mouseX = 0;
    #mouseY = 0;

    constructor(parent) {
        this.#element = document.createElement('div');
        this.#element.classList.add('grid');
        this.#element.onmousedown = this.#handleDragStart.bind(this);
        this.#element.onwheel = this.#handleZoom.bind(this);

        this.#status = document.createElement('div');
        this.#status.classList.add('grid-status');
        this.#element.appendChild(this.#status);

        this.hoverStatusListener = new WeakMap();

        document.addEventListener('mousemove', this.#handleMouse.bind(this));
        parent.appendChild(this.#element);
        this.clearStatus();
        this.render();
    }

    // Registers a componenet with the grids renderloop. Automatically done by GridElement constructor.
    registerComponent(component) {
        this.#components.push(new WeakRef(component));
    }

    // Adds a component visual element to the grid.
    addVisual(element) {
        this.#element.appendChild(element);
    }

    // Removes a component visual element from the grid.
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

    // Renders the grid and its components.
    render() {
        let spacing = this.spacing * this.zoom;
        let offsetX = this.offsetX * this.zoom;
        let offsetY = this.offsetY * this.zoom;

        // add below/above/current zoom level classes to grid to enable zoom based styling
        for (let zoom of this.zoomLevels) {
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

        this.#element.style.backgroundSize = spacing + 'px ' + spacing + 'px';
        this.#element.style.backgroundPositionX = (offsetX % spacing) + 'px';
        this.#element.style.backgroundPositionY = (offsetY % spacing) + 'px';

        for (let i = 0; i < this.#components.length; ++i) {
            let component = this.#components[i].deref();
            if (component) {
                component.render();
            } else {
                // remove from array by replacing with last entry. afterwards next iteration has to repeat this index.
                if (i < this.#components.length - 1) {
                    this.#components[i] = this.#components.pop();
                    --i;
                } else {
                    this.#components.pop()
                }
            }
        }
    }

    // Sets a status message. Pass null to unset and revert back to default status.
    setStatus(message) {
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
    clearStatus() {
        if (this.#statusTimer) {
            clearTimeout(this.#statusTimer);
        }
        this.#status.classList.add('grid-status-faded');
        this.#statusTimer = setTimeout(() => this.setStatus(), this.statusDelay);
    }

    // Gets the current zoom level index.
    get zoomLevel() {
        return this.zoomLevels.findIndex((z) => z === this.zoom) ?? 0;
    }

    // Sets a new zoom level index.
    set zoomLevel(level) {
        level = level < 0 ? 0 : (level >= this.zoomLevels.length ? this.zoomLevels.length - 1 : level);
        this.zoom = this.zoomLevels[level];
    }

    // Called on mouse move, updates mouse coordinates and tooltip.
    #handleMouse(e) {
        this.#mouseX = e.clientX;
        this.#mouseY = e.clientY;
        if (this.debugCoords && this.#statusMessage === null && this.screenInBounds(this.#mouseX, this.#mouseY)) {
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

    #handleDragStart(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.which !== 2) {
            return;
        }
        document.onmousemove = this.#handleDragMove.bind(this, e.clientX, e.clientY, this.offsetX, this.offsetY);
        document.onmouseup = this.#handleDragStop.bind(this);
    }

    #handleDragMove(dragStartX, dragStartY, originalX, originalY, e) {
        e.preventDefault();
        e.stopPropagation();
        let deltaX = e.clientX - dragStartX;
        let deltaY = e.clientY - dragStartY;
        this.offsetX = originalX + deltaX / this.zoom;
        this.offsetY = originalY + deltaY / this.zoom;
        this.render();
    }

    #handleDragStop(e) {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}
