"use strict";

// Used to build wire corners.
class WireBuilder extends GridItem { // Note: Not actually a grid item, but uses a lot of grid item functionality.

    #wireH;
    #wireV;
    #ordering;
    #fliptest;
    #debugElement;
    #color;

    constructor(app, grid, x1, y1, x2, y2, ordering = null, color = null, fliptest = null) {
        assert.class(Application, app);
        assert.class(Grid, grid);
        assert.number(x1);
        assert.number(y1);
        assert.number(x2);
        assert.number(y2);
        assert.string(ordering, true);
        assert.integer(color, true);
        assert.function(fliptest, true);

        super(app, 0, 0);
        this.grid = grid;

        [ x1, y1 ] = Grid.align(x1, y1);
        [ x2, y2 ] = Grid.align(x2, y2);
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
        this.#ordering = ordering ?? 'hv';
        this.#color = color;
        this.#fliptest = fliptest ?? ( (x, y) => false );

        this.#wireH = new Wire(this.app, x1, y1, this.width, 'h', this.#color);
        this.#wireH.limbo = true;
        this.grid.addItem(this.#wireH, false);
        this.#wireH.element.classList.add('wire-building');

        this.#wireV = new Wire(this.app, x1, y1, this.height, 'v', this.#color);
        this.#wireV.limbo = true;
        this.grid.addItem(this.#wireV, false);
        this.#wireV.element.classList.add('wire-building');

        this.#updateWires();

        if (this.app.config.debugShowWireBox) {
            this.#debugElement = html(null, 'div', 'wirebuilder-debug');
            this.grid.addVisual(this.#debugElement);
        }
    }

    // Returns potentially flipped ordering.
    get ordering() {
        return this.#fliptest(this.x + this.width, this.y + this.height) ? this.#ordering === 'hv' ? 'vh' : 'hv' : this.#ordering;
    }

    // Hover hotkey actions
    onHotkey(key, action, what) {
        if (action !== 'down') {
            return;
        }
        if (key === 'r' && what.type === 'connect') {
            // add new corner when pressing R while dragging a wire
            const x = this.x + this.width;
            const y = this.y + this.height;
            // pass handling off to the previously created wirebuilder
            const flippedOrdering = this.#ordering !== what.ordering;
            const dragConnectionWhat = { ...what, ordering: flippedOrdering ? what.ordering == 'hv' ? 'vh' : 'hv' : what.ordering, x, y, color: this.#color };
            this.dragStop(x, y, what);
            this.grid.releaseHotkeyTarget(this, true);
            const wireBuilder = new WireBuilder(this.app, this.grid, what.startX, what.startY, x, y, what.ordering, this.#color);
            wireBuilder.dragStart(x, y, dragConnectionWhat);
            return true;
        }
    }

    // Called while a registered visual is being dragged.
    onDrag(x, y, status, what) {
        if (status === 'start') {
            what.startX = x;
            what.startY = y;
            this.app.setStatus('Drawing connection. <i>R</i> Add point, continue drawing from here.', true);
            this.grid.requestHotkeyTarget(this, true, { ...what, type: 'connect' }); // pass 'what' to onHotkey()
            return true;
        } else if (status !== 'stop') {
            this.#setBounding(what.startX, what.startY, x, y);
            return true;
        } else {
            this.app.clearStatus(true);
            this.grid.releaseHotkeyTarget(this, true);
            this.#remove();
            return true;
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
        if (this.app.config.debugShowWireBox) {
            this.grid.removeVisual(this.#debugElement);
            for (let i = 0; i < 3; ++i) {
                this.grid.removeVisual(this['debug' + i]);
            }
        }
        Wire.compact(this.grid);
        this.grid.markDirty();
        this.app.simulations.markDirty(this.grid.circuit);
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
        if (this.app.config.debugShowWireBox) {
            this.#debugRenderBox();
        }
    }

    // Updates wire positions from endpoints.
    #updateWires() {
        const x = this.x;
        const y = this.y ;
        const width = this.width;
        const height = this.height;
        if (this.ordering === 'hv') {
            // horizontal first, then vertical
            const hx = width < 0 ? x + width : x;
            const hw = Math.abs(width);
            this.#wireH.setDimensions(hx, y, hw, 'h');

            const vy = height < 0 ? y + height : y;
            const vh = Math.abs(height);
            this.#wireV.setDimensions(x + width, vy, vh, 'v');
        } else {
            // vertical first, then horizontal
            const vy = height < 0 ? y + height : y;
            const vh = Math.abs(height);
            this.#wireV.setDimensions(x, vy, vh, 'v');

            const hx = width < 0 ? x + width : x;
            const hw = Math.abs(width);
            this.#wireH.setDimensions(hx, y + height, hw, 'h');
        }
    }

    // Returns the 2 or 3 distinct endpoint coordinates of this wire corner.
    #points() {
        const mk = (x, y) => new Point(x, y);
        const points = [ mk(this.x, this.y) ];
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
        const v = this.visual;
        const hx = v.width < 0 ? v.x + v.width : v.x;
        const hy = v.height < 0 ? v.y + v.height : v.y;
        this.#debugElement.style.left = hx + "px";
        this.#debugElement.style.top = hy + "px";
        this.#debugElement.style.width = Math.abs(v.width) + "px";
        this.#debugElement.style.height = Math.abs(v.height) + "px";
        const points = this.#points();
        for (let i = 0; i < 3; ++i) {
            this['debug' + i] = this.grid.debugPoint(i < points.length ? points[i] : null, i, this['debug' + i] ?? null);
        }
        this.#debugElement.innerHTML = '<span>' + points.map((p) => JSON.stringify(p)).join('<br>') + '</span>';
    }
}
