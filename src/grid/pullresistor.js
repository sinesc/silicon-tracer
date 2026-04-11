"use strict";

// Basic clock provider.
class PullResistor extends SimulationComponent {

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
    get label() {
        return this.#direction.toUpperFirst();
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure pull resistor", PullResistor.EDIT_DIALOG, { direction: this.#direction, rotation: this.rotation });
        if (config) {
            this.#direction = config.direction;
            this.rotation = config.rotation;
            this.redraw(); // FIXME: this does not result in a change to the netlist hash causing simulation.compile to retain state
            this.grid.trackAction('Edit pull resistor');
        }
    }

    static toolbarMeta(_desc) {
        return { label: 'Pull resistor', hoverMessage: '<b>Pull up/down resistor</b>. <i>LMB</i> Drag to move onto grid.' };
    }

    static fromDescriptor(app, _desc) {
        const d = app.config.placementDefaults;
        return (grid, x, y) => grid.addItem(new PullResistor(app, x, y, d.pull.rotation));
    }
}

GridItem.CLASSES['PullResistor'] = PullResistor;
