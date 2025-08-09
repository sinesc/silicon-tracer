class Grid {

    spacing = 15;
    zoomLevels = [ 0.5, 0.65, 0.85, 1.0, 1.25, 1.50, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0 ];

    zoom = 1.0;
    offsetX = 0;
    offsetY = 0;

    #element;
    #tooltip;
    #components = [];

    constructor(parent) {
        this.#element = document.createElement('div');
        this.#element.classList.add('grid');
        this.#element.onmousedown = this.#handleDragStart.bind(this);
        this.#element.onwheel = this.#handleZoom.bind(this);

        this.#tooltip = document.createElement('div');
        this.#tooltip.classList.add('tooltip');
        this.#element.appendChild(this.#tooltip);
        document.addEventListener('mousemove', this.updateTooltip.bind(this));

        parent.appendChild(this.#element);
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

    // Utility function to align given x/y to grid coordinates and return them.
    align(x, y) {
        return [
            Math.ceil(x / this.spacing) * this.spacing - 0.5 * this.spacing,
            Math.ceil(y / this.spacing) * this.spacing - 0.5 * this.spacing
        ];
    }

    // Returns whether the given screen coordinates are within the bounds of the grid.
    screenInBounds(x, y) {
        let ex1 = this.#element.offsetLeft;
        let ey1 = this.#element.offsetTop;
        return x >= ex1 && y >= ey1 && x <= ex1 + this.#element.offsetWidth && y <= ey1 + this.#element.offsetHeight;
    }

    // Convers screen coordinates to in-simulation/on-grid coordinates.
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

    // Updates the grids bottom tooltip.
    updateTooltip(e) {
        if (this.screenInBounds(e.clientX, e.clientY)) {
            let [ x, y ] = this.screenToGrid(e.clientX, e.clientY);
            this.#tooltip.innerHTML = 'x: ' + Math.round(x) + ' y: ' + Math.round(y) + ' zoom: ' + this.zoom + '</b>';
        } else {
            this.#tooltip.innerHTML = '<i>LMB</i>: Drag component, <i>MMB</i>: Drag grid, <i>MW</i>: Zoom grid';
        }

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

    #handleZoom(e) {
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

class GridElement {

    grid;

    x;
    y;
    width;
    height;

    constructor(grid) {
        this.grid = grid;
        grid.registerComponent(this);
    }

    render() { }

    onDrag(x, y, done, ...args) { }

    get visualX() {
        return (this.x + this.grid.offsetX) * this.grid.zoom;
    }

    get visualY() {
        return (this.y + this.grid.offsetY) * this.grid.zoom;
    }

    get visualWidth() {
        return this.width * this.grid.zoom;
    }

    get visualHeight() {
        return this.height * this.grid.zoom;
    }

    setPosition(x, y, aligned) {
        if (aligned) {
            [ x, y ] = this.grid.align(x, y);
        }
        this.x = x;
        this.y = y;
    }

    registerDrag(element, ...args) {
        element.onmousedown = this.#handleDragStart.bind(this, args);
    }

    #handleDragStart(args, e) {
        e.preventDefault();
        if (e.which !== 1) { // don't stop propagation for other buttons so we can drag the grid while hovering over a connection/component
            return;
        }
        e.stopPropagation();
        let dragOffsetX = e.clientX / this.grid.zoom - this.x;
        let dragOffsetY = e.clientY / this.grid.zoom - this.y;
        document.onmousemove = this.#handleDragMove.bind(this, args, dragOffsetX, dragOffsetY);
        document.onmouseup = this.#handleDragStop.bind(this, args, dragOffsetX, dragOffsetY);
    }

    #handleDragMove(args, dragOffsetX, dragOffsetY, e) {
        e.preventDefault();
        e.stopPropagation();
        this.onDrag(e.clientX / this.grid.zoom - dragOffsetX, e.clientY / this.grid.zoom - dragOffsetY, false, ...args);
        this.render();
    }

    #handleDragStop(args, dragOffsetX, dragOffsetY, e) {
        document.onmouseup = null;
        document.onmousemove = null;
        this.onDrag(e.clientX / this.grid.zoom - dragOffsetX, e.clientY / this.grid.zoom - dragOffsetY, true, ...args);
        this.render();
    }
}