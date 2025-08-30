"use strict";

// Basic clock provider.
class Clock extends Interactive {

    interval = 1000;
    #state = null;
    #port;

    constructor(grid, x, y) {
        super(grid, x, y, { right: [ '' ] }, 'Clock');
        this.#port = this.portByName('');
        this.#updateMessage();

    }

    applyState(port, sim) {
        if (this.#port.netId !== null) {
            if (this.#state === 0) {
                sim.setNet(this.#port.netId, 0);
            } else if (this.#state === 1) {
                let delta = performance.now() - app.simStart;
                sim.setNet(this.#port.netId, (delta % this.interval) < (this.interval / 2) ? 1 : 0);
            }
        }
    }

    #updateMessage() {
        this.setHoverMessage(this.inner, '<b>' + (1000 / this.interval) + 'Hz Clock</b>. <i>LMB</i>: Drag to move, <i>R</i>: Rotate, <i>F</i>: Change frequency, <i>1</i>: Enable, <i>2</i>: Disable, <i>3</i>: Detach', { type: 'hover' });
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        super.onHotkey(key, what);
        if (what.type === 'hover') {
            if (key === 'f') {
                let freq = parseInt(prompt('Set new frequency in Hz', Math.round(1000 / this.interval)));
                this.interval = isNaN(freq) ? 1000 : 1000 / freq;
                this.#updateMessage();
            } if (key === '1') {
                this.#state = 1;
            } else if (key === '2') {
                this.#state = 0;
            } else if (key === '3') {
                this.#state = null;
            }
        }
    }
}