"use strict";

// Custom text
class TextLabel extends GridItem {

    static #EDIT_DIALOG = [
        { name: 'text', label: 'Text', type: 'string', check: (v, f) => v.trim().length > 0 },
        { name: 'fontSize', label: 'Font size', type: 'select', options: { "small": "Small", "medium": "Medium", "large": "Large" } },
        { name: 'color', label: 'Color', type: 'select', options: { "-": "White", "c0": "Mint", "c1": "Green", "c2": "Yellow", "c3": "Orange", "c4": "Red", "c5": "Ruby", "c6": "Magenta", "c7": "Purple", "c8": "Blue", "c9": "Turquoise" } },
        { name: 'maxLength', label: 'Max. width', type: 'int', check: (v, f) => { const p = Number.parseInt(v); return isFinite(p) && p >= Grid.SPACING; } },
        ...Component.EDIT_DIALOG,
    ];

    #element;
    #inner;
    #dropPreview;
    #fontSize;
    #color;
    #text;
    #rotation;

    constructor(app, x, y, rotation, maxLength = 180, text = 'Placeholder text. Press e to edit.', fontSize = 'small', color = null) {
        assert.integer(rotation);
        assert.integer(maxLength);
        assert.string(text);
        assert.string(fontSize);
        assert.integer(color, true);
        super(app, x, y);
        this.width = maxLength;
        this.height = Grid.SPACING;
        this.#text = text;
        this.#fontSize = fontSize;
        this.#color = color;
        this.#rotation = rotation & 3;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.#rotation, this.width, this.#text, this.#fontSize, this.#color ],
        };
    }

    // Link wire to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.#element = element(null, 'div', 'text');
        this.#inner = element(this.#element, 'span', 'inner'); // not assigning contents here since we don't want to use innerHTML
        this.#inner.innerText = this.#text;
        this.setHoverMessage(this.#inner, () => `Text element. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.registerMouseAction(this.#inner, { type: "component", grabOffsetX: null, grabOffsetY: null });
        this.grid.addVisual(this.#element);
    }

    // Removes the component from the grid.
    unlink() {
        this.#inner?.remove();
        this.#inner = null;
        this.grid.removeVisual(this.#element);
        this.#element = null;
        this.#dropPreview?.remove();
        this.#dropPreview = null;
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

    // Return text color.
    get color() {
        return this.#color;
    }

    // Set text color.
    set color(value) {
        assert.integer(value, true);
        this.dirty ||= this.#color !== value;
        this.#color = value;
    }

    // Hover hotkey actions
    onHotkey(key, action, what) {
        if (action !== 'down') {
            return;
        }
        if (key === 'r' && what.type === 'hover') {
            // rotate component with R while mouse is hovering
            this.#rotation = (this.#rotation + 1) & 3;
            this.app.config.placementDefaults.textlabel ??= {};
            this.app.config.placementDefaults.textlabel.rotation = this.#rotation;
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
        if (super.onDrag(x, y, status, what)) {
            return true;
        } else if (what.type === 'component') {
            this.onMove(x, y, status, what);
            return true;
        }
    }

    // Draw drop preview while moving component.
    onMove(x, y, status, what) {
        // get offset between component top/left and mouse grab point
        if (status === 'start') {
            what.grabOffsetX ??= x - this.x;
            what.grabOffsetY ??= y - this.y;
        }
        // set new position, align it on stop
        this.setPosition(x - what.grabOffsetX, y - what.grabOffsetY, status === 'stop');
        // draw grid-aligned drop-preview outline
        if (status !== 'stop') {
            if (!this.#dropPreview) {
                this.#dropPreview = element(null, 'div', 'text-drop-preview');
                this.grid.addVisual(this.#dropPreview);
            }
            const [ alignedX, alignedY ] = Grid.align(this.x, this.y);
            const [ visualX, visualY ] = this.gridToVisual(alignedX, alignedY);
            this.#dropPreview.style.left = visualX + "px";
            this.#dropPreview.style.top = visualY + "px";
            this.#dropPreview.style.width = this.#element.offsetWidth + "px";
            this.#dropPreview.style.height = this.#element.offsetHeight + "px";
        } else {
            this.grid.removeVisual(this.#dropPreview);
            this.#dropPreview = null;
            what.grabOffsetX = null;
            what.grabOffsetY = null;
            this.redraw();
        }
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure text element", TextLabel.#EDIT_DIALOG, { text: this.#text, maxLength: this.width, fontSize: this.#fontSize, color: this.#color === null ? '-' : 'c' + this.#color, rotation: this.#rotation });
        if (config) {
            this.#text = config.text;
            this.width = config.maxLength;
            this.#fontSize = config.fontSize;
            this.#color = config.color === '-' ? null : Number.parseInt(config.color.slice(1));
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
        this.#element.style.maxWidth = v.width + "px";
        this.#element.style.width = 'auto';
        this.#element.style.height = 'auto';
        this.#element.setAttribute('data-text-rotation', this.#rotation);

        if (this.dirty) {
            this.#inner.innerText = this.#text;
            if (this.#color !== null) {
                this.#inner.setAttribute('data-net-color', '' + this.#color);
            } else {
                this.#inner.removeAttribute('data-net-color');
            }
            for (const size of [ 'small', 'medium', 'large' ]) {
                this.#element.classList.toggle(`size-${size}`, this.#fontSize === size);
            }
        }
        return true;
    }
}
