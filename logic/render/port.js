class Port extends Component {

    constructor(grid, name, x, y, rotation, ports) {

        super(grid, name, x, y, rotation, ports);
        this.setHoverMessage(this.inner, 'Port <b>' + name + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate', { type: 'hover' });
    }

}