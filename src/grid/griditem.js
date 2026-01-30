"use strict";

// Base class for grid items.
class GridItem {

    static HOTKEYS = '<i>SHIFT/CTRL+LMB</i> Click to select/deselect';

    // Reference to linked grid, if linked.
    grid = null;

    // Whether the item needs to be rendered.
    dirty = true;

    // Reference to the application
    #app;

    // Ephemeral grid ID used to link simulation items with grid items
    #gid;

    // Position/size on grid
    #position;
    #size;

    // Registered hover messages, Map(element => message).
    #hoverMessages;

    // List of functions to call once before the next render.
    #beforeRender = [];

    constructor(app, x, y) {
        assert.class(Application, app);
        assert.number(x);
        assert.number(y);
        this.#app = app;
        this.#gid = Grid.generateGID();
        this.#position = new Point(...Grid.align(x, y));
        this.#size = new Point(0, 0);
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            '#c': this.constructor.name,
        };
    }

    // Unserializes a circuit item to a grid idem.
    static unserialize(app, item, rawOthers) {
        assert.class(Application, app);
        assert.object(item);
        const cname = item._.c;
        const cargs = item._.a;
        let instance;
        if (cname === 'Port') { // TODO: meh to have cases here
            instance = new Port(app, ...cargs);
        } else if (cname === 'Gate') {
            instance = new Gate(app, ...cargs);
        } else if (cname === 'Clock') {
            instance = new Clock(app, ...cargs);
        } else if (cname === 'PullResistor') {
            instance = new PullResistor(app, ...cargs);
        } else if (cname === 'Builtin') {
            instance = new Builtin(app, ...cargs);
        } else if (cname === 'Wire') {
            instance = new Wire(app, ...cargs);
        } else if (cname === 'CustomComponent') {
            const uid = cargs[3];
            if (!app.circuits.byUID(uid)) {
                const rawCircuit = rawOthers.find((o) => o.uid === uid);
                Circuits.Circuit.unserialize(app, rawCircuit, rawOthers); // TODO: add max recursion depth
            }
            instance = new CustomComponent(app, ...cargs);
        } else if (cname === 'Splitter') {
            instance = new Splitter(app, ...cargs);
        } else if (cname === 'Tunnel') {
            instance = new Tunnel(app, ...cargs);
        } else if (cname === 'Toggle') {
            instance = new Toggle(app, ...cargs);
        } else if (cname === 'TextLabel') {
            instance = new TextLabel(app, ...cargs);
        } else if (cname === 'Constant') {
            instance = new Constant(app, ...cargs);
        } else {
            throw new Error('Invalid component type "' + cname + '"');
        }
        for (const [ k, v ] of Object.entries(item)) {
            if (k !== '_' /*&& k !== 'width' && k !== 'height'*/) {
                instance[k] = v;
            }
        }
        return instance;
    }

    // Gets the net-state attribute string for the given netIds.
    getNetState(netIds) {
        assert.array(netIds, true);
        const sim = this.#app.simulations.current;
        if (!netIds || !sim || !sim.engine) {
            return '';
        }
        let state = null;
        for (const netId of netIds) {
            const netState = sim.engine.getNetValue(netId);
            if (netState === -1) {
                // conflict, other state doesn't matter, exit
                state = -1;
                break;
            } else if ((netState === 0 && state === null) || netState === 1) {
                // high state has priority over low state over unset
                state = netState;
            }
        }
        return '' + state;
    }

    // Link item to a grid, enabling it to be rendered.
    link(grid) {
        assert.class(Grid, grid);
        this.grid = grid;
        this.#hoverMessages = new WeakMap();
        this.dirty = true;
    }

    // Remove item from grid.
    unlink() {
        this.#hoverMessages = null;
        this.grid = null;
    }

    // Implement to detach the item from the simulation.
    detachSimulation() { }

    // Implement to render the item to the grid.
    render() {
        if (this.#beforeRender.length > 0) {
            for (const func of this.#beforeRender) {
                func();
            }
            this.#beforeRender = [];
        }
        return true;
    }

    // Implement to render the net-state of the item to the grid.
    renderNetState() { }

    // Call after the grid item is modified to ensure the component is fully redrawn and the simulation is updated.
    redraw(beforeRender = null) {
        assert.function(beforeRender, true);
        if (beforeRender) {
            this.#beforeRender.push(beforeRender);
        }
        this.#app.simulations.markDirty(this.grid.circuit);
        this.dirty = true;
    }

    // Returns the app reference.
    get app() { return this.#app; };

    // Implement to return whether the grid item is selected.
    get selected() { return false; }

    // Implement to apply/remove grid item selection effect.
    set selected(status) { }

    // Extend to handle drag events. Return true to prevent parent action.
    onDrag(x, y, status, what) {
        const selection = this.grid.selection;
        if (selection.length > 0 && this.selected) {
            if (status === 'start') {
                what.items = (new Array(selection.length)).fill(null, 0, selection.length).map((_) => ({})); // excellent developer experience
            }
            for (const [ index, item ] of pairs(this.grid.selection)) {
                item.onMove(x, y, status, what.items[index]);
            }
            this.grid.invalidateSelection();
            return true;
        }
        return false;
    }

    // Implement to handle click events. Return true to prevent parent action.
    onClick(modifier, ...args) {
        if (modifier.shift && !this.selected) {
            this.grid.selection.push(this);
            this.grid.invalidateSelection();
            this.selected = true;
            return true;
        } else if (modifier.ctrl && this.selected) {
            const index = this.grid.selection.indexOf(this);
            this.grid.selection.swapRemove(index);
            this.grid.invalidateSelection();
            this.selected = false;
            return true;
        }
        return false;
    }

    // Implement to handle hover hotkey events. Return true to prevent parent/default action.
    onHotkey(key, ...args) {
        return false;
    }

    // Return grid item x position.
    get x() {
        return this.#position.x;
    }

    // Set grid item x position.
    set x(value) {
        assert.number(value);
        this.dirty ||= this.#position.x !== value;
        this.#position.x = value;
    }

    // Return grid item y position.
    get y() {
        return this.#position.y;
    }

    // Set grid item y position.
    set y(value) {
        assert.number(value);
        this.dirty ||= this.#position.y !== value;
        this.#position.y = value;
    }

    // Return grid item width.
    get width() {
        return this.#size.x;
    }

    // Set grid item width.
    set width(value) {
        assert.integer(value);
        this.dirty ||= this.#size.x !== value;
        this.#size.x = value;
    }

    // Return grid item height.
    get height() {
        return this.#size.y;
    }

    // Set grid item height.
    set height(value) {
        assert.integer(value);
        this.dirty ||= this.#size.y !== value;
        this.#size.y = value;
    }

    // Return grid item gid.
    get gid() {
        return this.#gid;
    }

    // Gets the grid-relative screen coordinate/dimensions for this grid item.
    get visual() {
        return {
            x: (this.x + this.grid.offsetX) * this.grid.zoom,
            y: (this.y + this.grid.offsetY) * this.grid.zoom,
            width: this.width * this.grid.zoom,
            height: this.height * this.grid.zoom,
        };
    }

    // Converts in-simulation/on-grid to visual coordinates (for rendering).
    gridToVisual(x, y) {
        assert.number(x);
        assert.number(y);
        return [
            (x + this.grid.offsetX) * this.grid.zoom,
            (y + this.grid.offsetY) * this.grid.zoom
        ];
    }

    // Sets the optionally aligned item position.
    setPosition(x, y, aligned = false) {
        assert.number(x);
        assert.number(y);
        assert.bool(aligned);
        if (aligned) {
            [ x, y ] = Grid.align(x, y);
        }
        this.x = x;
        this.y = y;
    }

    // Sets a status message to be displayed while mouse-hovering the visual element. Additional arguments will be passed to the
    // onHotkey() handler that may be triggered while an element with a hover-message is being hovered.
    setHoverMessage(element, message, ...args) {
        assert.class(Node, element);
        this.registerMouseHover(element, ...args);
        this.#hoverMessages.set(element, message);
    }

    // Registers a visual element for hover events. Required for hover messages or hover hotkeys.
    // Note: setHoverMessage() automatically registers the element.
    // TODO: some sort of error/result if already registered because this causes new args to be ignored
    registerMouseHover(element, ...args) {
        element.addEventListener('mouseenter', this.#handleHover.bind(this, element, 'start', args));
        element.addEventListener('mouseleave', this.#handleHover.bind(this, element, 'stop', args));
    }

    // Registers a drag event source with optional additional arguments to pass with each event to onDrag().
    registerMouseAction(element, ...args) {
        element.onmousedown = this.#handleMouseDown.bind(this, args);
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

    // Called when mouse drag or click starts.
    #handleMouseDown(args, e) {
        e.preventDefault();
        if (e.which !== 1) { // don't stop propagation for other buttons so we can drag the grid while hovering over a wire/component
            return;
        }
        e.stopPropagation();
        const [ dragStartX, dragStartY ] = this.grid.screenToGrid(e.clientX, e.clientY);
        document.onmouseup = this.#handleClick.bind(this, args);
        document.onmousemove = (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.onmousemove = this.#handleDragMove.bind(this, args);
            document.onmouseup = this.#handleDragStop.bind(this, args);
            document.body.classList.add('dragging');
            this.onDrag(dragStartX, dragStartY, 'start', ...args);
        };
    }

    // Called on mouse click (left mouse down and up without movement inbetween)
    #handleClick(args, e) {
        e.preventDefault();
        e.stopPropagation();
        document.onmouseup = null;
        document.onmousemove = null;
        const modifier = { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey };
        this.onClick(modifier, ...args);
    }

    // Called during mouse drag, invokes onDrag().
    #handleDragMove(args, e) {
        e.preventDefault();
        e.stopPropagation();
        const [ dragCurrentX, dragCurrentY ] = this.grid.screenToGrid(e.clientX, e.clientY);
        this.onDrag(dragCurrentX, dragCurrentY, 'drag', ...args);
    }

    // Called when mouse drag ends, invokes onDrag().
    #handleDragStop(args, e) {
        e.preventDefault();
        e.stopPropagation();
        document.onmouseup = null;
        document.onmousemove = null;
        document.body.classList.remove('dragging');
        const [ dragCurrentX, dragCurrentY ] = this.grid.screenToGrid(e.clientX, e.clientY);
        this.onDrag(dragCurrentX, dragCurrentY, 'stop', ...args);
    }

    // Called when mouse hovers over a registered element, sets the grids status message.
    #handleHover(element, status, args, e) {
        // redirect hotkeys to this grid item while hovered
        if (status === 'start') {
            this.grid.requestHotkeyTarget(this, false, ...args);
        } else {
            this.grid.releaseHotkeyTarget(this);
        }
        // set the status message, if any
        const message = !this.selected ? this.#hoverMessages.get(element) : '<b>Multiple items.</b> <i>LMB</i> Drag to move, <i>R</i> Rotate, <i>DEL</i> Delete, <i>CTRL+C</i> Copy, <i>CTRL+X</i> Cut';
        if (message) {
            if (status === 'start') {
                this.#app.setStatus(message, false, this);
            } else {
                this.#app.clearStatus();
            }
        }
    }
}
