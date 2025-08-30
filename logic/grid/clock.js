"use strict";

// Basic clock provider.
class Clock extends Interactive {

    interval = 1000;
    #start = null;
    #port;

    constructor(grid, x, y) {
        super(grid, x, y, { right: [ '' ] }, 'Clock');
        this.#port = this.portByName('');
        this.#updateMessage();

    }

    applyState(port, sim) {
        if (this.#start === null) {
            sim.setNet(this.#port.netId, 0);
        } else {
            let delta = performance.now() - this.#start;
            sim.setNet(this.#port.netId, (delta % this.interval) < (this.interval / 2) ? 1 : 0);
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
                let freq = parseInt(prompt('Set new frequency in Hz', 1000 / this.interval));
                this.interval = isNaN(freq) ? 1000 : 1000 / freq;
                this.#updateMessage();
            } if (key === '1') {
                this.#start = performance.now();
            } else if (key === '2') {
                this.#start = null; // TODO
            } else if (key === '3') {
                this.#start = null;
            }
        }
    }
}