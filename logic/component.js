class Component extends GridElement {

    dragAligned = false;
    portSize = 10;
    innerMargin = 5;

    element;
    inner;
    dropPreview;
    ports;
    dragConnection = null;

    constructor(grid, name, x, y, ports) {

        super(grid);
        [ this.x, this.y ] = this.gridAlign(x, y);

        // container
        this.element = document.createElement('div');
        this.element.classList.add('component');

        // inner area with name
        this.inner = document.createElement('div');
        this.inner.innerHTML = name;
        this.inner.classList.add('component-inner');
        grid.setHoverStatus(this.inner, 'Component <b>' + name + '</b>. <i>LMB</i>: Drag to move.');
        this.registerDrag(this.inner, { type: "component" });
        this.element.appendChild(this.inner);

        // compute dimensions from ports
        this.ports = { left: [], right: [], top: [], bottom: [], ...ports }.map((side, ports) => ports.map((name) => ({ name: name, side: side, port: null, portLabel: null, x: null, y: null })));
        this.width = Math.max(grid.spacing * 2, (this.ports.top.length + 1) * grid.spacing, (this.ports.bottom.length + 1) * grid.spacing);
        this.height = Math.max(grid.spacing * 2, (this.ports.left.length + 1) * grid.spacing, (this.ports.right.length + 1) * grid.spacing);

        // ports
        for (const [side, items] of Object.entries(this.ports)) {
            let x = side !== 'right' ? (side !== 'left' ? this.portSize / 2 : 0) : this.width - this.portSize;
            let y = side !== 'bottom' ? (side !== 'top' ? this.portSize / 2 : 0) : this.height - this.portSize;
            let stepX = side === 'left' || side === 'right' ? 0 : grid.spacing;
            let stepY = side === 'top' || side === 'bottom' ? 0 : grid.spacing;
            for (const item of items) {
                if (item.name !== null) {
                    // port itself
                    let port = document.createElement('div');
                    port.classList.add('component-port');
                    this.element.appendChild(port);
                    grid.setHoverStatus(port, 'Port <b>' + item.name + '</b> of <b>' + name + '</b>. <i>LMB</i>: Drag to connect.');
                    // port hover label
                    let portLabel = document.createElement('div');
                    portLabel.classList.add('component-port-label');
                    this.element.appendChild(portLabel);
                    // update this.ports with computed port properties
                    item.port = port;
                    item.portLabel = portLabel;
                    item.x = x + this.portSize / 2;
                    item.y = y + this.portSize / 2;
                    // register a drag event for the port, will trigger onDrag with the port name
                    this.registerDrag(port, { type: "port", name: item.name });
                }
                x += stepX;
                y += stepY;
            }
        }

        grid.addVisual(this.element);
        this.render();
    }

    // Gets a port definition by its name.
    portByName(name) {
        for (const [side, items] of Object.entries(this.ports)) {
            for (const item of items) {
                if (item.name === name) {
                    return item;
                }
            }
        }
        return null;
    }

    // Draw drop preview while moving component.
    onMove(x, y, done) {
        this.setPosition(x, y, this.dragAligned || done);
        if (!done) {
            if (!this.dropPreview) {
                this.dropPreview = document.createElement('div');
                this.dropPreview.classList.add('component-drop-preview');
                this.grid.addVisual(this.dropPreview);
            }
            let [ alignedX, alignedY ] = this.gridAlign(this.x, this.y);
            let [ visualX, visualY ] = this.gridToVisual(alignedX, alignedY);
            this.dropPreview.style.left = visualX + "px";
            this.dropPreview.style.top = visualY + "px";
            this.dropPreview.style.width = this.visualWidth + "px";
            this.dropPreview.style.height = this.visualHeight + "px";
        } else {
            this.grid.removeVisual(this.dropPreview);
            this.dropPreview = null;
        }
    }

    // Create connection from port.
    onConnect(x, y, name, done) {
        let port = this.portByName(name);
        if (!this.dragConnection) {
            let ordering = port.side === 'top' || port.side === 'bottom' ? 'vh' : 'hv';
            this.dragConnection = new Connection(this.grid, this.x + port.x, this.y + port.y, x + port.x, y + port.y, ordering); // TODO: unclear why I needed to add port.x/y to the target coordinate, it should just be the mouse coordinate x/y //FIXME: got it: it's the dragOffset from GridElement::handleDragMove to keep the component fixed relative to the mouse. it should be computed only for the component case
            this.dragConnection.render();
        } else if (!done) {
            this.dragConnection.setEndpoints(this.x + port.x, this.y + port.y, x + port.x, y + port.y, true); // TODO: unclear why I needed to add port.x/y to the target coordinate, it should just be the mouse coordinate x/y
            this.dragConnection.render();
        } else {
            this.dragConnection = null;
        }

    }

    // Called while a registered visual is being dragged.
    onDrag(x, y, done, what) {
        if (what.type === 'component') {
            this.onMove(x, y, done);
        } else if (what.type === 'port') {
            this.onConnect(x, y, what.name, done);
        }
    }

    // Renders the component onto the grid.
    render() {
        // render component ports
        let visualSpacing = this.grid.spacing * this.grid.zoom;
        let visualPortSize = this.portSize * this.grid.zoom;
        let visualOffset = visualSpacing - (visualPortSize / 2);
        let visualLabelPadding = 1 * this.grid.zoom;
        let visualLabelLineHeight = visualPortSize + 2 * visualLabelPadding;

        for (const [side, items] of Object.entries(this.ports)) {
            let x = side !== 'right' ? (side !== 'left' ? visualOffset : 0) : this.visualWidth - visualPortSize;
            let y = side !== 'bottom' ? (side !== 'top' ? visualOffset : 0) : this.visualHeight - visualPortSize;
            let stepX = side === 'left' || side === 'right' ? 0 : visualSpacing;
            let stepY = side === 'top' || side === 'bottom' ? 0 : visualSpacing;
            for (const { name, port, portLabel } of items) {
                if (port !== null) {
                    port.style.left = x + "px";
                    port.style.top = y + "px";
                    port.style.width = visualPortSize + "px";
                    port.style.height = visualPortSize + "px";
                    if (this.grid.zoom >= 1.25 && name.length > 1) {
                        port.innerHTML = '';
                        portLabel.style.display = 'block';
                        portLabel.innerHTML = name;
                        portLabel.style.lineHeight = visualLabelLineHeight + 'px';
                        if (side === 'bottom') {
                            portLabel.style.writingMode = 'vertical-rl';
                            portLabel.style.left = (x - visualLabelPadding) + "px";
                            portLabel.style.top = (y - visualLabelPadding) + "px";
                            portLabel.style.paddingBottom = visualLabelPadding + "px";
                            portLabel.style.paddingTop = visualLabelLineHeight + "px";
                            portLabel.style.width = visualLabelLineHeight + "px";
                        } else if (side === 'top') {
                            portLabel.style.writingMode = 'sideways-lr';
                            portLabel.style.left = (x - visualLabelPadding) + "px";
                            portLabel.style.bottom = (this.visualHeight - visualPortSize - visualLabelPadding) + "px";
                            portLabel.style.paddingBottom = visualLabelLineHeight + "px";
                            portLabel.style.paddingTop = visualLabelPadding + "px";
                            portLabel.style.width = visualLabelLineHeight + "px";
                        } else if (side === 'left') {
                            portLabel.style.right = (this.visualWidth - visualPortSize - visualLabelPadding) + "px";
                            portLabel.style.top = (y - visualLabelPadding) + "px";
                            portLabel.style.paddingLeft = visualLabelPadding + "px";
                            portLabel.style.paddingRight = visualLabelLineHeight + "px";
                            portLabel.style.height = visualLabelLineHeight + "px";
                        } else if (side === 'right') {
                            portLabel.style.left = (x - visualLabelPadding) + "px";
                            portLabel.style.top = (y - visualLabelPadding) + "px";
                            portLabel.style.paddingLeft = visualLabelLineHeight + "px";
                            portLabel.style.paddingRight = visualLabelPadding + "px";
                            portLabel.style.height = visualLabelLineHeight + "px";
                        }
                    } else {
                        portLabel.style.display = 'none';
                    }
                    if (this.grid.zoom >= 1.25) {
                        port.style.lineHeight = visualPortSize + 'px';
                        port.innerHTML = name.slice(0, 1);
                    } else {
                        port.innerHTML = '';
                    }
                }
                x += stepX;
                y += stepY;
            }
        }

        // render component body
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