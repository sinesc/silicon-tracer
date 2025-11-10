"use strict";

// Basic clock provider.
class Clock extends Interactive {

    interval = 1000;
    #state = null;
    #port;

    constructor(x, y) {
        super(x, y, { right: [ '' ] }, 'clock');
        this.#port = this.portByName('');
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y ]},
            interval: this.interval,
        };
    }

    // Link clock to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => '<b>' + (1000 / this.interval) + 'Hz Clock</b>. <i>LMB</i>: Drag to move, <i>R</i>: Rotate, <i>E</i>: Edit frequency, <i>1</i>: Enable, <i>2</i>: Disable, <i>3</i>: Detach', { type: 'hover' });
    }

    // Apply component state to simulation.
    applyState(port, sim) {
        if (this.#port.netId !== null) {
            if (this.#state === 0) {
                sim.setNet(this.#port.netId, 0);
            } else if (this.#state === 1) {
                let delta = performance.now() - app.sim.start;
                sim.setNet(this.#port.netId, (delta % this.interval) < (this.interval / 2) ? 1 : 0);
            }
        }
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        super.onHotkey(key, what);
        if (what.type === 'hover') {
            let prevState = this.#state;
            if (key === 'e') {
                let freq = parseInt(prompt('Set new frequency in Hz', Math.round(1000 / this.interval)));
                this.interval = isNaN(freq) ? 1000 : 1000 / freq;
            } if (key === '1') {
                this.#state = 1;
            } else if (key === '2') {
                this.#state = 0;
            } else if (key === '3') {
                this.#state = null;
            }
            if (prevState !== this.#state) {
                if (this.#port.netId !== null && app.sim) {
                    app.sim.engine.setNet(this.#port.netId, this.#state);
                }
                this.render();
            }
        }
    }
}