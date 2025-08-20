"use strict";

class Clock extends Component {

    type = null;

    constructor(grid, type, x, y, rotation, ports) {
        let name = type.toUpperFirst();
        super(grid, name, x, y, rotation, ports);
        this.type = type;
        this.setHoverMessage(this.inner, '<b>' + name + '-Gate</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate', { type: 'hover' });
    }
}