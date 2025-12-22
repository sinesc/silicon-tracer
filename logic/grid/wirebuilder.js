"use strict";

// Used to build wire corners.
class WireBuilder extends GridItem { // Note: Not actually a grid item, but uses a lot of grid item functionality.

    static DRAWING_CONNECTION_MESSAGE = 'Drawing connection. <i>R</i>: Add point, continue drawing from here.';

    #wireH;
    #wireV;
    #ordering;
    #fliptest;
    #debugElement;
    color;

    constructor(x1, y1, x2, y2, ordering = null, color = null, fliptest = null) {
        assert.number(x1);
        assert.number(y1);
        assert.number(x2);
        assert.number(y2);
        assert.string(ordering, true);
        assert.integer(color, true);
        assert.function(fliptest, true);

        super(0, 0);
        this.grid = app.grid;

        [ x1, y1 ] = Grid.align(x1, y1);
        [ x2, y2 ] = Grid.align(x2, y2);
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
        this.#ordering = ordering ?? 'hv';
        this.color = color;
        this.#fliptest = fliptest ?? ( (x, y) => false );

        this.#wireH = new Wire(x1, y1, this.width, 'h', this.color);
        this.#wireH.limbo = true;
        this.grid.addItem(this.#wireH, false);
        this.#wireH.element.classList.add('wire-building');

        this.#wireV = new Wire(x1, y1, this.height, 'v', this.color);
        this.#wireV.limbo = true;
        this.grid.addItem(this.#wireV, false);
        this.#wireV.element.classList.add('wire-building');

        this.#updateWires();

        if (app.config.debugShowWireBox) {
            this.#debugElement = document.createElement('div');
            this.#debugElement.classList.add('wirebuilder-debug');
            this.grid.addVisual(this.#debugElement);
        }
    }

    // Returns potentially flipped ordering.
    get ordering() {
        return this.#fliptest(this.x + this.width, this.y + this.height) ? this.#ordering === 'hv' ? 'vh' : 'hv' : this.#ordering;
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        if (key === 'r' && what.type === 'connect') {
            // add new corner when pressing R while dragging a wire
            let x = this.x + this.width;
            let y = this.y + this.height;
            let color = this.color;
            // pass handling off to the previously created wirebuilder
            let flippedOrdering = this.#ordering !== what.ordering;
            let dragConnectionWhat = { ...what, ordering: flippedOrdering ? what.ordering == 'hv' ? 'vh' : 'hv' : what.ordering, x, y, color };
            this.dragStop(x, y, what);
            this.grid.releaseHotkeyTarget(this, true);
            let wireBuilder = new WireBuilder(what.startX, what.startY, x, y, what.ordering, this.color);
            wireBuilder.dragStart(x, y, dragConnectionWhat);
            return true;
        }
    }

    // Called while a registered visual is being dragged.
    onDrag(x, y, status, what) {
        if (status === 'start') {
            what.startX = x;
            what.startY = y;
            app.setStatus(WireBuilder.DRAWING_CONNECTION_MESSAGE, true);
            this.grid.requestHotkeyTarget(this, true, { ...what, type: 'connect' }); // pass 'what' to onHotkey()
        } else if (status !== 'stop') {
            this.#setBounding(what.startX, what.startY, x, y);
        } else {
            app.clearStatus(true);
            this.grid.releaseHotkeyTarget(this, true);
            this.#remove();
        }
    }

    // Upon removal of the builder also remove any zero length wires produced by it and compact wires.
    #remove() {
        this.#wireH.element.classList.remove('wire-building');
        this.#wireH.limbo = false;
        this.#wireV.element.classList.remove('wire-building');
        this.#wireV.limbo = false;
        if (this.width === 0) {
            this.grid.removeItem(this.#wireH, false);
        }
        if (this.height === 0) {
            this.grid.removeItem(this.#wireV, false);
        }
        if (app.config.debugShowWireBox) {
            this.grid.removeVisual(this.#debugElement);
            for (let i = 0; i < 3; ++i) {
                this.grid.removeVisual(this['debug' + i]);
            }
        }
        Wire.compact(this.grid);
        this.grid.markDirty();
        app.simulations.markDirty(this.grid.circuit);
    }

    // Sets wire corner bounding box.
    #setBounding(x1, y1, x2, y2) {
        [ x1, y1 ] = Grid.align(x1, y1);
        [ x2, y2 ] = Grid.align(x2, y2);
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
        this.#updateWires();
        if (app.config.debugShowWireBox) {
            this.#debugRenderBox();
        }
    };

    // Updates wire positions from endpoints.
    #updateWires() {
        const x = this.x;
        const y = this.y ;
        const width = this.width;
        const height = this.height;
        if (this.ordering === 'hv') {
            // horizontal first, then vertical
            let hx = width < 0 ? x + width : x;
            let hw = Math.abs(width);
            this.#wireH.setEndpoints(hx, y, hw, 'h');

            let vy = height < 0 ? y + height : y;
            let vh = Math.abs(height);
            this.#wireV.setEndpoints(x + width, vy, vh, 'v');
        } else {
            // vertical first, then horizontal
            let vy = height < 0 ? y + height : y;
            let vh = Math.abs(height);
            this.#wireV.setEndpoints(x, vy, vh, 'v');

            let hx = width < 0 ? x + width : x;
            let hw = Math.abs(width);
            this.#wireH.setEndpoints(hx, y + height, hw, 'h');
        }
    }

    // Returns the 2 or 3 distinct endpoint coordinates of this wire corner.
    #points() {
        let mk = (x, y) => new Point(x, y);
        let points = [ mk(this.x, this.y) ];
        if (this.width !== 0) {
            points.push(this.ordering === 'hv' ? mk(this.x + this.width, this.y) : mk(this.x + (this.height === 0 ? this.width : 0), this.y + this.height));
        }
        if (this.height !== 0) {
            points.push(mk(this.x + this.width, this.y + this.height));
        }
        return points;
    }

    // Renders a debug bounding box around for the wire corner.
    #debugRenderBox() {
        let v = this.visual;
        let hx = v.width < 0 ? v.x + v.width : v.x;
        let hy = v.height < 0 ? v.y + v.height : v.y;
        this.#debugElement.style.left = hx + "px";
        this.#debugElement.style.top = hy + "px";
        this.#debugElement.style.width = Math.abs(v.width) + "px";
        this.#debugElement.style.height = Math.abs(v.height) + "px";
        let points = this.#points();
        for (let i = 0; i < 3; ++i) {
            this['debug' + i] = this.grid.debugPoint(i < points.length ? points[i] : null, i, this['debug' + i] ?? null);
        }
        this.#debugElement.innerHTML = '<span>' + points.map((p) => JSON.stringify(p)).join('<br>') + '</span>';
    }
}
