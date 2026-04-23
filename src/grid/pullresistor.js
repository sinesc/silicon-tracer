"use strict";

// Basic clock provider.
class PullResistor extends SimulationComponent {

    static TYPE_LABEL = 'Pull resistor';
    static TYPE_LABEL_LONG = 'Pull up/down resistor';

    static EDIT_DIALOG = [
        { name: 'direction', label: 'Pull direction', type: 'select', options: { "up": "Up", "down": "Down" } },
        ...Component.EDIT_DIALOG,
    ];

    #direction = 'down';

    constructor(app, x, y, rotation, direction = 'down') {
        assert.enum([ "up", "down" ], direction);
        super(app, x, y, rotation, { right: ['q'] }, 'pull', 1);
        this.portByName('q').label = '';
        this.#direction = direction;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation, this.#direction ],
        };
    }

    // Link pull resistor to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => `<b>Pull-${this.#direction} resistor</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return sim.declarePullResistor(this.#direction, suffix);
    }

    // Override inner component label.
    get topMarkings() {
        return this.#direction.toUpperFirst();
    }

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    static editDialogConfig(_descriptor, defaults = {}) {
        return {
            title: 'Configure pull resistor',
            fields: PullResistor.EDIT_DIALOG,
            data: { direction: defaults.direction ?? 'down', rotation: defaults.rotation ?? 0 },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.pull;
    }

    // Handle edit hotkey.
    async onEdit() {
        const { title, fields, data } = PullResistor.editDialogConfig({}, { direction: this.#direction, rotation: this.rotation });
        const config = await dialog(title, fields, data);
        if (config) {
            this.#direction = config.direction;
            this.rotation = config.rotation;
            this.redraw();
            this.grid.trackAction('Edit pull resistor');
        }
    }

    static fromDescriptor(app, _desc, overrideDefaults = {}) {
        const d = app.config.placementDefaults;
        return (grid, x, y) => grid.addItem(new PullResistor(
            app,
            x,
            y,
            overrideDefaults.rotation ?? d.pull.rotation,
            overrideDefaults.direction ?? 'down'
        ), false);
    }
}

GridItem.CLASSES['PullResistor'] = PullResistor;
