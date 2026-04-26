"use strict";

class TrimBox {

    #element;
    #overlays = [];
    #grid;

    constructor(grid, container) {
        this.#grid = grid;
        this.#element = html(container, 'div', 'grid-selection grid-selection-trim hidden');
    }

    // Shows the trim box, rendering it at the given pixel coordinates (w/h may be negative).
    renderBox(x, y, width, height) {
        assert.number(x);
        assert.number(y);
        assert.number(width);
        assert.number(height);
        [ x, y, width, height ] = TrimBox.#normalizeRect(x, y, width, height);
        this.#element.style.left   = x + 'px';
        this.#element.style.top    = y + 'px';
        this.#element.style.width  = width  + 'px';
        this.#element.style.height = height + 'px';
        const gx1 = x / this.#grid.zoom - this.#grid.offsetX;
        const gy1 = y / this.#grid.zoom - this.#grid.offsetY;
        this.#updateOverlays(gx1, gy1, gx1 + width / this.#grid.zoom, gy1 + height / this.#grid.zoom);
    }

    // Shows the trim box element.
    show() {
        this.#element.classList.remove('hidden');
    }

    // Hides the trim box element.
    hide() {
        this.#element.classList.add('hidden');
    }

    // Removes all active trim overlay elements.
    clearOverlays() {
        for (const el of this.#overlays) el.remove();
        this.#overlays = [];
    }

    // Removes the portions of wires inside the pixel-space rectangle (x, y, w, h may be negative).
    execute(x, y, w, h) {
        assert.number(x);
        assert.number(y);
        assert.number(w);
        assert.number(h);
        [ x, y, w, h ] = TrimBox.#normalizeRect(x, y, w, h);
        const gx1 = x / this.#grid.zoom - this.#grid.offsetX;
        const gy1 = y / this.#grid.zoom - this.#grid.offsetY;
        const gx2 = gx1 + w / this.#grid.zoom;
        const gy2 = gy1 + h / this.#grid.zoom;
        const segments = [];
        this.#forEachTrimSegment(gx1, gy1, gx2, gy2, (...args) => segments.push(args));
        if (segments.length === 0) return;
        for (const [ wire, fixed, wireStart, wireEnd, trimA, trimB, dir ] of segments) {
            this.#grid.removeItem(wire, false);
            if (wireStart < trimA)
                this.#grid.addItem(new Wire(this.#grid.app, dir === 'h' ? wireStart : fixed, dir === 'h' ? fixed : wireStart, trimA - wireStart, dir, wire.color), false);
            if (trimB < wireEnd)
                this.#grid.addItem(new Wire(this.#grid.app, dir === 'h' ? trimB : fixed, dir === 'h' ? fixed : trimB, wireEnd - trimB, dir, wire.color), false);
        }
        this.#grid.selection.prune();
        this.#grid.markWiresChanged();
    }

    static #normalizeRect(x, y, w, h) {
        if (w < 0) { x += w; w = -w; }
        if (h < 0) { y += h; h = -h; }
        return [ x, y, w, h ];
    }

    // Iterates over wire segments that fall inside [gx1,gy1] - [gx2,gy2] with inward-snapped boundaries.
    // Calls callback(wire, fixed, wireStart, wireEnd, trimA, trimB, dir) for each affected segment.
    // fixed = the perpendicular coordinate; wireStart/End = full wire span; trimA/B = trimmed span; dir = 'h'|'v'.
    #forEachTrimSegment(gx1, gy1, gx2, gy2, callback) {
        const s = Grid.SPACING / 2;
        const snapIn  = (v) => Math.ceil( (v + s) / Grid.SPACING) * Grid.SPACING - s;
        const snapOut = (v) => Math.floor((v + s) / Grid.SPACING) * Grid.SPACING - s;
        const snapX1 = snapIn(gx1),  snapX2 = snapOut(gx2);
        const snapY1 = snapIn(gy1),  snapY2 = snapOut(gy2);
        for (const wire of this.#grid.items) {
            if (!(wire instanceof Wire)) continue;
            const [ p1, p2 ] = wire.points();
            if (wire.width !== 0) {
                const wy = p1.y;
                if (wy < gy1 || wy > gy2) continue;
                const wx1 = Math.min(p1.x, p2.x), wx2 = Math.max(p1.x, p2.x);
                const trimLeft = Math.max(wx1, snapX1), trimRight = Math.min(wx2, snapX2);
                if (trimLeft < trimRight) callback(wire, wy, wx1, wx2, trimLeft, trimRight, 'h');
            } else {
                const wx = p1.x;
                if (wx < gx1 || wx > gx2) continue;
                const wy1 = Math.min(p1.y, p2.y), wy2 = Math.max(p1.y, p2.y);
                const trimTop = Math.max(wy1, snapY1), trimBottom = Math.min(wy2, snapY2);
                if (trimTop < trimBottom) callback(wire, wx, wy1, wy2, trimTop, trimBottom, 'v');
            }
        }
    }

    // Creates/updates overlay divs highlighting the wire segments that will be trimmed.
    #updateOverlays(gx1, gy1, gx2, gy2) {
        for (const el of this.#overlays) el.remove();
        this.#overlays = [];
        const thickness = 3 * this.#grid.zoom, t = thickness / 2;
        this.#forEachTrimSegment(gx1, gy1, gx2, gy2, (wire, fixed, _ws, _we, trimA, trimB, dir) => {
            const div = document.createElement('div');
            div.className = 'wire-trim-overlay';
            if (dir === 'h') {
                div.style.left   = (trimA + this.#grid.offsetX) * this.#grid.zoom - t + 'px';
                div.style.top    = (fixed + this.#grid.offsetY) * this.#grid.zoom - t + 'px';
                div.style.width  = (trimB - trimA) * this.#grid.zoom + thickness + 'px';
                div.style.height = thickness + 'px';
            } else {
                div.style.left   = (fixed + this.#grid.offsetX) * this.#grid.zoom - t + 'px';
                div.style.top    = (trimA + this.#grid.offsetY) * this.#grid.zoom - t + 'px';
                div.style.width  = thickness + 'px';
                div.style.height = (trimB - trimA) * this.#grid.zoom + thickness + 'px';
            }
            this.#element.parentNode.appendChild(div);
            this.#overlays.push(div);
        });
    }
}
