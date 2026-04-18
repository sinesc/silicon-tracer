"use strict";

// Base class for grid items.
class GridItem {

    static HOTKEYS = '<i>SHIFT/CTRL+LMB</i> Click to select/deselect';

    // Serializable GridItem subclasses. Registration at the bottom of each subclass file.
    static CLASSES = {};

    // Bounding box inset during selection.
    static #SELECTION_MARGIN = 5;

    // Render flag: update CSS left/top only (mid-drag move).
    static NEEDS_POSITION_UPDATE = 1;
    // Render flag: update labels and port content only (no geometry change).
    static NEEDS_DETAIL_RENDER = 2;
    // Render flag: full re-render including position, size, and content.
    static NEEDS_FULL_RENDER = 4;

    // Reference to linked grid, if linked.
    grid = null;

    // Pending render work: bitmask of NEEDS_POSITION_UPDATE / NEEDS_DETAIL_RENDER / NEEDS_FULL_RENDER.
    renderFlags = 0;

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
        this.#gid = GridItem.#generateGID(app.config.debugCompileComments);
        this.#position = new Point(...this.align(x, y));
        this.#size = new Point(0, 0);
    }

    // Generate a unique ID.
    static #generateGID(readable = false) {
        assert.bool(readable)
        if (!readable) {
            return 'g' + crypto.randomUUID().replaceAll('-', '');
        } else {
            return 'g' + crypto.randomUUID().replaceAll('-', '').slice(0, 6);
        }
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            '#c': this.constructor.name,
        };
    }

    // Unserializes a circuit item to a grid item.
    static unserialize(app, item, rawOthers = [], setLid = null, errors = []) {
        assert.class(Application, app);
        assert.object(item);
        assert.array(rawOthers);
        assert.string(setLid, true);
        const cname = item['#c'];
        const cargs = item['#a'];
        let instance;
        let isError = false;
        if (cname === 'CustomComponent') {
            const uid = cargs[3];
            let missing = false;
            if (!app.circuits.byUID(uid)) {
                const rawCircuit = rawOthers.find((o) => o.uid === uid);
                if (rawCircuit) {
                    Circuit.unserialize(app, rawCircuit, rawOthers, setLid, errors); // TODO: add max recursion depth
                } else {
                    missing = true;
                }
            }
            if (missing) {
                instance = new GridItem.CLASSES['TextLabel'](app, cargs[0] ?? 0, cargs[1] ?? 0, 0, 200, 'Missing custom component ' + uid, 'small', 4);
                errors.push([ 'missing', uid ]);
                isError = true;
            } else {
                instance = new GridItem.CLASSES['CustomComponent'](app, ...cargs);
            }
        } else if (GridItem.CLASSES[cname]) {
            instance = new GridItem.CLASSES[cname](app, ...cargs);
        } else {
            instance = new GridItem.CLASSES['TextLabel'](app, cargs[0] ?? 0, cargs[1] ?? 0, 0, 200, 'Unknown component ' + cname, 'small', 4);
            errors.push([ 'invalid', cname ]);
            isError = true;
        }
        // set remaining properties
        if (!isError) {
            for (const [ k, v ] of Object.entries(item)) {
                if (k.slice(0, 1) !== '#') {
                    instance[k] = v;
                }
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
            const netState = netId !== undefined ? sim.engine.getNetValue(netId) : null;
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
        this.renderFlags = GridItem.NEEDS_FULL_RENDER;
    }

    // Remove item from grid.
    unlink() {
        this.#hoverMessages = null;
        this.grid = null;
    }

    // Implement to detach the item from the simulation.
    detachSimulation() { }

    // Full re-render: position, size, and content. Subclasses must call super.renderFull() first.
    renderFull() {
        if (this.#beforeRender.length > 0) {
            for (const func of this.#beforeRender) {
                func();
            }
            this.#beforeRender = [];
        }
        return true;
    }

    // Partial re-render: labels and port content only (no geometry change). Subclasses may override.
    renderDetail() { }

    // Partial re-render: update CSS left/top only (mid-drag move). Subclasses may override.
    renderPosition() { }

    // Implement to render the net-state of the item to the grid.
    renderNetState() { }

    // Call after the grid item is modified to ensure the component is fully redrawn and the simulation is updated.
    redraw(recompile = true, beforeRender = null) {
        assert.bool(recompile);
        assert.function(beforeRender, true);
        if (beforeRender) {
            this.#beforeRender.push(beforeRender);
        }
        if (recompile) {
            this.grid?.onTopologyChanged();
        }
        this.renderFlags |= GridItem.NEEDS_FULL_RENDER;
        this.#app.haveChanges = true;
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
                what.items = (new Array(selection.length)).fill(null, 0, selection.length).map((_) => ({}));
                if (this.app.modifierKeys.altKey) {
                    what.altDrag = Wire.findSelectionAttachedWires(this.grid, selection, x, y);
                }
            }
            const [ effectiveX, effectiveY ] = what.altDrag ? Wire.updateSelectionAttachedWires(x, y, what.altDrag, status) : [ x, y ];
            for (const [ index, item ] of pairs(this.grid.selection)) {
                item.onMove(effectiveX, effectiveY, status, what.items[index]);
            }
            this.grid.invalidateSelection();
            if (status === 'stop') {
                delete what.altDrag;
                this.grid.onWiresChanged(); // schedules compact + recompile; pruneSelection runs after compact
                this.grid.trackAction('Move selection');
            }
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

    // Implement to handle hover hotkey events. Should call parent and exit early on true result.
    onHotkey(key, action, ...args) {
        return false;
    }

    // Called after the item is pasted into the circuit. Subclasses may override to fix up properties with a uniqueness requirement.
    onPaste() { }

    // Finds a unique value for the given property within the circuit by appending/incrementing a numeric suffix.
    makeUnique(propertyName, value) {
        assert.string(propertyName);
        assert.string(value);
        const existing = new Set(
            this.grid.circuit.items
                .filter((item) => item !== this)
                .map((item) => item[propertyName])
                .filter((v) => v !== undefined)
        );
        if (!existing.has(value)) return value;
        const base = value.replace(/_\d+$/, '');
        let n = 1;
        while (existing.has(`${base}_${n}`)) n++;
        return `${base}_${n}`;
    }

    // Return grid item x position.
    get x() {
        return this.#position.x;
    }

    // Set grid item x position.
    set x(value) {
        assert.number(value);
        if (this.#position.x !== value) {
            this.#position.x = value;
            this.renderFlags |= GridItem.NEEDS_POSITION_UPDATE;
        }
    }

    // Return grid item y position.
    get y() {
        return this.#position.y;
    }

    // Set grid item y position.
    set y(value) {
        assert.number(value);
        if (this.#position.y !== value) {
            this.#position.y = value;
            this.renderFlags |= GridItem.NEEDS_POSITION_UPDATE;
        }
    }

    // Return grid item width.
    get width() {
        return this.#size.x;
    }

    // Set grid item width.
    set width(value) {
        assert.integer(value);
        if (this.#size.x !== value) {
            this.#size.x = value;
            this.renderFlags |= GridItem.NEEDS_FULL_RENDER;
        }
    }

    // Return grid item height.
    get height() {
        return this.#size.y;
    }

    // Set grid item height.
    set height(value) {
        assert.integer(value);
        if (this.#size.y !== value) {
            this.#size.y = value;
            this.renderFlags |= GridItem.NEEDS_FULL_RENDER;
        }
    }

    // Return grid item id.
    get gid() {
        return this.#gid;
    }

    // Restores the GID from an undo snapshot. Only called by Circuit.restoreFromUndo().
    restoreGid(gid) {
        this.#gid = gid;
    }

    // Gets the grid-relative screen coordinate/dimensions for this grid item.
    get visual() {
        return {
            x: this.x * this.grid.zoom,
            y: this.y * this.grid.zoom,
            width: this.width * this.grid.zoom,
            height: this.height * this.grid.zoom,
        };
    }

    // Returns the inset bounding box used for area selection. Subclasses may override.
    get selectionBounds() {
        const m = GridItem.#SELECTION_MARGIN;
        return { x: this.x + m, y: this.y + m, width: this.width - m * 2, height: this.height - m * 2 };
    }

    // Converts in-simulation/on-grid to visual coordinates (for rendering).
    gridToVisual(x, y) {
        assert.number(x);
        assert.number(y);
        return [
            x * this.grid.zoom,
            y * this.grid.zoom
        ];
    }

    // Aligns coordinates to the grid. Subclasses may override for custom snapping.
    align(x, y) {
        return Grid.align(x, y);
    }

    // Sets the optionally aligned item position.
    setPosition(x, y, aligned = false) {
        assert.number(x);
        assert.number(y);
        assert.bool(aligned);
        if (aligned) {
            [ x, y ] = this.align(x, y);
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
        if (this.grid && !this.grid.passive && !this.grid.readonly) {
            element.onmousedown = this.#handleMouseDown.bind(this, args);
        }
    }

    // Hack to store onclick handler during drag&drop operations to avoid sporadic click actions.
    // This fixes 'dragging tunnel from menu closes menu'.
    #onClickBackup;

    // Backup onclick handler during drag operation.
    #backupOnClick() {
        this.#onClickBackup = document.onclick;
        document.onclick = null;
    }

    // Restore onclick handler after drag operation.
    #restoreOnClick() {
        setTimeout(() => document.onclick = this.#onClickBackup, 10);
    }

    // Trigger item drag (e.g. when dragging from template into the grid).
    dragStart(x, y, ...args) {
        if (this.grid && !this.grid.passive) {
            document.onmousemove = this.#handleDragMove.bind(this, args);
            document.onmouseup = this.#handleDragStop.bind(this, args);
            document.body.classList.add('dragging');
            this.#backupOnClick();
            this.onDrag(x, y, 'start', ...args);
        }
    }

    // Trigger item drag cancellation.
    dragStop(x, y, ...args) {
        if (this.grid && !this.grid.passive) {
            document.onmouseup = null;
            document.onmousemove = null;
            document.body.classList.remove('dragging');
            this.onDrag(x, y, 'stop', ...args);
            this.#restoreOnClick();
        }
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
            this.#backupOnClick();
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
        this.#restoreOnClick();
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
        const message = !this.selected ? this.#hoverMessages.get(element) : '<b>Multiple items.</b> <i>LMB</i> Drag to move, <i>ALT+LMB</i> Drag to move and shorten/lengthen wires, <i>R</i> Rotate, <i>DEL</i> Delete, <i>CTRL+C</i> Copy, <i>CTRL+X</i> Cut';
        if (message) {
            if (status === 'start') {
                this.#app.setStatus(message, false, this);
            } else {
                this.#app.clearStatus();
            }
        }
    }
}
