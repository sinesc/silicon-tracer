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
            _: { c: this.constructor.name, a: [ this.x, this.y, direction === 'h' ? this.width : this.height, direction, this.color ]},
        };
    }

    // Link wire to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.#element = element(null, 'div', 'wire wire-' + this.#direction);
        this.registerMouseAction(this.#element, { type: 'connect', ordering: this.#direction === 'h' ? 'vh' : 'hv' });
        this.setHoverMessage(this.#element, `Wire. <i>LMB</i> Drag to branch off new wire. <i>DEL</i> Delete, <i>0</i> - <i>9</i> Set net color, ${GridItem.HOTKEYS}.`, { type: 'hover' });
        this.grid.addVisual(this.#element);
    }

    // Removes the component from the grid.
    unlink() {
        this.grid.removeVisual(this.#element);
        this.#element = null;
        super.unlink();
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
        const [ mx, my ] = Grid.align(x, y);
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
        } else if (status === 'start') {
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
    onHotkey(key, what) {
        if (key >= '0' && key <= '9' && what.type === 'hover') {
            const netList = NetList.identify(this.grid.circuit)
            const myNetId = netList.findWire(this);
            const color = parseInt(key);
            for (const netWire of netList.nets[myNetId].wires) {
                this.grid.circuit.itemByGID(netWire.gid).color = color;
            }
            this.grid.markDirty();
            return true;
        } else if (key === 'Delete' && what.type === 'hover') {
            this.#element.classList.add('wire-delete-animation');
            setTimeout(() => {
                if (this.#element) { // deletion might already be in progress
                    this.#element.classList.remove('wire-delete-animation');
                    this.grid.markDirty();
                    this.grid.removeItem(this);
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
        this.dirty ||= this.#color !== value;
        this.#color = value;
    }

    // Sets wire dimensions, optionally aligned to the grid.
    setDimensions(x, y, length, direction, aligned = false) {
        if (aligned) {
            [ x, y ] = Grid.align(x, y);
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
            [ x1, y1 ] = Grid.align(x1, y1);
            [ x2, y2 ] = Grid.align(x2, y2);
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
    render() {

        if (!super.render()) {
            return false;
        }

        const thickness = Wire.#THICKNESS * this.grid.zoom;
        const v = this.visual;
        const t = thickness / 2;

        this.#element.setAttribute('data-net-color', this.color ?? '');

        if (v.width !== 0) {
            const hx = v.width < 0 ? v.x + v.width : v.x;
            const hw = Math.abs(v.width);
            this.#element.style.left = (hx - t) + "px";
            this.#element.style.top = (v.y - t) + "px";
            this.#element.style.width = (hw + thickness) + "px";
            this.#element.style.height = thickness + "px";
            this.#element.style.display = '';
        } else if (v.height !== 0) {
            const vy = v.height < 0 ? v.y + v.height : v.y;
            const vh = Math.abs(v.height);
            this.#element.style.left = (v.x + v.width - t) + "px";
            this.#element.style.top = (vy - t) + "px";
            this.#element.style.width = thickness + "px";
            this.#element.style.height = (vh + thickness) + "px";
            this.#element.style.display = '';
        } else {
            this.#element.style.display = 'none';
        }

        return true;
    }

    // Renders/updates the current net state of the wire to the grid.
    renderNetState() {
        const state = this.getNetState(this.netIds);
        if (this.#element.getAttribute('data-net-state') !== state) {
            this.#element.setAttribute('data-net-state', state);
        }
    }

    // Compact/reduce overlapping wires on the given grid or circuit.
    static compact(container) {
        assert(container instanceof Grid || container instanceof Circuits.Circuit, 'container must be a Grid or Circuit');

        const preMergedWires = Wire.#getAllWires(container);
        const intersections = Wire.#findIntersections(preMergedWires);
        let merged = false;

        for (const direction of [ 'h', 'v' ]) {
            merged ||=  Wire.#mergeWires(container, preMergedWires, direction);
        }

        if (merged) {
            Wire.#restoreIntersections(container, intersections);
        }
    }

    // compact() support. Find intentional intersection points (one wire ending on another).
    static #findIntersections(allWires) {
        const intersections = new Map();
        for (const direction of [ 'h', 'v' ]) {
            const otherDirection = direction === 'h' ? 'v' : 'h';
            for (const wire of allWires[direction]) {
                for (const otherWire of allWires[otherDirection]) {
                    for (let i = 0; i < 2; ++i) {
                        // check if endpoint intersects other wire but is not on that wire's end points (we use these intersections to add back points to merged
                        // wires but that's not necessary if we are already intersecting an endpoint)
                        if (wire.points[i].onLine(otherWire.points) /*&& otherWire.points[0].c !== wire.points[i].c && otherWire.points[1].c !== wire.points[i].c*/) {
                            intersections.set(wire.points[i].c, { point: wire.points[i], direction: direction, done: false });
                        }
                    }
                }
            }
        }
        return intersections.values().toArray();
    }

    // compact() support. Restore intentional intersection points after merging unintentional endpoints.
    static #restoreIntersections(container, intersections) {

        const isIntersected = (w, d) => {
            for (const i of intersections) {
                if (i.direction === d && !i.done && i.point.onLine(w)) {
                    i.done = true;
                    return i.point;
                }
            }
            return null;
        };

        // repeat intersection point insertion until done (wire might have multiple intersection and this
        // code only handles one each time). //TODO: at some point that should be refactored
        let created;
        let paranoiaLimit = 100;

        do {
            created = false;
            const postMergedWires = Wire.#getAllWires(container);
            for (const direction of [ 'h', 'v' ]) {
                const axis = direction === 'h' ? 'x' : 'y';
                for (const w of postMergedWires[direction]) {
                    const intersection = isIntersected(w.points, w.wire.#direction);
                    if (intersection !== null) {
                        const app = w.wire.app;
                        const length1 = intersection[axis] - w.points[0][axis];
                        if (length1 !== 0) {
                            container.addItem(new Wire(app, w.points[0].x, w.points[0].y, length1, direction, w.wire.color));
                            created = true;
                        }
                        const length2 = w.points[1][axis] - intersection[axis];
                        if (length2 !== 0) {
                            container.addItem(new Wire(app, intersection.x, intersection.y, length2, direction, w.wire.color));
                            created = true;
                        }
                        container.removeItem(w.wire);
                    }
                }
            }
        } while (created && paranoiaLimit--);
    }

    // compact() support. Merge overlapping wires.
    static #mergeWires(container, allWires, direction) {

        const axis = direction === 'h' ? 'x' : 'y';
        const wires = allWires[direction];

        for (const wp of wires) {
            if (!wp.active) {
                continue;
            }
            for (const wq of wires) {
                if (!wq.active || wq.wire === wp.wire) {
                    continue;
                }
                if (wp.points[0].onLine(wq.points)) {
                    if (wp.points[1].onLine(wq.points)) {
                        // entirely contained in the other wire, disable wp
                        wp.active = false;
                    } else {
                        // partially outside, enlarge wq, disable wp
                        const min = Math.min(wp.points[0][axis], wp.points[1][axis], wq.points[0][axis], wq.points[1][axis]);
                        const max = Math.max(wp.points[0][axis], wp.points[1][axis], wq.points[0][axis], wq.points[1][axis]);
                        wq.points[0][axis] = min;
                        wq.points[1][axis] = max;
                        wp.active = false;
                    }
                }
            }
        }

        let merged = false;

        for (const w of wires) {
            if (!w.active) {
                container.removeItem(w.wire);
                merged = true;
            } else {
                const length = w.points[1][axis] - w.points[0][axis];
                w.wire.setDimensions(w.points[0].x, w.points[0].y, length, direction);
            }
        }

        return merged;
    }

    // compact() support. Returns all wires grouped by direction
    static #getAllWires(container) {
        return {
            h: container.items
                .filter((w) => w instanceof Wire && w.#direction === 'h')
                .map((w) => ({ active: true, points: w.points(), wire: w }))
                .toArray(),
            v: container.items
                .filter((w) => w instanceof Wire && w.#direction === 'v')
                .map((w) => ({ active: true, points: w.points(), wire: w }))
                .toArray(),
        };
    }
}
