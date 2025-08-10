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

    // Utility function to align given x/y to grid coordinates and return them.
    gridAlign(x, y) {
        return [
            Math.ceil(x / this.grid.spacing) * this.grid.spacing - 0.5 * this.grid.spacing,
            Math.ceil(y / this.grid.spacing) * this.grid.spacing - 0.5 * this.grid.spacing
        ];
    }

    // Converts in-simulation/on-grid to visual coordinates (for rendering).
    gridToVisual(x, y) {
        return [
            (x + this.grid.offsetX) * this.grid.zoom,
            (y + this.grid.offsetY) * this.grid.zoom
        ];
    }

    setPosition(x, y, aligned) {
        if (aligned) {
            [ x, y ] = this.gridAlign(x, y);
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
        let [ dragStartX, dragStartY ] = this.grid.screenToGrid(e.clientX, e.clientY);
        document.onmousemove = this.#handleDragMove.bind(this, args);
        document.onmouseup = this.#handleDragStop.bind(this, args);
        this.onDrag(dragStartX, dragStartY, 'start', ...args);
    }

    #handleDragMove(args, e) {
        e.preventDefault();
        e.stopPropagation();
        let [ dragCurrentX, dragCurrentY ] = this.grid.screenToGrid(e.clientX, e.clientY);
        this.onDrag(dragCurrentX, dragCurrentY, 'drag', ...args);
        this.render();
    }

    #handleDragStop(args, e) {
        document.onmouseup = null;
        document.onmousemove = null;
        let [ dragCurrentX, dragCurrentY ] = this.grid.screenToGrid(e.clientX, e.clientY);
        this.onDrag(dragCurrentX, dragCurrentY, 'stop', ...args);
        this.render();
    }
}
