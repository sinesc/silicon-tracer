"use strict";

// Basic clock provider.
class Clock extends Component {

    static EDIT_DIALOG = [
        { name: 'frequency', label: 'Frequency in Hz', type: 'int', check: (v, f) => { const p = Number.parseSI(v, true); return isFinite(p) && p >= 1; } },
        ...Component.EDIT_DIALOG,
    ];

    frequency = 1;

    constructor(app, x, y, rotation) {
        super(app, x, y, rotation, { left: [ 'enable' ], right: [ 'c' ] }, 'clock', 1);
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.rotation ]},
            frequency: this.frequency,
        };
    }

    // Link clock to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => `<b>${Number.formatSI(this.frequency, true)}Hz Clock</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return sim.declareClock(this.frequency, config.targetTPS, suffix);
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure clock", Clock.EDIT_DIALOG, { frequency: Number.formatSI(this.frequency, true), rotation: this.rotation });
        if (config) {
            this.frequency = config.frequency;
            this.rotation = config.rotation;

            /*const sim = this.app.simulations.current;
            if (this.simId !== null && sim) {
                sim.engine.setClockFrequency(this.simId, this.frequency);
            }*/

            this.redraw();
        }
    }
}