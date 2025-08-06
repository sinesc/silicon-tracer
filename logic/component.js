class Component {

    gridSpacing = 20;
    portSize = 10;
    margin = 5;

    element;
    inner;
    ports;

    prevX = 0;
    prevY = 0;

    constructor(label, x, y, ports) {
        this.element = document.createElement('div');
        this.element.classList.add('component');
        this.inner = document.createElement('div');
        this.inner.innerHTML = label;
        this.inner.onmousedown = this.dragStart.bind(this);
        this.inner.classList.add('component-inner');
        this.element.appendChild(this.inner);

        document.getElementById('schematic').appendChild(this.element);
        this.setPorts(ports);
    }

    setPorts(ports) {
        this.ports = ports;
        let width = Math.max((ports.top.length + 1) * this.gridSpacing, (ports.bottom.length + 1) * this.gridSpacing);
        let height = Math.max((ports.left.length + 1) * this.gridSpacing, (ports.right.length + 1) * this.gridSpacing);
        if (isNaN(width) || isNaN(height)) {
            throw 'Component: width/height must be known before setting ports';
        }
        this.setDimensions(width, height);
        let offset = this.gridSpacing - (this.portSize / 2);
        for (const [side, labels] of Object.entries(ports)) {
            let x = side !== 'right' ? (side !== 'left' ? offset : 0) : width - this.portSize;
            let y = side !== 'bottom' ? (side !== 'top' ? offset : 0) : height - this.portSize;
            let stepX = side === 'left' || side === 'right' ? 0 : this.gridSpacing;
            let stepY = side === 'top' || side === 'bottom' ? 0 : this.gridSpacing;
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

    gridAlign() {
        const y = Math.round(this.element.offsetTop / this.gridSpacing) * this.gridSpacing + 0.5 * this.gridSpacing;
        const x = Math.round(this.element.offsetLeft / this.gridSpacing) * this.gridSpacing + 0.5 * this.gridSpacing;
        this.setPosition(x, y);
    }

    dragStart(e) {
        e.preventDefault();
        this.prevX = e.clientX;
        this.prevY = e.clientY;
        document.onmousemove = this.dragMove.bind(this);
        document.onmouseup = this.dragStop.bind(this);
    }

    dragMove(e) {
        e.preventDefault();
        let posX = this.prevX - e.clientX;
        let posY = this.prevY - e.clientY;
        this.prevX = e.clientX;
        this.prevY = e.clientY;
        this.setPosition(this.element.offsetLeft - posX, this.element.offsetTop - posY);
    }

    dragStop() {
        document.onmouseup = null;
        document.onmousemove = null;
        this.gridAlign();
    }
}