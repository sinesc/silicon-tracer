class Port extends Component {

    state = null;

    constructor(grid, name, x, y, rotation, ports) {
        super(grid, name, x, y, rotation, ports);
        this.setHoverMessage(this.inner, 'Port <b>' + name + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>Space</i>: Toggle high/low/-', { type: 'hover' });
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        super.onHotkey(key, what);
        if (key === ' ' && what.type === 'hover') {
            if (this.state === null) {
                this.state = 1;
            } else if (this.state === 1) {
                this.state = 0;
            } else if (this.state === 0) {
                this.state = null;
            }
            this.render();
        }
    }

    // Renders the port onto the grid.
    render(reason) {
        super.render(reason);
        this.element.setAttribute('data-port-state', this.state ?? '');
    }
}