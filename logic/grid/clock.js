"use strict";

// Basic clock provider.
class Clock extends Component {

    static EDIT_DIALOG = [
        { name: 'frequency', label: 'Frequency in Hz', type: 'int', check: (v, f) => { const p = Number.parseSI(v, true); return isFinite(p) && p >= 1; } },
        ...Component.EDIT_DIALOG,
    ];

    frequency = 1;
    clockId = null;

    constructor(x, y) {
        super(x, y, { left: [ 'enable' ], right: [ 'c' ] }, 'clock');
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y ]},
            frequency: this.frequency,
        };
    }

    // Link clock to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => `<b>${this.frequency} Hz Clock</b>. <i>LMB</i>: Drag to move, <i>R</i>: Rotate, <i>D</i>: Delete, <i>E</i>: Edit`, { type: 'hover' });
    }

    // Number of ticks in half a cycle.
    get ticksPerHalfCycle() {
        return app.config.targetTPS / this.frequency / 2;
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure clock", Clock.EDIT_DIALOG, { frequency: this.frequency, rotation: this.rotation });
        if (config) {
            this.frequency = config.frequency;
            this.rotation = config.rotation;
            if (this.clockId !== null && app.sim) { // FIXME: insufficient check, running simulation might be for another circuit. just rebuild entire circuit but keep mem8/32
                app.sim.engine.updateClock(this.clockId, this.ticksPerHalfCycle, true);
            }
        }
    }
}