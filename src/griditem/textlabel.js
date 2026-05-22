"use strict";

// Custom text
class TextLabel extends GridItem {

    static TYPE_LABEL = 'Text';
    static TYPE_LABEL_LONG = 'Text element';
    static TYPE_DESCRIPTION = 'Userdefined text message.';

    static EDIT_DIALOG = [
        { name: 'text', label: 'Text', type: 'string', check: (v, f) => v.trim().length > 0 },
        { name: 'fontSize', label: 'Font size', type: 'select', options: { "small": "Small", "medium": "Medium", "large": "Large" } },
        { name: 'color', label: 'Color', type: 'select', options: { "-": "White", "c0": "Mint", "c1": "Green", "c2": "Yellow", "c3": "Orange", "c4": "Red", "c5": "Ruby", "c6": "Magenta", "c7": "Purple", "c8": "Blue", "c9": "Turquoise" } },
        { name: 'maxLength', label: 'Max. width', type: 'int', postCheck: (v, f) => isFinite(v) && v >= Grid.SPACING },
        ...Component.EDIT_DIALOG,
    ];

    static #ctx = document.createElement('canvas').getContext('2d');

    #element;
    #inner;
    #dropPreview;
    #fontSize;
    #color;
    #text;
    #rotation;
    #computedWidth = {};

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
        this.#element = html(null, 'div', 'text');
        this.#inner = html(this.#element, 'span', 'inner'); // not assigning contents here since we don't want to use innerHTML
        this.#inner.innerText = this.#text;
        this.setHoverMessage(this.#inner, () => `<b>${this.typeLabel}</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
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

    // Returns the component type label used in text referring to what the component is.
    get typeLabel() {
        return this.constructor.TYPE_LABEL_LONG ?? this.constructor.TYPE_LABEL;
    }

    // Return whether the element is selected.
    get selected() {
        return this.#element?.classList.contains('selected') ?? false;
    }

    // Apply/remove component selection effect.
    set selected(status) {
        assert.bool(status, true);
        this.#element?.classList.toggle('selected', status);
    }

    // Return text color.
    get color() {
        return this.#color;
    }

    // Set text color.
    set color(value) {
        assert.integer(value, true);
        if (this.#color !== value) {
            this.#color = value;
            this.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;
        }
    }

    // Return text label rotation.
    get rotation() {
        return this.#rotation;
    }

    // Set text label rotation.
    set rotation(value) {
        //this.renderFlags |= GridItem.NEEDS_FULL_RENDER;
        this.#rotation = value & 3;
    }

    // Returns the effective bounding box for area selection, accounting for rotation.
    get selectionBounds() {
        if (this.#rotation === 1 || this.#rotation === 3) {
            const b = super.selectionBounds;
            const cx = this.x + this.width / 2;
            const cy = this.y + this.height / 2;
            return { x: cx - b.height / 2, y: cy - b.width / 2, width: b.height, height: b.width };
        }
        return super.selectionBounds;
    }

    // Snap to grid points (n*SPACING) rather than the default midpoints (n*SPACING - SPACING/2)
    align(x, y) {
        const half = Grid.SPACING / 2;
        const [ax, ay] = Grid.align(x - half, y - half);
        return [ax + half, ay + half];
    }

    // Returns true if the search string matches text.
    match(string) {
        assert.string(string);
        return this.#text.toLowerCase().includes(string);
    }

    // Hover hotkey actions
    onHotkey(key, action, what) {
        if (action !== 'down') {
            return;
        }
        if (key === 'r' && what.type === 'hover') {
            this.animateAction(this.#element, 'component-rotate', () => {
                // rotate component with R while mouse is hovering
                this.#rotation = (this.#rotation + 1) & 3;
                this.app.config.placementDefaults.textlabel ??= {};
                this.app.config.placementDefaults.textlabel.rotation = this.#rotation;
            });
            return true;
        } else if (key === 'Delete' && what.type === 'hover') {
            this.animateAction(this.#element, 'component-delete', null, () => {
                if (this.#element) { // deletion might already be in progress
                    this.grid.removeItem(this);
                }
            });
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
            if (status === 'stop') {
                this.grid.trackAction(what.isNew ? 'Add text label' : 'Move text label');
            }
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
                this.#dropPreview = html(null, 'div', 'text-drop-preview');
                this.grid.addVisual(this.#dropPreview);
            }
            const [ alignedX, alignedY ] = this.align(this.x, this.y);
            const [ visualX, visualY ] = this.gridToVisual(alignedX, alignedY);
            this.#dropPreview.style.left = visualX + "px";
            this.#dropPreview.style.top = visualY + "px";
            this.#dropPreview.style.width = this.#element.offsetWidth + "px";
            this.#dropPreview.style.height = this.#element.offsetHeight + "px";
            this.#dropPreview.style.transform = this.#rotation ? 'rotate(' + (this.#rotation * 90) + 'deg)' : '';
        } else {
            this.grid.removeVisual(this.#dropPreview);
            this.#dropPreview = null;
            what.grabOffsetX = null;
            what.grabOffsetY = null;
            this.redraw();
        }
    }

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    static editDialogConfig(_descriptor, defaults = {}) {
        return {
            title: 'Configure text element',
            fields: TextLabel.EDIT_DIALOG,
            data: {
                text: defaults.text ?? 'Placeholder text. Press e to edit.',
                maxLength: defaults.maxLength ?? 180,
                fontSize: defaults.fontSize ?? 'small',
                color: defaults.color ?? '-',
                rotation: defaults.rotation ?? 0,
            },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.textlabel;
    }

    // Handle edit hotkey.
    async onEdit() {
        const { title, fields, data } = TextLabel.editDialogConfig({}, {
            text: this.#text,
            maxLength: this.width,
            fontSize: this.#fontSize,
            color: this.#color === null ? '-' : 'c' + this.#color,
            rotation: this.#rotation,
        });
        const config = await dialog(title, fields, data);
        if (config) {
            this.#text = config.text;
            this.width = config.maxLength;
            this.#fontSize = config.fontSize;
            this.#color = config.color === '-' ? null : Number.parseInt(config.color.slice(1));
            this.#rotation = config.rotation;
            this.#computedWidth = {};
            this.redraw();
            this.grid.trackAction('Edit text label');
        }
    }

    // Measures the natural pixel width of the text at current font settings.
    #computeWidth() {
        TextLabel.#ctx.font = getComputedStyle(this.#inner).font;
        const padding = 5 * 2 * this.grid.zoom; // compensate padding on `.text > .inner` padding
        return Math.ceil(Math.max(...this.#text.split('\n').map(line => TextLabel.#ctx.measureText(line).width))) + padding;
    }

    // Renders the text label onto the grid.
    renderFull() {
        if (!super.renderFull()) {
            return false;
        }
        const v = this.visual;
        this.#element.style.left = v.x + "px";
        this.#element.style.top = v.y + "px";
        this.#element.style.height = 'auto';
        this.#element.setAttribute('data-text-rotation', this.#rotation);
        this.renderDetail(); // apply font classes before measuring
        this.#computedWidth[`z${this.grid.zoom}`] ??= this.#computeWidth();
        this.#element.style.width = Math.min(this.#computedWidth[`z${this.grid.zoom}`], v.width) + 'px';
        return true;
    }

    // Updates text content and styling.
    renderDetail() {
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

    // Updates CSS left/top position only.
    renderPosition() {
        const v = this.visual;
        this.#element.style.left = v.x + "px";
        this.#element.style.top = v.y + "px";
    }

    // Returns default button label and hover message for component factory buttons.
    static descriptorInfo(_desc) {
        return { label: this.TYPE_LABEL ?? this.name /*the classname*/, hoverMessage: `<b>${this.TYPE_LABEL_LONG ?? this.TYPE_LABEL ?? this.name}</b>. ${this.TYPE_DESCRIPTION ?? ''}` };
    }

    static fromDescriptor(app, _desc, overrideDefaults = {}) {
        const d = app.config.placementDefaults;
        return (grid, x, y) => {
            const rotation = overrideDefaults.rotation ?? d.textlabel.rotation;
            const maxLength = overrideDefaults.maxLength ?? 180;
            const text = overrideDefaults.text ?? 'Placeholder text. Press e to edit.';
            const fontSize = overrideDefaults.fontSize ?? 'small';
            const colorStr = overrideDefaults.color ?? '-';
            const color = colorStr === '-' ? null : Number.parseInt(colorStr.slice(1));
            return grid.addItem(new TextLabel(app, x, y, rotation, maxLength, text, fontSize, color), false);
        };
    }
}

GridItem.CLASSES['TextLabel'] = TextLabel;
