"use strict";

// Used to build wire corners.
class WireBuilder extends GridItem {

    static DEBUG_BOX = false;
    static DRAWING_CONNECTION_MESSAGE = 'Drawing connection. <i>R</i>: Add point, continue drawing from here.';

    #wireH;
    #wireV;
    #ordering;
    #fliptest;
    width;
    height;
    color;

    constructor(grid, x1, y1, x2, y2, ordering = null, color = null, fliptest = null) {
        assert.object(grid);
        assert.number(x1);
        assert.number(y1);
        assert.number(x2);
        assert.number(y2);
        assert.string(ordering, true);
        assert.number(color, true);
        assert.function(fliptest, true);

        super();
        this.grid = grid;

        [ x1, y1 ] = this.gridAlign(x1, y1);
        [ x2, y2 ] = this.gridAlign(x2, y2);
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
        this.#ordering = ordering ?? 'hv';
        this.color = color ?? this.grid.nextNetColor;
        this.#fliptest = fliptest ?? ( (x, y) => false );

        this.#wireH = new Wire(x1, y1, this.width, 'h', this.color);
        this.#wireH.link(grid);
        this.#wireH.element.classList.add('wire-building');
        this.#wireV = new Wire(x1, y1, this.height, 'v', this.color);
        this.#wireV.link(grid);
        this.#wireV.element.classList.add('wire-building');
        this.#updateWires();

        if (WireBuilder.DEBUG_BOX) {
            this.debug = document.createElement('div');
            this.debug.classList.add('wirebuilder-debug');
            this.grid.addVisual(this.debug);
            for (let i = 0; i < 3; ++i) {
                this['debug' + i] = document.createElement('div');
                this['debug' + i].classList.add('wirebuilder-debug-point', 'wirebuilder-debug-point' + i);
                this.grid.addVisual(this['debug' + i]);
            }
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
            let wireBuilder = new WireBuilder(this.grid, what.startX, what.startY, x, y, what.ordering, this.color);
            wireBuilder.dragStart(x, y, dragConnectionWhat);
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
            this.setBounding(what.startX, what.startY, x, y);
            this.render();
        } else {
            app.clearStatus(true);
            this.grid.releaseHotkeyTarget(this, true);
            this.grid.circuit.invalidateNets();
            let grid = this.grid;
            this.remove();//unsets grid
            grid.render();
        }
    }

    // Upon removal of the builder also remove any zero length wires produced by it.
    remove() {
        this.#wireH.element.classList.remove('wire-building');
        this.#wireV.element.classList.remove('wire-building');
        if (this.width === 0) {
            this.#wireH.remove();
        }
        if (this.height === 0) {
            this.#wireV.remove();
        }
        if (WireBuilder.DEBUG_BOX) {
            this.grid.removeVisual(this.debug);
            for (let i = 0; i < 3; ++i) {
                this.grid.removeVisual(this['debug' + i]);
            }
        }
        super.remove();
    }

    // Sets wire corner bounding box.
    setBounding(x1, y1, x2, y2) {
        [ x1, y1 ] = this.gridAlign(x1, y1);
        [ x2, y2 ] = this.gridAlign(x2, y2);
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
        this.#updateWires();
    };

    // Renders the wires onto the grid.
    render() {
        this.#wireH.render();
        this.#wireV.render();
        if (WireBuilder.DEBUG_BOX) {
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
        let z = this.grid.zoom;
        let x0 = this.grid.offsetX;
        let y0 = this.grid.offsetY;
        let hx = this.width < 0 ? this.x + this.width : this.x;
        let hy = this.height < 0 ? this.y + this.height : this.y;
        this.debug.style.left = (x0 + hx * z) + "px";
        this.debug.style.top = (y0 + hy * z) + "px";
        this.debug.style.width = Math.abs(this.width * z) + "px";
        this.debug.style.height = Math.abs(this.height * z) + "px";
        let points = this.#points();
        for (let i = 0; i < 3; ++i) {
            this.#debugRenderPoint(i, i < points.length ? points[i] : null);
        }
        this.debug.innerHTML = '<span>' + points.map((p) => JSON.stringify(p)).join('<br>') + '</span>';
    }

    // Renders a debug point on one of the 3 distinct wire corner/end points.
    #debugRenderPoint(i, c) {
        if (c === null) {
            this['debug' + i].style.display = 'none';
        } else {
            let x = c.x;
            let y = c.y;
            let vx = (x + this.grid.offsetX) * this.grid.zoom;
            let vy = (y + this.grid.offsetY) * this.grid.zoom;
            this['debug' + i].style.display = 'block';
            this['debug' + i].style.left = (vx - 6) + 'px';
            this['debug' + i].style.top = (vy - 6) + 'px';
        }
    }
}
