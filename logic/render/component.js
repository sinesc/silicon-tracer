class Component extends GridItem {

    static SIDES = [ 'top', 'right', 'bottom', 'left' ];
    static PORT_SIZE = 14;
    static INNER_MARGIN = 5;

    element;
    inner;
    dropPreview;
    ports;
    dragConnection = null;
    rotation = 0;

    constructor(grid, name, x, y, rotation, ports) {

        super(grid);
        this.rotation = rotation & 3;

        [ this.x, this.y ] = this.gridAlign(x, y);

        // container
        this.element = document.createElement('div');
        this.element.classList.add('component');
        this.element.setAttribute('data-component-name', name); // setAttribtute: dislike dataset-api name transcription when they could have just used [index] access to avoid the hyphen issue.

        // inner area with name
        this.inner = document.createElement('div');
        this.inner.innerHTML = '<span>' + name + '</span>';
        this.inner.classList.add('component-inner');
        this.setHoverMessage(this.inner, 'Component <b>' + name + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate', { type: 'hover' });
        this.registerDrag(this.inner, { type: "component", grabOffsetX: null, grabOffsetY: null });
        this.element.appendChild(this.inner);

        // ensure ports are completely defined

        this.ports = { left: [], right: [], top: [], bottom: [], ...ports };

        for (let [ side, other ] of Object.entries({ 'left': 'right', 'right': 'left', 'top': 'bottom', 'bottom': 'top' })) {
            while (this.ports[side].length < this.ports[other].length) {
                this.ports[side].push(null);
            }
        }

        this.ports = this.ports.map((side, ports) => ports.map((name) => ({ name: name, port: null, portLabel: null, color: null, x: null, y: null })));

        // ports
        let rotatedPorts = this.#rotatedPorts();
        this.#updateDimensions(rotatedPorts);
        this.#iterPorts(rotatedPorts, (item, side, x, y) => {
            let port = document.createElement('div');
            port.classList.add('component-port');
            this.element.appendChild(port);
            this.setHoverMessage(port, 'Port <b>' + item.name + '</b> of <b>' + name + '</b>. <i>LMB</i>: Drag to connect.', { type: 'hover-port' });
            // port hover label
            let portLabel = document.createElement('div');
            portLabel.classList.add('component-port-label');
            this.element.appendChild(portLabel);
            // update this.ports with computed port properties
            item.port = port;
            item.portLabel = portLabel;
            item.x = x;
            item.y = y;
            // register a drag event for the port, will trigger onDrag with the port name
            this.registerDrag(port, { type: "port", name: item.name });
        });

        grid.addVisual(this.element);
        this.render();
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        if (key === 'r' && what.type === 'hover') {
            // rotate component with R while mouse is hovering
            this.rotation = (this.rotation - 1) & 3;
            let ports = this.#rotatedPorts();
            this.x += (this.width - this.height) / 2;
            this.y -= (this.width - this.height) / 2;
            this.#updateDimensions(ports);
            this.#iterPorts(ports, (item, side, x, y) => {
                item.x = x;
                item.y = y;
            });
            this.element.classList.add('component-rotate-animation');
            setTimeout(() => {
                this.element.classList.remove('component-rotate-animation');
                this.render();
                identifyNets();
            }, 150);
        } else if (key === 'r' && what.type === 'connect') {
            // add connection point when pressing R while dragging a connection
            let x = this.dragConnection.x + this.dragConnection.width;
            let y = this.dragConnection.y + this.dragConnection.height;
            let color = this.dragConnection.color;
            // pass handling off to the previously created connection
            let flippedOrdering = this.dragConnection.ordering !== what.ordering;
            let dragConnectionWhat = { ...what, ordering: flippedOrdering ? what.ordering == 'hv' ? 'vh' : 'hv' : what.ordering, x, y, color };
            this.grid.releaseHotkeyTarget(this, true);
            this.dragStop(x, y, what);
            this.dragConnection.dragStart(x, y, dragConnectionWhat);
            this.dragConnection = null;
            identifyNets();
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
            what.grabOffsetY = null;
            identifyNets();
        }
        this.render('move');
    }

    // Create connection from port.
    onConnect(x, y, status, what) {
        let [ side, port ] = this.portByName(what.name);
        if (!this.dragConnection /* start */) {
            this.grid.setStatus(Connection.DRAWING_CONNECTION_MESSAGE, true);
            what.ordering = side === 'top' || side === 'bottom' ? 'vh' : 'hv';
            this.grid.requestHotkeyTarget(this, true, { ...what, type: 'connect' }); // pass 'what' to onHotkey()
            this.dragConnection = new Connection(this.grid, this.x + port.x, this.y + port.y, x, y, what.ordering);
            this.dragConnection.render();
        } else if (status !== 'stop') {
            // flip ordering when draggin towards component, effetively routing around the component
            if (what.ordering === 'hv' && ((side === 'left' ? this.dragConnection.x < x : this.dragConnection.x > x))) {
                this.dragConnection.ordering = 'vh';
            } else if (what.ordering === 'vh' && (side === 'top' ? this.dragConnection.y < y : this.dragConnection.y > y)) {
                this.dragConnection.ordering = 'hv';
            } else {
                this.dragConnection.ordering = what.ordering;
            }
            this.dragConnection.setEndpoints(this.dragConnection.x, this.dragConnection.y, x, y, true);
            this.dragConnection.render();
        } else {
            // FIXME: delete connection if no wires were produced (not dragged far enough)
            this.dragConnection = null;
            this.grid.clearStatus(true);
            this.grid.releaseHotkeyTarget(this, true);
            identifyNets();
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
    render(reason) {
        let ports = this.#rotatedPorts();

        // don't need to update ports when only moving
        if (reason !== 'move') {
            this.#renderPorts();
        }

        this.element.style.left = this.visualX + "px";
        this.element.style.top = this.visualY + "px";
        this.element.style.width = this.visualWidth + "px";
        this.element.style.height = this.visualHeight + "px";

        if ((this.width < this.height || (this.width === this.height && ports.top.length === 0 && ports.bottom.length === 0)) && this.visualWidth < 200) {
            this.inner.style.lineHeight = (this.visualWidth - (Component.INNER_MARGIN * 2)) + "px";
            this.inner.style.writingMode = 'vertical-rl';
        } else {
            this.inner.style.lineHeight = (this.visualHeight - (Component.INNER_MARGIN * 2)) + "px";
            this.inner.style.writingMode = 'horizontal-tb';
        }
    }

    // Returns flat list of ports.
    getPorts() {
        let ports = [  ];
        for (const [ side, items ] of Object.entries(this.ports)) {
            for (const item of items) {
                if (item.x !== null && item.y !== null) {
                    ports.push(item);
                }
            }
        }
        return ports;
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

    // Renders component ports. Only required during scaling/rotation.
    #renderPorts() {
        let visualPortSize = Component.PORT_SIZE * this.grid.zoom;
        let visualPortCenterOffset = visualPortSize / 2;
        let visualPortInset = visualPortSize / 4;
        let visualLabelPadding = 1 * this.grid.zoom;
        let visualLabelLineHeight = visualPortSize + 2 * visualLabelPadding;
        let ports = this.#rotatedPorts();
        let properties = [ 'writingMode', 'left', 'top', 'right', 'bottom','paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'width', 'height', ];
        this.#iterPorts(ports, ({ name, port, color, portLabel }, side, x, y) => {
            // minor inset to move ports inward into the component just a little
            let visualPortInsetX = side === 'left' ? visualPortInset : (side === 'right' ? -visualPortInset : 0);
            let visualPortInsetY = side === 'top' ? visualPortInset : (side === 'bottom' ? -visualPortInset : 0);
            // apply grid zoom
            x *= this.grid.zoom;
            y *= this.grid.zoom;
            // set visual coordinates
            port.style.left = (x - visualPortCenterOffset + visualPortInsetX) + "px";
            port.style.top = (y - visualPortCenterOffset + visualPortInsetY) + "px";
            port.style.width = visualPortSize + "px";
            port.style.height = visualPortSize + "px";
            port.style.lineHeight = visualPortSize + 'px';
            port.innerHTML = '<span>' + name.slice(0, 1) + '</span>';
            port.setAttribute('data-component-port-color', color ?? '');
            if (name.length <= 1) {
                portLabel.style.display = 'none';
            } else {
                portLabel.style.display = 'block';
                portLabel.innerHTML = name;
                portLabel.style.lineHeight = visualLabelLineHeight + 'px';
                let style;
                if (side === 'bottom') {
                    style = {
                        writingMode: 'vertical-rl',
                        left: (x - visualLabelPadding) + "px",
                        top: (y - visualLabelPadding) + "px",
                        paddingTop: visualLabelLineHeight + "px",
                        paddingBottom: visualLabelPadding + "px",
                        width: visualLabelLineHeight + "px",
                    };
                } else if (side === 'top') {
                    style = {
                        writingMode: 'sideways-lr',
                        left: (x - visualLabelPadding) + "px",
                        bottom: (this.visualHeight - visualPortSize - visualLabelPadding) + "px",
                        paddingTop: visualLabelPadding + "px",
                        paddingBottom: visualLabelLineHeight + "px",
                        width: visualLabelLineHeight + "px",
                    };
                } else if (side === 'left') {
                    style = {
                        writingMode: 'horizontal-tb',
                        top: (y - visualLabelPadding) + "px",
                        right: (this.visualWidth - visualPortSize - visualLabelPadding) + "px",
                        paddingLeft: visualLabelPadding + "px",
                        paddingRight: visualLabelLineHeight + "px",
                        height: visualLabelLineHeight + "px",
                    };
                } else if (side === 'right') {
                    style = {
                        writingMode: 'horizontal-tb',
                        left: (x - visualLabelPadding) + "px",
                        top: (y - visualLabelPadding) + "px",
                        paddingLeft: visualLabelLineHeight + "px",
                        paddingRight: visualLabelPadding + "px",
                        height: visualLabelLineHeight + "px",
                    };
                }
                for (const property of properties) {
                    portLabel.style[property] = style[property] ?? '';
                }
            }
        });
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

    // Iterate with callback fn(port, side, x, y) over component ports.
    #iterPorts(ports, fn) {
        // for correct rotation required: top: left->right, right: top->bottom, bottom: right->left, left: bottom->top
        const map = {
            'top'   : { x: Grid.SPACING,                y: 0,                           stepX: Grid.SPACING },
            'right' : { x: this.width,                  y: Grid.SPACING,                stepY: Grid.SPACING },
            'bottom': { x: this.width - Grid.SPACING,   y: this.height,                 stepX: -Grid.SPACING },
            'left'  : { x: 0,                           y: this.height - Grid.SPACING,  stepY: -Grid.SPACING },
        };
        for (const [side, items] of Object.entries(ports)) {
            let x = map[side].x;
            let y = map[side].y;
            let stepX = map[side].stepX ?? 0;
            let stepY = map[side].stepY ?? 0;
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
        this.width = Math.max(Grid.SPACING * 2, (ports.top.length + 1) * Grid.SPACING, (ports.bottom.length + 1) * Grid.SPACING);
        this.height = Math.max(Grid.SPACING * 2, (ports.left.length + 1) * Grid.SPACING, (ports.right.length + 1) * Grid.SPACING);
    }
}
