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
