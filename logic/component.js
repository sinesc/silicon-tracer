class Component extends GridElement {

    dragAligned = false;
    portSize = 10;
    innerMargin = 5;

    element;
    inner;
    ports;

    constructor(grid, label, x, y, ports) {

        super(grid);
        this.ports = { left: [], right: [], top: [], bottom: [], ...ports };

        [ x, y ] = grid.align(x, y);
        this.setPosition(x, y);

        // compute dimensions from ports
        let width = Math.max(grid.spacing * 2, (this.ports.top.length + 1) * grid.spacing, (this.ports.bottom.length + 1) * grid.spacing);
        let height = Math.max(grid.spacing * 2, (this.ports.left.length + 1) * grid.spacing, (this.ports.right.length + 1) * grid.spacing);
        this.setDimensions(width, height);

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
        let portOffset = this.grid.spacing - (this.portSize / 2);

        for (const [side, labels] of Object.entries(this.ports)) {
            let x = side !== 'right' ? (side !== 'left' ? portOffset : 0) : this.width - this.portSize;
            let y = side !== 'bottom' ? (side !== 'top' ? portOffset : 0) : this.height - this.portSize;
            let stepX = side === 'left' || side === 'right' ? 0 : this.grid.spacing;
            let stepY = side === 'top' || side === 'bottom' ? 0 : this.grid.spacing;
            for (const label of labels) {
                if (label !== null) {
                    let port = document.createElement('div');
                    port.classList.add('component-port');
                    port.style.left = x + "px";
                    port.style.top = y + "px";
                    port.style.width = this.portSize + "px";
                    port.style.height = this.portSize + "px";
                    this.element.appendChild(port);
                }
                x += stepX;
                y += stepY;
            }
        }

        grid.element.appendChild(this.element);

        this.render();
    }

    onDrag(x, y, done) {
        this.setPosition(x, y, this.dragAligned || done);
    }

    render() {
        this.element.style.left = this.x + "px";
        this.element.style.top = this.y + "px";
        this.element.style.width = this.width + "px";
        this.element.style.height = this.height + "px";

        if (this.width < this.height && this.width < 200) {
            this.inner.style.lineHeight = (this.width - (this.innerMargin * 2)) + "px";
            this.inner.style.writingMode = 'vertical-rl';
        } else {
            this.inner.style.lineHeight = (this.height - (this.innerMargin * 2)) + "px";
            this.inner.style.writingMode = 'horizontal-tb';
        }
    }
}