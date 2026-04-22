"use strict";

class Selection {

    #items = [];
    #hadWires = false;
    #element;
    #grid;
    #onInvalidate;

    // onInvalidate() is called when selection state is invalidated.
    constructor(grid, element, onInvalidate) {
        this.#grid = grid;
        this.#element = element;
        this.#onInvalidate = onInvalidate;
    }

    // Returns the current selection items array.
    get items() { return this.#items; }

    // Adds item to selection and marks it as selected.
    add(item) {
        assert.class(GridItem, item);
        item.selected = true;
        this.#items.push(item);
        this.#doInvalidate();
    }

    // Removes item from selection and clears its selected state.
    remove(item) {
        assert.class(GridItem, item);
        const idx = this.#items.indexOf(item);
        if (idx < 0) return;
        this.#items.swapRemove(idx);
        item.selected = false;
        this.#doInvalidate();
    }

    // Replaces selection with given items, updating selected state on all affected items.
    set(items) {
        assert.array(items);
        for (const item of this.#items) item.selected = false;
        this.#items = items.slice();
        for (const item of this.#items) item.selected = true;
        this.#doInvalidate();
    }

    // Clears the selection.
    clear() {
        this.set([]);
    }

    // Clears selection state without triggering onWiresChanged. Use when switching circuits,
    // where deferred wire compact should not carry over to the incoming circuit.
    reset() {
        for (const item of this.#items) {
            item.selected = false;
        }
        this.#items = [];
        this.#hadWires = false;
        this.#onInvalidate();
    }

    // Removes items no longer on the grid from the selection.
    prune() {
        if (this.#items.length > 0) {
            this.#items = this.#items.filter(item => item.grid === this.#grid);
            this.#hadWires = this.#items.some(w => w instanceof Wire);
        }
    }

    // Invalidates selection state, triggering the onInvalidate callback.
    invalidate() {
        this.#doInvalidate();
    }

    // Renders the selection box and updates item selected states based on overlap with the box.
    renderBox(x, y, width, height, addSelection) {
        assert.number(x);
        assert.number(y);
        assert.number(width);
        assert.number(height);
        assert.bool(addSelection);
        if (width < 0)  {
            x += width;
            width = -width;
        }
        if (height < 0) {
            y += height;
            height = -height;
        }
        this.#element.style.left   = x + 'px';
        this.#element.style.top    = y + 'px';
        this.#element.style.width  = width  + 'px';
        this.#element.style.height = height + 'px';
        this.#element.classList.remove('hidden');
        const sX      = x      / this.#grid.zoom - this.#grid.offsetX;
        const sY      = y      / this.#grid.zoom - this.#grid.offsetY;
        const sWidth  = width  / this.#grid.zoom;
        const sHeight = height / this.#grid.zoom;
        for (const c of this.#grid.circuit.items) {
            const currentlySelected = this.#items.indexOf(c) > -1;
            const b = c.selectionBounds;
            if (b.x >= sX && b.y >= sY && b.x + b.width <= sX + sWidth && b.y + b.height <= sY + sHeight) {
                c.selected = addSelection;
            } else {
                c.selected = currentlySelected;
            }
        }
    }

    // Hides the selection box element.
    removeBox() {
        this.#element.classList.add('hidden');
    }

    #doInvalidate() {
        const hadWires = this.#hadWires;
        const hasWires = this.#items.some(w => w instanceof Wire);
        this.#hadWires = hasWires;
        if (this.#items.length === 0 && hadWires) {
            this.#grid.onWiresChanged();
        }
        this.#onInvalidate();
    }
}
