"use strict";

class Port extends Component {

    state = null;
    netId = null;
    #side;

    constructor(grid, x, y, side, name = 'Port') {
        super(grid, x, y, { 'top': [ '' ], 'left': [ null, null ] }, name);
        this.element.classList.add('port');
        this.rotation = Component.SIDES.indexOf(side);
        this.updateDimensions();
        this.#side = side;
        this.setHoverMessage(this.inner, 'Port <b>' + name + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>1</i>: Set high, <i>2</i>: Set low, <i>3</i>: Unset', { type: 'hover' });
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.#side, this.element.getAttribute('data-component-name') ]},
            rotation: this.rotation,
        };
    }

    // Detach port from simulation.
    detachSimulation() {
        this.netId = null;
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        super.onHotkey(key, what);
        if (what.type === 'hover') {
            let prevState = this.state;
            if (key === '1') {
                this.state = 1;
            } else if (key === '2') {
                this.state = 0;
            } else if (key === '3') {
                this.state = null;
            }
            if (prevState !== this.state) {
                if (/*this.state !== null &&*/ this.netId !== null && this.grid.sim) {
                    this.grid.sim.setNet(this.netId, this.state);
                }
                this.render();
            }
        }
    }

    // Renders the port onto the grid.
    render(reason) {
        super.render(reason);
        this.element.setAttribute('data-port-state', this.state ?? '');
        // TODO: better way to get simulation
        this.element.setAttribute('data-net-state', this.netId !== null && this.grid.sim ? this.grid.sim.getNet(this.netId) : '');
    }
}