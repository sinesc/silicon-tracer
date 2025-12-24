"use strict";

// Basic clock provider.
class PullResistor extends Component {

    static EDIT_DIALOG = [
        { name: 'direction', label: 'Pull direction', type: 'select', options: { "up": "Up", "down": "Down" } },
        ...Component.EDIT_DIALOG,
    ];

    direction = 'down';

    constructor(app, x, y) {
        super(app, x, y, { right: [ 'q' ] }, 'pull');
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y ]},
            direction: this.direction,
        };
    }

    // Link pull resistor to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        const type = this.direction === 1 ? 'Pull-up' : 'Pull-down';
        this.setHoverMessage(this.inner, () => `<b>${type} resistor</b>. <i>LMB</i>: Drag to move, <i>R</i>: Rotate, <i>DEL</i>: Delete, <i>E</i>: Edit, <i>SHIFT/CTRL+LMB</i>: Click to select/deselect`, { type: 'hover' });
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure pull resistor", PullResistor.EDIT_DIALOG, { direction: this.direction, rotation: this.rotation });
        if (config) {
            this.direction = config.direction;
            this.rotation = config.rotation;
            this.redraw();
        }
    }
}