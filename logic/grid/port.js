"use strict";

// An IO port to interface with other circuits.
class Port extends Interactive {

    #side;
    #port;
    #labelElement;
    #state = null;
    name = '';

    constructor(x, y, side) {
        assert.string(side);
        super(x, y, { 'top': [ '' ], 'left': [ null, null, null ] }, 'Port');
        this.rotation = Component.SIDES.indexOf(side);
        this.updateDimensions();
        this.#side = side;
        this.#port = this.portByName('');
    }

    // Link port to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.#updateMessage();
        this.#labelElement = document.createElement('div');
        this.#labelElement.classList.add('port-name');
        this.element.classList.add('port');
        this.element.appendChild(this.#labelElement);
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.#side ]},
            rotation: this.rotation,
            name: this.name,
            width: this.width,
            height: this.height,
        };
    }

    // Apply component state to simulation.
    applyState(port, sim) {
        if (this.#port.netId !== null) {
            if (this.#state !== null) {
                sim.setNet(this.#port.netId, this.#state);
            }
        }
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
                this.name = prompt('Set port name', this.name);
                this.#updateMessage();
                this.render();
            }
            if (prevState !== this.#state) {
                if (this.#port.netId !== null && app.sim) {
                    app.sim.engine.setNet(this.#port.netId, this.#state);
                }
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
        this.renderLabel(this.#labelElement, side, labelCoords.x * this.grid.zoom, labelCoords.y * this.grid.zoom, this.name, false, true);

        this.element.setAttribute('data-port-state', this.#state ?? '');
        this.element.setAttribute('data-net-state', this.#port.netId !== null && app.sim ? app.sim.engine.getNet(this.#port.netId) : '');
    }

    // Update hover message
    #updateMessage() {
        this.setHoverMessage(this.inner, 'Port <b>' + this.name + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>E</i>: Edit name, <i>1</i>: Set high, <i>2</i>: Set low, <i>3</i>: Unset', { type: 'hover' });
    }
}