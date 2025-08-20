"use strict";

class Port extends Component {

    state = null;
    netId = null;

    constructor(grid, x, y, side, name = 'Port') {

        let ports;

        if (side === 'left') {
            ports = { 'left': [ '' ], 'top': [ null, null ] }
        } else if (side === 'right') {
            ports = { 'right': [ '' ], 'top': [ null, null ] };
        } else if (side === 'top') {
            ports = { 'top': [ '' ], 'left': [ null, null ] };
        } else if (side === 'bottom') {
            ports = { 'bottom': [ '' ], 'left': [ null, null ] };
        }

        super(grid, x, y, ports, name);
        this.setHoverMessage(this.inner, 'Port <b>' + name + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>1</i>: Set high, <i>2</i>: Set low, <i>3</i>: Unset, <i>Space</i>: Toggle high/low/unset', { type: 'hover' });
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
            } else if (key === ' ') {
                if (this.state === null) {
                    this.state = 1;
                } else if (this.state === 1) {
                    this.state = 0;
                } else if (this.state === 0) {
                    this.state = null;
                }
            }
            if (prevState !== this.state) {
                if (this.state !== null && this.netId !== null && global.sim && global.sim.ready) {
                    global.sim.setNet(this.netId, this.state);
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
        this.element.setAttribute('data-port-net-state', this.netId !== null && global.sim && global.sim.ready ? global.sim.getNet(this.netId) : '');
    }
}