"use strict";

// Base class for grid items.
class GridItem {

    // Grid ID used to link simulation items with grid items
    gid;

    // Reference to linked grid
    grid = null;

    // Position on grid
    x;
    y;

    #hoverMessages;
    #hoverRegistered;

    // Serializes the grid item to a circuit item stored as part of a Circuit in Circuits.
    serialize() {
        return {
            _: { c: this.constructor.name, a: [] },
            gid: this.gid,
        };
    }

    // Unserializes a circuit item to a grid idem.
    static unserialize(item) {
        const cname = item._.c;
        const cargs = item._.a;
        let instance;
        if (cname === 'Port') { // TODO: meh to have cases here
            instance = new Port(...cargs);
        } else if (cname === 'Gate') {
            instance = new Gate(...cargs);
        } else if (cname === 'Clock') {
            instance = new Clock(...cargs);
        } else if (cname === 'Builtin') {
            instance = new Builtin(...cargs);
        } else if (cname === 'Wire') {
            instance = new Wire(...cargs);
        } else if (cname === 'CustomComponent') {
            instance = new CustomComponent(...cargs);
        } else {
            throw new Error('Invalid component type "' + cname + '"');
        }
        instance.gid = generateGID();
        for (let [ k, v ] of Object.entries(item)) {
            if (k !== '_') {
                instance[k] = v;
            }
        }
        return instance;
    }

    // Link item to a grid, enabling it to be rendered.
    link(grid) {
        this.grid = grid;
        this.#hoverRegistered = new WeakMap();
        this.#hoverMessages = new WeakMap();
    }

    // Remove item from grid.
    unlink() {
        this.#hoverRegistered = null;
        this.#hoverMessages = null;
        this.grid = null;
    }

    // Implement to detach the item from the simulation.
    detachSimulation() { }

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
            [ x, y ] = Grid.align(x, y);
        }
        this.x = x;
        this.y = y;
    }

    // Registers a visual element for hover events. Required for hover messages or hover hotkeys.
    // Note: setHoverMessage() automatically registers the element.
    // TODO: some sort of error/result if already registered because this causes new args to be ignored
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
        document.body.classList.add('dragging');
        this.onDrag(x, y, 'start', ...args);
    }

    // Trigger item drag cancellation.
    dragStop(x, y, ...args) {
        document.onmouseup = null;
        document.onmousemove = null;
        document.body.classList.remove('dragging');
        this.onDrag(x, y, 'stop', ...args);
    }

    // Called when mouse drag starts, invokes onDrag().
    #handleDragStart(args, e) {
        e.preventDefault();
        if (e.which !== 1) { // don't stop propagation for other buttons so we can drag the grid while hovering over a wire/component
            return;
        }
        e.stopPropagation();
        let [ dragStartX, dragStartY ] = this.grid.screenToGrid(e.clientX, e.clientY);
        document.onmousemove = this.#handleDragMove.bind(this, args);
        document.onmouseup = this.#handleDragStop.bind(this, args);
        document.body.classList.add('dragging');
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
        document.body.classList.remove('dragging');
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
                app.setStatus(message);
            } else {
                app.clearStatus();
            }
        }
    }
}
