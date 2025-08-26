"use strict";

class WireBuilder extends GridItem {

    static DEBUG_BOX = false;

    #wireH;
    #wireV;
    width;
    height;
    ordering;
    color;

    constructor(grid, x1, y1, x2, y2, ordering, color) {

        super(grid);

        [ x1, y1 ] = this.gridAlign(x1, y1);
        [ x2, y2 ] = this.gridAlign(x2, y2);
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
        this.ordering = ordering ?? 'hv';
        this.color = color ?? 0;

        this.#wireH = new Wire(this.grid, x1, y1, this.width, 'h', this.color);
        this.#wireV = new Wire(this.grid, x1, y1, this.height, 'v', this.color);
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

    // Gets the screen width for this wire corner.
    get visualWidth() {
        return this.width * this.grid.zoom;
    }

    // Gets the screen height for this wire corner.
    get visualHeight() {
        return this.height * this.grid.zoom;
    }

    // Upon removal of the builder also remove any zero length wires produced by it.
    remove() {
        if (this.width === 0) {
            this.#wireH.remove();
        }
        if (this.height === 0) {
            this.#wireV.remove();
        }
        super.remove();
    }

    // Sets wire corner endpoints, optionally aligned to the grid.
    setEndpoints(x1, y1, x2, y2, aligned) {
        if (aligned) {
            [ x1, y1 ] = this.gridAlign(x1, y1);
            [ x2, y2 ] = this.gridAlign(x2, y2);
        }
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
        this.#updateWires();
    };

    // Returns the 2 or 3 distinct endpoint coordinates of this wire corner.
    getPoints() {

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

    // Renders the wires onto the grid.
    render() {
        this.#wireH.render();
        this.#wireV.render();
        if (WireBuilder.DEBUG_BOX) {
            let z = this.grid.zoom;
            let x0 = this.grid.offsetX;
            let y0 = this.grid.offsetY;
            let hx = width < 0 ? x + width : x;
            let hy = height < 0 ? y + height : y;
            this.debug.style.left = (x0 + hx * z) + "px";
            this.debug.style.top = (y0 + hy * z) + "px";
            this.debug.style.width = Math.abs(width * z) + "px";
            this.debug.style.height = Math.abs(height * z) + "px";
            let points = this.getPoints();
            for (let i = 0; i < 3; ++i) {
                this.#debugPoint(i, i < points.length ? points[i] : null);
            }
            this.debug.innerHTML = '<span>' + points.map((p) => JSON.stringify(p)).join('<br>') + '</span>';
        }
    }

    // Renders a debug point on one of the 3 distinct wire corner/end points.
    #debugPoint(i, c) {
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
            this.#wireH.setEndpoints(x, vy, vh, 'v');

            let hx = width < 0 ? x + width : x;
            let hw = Math.abs(width);
            this.#wireV.setEndpoints(hx, y + height, hw, 'h');
        }
    }
}
