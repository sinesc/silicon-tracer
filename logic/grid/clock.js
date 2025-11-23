"use strict";

// Basic clock provider.
class Clock extends Component {

    static EDIT_DIALOG = [
        { name: 'frequency', label: 'Frequency in Hz', type: 'int' }
    ];

    frequency = 1;
    clockId = null;

    constructor(x, y) {
        super(x, y, { left: [ 'e' ], right: [ 'c' ] }, 'clock');
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
        this.setHoverMessage(this.inner, () => `<b>${this.frequency} Hz Clock</b>. <i>LMB</i>: Drag to move, <i>R</i>: Rotate, <i>D</i>: Delete, <i>E</i>: Edit frequency`, { type: 'hover' });
    }

    // Number of ticks in half a cycle.
    get ticksPerHalfCycle() {
        return app.config.targetTPS / this.frequency / 2;
    }

    // Hover hotkey actions.
    async onHotkey(key, what) {
        super.onHotkey(key, what);
        if (what.type === 'hover') {
            if (key === 'e') {
                const config = await dialog("Configure clock", Clock.EDIT_DIALOG, { frequency: this.frequency });
                if (config) {
                    this.frequency = isNaN(config.frequency) || config.frequency <= 0 ? 1 : config.frequency;
                    if (this.clockId !== null && app.sim) { // FIXME: insufficient check, running simulation might be for another circuit
                        app.sim.engine.updateClock(this.clockId, this.ticksPerHalfCycle, true);
                    }
                }
            }
        }
    }
}