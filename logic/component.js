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

        // compute dimensions from ports
        this.width = Math.max(grid.spacing * 2, (this.ports.top.length + 1) * grid.spacing, (this.ports.bottom.length + 1) * grid.spacing);
        this.height = Math.max(grid.spacing * 2, (this.ports.left.length + 1) * grid.spacing, (this.ports.right.length + 1) * grid.spacing);

        // ports
        for (const [side, items] of Object.entries(this.ports)) {
            for (const item of items) {
                if (item[0] !== null) {
                    let port = document.createElement('div');
                    port.classList.add('component-port');
                    port.onmouseenter = function() {
                        grid.setStatus('Port <b>' + item[0] + '</b> of <b>' + label + '</b>. Drag to connect.');
                    }
                    port.onmouseleave = function() {
                        grid.clearStatus();
                    }
                    this.element.appendChild(port);
                    item[1] = port;
                }
            }
        }

        grid.addVisual(this.element);
        this.render();
    }

    onDrag(x, y, done) {
        this.setPosition(x, y, this.dragAligned || done);
    }

    render() {
        // update ports
        let visualSpacing = this.grid.spacing * this.grid.zoom;
        let visualPortSize = this.portSize * this.grid.zoom;
        let visualOffset = visualSpacing - (visualPortSize / 2);

        for (const [side, items] of Object.entries(this.ports)) {
            let x = side !== 'right' ? (side !== 'left' ? visualOffset : 0) : this.visualWidth - visualPortSize;
            let y = side !== 'bottom' ? (side !== 'top' ? visualOffset : 0) : this.visualHeight - visualPortSize;
            let stepX = side === 'left' || side === 'right' ? 0 : visualSpacing;
            let stepY = side === 'top' || side === 'bottom' ? 0 : visualSpacing;
            for (const [ label, port ] of items) {
                if (port !== null) {
                    port.style.left = x + "px";
                    port.style.top = y + "px";
                    port.style.width = visualPortSize + "px";
                    port.style.height = visualPortSize + "px";
                }
                x += stepX;
                y += stepY;
            }
        }

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