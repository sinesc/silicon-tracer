"use strict";

// Single wire on the grid.
class Wire extends GridItem {

    static #THICKNESS = 3;

    // Net-id for this wire. Directly set by Circuit.attachSimulation()
    netIds = null;

    // Whether the wire is actually on the grid yet. false during wire-drag.
    limbo = false;

    #element;
    #color;
    #direction;

    constructor(app, x, y, length, direction, color = null) {
        assert.number(length);
        assert.enum([ 'h', 'v' ], direction);
        assert.integer(color, true);
        super(app, x, y);
        this.width = direction === 'h' ? length : 0;
        this.height = direction === 'v' ? length : 0;
        this.color = color ?? null;
        this.#direction = direction;
    }

    // Serializes the object for writing to disk.
    serialize() {
        const direction = this.width > 0 ? 'h' : 'v';
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, direction === 'h' ? this.width : this.height, direction, this.color ],
        };
    }

    // Link wire to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.#element = html(null, 'div', 'wire wire-' + this.#direction);
        this.registerMouseAction(this.#element, { type: 'connect', ordering: this.#direction === 'h' ? 'vh' : 'hv' });
        const message = () => {
            const channels = this.netIds?.length ?? 1;
            const kind = channels === 1 ? 'Wire' : `<b>${channels}-bit</b> bus`;
            return `${kind}. <i>LMB</i> Drag to branch off new wire. <i>SHIFT+LMB</i> Move wire. <i>DEL</i> Delete, <i>0</i> - <i>9</i> Set net color, ${GridItem.HOTKEYS}.`;
        };
        this.setHoverMessage(this.#element, message, { type: 'hover' });
        this.grid.addVisual(this.#element);
    }

    // Removes the component from the grid.
    unlink() {
        this.grid.removeVisual(this.#element);
        this.#element = null;
        super.unlink();
    }

    // Return true to completely ignore this component in netlist/simulation.
    disregard() {
        return this.limbo;
    }

    // Detach wire from simulation.
    detachSimulation() {
        this.netIds = null;
    }

    // Return whether the element is selected.
    get selected() {
        return this.#element.classList.contains('selected');
    }

    // Apply/remove component selection effect.
    set selected(status) {
        assert.bool(status, true);
        this.#element.classList.toggle('selected', status);
    }

    // Returns the DOM element used by the wire.
    get element() {
        return this.#element;
    }

    // Create connection from exiting connection.
    onConnect(x, y, status, what) {
        this.dragStop(x, y, what);
        this.grid.releaseHotkeyTarget(this, true);

        // check if we're dragging from either end of the wire and change ordering to extend from there first, then go perpendicular
        const [ mx, my ] = this.align(x, y);
        let fliptest;
        if ((mx === this.x && my === this.y) || (mx === this.x + this.width && my === this.y + this.height)) {
            if (this.#direction === 'h') {
                const xLeft = Math.min(this.x, this.x + this.width);
                fliptest = mx === xLeft ? (x, y) => x < mx : (x, y) => x > mx;
            } else {
                const yTop = Math.min(this.y, this.y + this.height);
                fliptest = my === yTop ? (x, y) => y < my : (x, y) => y > my;
            }
        } else {
            fliptest = () => false;
        }

        const wireBuilder = new WireBuilder(this.app, this.grid, x, y, x, y, what.ordering, this.color, fliptest);
        wireBuilder.dragStart(x, y, what);
    }

    // Called while a registered visual is being dragged.
    onDrag(x, y, status, what) {
        if (super.onDrag(x, y, status, what)) {
            return true;
        }
        if (status === 'start' && this.app.modifierKeys.shiftKey) {
            what.moving = true;
            this.limbo = true;
        }
        if (what.moving) {
            if (status === 'stop') {
                what.moving = false;
                this.limbo = false;
            }
            this.onMove(x, y, status, what);
            if (status === 'stop') {
                this.grid.trackAction('Move wire');
            }
            return true;
        }
        if (status === 'start') {
            this.onConnect(x, y, status, what);
            return true;
        }
    }

    // Called when dragging a selected wire.
    onMove(x, y, status, what) {
        // get offset between component top/left and mouse grab point
        if (status === 'start') {
            what.grabOffsetX ??= x - this.x;
            what.grabOffsetY ??= y - this.y;
        }
        // set new position, align it on stop
        this.setPosition(x - what.grabOffsetX, y - what.grabOffsetY, status === 'stop');
        // draw grid-aligned drop-preview outline
        if (status === 'stop') {
            what.grabOffsetX = null;
            what.grabOffsetY = null;
            this.redraw();
        }
    }

    // Hover hotkey actions
    onHotkey(key, action, what) {
        if (action !== 'down') {
            return;
        }
        if (key >= '0' && key <= '9' && what.type === 'hover') {
            const netList = NetList.identify(this.grid.circuit)
            const myNetId = netList.findWire(this);
            const color = parseInt(key);
            for (const netWire of netList.nets[myNetId].wires) {
                this.grid.circuit.itemByGID(netWire.gid).color = color;
            }
            this.grid.onNetColorsChanged();
            return true;
        } else if (key === 'Delete' && what.type === 'hover') {
            this.#element.classList.add('wire-delete-animation');
            setTimeout(() => {
                if (this.#element) { // deletion might already be in progress
                    this.#element.classList.remove('wire-delete-animation');
                    this.grid.removeItem(this); // fires onCircuitItemRemoved -> compact + recompile + prune
                }
            }, 150);
            return true;
        }
    }

    // Return wire color.
    get color() {
        return this.#color;
    }

    // Set wire color.
    set color(value) {
        assert.integer(value, true);
        if (this.#color !== value) {
            this.#color = value;
            this.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;
        }
    }

    // Sets wire dimensions, optionally aligned to the grid.
    setDimensions(x, y, length, direction, aligned = false) {
        if (aligned) {
            [ x, y ] = this.align(x, y);
            length = Math.ceil(length / Grid.SPACING) * Grid.SPACING;
        }
        this.#direction = direction;
        this.x = x;
        this.y = y;
        this.width = this.#direction === 'h' ? length : 0;
        this.height = this.#direction === 'v' ? length : 0;
    }

    // Sets wire endpoints, optionally aligned to the grid.
    setEndpoints(x1, y1, x2, y2, aligned = false) {
        if (aligned) {
            [ x1, y1 ] = this.align(x1, y1);
            [ x2, y2 ] = this.align(x2, y2);
        }
        this.#direction = y1 === y2 ? 'h' : 'v';
        this.x = Math.min(x1, x2);
        this.y = Math.min(y1, y2);
        this.width = this.#direction === 'h' ? Math.max(x1, x2) - this.x : 0;
        this.height = this.#direction === 'v' ? Math.max(y1, y2) - this.y : 0;
    }

    // Returns the 2 endpoint coordinates of this connection.
    points() {
        return [ new Point(this.x, this.y), new Point(this.x + this.width, this.y + this.height) ];
    }

    // Renders the connection onto the grid.
    renderFull() {

        if (!super.renderFull()) {
            return false;
        }

        this.renderDetail();
        this.renderPosition();
        return true;
    }

    // Updates wire color and bus class.
    renderDetail() {
        this.#element.setAttribute('data-net-color', this.color ?? '');
        this.#element.classList.toggle('wire-bus', (this.netIds?.length ?? 1) !== 1); // !== 1 to show 0-bit busses (unconnected, cannot yet determine channels) as bus wires
    }

    // Updates wire CSS position and dimensions.
    renderPosition() {
        const thickness = Wire.#THICKNESS * this.grid.zoom;
        const v = this.visual;
        const t = thickness / 2;

        if (v.width !== 0) {
            const hx = v.width < 0 ? v.x + v.width : v.x;
            const hw = Math.abs(v.width);
            this.#element.classList.add('wire-h');
            this.#element.classList.remove('wire-v');
            this.#element.style.left = (hx - t) + "px";
            this.#element.style.top = (v.y - t) + "px";
            this.#element.style.width = (hw + thickness) + "px";
            this.#element.style.height = '';
            this.#element.style.display = '';
        } else if (v.height !== 0) {
            const vy = v.height < 0 ? v.y + v.height : v.y;
            const vh = Math.abs(v.height);
            this.#element.classList.add('wire-v');
            this.#element.classList.remove('wire-h');
            this.#element.style.left = (v.x + v.width - t) + "px";
            this.#element.style.top = (vy - t) + "px";
            this.#element.style.width = '';
            this.#element.style.height = (vh + thickness) + "px";
            this.#element.style.display = '';
        } else {
            this.#element.style.display = 'none';
        }
    }

    // Renders/updates the current net state of the wire to the grid.
    renderNetState() {
        const state = this.getNetState(this.netIds);
        if (this.#element.getAttribute('data-net-state') !== state) {
            this.#element.setAttribute('data-net-state', state);
        }
    }

    // Compact overlapping wires on the given grid or circuit, retaining T- and X-junctions.
    static compact(container) {
        assert(container instanceof Grid || container instanceof Circuit, 'container must be a Grid or Circuit');

        const selection = container instanceof Grid ? container.selection : null;
        const allWires = container.items.filter((w) => w instanceof Wire).toArray();
        if (allWires.length === 0) return;

        const app = allWires[0].app;

        // Selected wires are excluded from the merge pass - user may still reposition them.
        // Endpoints still included in cut-point computation so T-junctions stay correct.
        const selectedWireSet = selection !== null ? new Set(selection.filter(w => w instanceof Wire)) : new Set();

        // Pre-compute cut points from the original wire state, before any merging.
        // A cut is needed wherever a perpendicular wire connects: either its endpoint lies on
        // this wire's body, or this wire's endpoint lies on the perpendicular wire's body.
        // Computed once and never mutated so processing one direction cannot corrupt the other.
        const hWiresByTrack = new Map(); // y -> [{start, end}]
        const vWiresByTrack = new Map(); // x -> [{start, end}]
        for (const wire of allWires) {
            const [ p1, p2 ] = wire.points();
            if (wire.#direction === 'h') {
                const y = p1.y, start = Math.min(p1.x, p2.x), end = Math.max(p1.x, p2.x);
                if (!hWiresByTrack.has(y)) hWiresByTrack.set(y, []);
                hWiresByTrack.get(y).push({ start, end });
            } else {
                const x = p1.x, start = Math.min(p1.y, p2.y), end = Math.max(p1.y, p2.y);
                if (!vWiresByTrack.has(x)) vWiresByTrack.set(x, []);
                vWiresByTrack.get(x).push({ start, end });
            }
        }

        const addCut = (map, track, pos) => {
            if (!map.has(track)) map.set(track, new Set());
            map.get(track).add(pos);
        };
        const coversPoint = (wires, pos) => wires?.some(w => w.start <= pos && pos <= w.end) ?? false;

        const cutsForH = new Map(); // y -> Set of x
        const cutsForV = new Map(); // x -> Set of y
        for (const wire of allWires) {
            for (const p of wire.points()) {
                if (wire.#direction === 'v') {
                    // V endpoint at (p.x, p.y): cuts H track at y=p.y if an H wire body covers p.x
                    addCut(cutsForH, p.y, p.x);
                    // V endpoint at (p.x, p.y): cuts V track at x=p.x if an H wire body covers p.y
                    if (coversPoint(hWiresByTrack.get(p.y), p.x)) addCut(cutsForV, p.x, p.y);
                } else {
                    // H endpoint at (p.x, p.y): cuts V track at x=p.x if a V wire body covers p.y
                    addCut(cutsForV, p.x, p.y);
                    // H endpoint at (p.x, p.y): cuts H track at y=p.y if a V wire body covers p.x
                    if (coversPoint(vWiresByTrack.get(p.x), p.y)) addCut(cutsForH, p.y, p.x);
                }
            }
        }

        for (const direction of [ 'h', 'v' ]) {
            const isH = direction === 'h';
            const cuts = isH ? cutsForH : cutsForV;

            // Group non-selected wires by their perpendicular coordinate into tracks.
            // Selected wires are skipped here - they are deferred until the user clears the selection.
            const tracks = new Map();
            for (const wire of allWires) {
                if (wire.#direction !== direction) continue;
                if (selectedWireSet.has(wire)) continue;
                const [ p1, p2 ] = wire.points();
                const trackCoord = isH ? p1.y : p1.x;
                const start = Math.min(isH ? p1.x : p1.y, isH ? p2.x : p2.y);
                const end   = Math.max(isH ? p1.x : p1.y, isH ? p2.x : p2.y);
                if (!tracks.has(trackCoord)) tracks.set(trackCoord, []);
                tracks.get(trackCoord).push({ wire, start, end });
            }

            for (const [ trackCoord, track ] of tracks) {
                track.sort((a, b) => a.start - b.start || b.end - a.end);

                // Find connected groups: wires that overlap or touch (start <= previous groupEnd).
                let groupStart = track[0].start, groupEnd = track[0].end;
                let groupWires = [ track[0] ];

                const flushGroup = () => {
                    // Cut points: perpendicular wire endpoints strictly inside this group's span.
                    const trackCuts = cuts.get(trackCoord) ?? new Set();
                    const interiorCuts = [...trackCuts].filter(c => c > groupStart && c < groupEnd);
                    // Nothing to do if this is a single unmodified wire with no interior cut points.
                    if (groupWires.length < 2 && interiorCuts.length === 0) return;

                    const splitPoints = [ groupStart,
                        ...interiorCuts.sort((a, b) => a - b),
                        groupEnd ];

                    for (const w of groupWires) container.removeItem(w.wire);

                    const color = groupWires[0].wire.color;
                    for (let i = 0; i < splitPoints.length - 1; i++) {
                        const from = splitPoints[i], to = splitPoints[i + 1];
                        container.addItem(new Wire(app, isH ? from : trackCoord, isH ? trackCoord : from, to - from, direction, color));
                    }
                };

                for (let i = 1; i < track.length; i++) {
                    if (track[i].start <= groupEnd) {
                        groupWires.push(track[i]);
                        groupEnd = Math.max(groupEnd, track[i].end);
                    } else {
                        flushGroup();
                        groupStart = track[i].start;
                        groupEnd   = track[i].end;
                        groupWires = [ track[i] ];
                    }
                }
                flushGroup();
            }
        }
    }

    // Finds non-selected wires with an endpoint attached to a selection.
    static findSelectionAttachedWires(grid, selection, startX, startY) {
        assert.class(Grid, grid);
        assert.array(selection);
        assert.number(startX);
        assert.number(startY);
        const selectionPoints = new Set();
        for (const item of selection) {
            if (item instanceof Wire) {
                const [ p0, p1 ] = item.points();
                selectionPoints.add(`${p0.x},${p0.y}`);
                selectionPoints.add(`${p1.x},${p1.y}`);
            } else if (item instanceof Component) {
                for (const port of item.ports) {
                    const c = port.coords(item.width, item.height, item.rotation);
                    selectionPoints.add(`${item.x + c.x},${item.y + c.y}`);
                }
            }
        }
        const attachedWires = [];
        for (const wire of grid.items.filter(i => i instanceof Wire && !i.selected && !i.limbo).toArray()) {
            const [ p0, p1 ] = wire.points();
            const p0c = selectionPoints.has(`${p0.x},${p0.y}`);
            const p1c = selectionPoints.has(`${p1.x},${p1.y}`);
            if (p0c && !p1c) {
                attachedWires.push({ wire, endpoint: 0, initialX: wire.x, initialY: wire.y, initialWidth: wire.width, initialHeight: wire.height });
            } else if (p1c && !p0c) {
                attachedWires.push({ wire, endpoint: 1, initialX: wire.x, initialY: wire.y, initialWidth: wire.width, initialHeight: wire.height });
            }
        }
        return { startX, startY, attachedWires };
    }

    // Updates non-selected wires, returns clamped drag position (to avoid wire length going to 0)
    static updateSelectionAttachedWires(x, y, dragInfo, status) {
        assert.number(x);
        assert.number(y);
        assert.object(dragInfo);
        assert.string(status);
        const dx = x - dragInfo.startX;
        const dy = y - dragInfo.startY;
        const [ cdx, cdy ] = Wire.#clampLengthDrag(dragInfo.attachedWires, dx, dy);
        const effectiveX = dragInfo.startX + cdx;
        const effectiveY = dragInfo.startY + cdy;
        Wire.#applyLengthDragWires(dragInfo.attachedWires, cdx, cdy, status === 'stop');
        return [ effectiveX, effectiveY ];
    }

    // Returns [dx, dy] clamped so no attached wire falls below Grid.SPACING minimum length.
    static #clampLengthDrag(attachedWires, dx, dy) {
        let minDx = -Infinity, maxDx = Infinity;
        let minDy = -Infinity, maxDy = Infinity;
        const MIN = Grid.SPACING;
        for (const { endpoint, initialWidth, initialHeight } of attachedWires) {
            if (initialWidth > 0) {
                // Horizontal wire: constrains dx only
                const room = initialWidth - MIN;
                if (endpoint === 0) {
                    maxDx = Math.min(maxDx, room); // p0 moves right -> shrinks wire
                } else {
                    minDx = Math.max(minDx, -room); // p1 moves left -> shrinks wire
                }
            } else {
                // Vertical wire: constrains dy only
                const room = initialHeight - MIN;
                if (endpoint === 0) {
                    maxDy = Math.min(maxDy, room); // p0 moves down -> shrinks wire
                } else {
                    minDy = Math.max(minDy, -room); // p1 moves up -> shrinks wire
                }
            }
        }
        return [
            Math.max(minDx, Math.min(maxDx, dx)),
            Math.max(minDy, Math.min(maxDy, dy)),
        ];
    }

    // Stretches/shrinks attached wires to follow clamped delta.
    static #applyLengthDragWires(attachedWires, dx, dy, snap) {
        for (const { wire, endpoint, initialX, initialY, initialWidth, initialHeight } of attachedWires) {
            if (initialWidth > 0) {
                // Horizontal wire: apply dx only
                const rdx = snap ? Math.ceil(dx / Grid.SPACING - 0.5) * Grid.SPACING : Math.round(dx);
                if (endpoint === 0) {
                    wire.x = initialX + rdx;
                    wire.width = initialWidth - rdx;
                } else {
                    wire.width = initialWidth + rdx;
                }
            } else {
                // Vertical wire: apply dy only
                const rdy = snap ? Math.ceil(dy / Grid.SPACING - 0.5) * Grid.SPACING : Math.round(dy);
                if (endpoint === 0) {
                    wire.y = initialY + rdy;
                    wire.height = initialHeight - rdy;
                } else {
                    wire.height = initialHeight + rdy;
                }
            }
        }
    }
}

GridItem.CLASSES['Wire'] = Wire;
