"use strict";

// Visual group box (fieldset-style label over a bordered, semi-transparent box). Purely visual, no effect on simulation.
class Group extends GridItem {

    static TYPE_LABEL = 'Group';
    static TYPE_LABEL_LONG = 'Group box';
    static TYPE_DESCRIPTION = 'Visual grouping box with a label. No effect on simulation.';

    static COLOR_BG_BLACK = 10;

    static COLOR_OPTIONS = { "-": "White", "c0": "Mint", "c1": "Green", "c2": "Yellow", "c3": "Orange", "c4": "Red", "c5": "Ruby", "c6": "Magenta", "c7": "Purple", "c8": "Blue", "c9": "Turquoise" };
    static BGCOLOR_OPTIONS = { ...Group.COLOR_OPTIONS, "k": "Black" };

    static EDIT_DIALOG = [
        { name: 'label', label: 'Label', type: 'string', check: (v, f) => v.trim().length > 0 },
        { name: 'fontSize', label: 'Font size', type: 'select', options: { "small": "Small", "medium": "Medium", "large": "Large" } },
        { name: 'color', label: 'Text color', type: 'select', options: Group.COLOR_OPTIONS },
        { name: 'bgColor', label: 'Background', type: 'select', options: Group.BGCOLOR_OPTIONS },
        { name: 'width', label: 'Width', type: 'int', postCheck: (v, f) => isFinite(v) && v >= Grid.SPACING },
        { name: 'height', label: 'Height', type: 'int', postCheck: (v, f) => isFinite(v) && v >= Grid.SPACING },
    ];

    #element;
    #fill;
    #labelEl;
    #resizeHandle;
    #dropPreview;
    #fontSize;
    #color;
    #bgColor;
    #label;

    constructor(app, x, y, width = 240, height = 120, label = 'Group', fontSize = 'small', color = null, bgColor = null) {
        assert.integer(width);
        assert.integer(height);
        assert.string(label);
        assert.string(fontSize);
        assert.integer(color, true);
        assert.integer(bgColor, true);
        super(app, x, y);
        this.width = width;
        this.height = height;
        this.#label = label;
        this.#fontSize = fontSize;
        this.#color = color;
        this.#bgColor = bgColor;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.width, this.height, this.#label, this.#fontSize, this.#color, this.#bgColor ],
        };
    }

    // Link wire to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.#element = html(null, 'div', 'group');
        this.#fill = html(this.#element, 'div', 'group-fill');
        this.#labelEl = html(this.#element, 'span', 'group-label');
        this.setHoverMessage(this.#labelEl, () => `<b>${this.typeLabel}</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.registerMouseAction(this.#labelEl, { type: 'component', grabOffsetX: null, grabOffsetY: null });
        this.#resizeHandle = html(this.#element, 'div', 'group-resize');
        this.registerMouseAction(this.#resizeHandle, { type: 'resize' });
        this.grid.addVisual(this.#element);
    }

    // Removes the component from the grid.
    unlink() {
        this.#resizeHandle?.remove();
        this.#resizeHandle = null;
        this.#labelEl?.remove();
        this.#labelEl = null;
        this.#fill?.remove();
        this.#fill = null;
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

    // Return group box label text.
    get label() {
        return this.#label;
    }

    // Set group box label text.
    set label(value) {
        assert.string(value);
        if (this.#label !== value) {
            this.#label = value;
            this.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;
        }
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

    // Return background color.
    get bgColor() {
        return this.#bgColor;
    }

    // Set background color.
    set bgColor(value) {
        assert.integer(value, true);
        if (this.#bgColor !== value) {
            this.#bgColor = value;
            this.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;
        }
    }

    // Snap to grid points (n*SPACING) rather than the default midpoints (n*SPACING - SPACING/2)
    align(x, y) {
        const half = Grid.SPACING / 2;
        const [ax, ay] = Grid.align(x - half, y - half);
        return [ax + half, ay + half];
    }

    // Returns true if the search string matches the group label.
    match(string) {
        assert.string(string);
        return this.#label.toLowerCase().includes(string);
    }

    // Hover hotkey actions
    onHotkey(key, action, what) {
        if (action !== 'down') {
            return;
        }
        if (key === 'Delete' && what.type === 'hover') {
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
        if (what.type === 'resize') {
            // resize box: snap bottom right corner of box to cursor grid point
            if (status === 'start') {
                this.#element.classList.add('resizing'); // keep drag handle visible while cursor leaves the box
            }
            const [ snappedX, snappedY ] = this.align(x, y);
            this.width = Math.max(Grid.SPACING, snappedX - this.x);
            this.height = Math.max(Grid.SPACING, snappedY - this.y);
            if (status === 'stop') {
                this.#element.classList.remove('resizing');
                this.redraw();
                this.grid.trackAction('Resize group');
            }
            return true;
        } else if (super.onDrag(x, y, status, what)) {
            return true;
        } else if (what.type === 'component') {
            this.onMove(x, y, status, what);
            if (status === 'stop') {
                this.grid.trackAction(what.isNew ? 'Add group' : 'Move group');
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
                this.#dropPreview = html(null, 'div', 'group-drop-preview');
                this.grid.addVisual(this.#dropPreview);
            }
            const [ alignedX, alignedY ] = this.align(this.x, this.y);
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

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    static editDialogConfig(_descriptor, defaults = {}) {
        return {
            title: 'Configure group box',
            fields: Group.EDIT_DIALOG,
            data: {
                label: defaults.label ?? 'Group',
                width: defaults.width ?? 240,
                height: defaults.height ?? 120,
                fontSize: defaults.fontSize ?? 'small',
                color: defaults.color ?? '-',
                bgColor: defaults.bgColor ?? '-',
            },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.group;
    }

    // Handle edit hotkey.
    async onEdit() {
        const { title, fields, data } = Group.editDialogConfig({}, {
            label: this.#label,
            width: this.width,
            height: this.height,
            fontSize: this.#fontSize,
            color: this.#color === null ? '-' : 'c' + this.#color,
            bgColor: this.#bgColor === null ? '-' : this.#bgColor === Group.COLOR_BG_BLACK ? 'k' : 'c' + this.#bgColor,
        });
        const config = await dialog(title, fields, data);
        if (config) {
            this.#label = config.label;
            this.width = config.width;
            this.height = config.height;
            this.#fontSize = config.fontSize;
            this.#color = config.color === '-' ? null : Number.parseInt(config.color.slice(1));
            this.#bgColor = config.bgColor === '-' ? null : config.bgColor === 'k' ? Group.COLOR_BG_BLACK : Number.parseInt(config.bgColor.slice(1));
            this.redraw();
            this.grid.trackAction('Edit group');
        }
    }

    // Renders the group box onto the grid.
    renderFull() {
        if (!super.renderFull()) {
            return false;
        }
        const v = this.visual;
        this.#element.style.left = v.x + "px";
        this.#element.style.top = v.y + "px";
        this.#element.style.width = v.width + "px";
        this.#element.style.height = v.height + "px";
        this.renderDetail();
        return true;
    }

    // Updates label text and styling.
    renderDetail() {
        this.#labelEl.innerText = this.#label;
        for (const size of [ 'small', 'medium', 'large' ]) {
            this.#element.classList.toggle(`size-${size}`, this.#fontSize === size);
        }
        if (this.#color !== null) {
            this.#labelEl.setAttribute('data-net-color', '' + this.#color);
        } else {
            this.#labelEl.removeAttribute('data-net-color');
        }
        if (this.#bgColor === Group.COLOR_BG_BLACK) {
            this.#fill.setAttribute('data-bg-color', 'k');
            this.#fill.setAttribute('data-net-color', '');
        } else {
            this.#fill.removeAttribute('data-bg-color');
            this.#fill.setAttribute('data-net-color', this.#bgColor === null ? '' : '' + this.#bgColor);
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
        const d = app.config.placementDefaults.group;
        return (grid, x, y) => {
            const width = overrideDefaults.width ?? d.width;
            const height = overrideDefaults.height ?? d.height;
            const label = overrideDefaults.label ?? 'Group';
            const fontSize = overrideDefaults.fontSize ?? d.fontSize;
            const colorStr = overrideDefaults.color ?? d.color;
            const color = colorStr === '-' ? null : Number.parseInt(colorStr.slice(1));
            const bgColorStr = overrideDefaults.bgColor ?? d.bgColor;
            const bgColor = bgColorStr === '-' ? null : bgColorStr === 'k' ? Group.COLOR_BG_BLACK : Number.parseInt(bgColorStr.slice(1));
            return grid.addItem(new Group(app, x, y, width, height, label, fontSize, color, bgColor), false);
        };
    }
}

GridItem.CLASSES['Group'] = Group;
