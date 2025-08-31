"use strict";

// An IO port to interface with other circuits.
class Port extends Interactive {

    #state = null;
    #side;
    #port;
    label = '';
    #labelElement;

    constructor(grid, x, y, side) {
        super(grid, x, y, { 'top': [ '' ], 'left': [ null, null, null ] }, 'Port');
        this.element.classList.add('port');
        this.rotation = Component.SIDES.indexOf(side);
        this.updateDimensions();
        this.#side = side;
        this.#port = this.portByName('');
        this.#updateMessage();

        this.#labelElement = document.createElement('div');
        this.#labelElement.classList.add('component-port-label');
        this.element.appendChild(this.#labelElement);
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
            } else if (key === 'e') {
                this.label = prompt('Set label');
                this.#updateMessage();
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
        if (this.element.classList.contains('component-rotate-animation')) {
            return;
        }

        super.render(reason);

        let side = ComponentPort.portSide(this.rotation, 'bottom');
        let labelCoords = ComponentPort.portCoords(this.width, this.height, side, 0, true);
        this.renderLabel(this.#labelElement, side, labelCoords.x * this.grid.zoom, labelCoords.y * this.grid.zoom, this.label);

        this.element.setAttribute('data-port-state', this.#state ?? '');
        this.element.setAttribute('data-net-state', this.#port.netId !== null && app.sim ? app.sim.getNet(this.#port.netId) : '');
    }

    // Update hover message
    #updateMessage() {
        this.setHoverMessage(this.inner, 'Port <b>' + this.label + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>E</i>: Edit name, <i>1</i>: Set high, <i>2</i>: Set low, <i>3</i>: Unset', { type: 'hover' });
    }
}