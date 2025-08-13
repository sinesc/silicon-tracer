class GridElement {

    grid;

    x;
    y;
    width;
    height;

    #hoverMessages;
    #hoverRegistered;

    constructor(grid) {
        this.grid = grid;
        grid.registerComponent(this);
        this.#hoverRegistered = new Map();
        this.#hoverMessages = new Map();
    }

    render() { }

    onDrag(x, y, status, ...args) { }

    onHotkey(element, key, status) { }

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

    // Sets the optionally aligned component position.
    setPosition(x, y, aligned) {
        if (aligned) {
            [ x, y ] = this.gridAlign(x, y);
        }
        this.x = x;
        this.y = y;
    }

    // Registers a visual element for hover events. Required for hover messages or hover hotkeys.
    registerHoverWatch(element) {
        if (!this.#hoverRegistered.has(element)) {
            element.addEventListener('mouseenter', this.#handleHover.bind(this, element, 'start'));
            element.addEventListener('mouseleave', this.#handleHover.bind(this, element, 'stop'));
        }
    }

    // Sets a status message to be displayed while mouse-hovering the visual element.
    setHoverMessage(element, message) {
        this.registerHoverWatch(element);
        this.#hoverMessages.set(element, message);
    }

    // Registers a drag event source with optional additional arguments to pass with each event to onDrag().
    registerDrag(element, ...args) {
        element.onmousedown = this.#handleDragStart.bind(this, args);
    }

    // Trigger component drag (e.g. when dragging from template into the grid).
    dragStart(e, ...args) {
        this.#handleDragStart(args, e);
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

    #handleHover(element, status) {
        this.grid.hotkeyTarget = status === 'start' ? { gridElement: this, element: element } : null;
        let message = this.#hoverMessages.get(element);
        if (message) {
            if (status === 'start') {
                this.grid.setStatus(message);
            } else {
                this.grid.clearStatus();
            }
        }
    }
}
