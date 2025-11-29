"use strict";

// Single wire on the grid.
class Wire extends GridItem {

    static DEBUG_BOX = false;
    static HOVER_MESSAGE = 'Wire. <i>LMB</i>: Branch off new wire. <i>DEL</i> Delete, <i>0</i> - <i>9</i>: Set net color.';// TODO: <i>Shift+LMB</i>: Drag along the normal.
    static THICKNESS = 3;

    #element;
    color;
    netId = null;
    width; // TODO: replace width/height with length/direction
    height;
    direction;
    limbo = false;

    constructor(x, y, length, direction, color = null) {
        assert.number(length);
        assert.string(direction);
        assert.number(color, true);
        super(x, y);
        this.width = direction === 'h' ? length : 0;
        this.height = direction === 'v' ? length : 0;
        this.color = color ?? null;
        this.direction = direction;
    }

    // Serializes the object for writing to disk.
    serialize() {
        let direction = this.width > 0 ? 'h' : 'v';
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, direction === 'h' ? this.width : this.height, direction, this.color ]},
        };
    }

    // Link wire to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.#element = document.createElement('div');
        this.#element.classList.add('wire-' + this.direction);
        this.registerDrag(this.#element, { type: 'connect', ordering: this.direction === 'h' ? 'vh' : 'hv' });
        this.setHoverMessage(this.#element, Wire.HOVER_MESSAGE, { type: 'hover' });
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
        this.netId = null;
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
        let [ mx, my ] = Grid.align(x, y);
        let fliptest;
        if ((mx === this.x && my === this.y) || (mx === this.x + this.width && my === this.y + this.height)) {
            if (this.direction === 'h') {
                let xLeft = Math.min(this.x, this.x + this.width);
                fliptest = mx === xLeft ? (x, y) => x < mx : (x, y) => x > mx;
            } else {
                let yTop = Math.min(this.y, this.y + this.height);
                fliptest = my === yTop ? (x, y) => y < my : (x, y) => y > my;
            }
        } else {
            fliptest = () => false;
        }

        let wireBuilder = new WireBuilder(x, y, x, y, what.ordering, this.color, fliptest);
        wireBuilder.render();
        wireBuilder.dragStart(x, y, what);
    }

    // Called while a registered visual is being dragged.
    onDrag(x, y, status, what) {
        if (status === 'start') {
            this.onConnect(x, y, status, what);
        }
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        if (key >= '0' && key <= '9' && what.type === 'hover') {
            let netList = NetList.identify(this.grid.circuit, false)
            let myNetId = netList.findWire(this);
            let color = parseInt(key);
            for (let netWire of netList.nets[myNetId].wires) {
                this.grid.circuit.itemByGID(netWire.gid).color = color;
            }
            this.grid.markDirty(true);
        } else if (key === 'Delete' && what.type === 'hover') {
            this.#element.classList.add('wire-delete-animation');
            setTimeout(() => {
                if (this.#element) { // deletion might already be in progress
                    this.#element.classList.remove('wire-delete-animation');
                    this.grid.markDirty(true);
                    this.grid.removeItem(this);
                }
            }, 150);
        }
    }

    // Sets connection endpoints, optionally aligned to the grid.
    setEndpoints(x1, y1, length, direction, aligned) {
        if (aligned) {
            [ x1, y1 ] = Grid.align(x1, y1);
            length = Math.ceil(length / Grid.SPACING) * Grid.SPACING;
        }
        this.x = x1;
        this.y = y1;
        this.width = direction === 'h' ? length : 0;
        this.height = direction === 'v' ? length : 0;
    };

    // Returns the 2 endpoint coordinates of this connection.
    points() {
        return [ new Point(this.x, this.y), new Point(this.x + this.width, this.y + this.height) ];
    }

    // Renders the connection onto the grid.
    render() {

        let thickness = Wire.THICKNESS * this.grid.zoom;
        let x = this.visualX;
        let y = this.visualY ;
        let width = this.width * this.grid.zoom;
        let height = this.height * this.grid.zoom;
        let t = thickness / 2;

        this.#element.setAttribute('data-net-color', this.color ?? '');

        if (this.width !== 0) {
            let hx = width < 0 ? x + width : x;
            let hw = Math.abs(width);
            this.#element.style.left = (hx - t) + "px";
            this.#element.style.top = (y - t) + "px";
            this.#element.style.width = (hw + 2 * t) + "px";
            this.#element.style.height = thickness + "px";
            this.#element.style.display = '';
        } else if (this.height !== 0) {
            let vy = height < 0 ? y + height : y;
            let vh = Math.abs(height);
            this.#element.style.left = (x + width - t) + "px";
            this.#element.style.top = (vy - t) + "px";
            this.#element.style.width = thickness + "px";
            this.#element.style.height = (vh + 2 * t) + "px";
            this.#element.style.display = '';
        } else {
            this.#element.style.display = 'none';
        }
    }

    // Renders/updates the current net state of the wire to the grid.
    renderNetState() {
        let state = this.netId !== null && app.sim ? '' + app.sim.engine.getNetValue(this.netId) : '';
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

        for (let direction of [ 'h', 'v' ]) {
            merged ||=  Wire.#mergeWires(container, preMergedWires, direction);
        }

        if (merged) {
            Wire.#restoreIntersections(container, intersections);
        }
    }

    // compact() support. Find intentional intersection points (one wire ending on another).
    static #findIntersections(allWires) {
        let intersections = new Map();
        for (let direction of [ 'h', 'v' ]) {
            const otherDirection = direction === 'h' ? 'v' : 'h';
            for (let wire of allWires[direction]) {
                for (let otherWire of allWires[otherDirection]) {
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

        let isIntersected = (w, d) => {
            for (let i of intersections) {
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
            for (let direction of [ 'h', 'v' ]) {
                let axis = direction === 'h' ? 'x' : 'y';
                for (let w of postMergedWires[direction]) {
                    let intersection = isIntersected(w.points, w.wire.direction);
                    if (intersection !== null) {
                        let length1 = intersection[axis] - w.points[0][axis];
                        if (length1 !== 0) {
                            container.addItem(new Wire(w.points[0].x, w.points[0].y, length1, direction, w.wire.color));
                            created = true;
                        }
                        let length2 = w.points[1][axis] - intersection[axis];
                        if (length2 !== 0) {
                            container.addItem(new Wire(intersection.x, intersection.y, length2, direction, w.wire.color));
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

        let axis = direction === 'h' ? 'x' : 'y';
        let wires = allWires[direction];

        for (let wp of wires) {
            if (!wp.active) {
                continue;
            }
            for (let wq of wires) {
                if (!wq.active || wq.wire === wp.wire) {
                    continue;
                }
                if (wp.points[0].onLine(wq.points)) {
                    if (wp.points[1].onLine(wq.points)) {
                        // entirely contained in the other wire, disable wp
                        wp.active = false;
                    } else {
                        // partially outside, enlarge wq, disable wp
                        let min = Math.min(wp.points[0][axis], wp.points[1][axis], wq.points[0][axis], wq.points[1][axis]);
                        let max = Math.max(wp.points[0][axis], wp.points[1][axis], wq.points[0][axis], wq.points[1][axis]);
                        wq.points[0][axis] = min;
                        wq.points[1][axis] = max;
                        wp.active = false;
                    }
                }
            }
        }

        let merged = false;

        for (let w of wires) {
            if (!w.active) {
                container.removeItem(w.wire);
                merged = true;
            } else {
                let length = w.points[1][axis] - w.points[0][axis];
                w.wire.setEndpoints(w.points[0].x, w.points[0].y, length, direction, false);
            }
        }

        return merged;
    }

    // compact() support. Returns all wires grouped by direction
    static #getAllWires(container) {
        return {
            h: container.filterItems((w) => w instanceof Wire && w.direction === 'h')
                .map((w) => ({ active: true, points: w.points(), wire: w })),
            v: container.filterItems((w) => w instanceof Wire && w.direction === 'v')
                .map((w) => ({ active: true, points: w.points(), wire: w })),
        };
    }
}
