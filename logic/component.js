class Component extends GridElement {

    dragAligned = false;
    portSize = 10;
    innerMargin = 5;

    element;
    inner;
    ports;

    constructor(grid, label, x, y, ports) {

        super(grid);
        this.ports = { left: [], right: [], top: [], bottom: [], ...ports }.map((side) => side.map((label) => [ label, null ]));

        [ this.x, this.y ] = grid.align(x, y);

        // container
        this.element = document.createElement('div');
        this.element.classList.add('component');

        // inner area with label
        this.inner = document.createElement('div');
        this.inner.innerHTML = label;
        this.inner.classList.add('component-inner');
        this.registerDrag(this.inner);

        this.element.appendChild(this.inner);

        // ports
        /*for (const [side, items] of Object.entries(this.ports)) {
            for (const item of items) {
                if (item[0] !== null) {
                    let port = document.createElement('div');
                    port.classList.add('component-port');
                    this.element.appendChild(port);
                    item[1] = port;
                }
            }
        }
        */
        grid.element.appendChild(this.element);
        this.render();
    }

    onDrag(x, y, done) {
        this.setPosition(x, y, this.dragAligned || done);
    }

    render() {

        // compute dimensions from ports
        this.width = Math.max(grid.spacing * 2, (this.ports.top.length + 1) * grid.spacing, (this.ports.bottom.length + 1) * grid.spacing);
        this.height = Math.max(grid.spacing * 2, (this.ports.left.length + 1) * grid.spacing, (this.ports.right.length + 1) * grid.spacing);

        // update ports
        /*
        let portOffset = this.grid.spacing - (this.portSize / 2);

        for (const [side, items] of Object.entries(this.ports)) {
            let x = side !== 'right' ? (side !== 'left' ? portOffset : 0) : this.width - this.portSize;
            let y = side !== 'bottom' ? (side !== 'top' ? portOffset : 0) : this.height - this.portSize;
            let stepX = side === 'left' || side === 'right' ? 0 : this.grid.spacing;
            let stepY = side === 'top' || side === 'bottom' ? 0 : this.grid.spacing;
            for (const [ label, port ] of items) {
                if (port !== null) {
                    port.style.left = x + "px";
                    port.style.top = y + "px";
                    port.style.width = this.portSize + "px";
                    port.style.height = this.portSize + "px";
                }
                x += stepX;
                y += stepY;
            }
        }
        */

        this.element.style.left = this.visualX + "px";
        this.element.style.top = this.visualY + "px";
        this.element.style.width = this.visualWidth + "px";
        this.element.style.height = this.visualHeight + "px";

        if (this.width < this.height && this.visualWidth < 200) {
            this.inner.style.lineHeight = (this.visualWidth - (this.innerMargin * 2)) + "px";
            this.inner.style.writingMode = 'vertical-rl';
        } else {
            this.inner.style.lineHeight = (this.visualHeight - (this.innerMargin * 2)) + "px";
            this.inner.style.writingMode = 'horizontal-tb';
        }
    }
}