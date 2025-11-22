"use strict";

// Basic clock provider.
class Clock extends Component {

    frequency = 2;

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
    onHotkey(key, what) {
        super.onHotkey(key, what);
        if (what.type === 'hover') {
            if (key === 'e') {
                let freq = parseInt(prompt('Set new frequency in Hz', this.frequency));
                this.frequency = isNaN(freq) || freq <= 0 ? 1 : freq;
            }
        }
    }
}