"use strict";

class GridItem {

    grid;

    x;
    y;

    #hoverMessages;
    #hoverRegistered;

    constructor(grid) {
        this.grid = grid;
        grid.addItem(this);
        this.#hoverRegistered = new WeakMap();
        this.#hoverMessages = new WeakMap();
    }

    // Gets the grid-relative screen x-coordinate for this grid item.
    get visualX() {
        return (this.x + this.grid.offsetX) * this.grid.zoom;
    }

    // Gets the grid-relative screen y-coordinate for this grid item.
    get visualY() {
        return (this.y + this.grid.offsetY) * this.grid.zoom;
    }

    // Implement to render the item to the grid.
    render() { }

    // Implement to handle drag events.
    onDrag(x, y, status, ...args) { }

    // Implement to handle hover hotkey events.
    onHotkey(key, ...args) { }

    // Remove the item from the grid. // TBD: maybe refactor to onRemove() and then have grid.removeItem() call it?
    remove() {
        this.hoverMessages = null;
        this.#hoverRegistered = null;
        this.grid.removeItem(this);
    }

    // Implement to detach the item from the simulation.
    detachSimulation() { }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            _: { c: this.constructor.name, a: [] },
        };
    }

    // Utility function to align given x/y to grid coordinates and return them.
    gridAlign(x, y) {
        return [
            Math.ceil(x / Grid.SPACING) * Grid.SPACING - 0.5 * Grid.SPACING,
            Math.ceil(y / Grid.SPACING) * Grid.SPACING - 0.5 * Grid.SPACING
        ];
    }

    // Converts in-simulation/on-grid to visual coordinates (for rendering).
    gridToVisual(x, y) {
        return [
            (x + this.grid.offsetX) * this.grid.zoom,
            (y + this.grid.offsetY) * this.grid.zoom
        ];
    }

    // Sets the optionally aligned item position.
    setPosition(x, y, aligned) {
        if (aligned) {
            [ x, y ] = this.gridAlign(x, y);
        }
        this.x = x;
        this.y = y;
    }

    // Registers a visual element for hover events. Required for hover messages or hover hotkeys.
    // Note: setHoverMessage() automatically registers the element.
    registerHoverWatch(element, ...args) {
        if (!this.#hoverRegistered.has(element)) {
            element.addEventListener('mouseenter', this.#handleHover.bind(this, element, 'start', args));
            element.addEventListener('mouseleave', this.#handleHover.bind(this, element, 'stop', args));
        }
    }

    // Sets a status message to be displayed while mouse-hovering the visual element. Additional arguments will be passed to the
    // onHotkey() handler that may be triggered while an element with a hover-message is being hovered.
    setHoverMessage(element, message, ...args) {
        this.registerHoverWatch(element, ...args);
        this.#hoverMessages.set(element, message);
    }

    // Registers a drag event source with optional additional arguments to pass with each event to onDrag().
    registerDrag(element, ...args) {
        element.onmousedown = this.#handleDragStart.bind(this, args);
    }

    // Trigger item drag (e.g. when dragging from template into the grid).
    dragStart(x, y, ...args) {
        document.onmousemove = this.#handleDragMove.bind(this, args);
        document.onmouseup = this.#handleDragStop.bind(this, args);
        this.onDrag(x, y, 'start', ...args);
    }

    // Trigger item drag cancellation.
    dragStop(x, y, ...args) {
        document.onmouseup = null;
        document.onmousemove = null;
        this.onDrag(x, y, 'stop', ...args);
    }

    // Called when mouse drag starts, invokes onDrag().
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

    // Called during mouse drag, invokes onDrag().
    #handleDragMove(args, e) {
        e.preventDefault();
        e.stopPropagation();
        let [ dragCurrentX, dragCurrentY ] = this.grid.screenToGrid(e.clientX, e.clientY);
        this.onDrag(dragCurrentX, dragCurrentY, 'drag', ...args);
    }

    // Called when mouse drag ends, invokes onDrag().
    #handleDragStop(args, e) {
        document.onmouseup = null;
        document.onmousemove = null;
        let [ dragCurrentX, dragCurrentY ] = this.grid.screenToGrid(e.clientX, e.clientY);
        this.onDrag(dragCurrentX, dragCurrentY, 'stop', ...args);
    }

    // Called when mouse hovers over a registered element, sets the grids status message.
    #handleHover(element, status, args, e) {

        if (status === 'start') {
            this.grid.requestHotkeyTarget(this, false, ...args);
        } else {
            this.grid.releaseHotkeyTarget(this);
        }
        let message = this.#hoverMessages.get(element);
        if (message) {
            if (status === 'start') {
                this.grid.setMessage(message);
            } else {
                this.grid.clearMessage();
            }
        }
    }
}
