class Component extends GridElement {

    static SIDES = [ 'top', 'right', 'bottom', 'left' ];

    portSize = 14;
    innerMargin = 5;

    element;
    inner;
    dropPreview;
    ports;
    dragConnection = null;
    rotation = 0;

    circuit;

    constructor(grid, name, x, y, rotation, circuit) {

        super(grid);
        this.circuit = circuit;
        this.rotation = rotation % 4;

        [ this.x, this.y ] = this.gridAlign(x, y);

        // container
        this.element = document.createElement('div');
        this.element.classList.add('component');
        this.element.classList.add('component-type-' + name);

        // inner area with name
        this.inner = document.createElement('div');
        this.inner.innerHTML = name;
        this.inner.classList.add('component-inner');
        this.setHoverMessage(this.inner, 'Component <b>' + name + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate');
        this.registerDrag(this.inner, { type: "component", grabOffsetX: null, grabOffsetY: null });
        this.element.appendChild(this.inner);

        // ensure ports are completely defined
        this.ports = { left: [], right: [], top: [], bottom: [], ...circuit.ports }.map((side, ports) => ports.map((name) => ({ name: name, port: null, portLabel: null, x: null, y: null })));

        // ports
        let ports = this.#rotatedPorts();
        this.#updateDimensions(ports);
        this.#iterPorts(ports, (item, side, x, y) => {
            let port = document.createElement('div');
            port.classList.add('component-port');
            this.element.appendChild(port);
            this.setHoverMessage(port, 'Port <b>' + item.name + '</b> of <b>' + name + '</b>. <i>LMB</i>: Drag to connect.');
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
        });

        grid.addVisual(this.element);
        this.render();
    }

    // Gets a port side+definition by its name.
    portByName(name) {
        let ports = this.#rotatedPorts();
        for (const [side, items] of Object.entries(ports)) {
            for (const item of items) {
                if (item.name === name) {
                    return [ side, item ];
                }
            }
        }
        return null;
    }

    // Hover hotkey actions
    onHotkey(element, key, status) {
        if (key === 'r') {
            this.rotation = (this.rotation + 1) % 4;
            let ports = this.#rotatedPorts();
            this.x += (this.width - this.height) / 2;
            this.y -= (this.width - this.height) / 2;
            this.#updateDimensions(ports);
            this.#iterPorts(ports, (item, side, x, y) => {
                item.x = x + this.portSize / 2;
                item.y = y + this.portSize / 2;
            });
            this.render();
        }
    }

    // Draw drop preview while moving component.
    onMove(x, y, status, what) {
        // get offset between component top/left and mouse grab point
        if (status === 'start') {
            what.grabOffsetX ??= x - this.x;
            what.grabOffsetY ??= y - this.y;
        }
        // set new position, align it on stop
        this.setPosition(x - what.grabOffsetX, y - what.grabOffsetY, status === 'stop');
        // draw grid-aligned drop-preview outline
        if (status !== 'stop') {
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
            what.grabOffsetX = null;
            what.grabOffsetY = null
        }
    }

    // Create connection from port.
    onConnect(x, y, status, what) {
        let [ side, port ] = this.portByName(what.name);
        if (!this.dragConnection) {
            console.log(side);
            let ordering = side === 'top' || side === 'bottom' ? 'vh' : 'hv';
            this.dragConnection = new Connection(this.grid, this.x + port.x, this.y + port.y, x, y, ordering);
            this.dragConnection.render();
        } else if (status !== 'stop') {
            this.dragConnection.setEndpoints(this.x + port.x, this.y + port.y, x, y, true);
            this.dragConnection.render();
        } else {
            this.dragConnection = null;
        }

    }

    // Called while a registered visual is being dragged.
    onDrag(x, y, status, what) {
        if (what.type === 'component') {
            this.onMove(x, y, status, what);
        } else if (what.type === 'port') {
            this.onConnect(x, y, status, what);
        }
    }

    // Renders the component onto the grid.
    render() {
        // render component ports
        let visualPortSize = this.portSize * this.grid.zoom;
        let visualLabelPadding = 1 * this.grid.zoom;
        let visualLabelLineHeight = visualPortSize + 2 * visualLabelPadding;
        let ports = this.#rotatedPorts();

        this.#iterPorts(ports, ({ name, port, portLabel }, side, x, y) => {
            x *= this.grid.zoom;
            y *= this.grid.zoom;
            port.style.left = x + "px";
            port.style.top = y + "px";
            port.style.width = visualPortSize + "px";
            port.style.height = visualPortSize + "px";
            if (/*this.grid.zoom >= 1.25 &&*/ name.length > 1) {
                port.innerHTML = '';
                portLabel.innerHTML = name;
                let style = portLabel.style;
                style.lineHeight = visualLabelLineHeight + 'px';
                if (side === 'bottom') {
                    style.writingMode = 'vertical-rl';
                    style.left = (x - visualLabelPadding) + "px";
                    style.top = (y - visualLabelPadding) + "px";
                    style.right = '';
                    style.bottom = '';
                    style.paddingLeft = '';
                    style.paddingTop = visualLabelLineHeight + "px";
                    style.paddingRight = '';
                    style.paddingBottom = visualLabelPadding + "px";
                    style.width = visualLabelLineHeight + "px";
                    style.height = '';
                } else if (side === 'top') {
                    style.writingMode = 'sideways-lr';
                    style.left = (x - visualLabelPadding) + "px";
                    style.top = '';
                    style.right = '';
                    style.bottom = (this.visualHeight - visualPortSize - visualLabelPadding) + "px";
                    style.paddingLeft = '';
                    style.paddingTop = visualLabelPadding + "px";
                    style.paddingRight = '';
                    style.paddingBottom = visualLabelLineHeight + "px";
                    style.width = visualLabelLineHeight + "px";
                    style.height = '';
                } else if (side === 'left') {
                    style.writingMode = 'horizontal-tb';
                    style.left = '';
                    style.top = (y - visualLabelPadding) + "px";
                    style.right = (this.visualWidth - visualPortSize - visualLabelPadding) + "px";
                    style.bottom = '';
                    style.paddingLeft = visualLabelPadding + "px";
                    style.paddingTop = '';
                    style.paddingRight = visualLabelLineHeight + "px";
                    style.paddingBottom = '';
                    style.width = '';
                    style.height = visualLabelLineHeight + "px";
                } else if (side === 'right') {
                    style.writingMode = 'horizontal-tb';
                    style.left = (x - visualLabelPadding) + "px";
                    style.top = (y - visualLabelPadding) + "px";
                    style.right = '';
                    style.bottom = '';
                    style.paddingLeft = visualLabelLineHeight + "px";
                    style.paddingTop = '';
                    style.paddingRight = visualLabelPadding + "px";
                    style.paddingBottom = '';
                    style.width = '';
                    style.height = visualLabelLineHeight + "px";
                }
            }
            //if (this.grid.zoom >= 1.25) {
                port.style.lineHeight = visualPortSize + 'px';
                port.innerHTML = '<span>' + name.slice(0, 1) + '</span>';
            //}
        });

        // render component body
        this.element.style.left = this.visualX + "px";
        this.element.style.top = this.visualY + "px";
        this.element.style.width = this.visualWidth + "px";
        this.element.style.height = this.visualHeight + "px";

        if ((this.width < this.height || (this.width === this.height && ports.top.length === 0 && ports.bottom.length === 0)) && this.visualWidth < 200) {
            this.inner.style.lineHeight = (this.visualWidth - (this.innerMargin * 2)) + "px";
            this.inner.style.writingMode = 'vertical-rl';
        } else {
            this.inner.style.lineHeight = (this.visualHeight - (this.innerMargin * 2)) + "px";
            this.inner.style.writingMode = 'horizontal-tb';
        }
    }

    // Returns ports rotated by current component rotation.
    #rotatedPorts() {
        let sides = Component.SIDES;
        let mapped = {};
        mapped.top      = this.ports[sides[(0 + this.rotation) % 4]];
        mapped.right    = this.ports[sides[(1 + this.rotation) % 4]];
        mapped.bottom   = this.ports[sides[(2 + this.rotation) % 4]];
        mapped.left     = this.ports[sides[(3 + this.rotation) % 4]];
        return mapped;
    }

    // Iterate with callback fn(port, x, y) over component ports.
    #iterPorts(ports, fn) {
        for (const [side, items] of Object.entries(ports)) {
            let x = side !== 'right' ? (side !== 'left' ? this.grid.spacing - (this.portSize / 2) : 0) : this.width - this.portSize;
            let y = side !== 'bottom' ? (side !== 'top' ? this.grid.spacing - (this.portSize / 2) : 0) : this.height - this.portSize;
            let stepX = side === 'left' || side === 'right' ? 0 : this.grid.spacing;
            let stepY = side === 'top' || side === 'bottom' ? 0 : this.grid.spacing;
            for (const item of items) {
                if (item.name !== null) {
                    fn(item, side, x, y);
                }
                x += stepX;
                y += stepY;
            }
        }
    }

    // Update component width/height from given ports.
    #updateDimensions(ports) {
        this.width = Math.max(this.grid.spacing * 2, (ports.top.length + 1) * this.grid.spacing, (ports.bottom.length + 1) * this.grid.spacing);
        this.height = Math.max(this.grid.spacing * 2, (ports.left.length + 1) * this.grid.spacing, (ports.right.length + 1) * this.grid.spacing);
    }
}
