"use strict";

// Custom text
class Text extends GridItem {

    static #EDIT_DIALOG = [
        { name: 'text', label: 'text', type: 'string' },
        { name: 'maxLength', label: 'Line width', type: 'int', check: (v, f) => { const p = Number.parseInt(v); return isFinite(p) && p >= Grid.SPACING; } },
        //...Component.EDIT_DIALOG,
    ];

    #element;
    #color;
    #text;
    #rotation;

    constructor(app, x, y, rotation, maxLength = 180, text = 'Placeholder text. Press e to edit.', color = null) {
        assert.string(text);
        assert.integer(maxLength);
        assert.integer(color, true);
        super(app, x, y);
        this.width = maxLength;
        this.height = Grid.SPACING;
        this.#text = text;
        this.#color = color ?? null;
        this.#rotation = rotation ?? null;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.#rotation, this.width, this.#text, this.#color ]},
        };
    }

    // Link wire to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.#element = element(null, 'div', 'text text-' + this.#rotation); // not assigning contents here since we don't want to use innerHTML
        this.#element.innerText = this.#text;
        this.setHoverMessage(this.#element, () => `Text element. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.registerMouseAction(this.#element, { type: "component", grabOffsetX: null, grabOffsetY: null });
        this.grid.addVisual(this.#element);
    }

    // Removes the component from the grid.
    unlink() {
        this.grid.removeVisual(this.#element);
        this.#element = null;
        super.unlink();
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

    // Hover hotkey actions
    onHotkey(key, what) {
        if (key === 'r' && what.type === 'hover') {
            // rotate component with R while mouse is hovering
            this.rotation += 1;
            this.#element.classList.add('component-rotate-animation');
            setTimeout(() => {
                // queue class removal for next render call to avoid brief flickering
                this.redraw(() => this.#element.classList.remove('component-rotate-animation'));
            }, 150);
            return true;
        } else if (key === 'Delete' && what.type === 'hover') {
            this.#element.classList.add('component-delete-animation');
            setTimeout(() => {
                if (this.#element) { // deletion might already be in progress
                    this.#element.classList.remove('component-delete-animation');
                    this.grid.removeItem(this);
                }
            }, 150);
            return true;
        } else if (key === 'e' && what.type === 'hover') {
            this.onEdit();
            return true;
        }
    }

    // Called while a registered visual is being dragged.
    onDrag(x, y, status, what) {
        // get offset between component top/left and mouse grab point
        if (status === 'start') {
            what.grabOffsetX ??= x - this.x;
            what.grabOffsetY ??= y - this.y;
        }
        if (super.onDrag(x, y, status, what)) {
            return true;
        } else  {
            this.setPosition(x - what.grabOffsetX, y - what.grabOffsetY, status === 'stop');
            return true;
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure splitter", Text.#EDIT_DIALOG, { text: this.#text, maxLength: this.width, rotation: this.rotation });
        if (config) {
            this.#text = config.text;
            this.width = config.maxLength;
            this.#rotation = config.rotation;
            this.redraw();
        }
    }

    // Renders the connection onto the grid.
    render() {
        if (!super.render()) {
            return false;
        }
        const v = this.visual;
        this.#element.style.left = v.x + "px";
        this.#element.style.top = v.y + "px";
        this.#element.style.width = v.width + "px";
        this.#element.style.height = v.height + "px";
        if (this.dirty) {
            this.#element.innerText = this.#text;
        }
        return true;
    }
}
