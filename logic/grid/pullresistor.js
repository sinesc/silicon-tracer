"use strict";

// Basic clock provider.
class PullResistor extends Component {

    static EDIT_DIALOG = [
        { name: 'direction', label: 'Pull direction', type: 'select', options: { "up": "Up", "down": "Down" } },
        ...Component.EDIT_DIALOG,
    ];

    #direction = 'down';
    #numChannels;

    constructor(app, x, y, numChannels = 1) {
        super(app, x, y, { right: [ 'q' ] }, 'pull', numChannels);
        this.#numChannels = numChannels;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y ]},
            direction: this.#direction,
        };
    }

    // Link pull resistor to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => `<b>Pull-${this.#direction === 1 ? 'up' : 'down'} resistor</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return sim.declarePullResistor(this.#direction, suffix);
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure pull resistor", PullResistor.EDIT_DIALOG, { direction: this.#direction, rotation: this.rotation });
        if (config) {
            this.#direction = config.direction;
            this.rotation = config.rotation;
            this.redraw();
        }
    }
}