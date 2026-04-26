"use strict";

// Wire splitter/joiner.
class Splitter extends VirtualComponent {

    static TYPE_LABEL = 'Splitter';
    static TYPE_DESCRIPTION = 'Wire splitter/joiner';

    static MULTI_PORT_TEMPLATE = 'n{i}';
    static SINGLE_PORT_NAME = 'm';

    static EDIT_DIALOG = [
        { name: 'numSplits', label: 'Number of n-ports', type: 'int', postCheck: (v, f) => isFinite(v) && v >= 2 && v <= 64 },
        { name: 'ordering', label: 'Order of n-ports', type: 'select', options: { ltr: "0 ... n", rtl: "n ... 0" } },
        { name: 'orientation', label: 'Position of single port', type: 'select', options: { start: "Opposite of n0", middle: "Middle", end: "Opposite of nMax" } },
        { name: 'spacing', label: 'Pin spacing', type: 'select', options: { 0: "None", 1: "One", 2: "Two" } },
        { name: 'gapPosition', label: 'Pin gap (when n-ports is even)', type: 'select', options: { start: "Next to n0", middle: "Middle", end: "Next to nMax", none: "None" } },
        ...Component.EDIT_DIALOG,
    ];

    #numSplits;
    #gapPosition;
    #orientation;
    #ordering;
    #spacing;

    constructor(app, x, y, rotation, numSplits, gapPosition = 'none', orientation = 'start', ordering = 'ltr', spacing = 0) {
        assert.number(numSplits);
        assert.enum([ 'start', 'middle', 'end', 'none' ], gapPosition);
        assert.enum([ 'start', 'middle', 'end' ], orientation);
        const { left, right/*, channelMap*/ } = Splitter.#generatePorts(numSplits, gapPosition, orientation, ordering, spacing);
        super(app, x, y, rotation, { 'left': left, 'right': right }, 'splitter');
        this.#numSplits = numSplits;
        this.#gapPosition = gapPosition;
        this.#orientation = orientation;
        this.#ordering = ordering;
        this.#spacing = spacing;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.#numSplits, this.#gapPosition, this.#orientation, this.#ordering, this.#spacing ],
        };
    }

    // Link splitter to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.element.classList.add('splitter');
        this.setHoverMessage(this.inner, `<b>Wire-splitter/joiner</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    static editDialogConfig(_descriptor, defaults = {}) {
        return {
            title: 'Configure splitter',
            fields: Splitter.EDIT_DIALOG,
            data: {
                numSplits: defaults.numSplits ?? 8,
                gapPosition: defaults.gapPosition ?? 'none',
                orientation: defaults.orientation ?? 'start',
                ordering: defaults.ordering ?? 'ltr',
                spacing: String(defaults.spacing ?? 0),
                rotation: defaults.rotation ?? 0,
            },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.splitter;
    }

    // Handle edit hotkey.
    async onEdit() {
        const { title, fields, data } = Splitter.editDialogConfig({}, { numSplits: this.#numSplits, gapPosition: this.#gapPosition, orientation: this.#orientation, ordering: this.#ordering, spacing: this.#spacing, rotation: this.rotation });
        const config = await dialog(title, fields, data);
        if (config) {
            const grid = this.grid;
            this.unlink();
            const { left, right } = Splitter.#generatePorts(config.numSplits, config.gapPosition, config.orientation, config.ordering, config.spacing);
            this.setPortsFromNames({ 'left': left, 'right': right });
            this.#numSplits = config.numSplits;
            this.#gapPosition = config.gapPosition;
            this.#orientation = config.orientation;
            this.#ordering = config.ordering;
            this.#spacing = Number.parseInt(config.spacing);
            this.link(grid);
            this.rotation = config.rotation; // needs to be on grid for rotation to properly update x/y/width/height
            this.redraw();
            this.app.config.placementDefaults.splitter.numSplits = config.numSplits;
            this.app.config.placementDefaults.splitter.rotation = config.rotation;
            this.grid.trackAction('Edit splitter');
        }
    }

    // Generates splitter port layout based on number of inputs.
    static #generatePorts(numSplits, gapPosition, orientation, ordering, spacing) {

        // compute blank spot if n-port count is even
        let blankAt = -1;
        let numSlots = numSplits;

        // if n-port ordering is inverted also invert ordering for the single port and the gap
        if (ordering === 'rtl') {
            orientation = orientation === 'start' ? 'end' : (orientation === 'end' ? 'start' : orientation);
            gapPosition = gapPosition === 'start' ? 'end' : (gapPosition === 'end' ? 'start' : gapPosition);
        }

        // compute number of ports slots and blank position for the gap
        if (numSplits % 2 === 0 && gapPosition !== 'none') {
            numSlots += 1;
            blankAt = gapPosition === 'middle' ? (numSlots - 1) / 2 : (gapPosition === 'end' ? numSlots - 1 : 0);
        }

        const singlePortAt = orientation === 'middle' ? Math.round((numSlots - 1) / 2) : (orientation === 'start' ? numSlots - 1 : 0);

        // generate ports arrays
        const left = [];
        const right = [];
        let split = 0;

        for (let i = 0; i < numSlots; ++i) {

            // n side (left)
            if (i === blankAt) {
                left.push(null);
            } else {
                const name = Splitter.MULTI_PORT_TEMPLATE.replace('{i}', '' + (ordering === 'ltr' ? split : numSplits - 1 - split));
                left.push(name);
                split += 1;
            }

            // 1 side
            if (i === singlePortAt) {
                right.push(Splitter.SINGLE_PORT_NAME);
            } else if (right.length === 0 || right[right.length - 1 - spacing] !== Splitter.SINGLE_PORT_NAME) {
                right.push(null);
            }

            if (i < numSlots - 1) {
                for (let s = 0; s < spacing; ++s) {
                    left.push(null);
                    right.push(null);
                }
            }
        }

        return { left, right/*, channelMap*/ };
    }

    static fromDescriptor(app, _desc, overrideDefaults = {}) {
        const d = app.config.placementDefaults;
        return (grid, x, y) => grid.addItem(new Splitter(
            app,
            x,
            y,
            overrideDefaults.rotation ?? d.splitter.rotation,
            overrideDefaults.numSplits ?? d.splitter.numSplits,
            overrideDefaults.gapPosition ?? 'none',
            overrideDefaults.orientation ?? 'start',
            overrideDefaults.ordering ?? 'ltr',
            overrideDefaults.spacing != null ? Number.parseInt(overrideDefaults.spacing) : 0
        ), false);
    }
}

GridItem.CLASSES['Splitter'] = Splitter;
