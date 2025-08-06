class Component {

    portSize = 12;
    margin = 5;

    grid;
    element;
    inner;

    ports;

    dragOffsetX;
    dragOffsetY;

    constructor(grid, label, x, y, ports) {

        this.grid = new WeakRef(grid);
        this.element = document.createElement('div');
        this.element.classList.add('component');

        this.inner = document.createElement('div');
        this.inner.innerHTML = label;
        this.inner.onmousedown = this.dragStart.bind(this);
        this.inner.classList.add('component-inner');
        this.element.appendChild(this.inner);

        grid.element.appendChild(this.element);
        this.setPorts(ports);
        this.setPosition(x, y);
    }

    setPorts(ports) {
        this.ports = { left: [], right: [], top: [], bottom: [], ...ports };
        let spacing = this.grid.deref()?.spacing ?? 1;
        let width = Math.max(spacing * 2, (this.ports.top.length + 1) * spacing, (this.ports.bottom.length + 1) * spacing);
        let height = Math.max(spacing * 2, (this.ports.left.length + 1) * spacing, (this.ports.right.length + 1) * spacing);
        if (isNaN(width) || isNaN(height)) {
            throw 'Component: width/height must be known before setting ports';
        }
        this.setDimensions(width, height);
        let offset = spacing - (this.portSize / 2);
        for (const [side, labels] of Object.entries(this.ports)) {
            let x = side !== 'right' ? (side !== 'left' ? offset : 0) : width - this.portSize;
            let y = side !== 'bottom' ? (side !== 'top' ? offset : 0) : height - this.portSize;
            let stepX = side === 'left' || side === 'right' ? 0 : spacing;
            let stepY = side === 'top' || side === 'bottom' ? 0 : spacing;
            for (const label of labels) {
                let port = document.createElement('div');
                port.classList.add('component-port');
                port.style.left = x + "px";
                port.style.top = y + "px";
                port.style.width = this.portSize + "px";
                port.style.height = this.portSize + "px";
                this.element.appendChild(port);
                x += stepX;
                y += stepY;
            }
        }
    }

    dimensions() {
        return [ parseInt(this.element.style.width.replace('px', '')), parseInt(this.element.style.height.replace('px', '')) ];
    }

    setDimensions(width, height) {
        this.element.style.width = width + "px";
        this.element.style.height = height + "px";
        this.inner.style.lineHeight = (height - (this.margin * 2)) + "px";
    }

    position() {
        return [ parseInt(this.element.style.left.replace('px', '')), parseInt(this.element.style.top.replace('px', '')) ];
    }

    setPosition(x, y) {
        this.element.style.left = x + "px";
        this.element.style.top = y + "px";
    }

    dragStart(e) {
        e.preventDefault();
        let [ x, y ] = this.position();
        this.dragOffsetX = e.clientX - x;
        this.dragOffsetY = e.clientY - y;
        document.onmousemove = this.dragMove.bind(this);
        document.onmouseup = this.dragStop.bind(this);
    }

    dragMove(e) {
        e.preventDefault();
        this.setPosition(e.clientX - this.dragOffsetX, e.clientY - this.dragOffsetY);
    }

    dragStop() {
        document.onmouseup = null;
        document.onmousemove = null;
        let [ x, y ] = this.grid.deref()?.align(...this.position());
        this.setPosition(x, y);
    }
}