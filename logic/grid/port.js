"use strict";

// An IO port to interface with other circuits.
class Port extends Interactive {

    #state = null;
    #side;
    #port;

    constructor(grid, x, y, side, name = 'Port') {
        super(grid, x, y, { 'top': [ '' ], 'left': [ null, null, null ] }, name);
        this.element.classList.add('port');
        this.rotation = Component.SIDES.indexOf(side);
        this.updateDimensions();
        this.#side = side;
        this.#port = this.portByName('');
        this.setHoverMessage(this.inner, 'Port <b>' + name + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>1</i>: Set high, <i>2</i>: Set low, <i>3</i>: Unset', { type: 'hover' });
    }

    // Returns UI-enforced state for given port.
    applyState(port, sim) {
        if (this.#port.netId !== null) {
            if (this.#state !== null) {
                sim.setNet(this.#port.netId, this.#state);
            }
        }
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.#side, this.element.getAttribute('data-component-name') ]},
            rotation: this.rotation,
        };
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        super.onHotkey(key, what);
        if (what.type === 'hover') {
            let prevState = this.#state;
            if (key === '1') {
                this.#state = 1;
            } else if (key === '2') {
                this.#state = 0;
            } else if (key === '3') {
                this.#state = null;
            }
            if (prevState !== this.#state) {
                /*if (this.#port.netId !== null && app.sim) {
                    app.sim.setNet(this.#port.netId, this.#state);
                }*/
                this.render();
            }
        }
    }

    // Renders the port onto the grid.
    render(reason) {
        super.render(reason);
        this.element.setAttribute('data-port-state', this.#state ?? '');
        // TODO: better way to get simulation
        this.element.setAttribute('data-net-state', this.#port.netId !== null && app.sim ? app.sim.getNet(this.#port.netId) : '');
    }
}