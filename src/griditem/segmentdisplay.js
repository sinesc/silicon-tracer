"use strict";

// 7-segment + dot display. Input port has 8 channels, one per segment.
class SegmentDisplay extends SimulationComponent {

    static TYPE_LABEL = '7-Segment';
    static TYPE_LABEL_LONG = '7-Segment Display';
    static TYPE_DESCRIPTION = 'Each input channel controls one segment';

    static SEGMENT_COLORS = { "c0": "Mint", "c1": "Green", "c2": "Yellow", "c3": "Orange", "c4": "Red", "c5": "Ruby", "c6": "Magenta", "c7": "Purple", "c8": "Blue", "c9": "Turquoise" };

    static EDIT_DIALOG = [
        { name: 'color', label: 'Color', type: 'select', options: SegmentDisplay.SEGMENT_COLORS },
        ...Component.EDIT_DIALOG,
    ];

    // Segment layout: [ left%, top%, width%, height% ]
    static #SEGMENTS = [
        [ '30%', '7%',  '40%', '7%'  ],  // 0 - A: top horizontal
        [ '70%', '14%', '8%',  '29%' ],  // 1 - B: top-right vertical
        [ '70%', '55%', '8%',  '29%' ],  // 2 - C: bottom-right vertical
        [ '30%', '84%', '40%', '7%'  ],  // 3 - D: bottom horizontal
        [ '22%', '55%', '8%',  '29%' ],  // 4 - E: bottom-left vertical
        [ '22%', '14%', '8%',  '29%' ],  // 5 - F: top-left vertical
        [ '30%', '46%', '40%', '7%'  ],  // 6 - G: middle horizontal
        [ '84%', '85%', '7%',  '7%'  ],  // 7 - DP: dot
    ];

    #input;
    #segmentElements = [];
    #color = 4;

    constructor(app, x, y, rotation = 0, color = 4) {
        assert.integer(rotation);
        assert.integer(color);
        // 3 ports on bottom (null padding around input), 4 null ports on left for display height
        super(app, x, y, rotation, { 'bottom': [null, 'input', null], 'left': [null, null, null, null] }, 'segmentdisplay', { 'input': 8 });
        this.#input = this.portByName('input');
        this.#input.label = '';
        this.#color = color;
    }

    // Link component to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        for (const [ l, t, w, h ] of SegmentDisplay.#SEGMENTS) {
            const el = document.createElement('div');
            el.className = `sd-seg`;
            el.dataset.on = '0';
            el.style.left = l;
            el.style.top = t;
            el.style.width = w;
            el.style.height = h;
            this.element.appendChild(el);
            this.#segmentElements.push(el);
        }
        this.#applyColor();
        this.setHoverMessage(this.inner, () => `<b>${this.typeLabel}</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Removes the component from the grid.
    unlink() {
        this.#segmentElements = [];
        super.unlink();
    }

    // Overrides method to disable top-markings.
    get topMarkings() {
        return '';
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [this.x, this.y, this.rotation, this.#color],
        };
    }

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    static editDialogConfig(_descriptor, defaults = {}) {
        return {
            title: 'Configure segment display',
            fields: SegmentDisplay.EDIT_DIALOG,
            data: {
                color: 'c' + (defaults.color ?? 4),
                rotation: defaults.rotation ?? 0,
            },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.segmentdisplay;
    }

    // Handle edit hotkey.
    async onEdit() {
        const { title, fields, data } = SegmentDisplay.editDialogConfig({}, { color: this.#color, rotation: this.rotation });
        const config = await dialog(title, fields, data);
        if (config) {
            this.#color = parseInt(config.color.slice(1));
            this.rotation = config.rotation;
            this.app.config.placementDefaults.segmentdisplay ??= {};
            this.app.config.placementDefaults.segmentdisplay.color = this.#color;
            this.#applyColor();
            this.redraw(config._changed.some((c) => c === 'rotation'));
            this.grid.trackAction('Edit segment display');
        }
    }

    // Renders/updates the current net state of each segment.
    renderNetState() {
        super.renderNetState();
        const netIds = this.#input.netIds;
        const engine = this.app.simulations?.current?.engine;
        for (let i = 0; i < 8; i++) {
            const netId = netIds?.[i];
            let val;
            if (!engine || netId === undefined) {
                val = '0';
            } else {
                const v = engine.getNetValue(netId);
                val = v === null ? '0' : String(v);
            }
            if (this.#segmentElements[i].dataset.on !== val) {
                this.#segmentElements[i].dataset.on = val;
            }
        }
    }

    static fromDescriptor(app, _desc, overrideDefaults = {}) {
        const d = app.config.placementDefaults;
        return (grid, x, y) => {
            const rotation = overrideDefaults.rotation ?? d.segmentdisplay?.rotation ?? 0;
            const color = overrideDefaults.color ?? d.segmentdisplay?.color ?? 4;
            return grid.addItem(new SegmentDisplay(app, x, y, rotation, color), false);
        };
    }

    // Sets data-sd-color on the component element to drive segment color via CSS.
    #applyColor() {
        this.element?.setAttribute('data-sd-color', this.#color);
    }
}

GridItem.CLASSES['SegmentDisplay'] = SegmentDisplay;
