"use strict";

// Single wire on the grid.
class Wire extends GridItem {

    static DEBUG_BOX = false;
    static HOVER_MESSAGE = 'Wire. <i>LMB</i>: Branch off new wire. <i>D</i> Delete, <i>0</i> - <i>9</i>: Set net color.';// TODO: <i>Shift+LMB</i>: Drag along the normal.
    static THICKNESS = 3;

    #element;
    color;
    netId = null;
    width; // TODO: replace width/height with length/direction
    height;
    direction;

    constructor(grid, x1, y1, length, direction, color) {

        super(grid);

        [ x1, y1 ] = this.gridAlign(x1, y1);
        this.x = x1;
        this.y = y1;
        this.width = direction === 'h' ? length : 0;
        this.height = direction === 'v' ? length : 0;
        this.color = color ?? null;
        this.direction = direction;

        if (this.grid) {
            this.#element = document.createElement('div');
            this.#element.classList.add('wire-' + direction);
            this.registerDrag(this.#element, { type: 'connect', ordering: direction === 'h' ? 'vh' : 'hv' });
            this.setHoverMessage(this.#element, Wire.HOVER_MESSAGE, { type: 'hover' });
            this.grid.addVisual(this.#element);
        }
    }

    // Returns the DOM element used by the wire.
    get element() {
        return this.#element;
    }

    // Serializes the object for writing to disk.
    serialize() {
        let direction = this.width > 0 ? 'h' : 'v';
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, direction === 'h' ? this.width : this.height, direction, this.color ]},
        };
    }

    // Removes the component from the grid.
    remove() {
        this.grid.removeVisual(this.#element);
        this.#element = null;
        super.remove();
    }

    // Detach wire from simulation.
    detachSimulation() {
        this.netId = null;
    }

    // Create connection from exiting connection.
    onConnect(x, y, status, what) {
        // TODO: when dragging forward (i.e. not perpendicular) from the end of a wire, ordering should be reversed.
        // this requires getting a mouse movement vector because the user might still want to drag along the normal at the end of a wire
        this.dragStop(x, y, what);
        this.grid.releaseHotkeyTarget(this, true);
        let wireBuilder = new WireBuilder(this.grid, x, y, x, y, what.ordering, this.color);
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
        if (what.type === 'hover' && key >= '0' && key <= '9') {
            let [ netList ] = this.grid.identifyNets();
            let myNetId = netList.findWire(this);
            let color = parseInt(key);
            for (let [ , , wire ] of netList.nets[myNetId].wires) {
                wire.color = color;
            }
            this.grid.render();
        } else if (key === 'd' && what.type === 'hover') {
            this.#element.classList.add('wire-delete-animation');
            setTimeout(() => {
                this.#element.classList.remove('wire-delete-animation');
                this.remove();
                this.grid.invalidateNets();
                this.grid.render();
            }, 150);
        }
    }

    // Sets connection endpoints, optionally aligned to the grid.
    setEndpoints(x1, y1, length, direction, aligned) {
        if (aligned) {
            [ x1, y1 ] = this.gridAlign(x1, y1);
            length = Math.ceil(length / Grid.SPACING) * Grid.SPACING;
        }
        this.x = x1;
        this.y = y1;
        this.width = direction === 'h' ? length : 0;
        this.height = direction === 'v' ? length : 0;
    };

    // Returns the 2 endpoint coordinates of this connection.
    points() {
        let mk = (x, y) => new Point(x, y);
        return [ mk(this.x, this.y), mk(this.x + this.width, this.y + this.height) ];
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
        this.#element.setAttribute('data-net-state', this.netId !== null && app.sim ? app.sim.engine.getNet(this.netId) : '');

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

    // Compact/reduce overlapping wires.
    static compact(grid) {
        const preMergedWires = Wire.#getAllWires(grid);
        const intersections = Wire.#wireIntersections(preMergedWires);

        for (let direction of [ 'h', 'v' ]) {
            Wire.#mergeWires(preMergedWires, direction);
        }

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
            const postMergedWires = Wire.#getAllWires(grid);
            for (let direction of [ 'h', 'v' ]) {
                let axis = direction === 'h' ? 'x' : 'y';
                for (let w of postMergedWires[direction]) {
                    let intersection = isIntersected(w.points, w.wire.direction);
                    if (intersection !== null) {
                        let length1 = intersection[axis] - w.points[0][axis];
                        if (length1 !== 0) {
                            new Wire(grid, w.points[0].x, w.points[0].y, length1, direction, w.wire.color);
                            created = true;
                        }
                        let length2 = w.points[1][axis] - intersection[axis];
                        if (length2 !== 0) {
                            new Wire(grid, intersection.x, intersection.y, length2, direction, w.wire.color);
                            created = true;
                        }
                        w.wire.remove();
                    }
                }
            }
        } while (created && paranoiaLimit--);
    }

    // compact() support. Find intentional intersection points (one wire ending on another).
    static #wireIntersections(allWires) {
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

    // compact() support. Merge overlapping wires.
    static #mergeWires(allWires, direction) {

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

        for (let w of wires) {
            if (!w.active) {
                w.wire.remove();
            } else {
                let length = w.points[1][axis] - w.points[0][axis];
                w.wire.setEndpoints(w.points[0].x, w.points[0].y, length, direction, false);
            }
        }
    }

    // compact() support. Returns all wires grouped by direction
    static #getAllWires(grid) {
        return {
            h: grid.filterItems((w) => w instanceof Wire && w.direction === 'h')
                .map((w) => ({ active: true, points: w.points(), wire: w }))
                .toArray(),
            v: grid.filterItems((w) => w instanceof Wire && w.direction === 'v')
                .map((w) => ({ active: true, points: w.points(), wire: w }))
                .toArray(),
        };
    }
}
