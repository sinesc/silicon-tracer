"use strict";

class ComponentPort {
    name;
    originalSide;
    index;
    color;
    port;
    portLabel;
    netId = null;
    constructor(name, originalSide, index, color = null, port = null, portLabel = null) {
        this.name = name;
        this.originalSide = originalSide;
        this.index = index;
        this.color = color;
        this.port = port;
        this.portLabel = portLabel;
    }
    // Removes port dom elements
    remove() {
        this.portLabel?.remove();
        this.portLabel = null;
        this.port?.remove();
        this.port = null;
    }
    // Returns the port coordinates after component rotation is considered. Also requires component width and height as input.
    coords(width, height, rotation) {
        // for correct rotation required: top: left->right, right: top->bottom, bottom: right->left, left: bottom->top
        const map = {
            'top'   : { x: Grid.SPACING,            y: 0,                       stepX: Grid.SPACING },
            'right' : { x: width,                   y: Grid.SPACING,            stepY: Grid.SPACING },
            'bottom': { x: width - Grid.SPACING,    y: height,                  stepX: -Grid.SPACING },
            'left'  : { x: 0,                       y: height - Grid.SPACING,   stepY: -Grid.SPACING },
        };
        let side = this.side(rotation);
        let x = map[side].x + (map[side].stepX ?? 0) * this.index;
        let y = map[side].y + (map[side].stepY ?? 0) * this.index;
        return new Point(x, y);
    }
    // Returns the port side name after component rotation is considered.
    side(rotation) {
        let index = Component.SIDES.indexOf(this.originalSide);
        return Component.SIDES[(index + rotation) % 4];
    }
}

class Component extends GridItem {

    static SIDES = [ 'top', 'right', 'bottom', 'left' ];
    static PORT_SIZE = 14;
    static INNER_MARGIN = 5;

    #element;
    #inner;
    #dropPreview;
    #ports;
    #dragConnection = null;
    rotation = 0;

    constructor(grid, x, y, ports, name) {

        super(grid);

        [ this.x, this.y ] = this.gridAlign(x, y);

        // container
        this.#element = document.createElement('div');
        this.#element.classList.add('component');
        this.#element.setAttribute('data-component-name', name); // setAttribtute: dislike dataset-api name transcription when they could have just used [index] access to avoid the hyphen issue.

        // inner area with name
        this.#inner = document.createElement('div');
        this.#inner.innerHTML = '<span>' + name + '</span>';
        this.#inner.classList.add('component-inner');
        this.setHoverMessage(this.#inner, 'Component <b>' + name + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>D</i>: Delete', { type: 'hover' });
        this.registerDrag(this.#inner, { type: "component", grabOffsetX: null, grabOffsetY: null });
        this.#element.appendChild(this.#inner);

        // ensure ports are completely defined

        this.#ports = { left: [], right: [], top: [], bottom: [], ...ports };

        for (let [ side, other ] of Object.entries({ 'left': 'right', 'right': 'left', 'top': 'bottom', 'bottom': 'top' })) {
            while (this.#ports[side].length < this.#ports[other].length) {
                this.#ports[side].push(null);
            }
        }

        this.#ports = this.#ports.map((side, sidePorts) => sidePorts.map((name, index) => new ComponentPort(name, side, index)));

        // ports
        this.updateDimensions();
        this.getPorts().forEach((item) => {
            let port = document.createElement('div');
            port.classList.add('component-port');
            this.#element.appendChild(port);
            this.setHoverMessage(port, 'Port <b>' + item.name + '</b> of <b>' + name + '</b>. <i>LMB</i>: Drag to connect.', { type: 'hover-port' });
            // port hover label
            let portLabel = document.createElement('div');
            portLabel.classList.add('component-port-label');
            this.#element.appendChild(portLabel);
            // update this.ports with computed port properties
            item.port = port;
            item.portLabel = portLabel;
            // register a drag event for the port, will trigger onDrag with the port name
            this.registerDrag(port, { type: "port", name: item.name });
        });

        grid.addVisual(this.#element);
    }

    get element() {
        return this.#element;
    }

    get inner() {
        return this.#inner;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.#ports.map((p) => p.name), this.#element.getAttribute('data-component-name') ]},
            rotation: this.rotation,
        };
    }

    // Removes the component from the grid.
    remove() {
        this.getPorts().forEach((item) => {
            item.remove();
        });
        this.#ports = null;
        this.#inner?.remove();
        this.#inner = null;
        this.grid.removeVisual(this.#element);
        this.#element = null;
        this.#dropPreview?.remove();
        this.#dropPreview = null;
        this.#dragConnection?.remove();
        this.#dragConnection = null;
        super.remove();
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        if (key === 'r' && what.type === 'hover') {
            // rotate component with R while mouse is hovering
            this.rotation = (this.rotation + 1) & 3;
            this.x += (this.width - this.height) / 2;
            this.y -= (this.width - this.height) / 2;
            this.updateDimensions();
            this.#element.classList.add('component-rotate-animation');
            setTimeout(() => {
                this.#element.classList.remove('component-rotate-animation');
                this.grid.invalidateNets();
                this.grid.render();
            }, 150);
        } else if (key === 'd' && what.type === 'hover') {
            this.#element.classList.add('component-delete-animation');
            setTimeout(() => {
                this.#element.classList.remove('component-delete-animation');
                this.grid.invalidateNets();
                this.remove();
            }, 150);
        } else if (key === 'r' && what.type === 'connect') {
            // add connection point when pressing R while dragging a connection
            let x = this.#dragConnection.x + this.#dragConnection.width;
            let y = this.#dragConnection.y + this.#dragConnection.height;
            let color = this.#dragConnection.color;
            // pass handling off to the previously created connection
            let flippedOrdering = this.#dragConnection.ordering !== what.ordering;
            let dragConnectionWhat = { ...what, ordering: flippedOrdering ? what.ordering == 'hv' ? 'vh' : 'hv' : what.ordering, x, y, color };
            this.grid.releaseHotkeyTarget(this, true);
            this.dragStop(x, y, what);
            this.#dragConnection.dragStart(x, y, dragConnectionWhat);
            this.#dragConnection = null;
            this.grid.invalidateNets();
            this.grid.render();
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
            if (!this.#dropPreview) {
                this.#dropPreview = document.createElement('div');
                this.#dropPreview.classList.add('component-drop-preview');
                this.grid.addVisual(this.#dropPreview);
            }
            let [ alignedX, alignedY ] = this.gridAlign(this.x, this.y);
            let [ visualX, visualY ] = this.gridToVisual(alignedX, alignedY);
            this.#dropPreview.style.left = visualX + "px";
            this.#dropPreview.style.top = visualY + "px";
            this.#dropPreview.style.width = this.visualWidth + "px";
            this.#dropPreview.style.height = this.visualHeight + "px";
            this.render('move');
        } else {
            this.grid.removeVisual(this.#dropPreview);
            this.#dropPreview = null;
            what.grabOffsetX = null;
            what.grabOffsetY = null;
            this.grid.invalidateNets();
            this.grid.render();
        }
    }

    // Create connection from port.
    onConnect(x, y, status, what) {
        let port = this.portByName(what.name);
        let portCoords = port.coords(this.width, this.height, this.rotation);
        let portSide = port.side(this.rotation);
        if (!this.#dragConnection /* start */) {
            this.grid.setMessage(Connection.DRAWING_CONNECTION_MESSAGE, true);
            what.ordering = portSide === 'top' || portSide === 'bottom' ? 'vh' : 'hv';
            this.grid.requestHotkeyTarget(this, true, { ...what, type: 'connect' }); // pass 'what' to onHotkey()
            this.#dragConnection = new Connection(this.grid, this.x + portCoords.x, this.y + portCoords.y, x, y, what.ordering);
            this.#dragConnection.render();
        } else if (status !== 'stop') {
            // flip ordering when draggin towards component, effetively routing around the component
            if (what.ordering === 'hv' && ((portSide === 'left' ? this.#dragConnection.x < x : this.#dragConnection.x > x))) {
                this.#dragConnection.ordering = 'vh';
            } else if (what.ordering === 'vh' && (portSide === 'top' ? this.#dragConnection.y < y : this.#dragConnection.y > y)) {
                this.#dragConnection.ordering = 'hv';
            } else {
                this.#dragConnection.ordering = what.ordering;
            }
            this.#dragConnection.setEndpoints(this.#dragConnection.x, this.#dragConnection.y, x, y, true);
            this.#dragConnection.render();
        } else {
            // FIXME: delete connection if no wires were produced (not dragged far enough)
            this.#dragConnection = null;
            this.grid.clearMessage(true);
            this.grid.releaseHotkeyTarget(this, true);
            this.grid.invalidateNets();
            this.grid.render();
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

        if (this.#element.classList.contains('component-rotate-animation')) {
            return;
        }

        // don't need to update ports when only moving
        if (reason !== 'move') {
            this.#renderPorts();
        }

        this.#element.style.left = this.visualX + "px";
        this.#element.style.top = this.visualY + "px";
        this.#element.style.width = this.visualWidth + "px";
        this.#element.style.height = this.visualHeight + "px";
        this.element.setAttribute('data-component-rotation', this.rotation);

        if ((this.width < this.height || (this.width === this.height && this.#ports[this.rotatedTop].length === 0 && this.#ports[this.rotatedBottom].length === 0)) && this.visualWidth < 200) {
            this.#inner.style.lineHeight = (this.visualWidth - (Component.INNER_MARGIN * 2)) + "px";
            this.#inner.style.writingMode = 'vertical-rl';
        } else {
            this.#inner.style.lineHeight = (this.visualHeight - (Component.INNER_MARGIN * 2)) + "px";
            this.#inner.style.writingMode = 'horizontal-tb';
        }
    }

    // Returns flat list of ports.
    getPorts() {
        let ports = [  ];
        for (const items of Object.values(this.#ports)) {
            for (const item of items) {
                if (item.name !== null) {
                    ports.push(item);
                }
            }
        }
        return ports;
    }

    // Gets a port by its name.
    portByName(name) {
        for (const items of Object.values(this.#ports)) {
            for (const item of items) {
                if (item.name === name) {
                    return item;
                }
            }
        }
        return null;
    }

    // Renders component ports. Only required during scaling/rotation.
    #renderPorts() {
        let visualPortSize = Component.PORT_SIZE * this.grid.zoom;
        let visualPortInset = visualPortSize / 4;
        let visualLabelPadding = 1 * this.grid.zoom;
        let visualLabelLineHeight = visualPortSize + 2 * visualLabelPadding;
        let properties = [ 'writingMode', 'left', 'top', 'right', 'bottom','paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'width', 'height', ];
        this.getPorts().forEach((item) => {
            let side = item.side(this.rotation);
            let { x, y } = item.coords(this.width, this.height, this.rotation);
            // minor inset to move ports inward into the component just a little
            let visualPortInsetX = side === 'left' ? visualPortInset : (side === 'right' ? -visualPortInset : 0);
            let visualPortInsetY = side === 'top' ? visualPortInset : (side === 'bottom' ? -visualPortInset : 0);
            // apply port center offset and grid zoom
            x = (x - Component.PORT_SIZE / 2) * this.grid.zoom;
            y = (y - Component.PORT_SIZE / 2) * this.grid.zoom;
            // set visual coordinates
            item.port.style.left = (x + visualPortInsetX) + "px";
            item.port.style.top = (y + visualPortInsetY) + "px";
            item.port.style.width = visualPortSize + "px";
            item.port.style.height = visualPortSize + "px";
            item.port.style.lineHeight = visualPortSize + 'px';
            item.port.innerHTML = '<span>' + item.name.slice(0, 1) + '</span>';
            item.port.setAttribute('data-net-color', item.color ?? '');
            item.port.setAttribute('data-net-state', item.netId !== null && this.grid.sim ? this.grid.sim.getNet(item.netId) : '');
            if (item.name.length <= 1) {
                item.portLabel.style.display = 'none';
            } else {
                item.portLabel.style.display = 'block';
                item.portLabel.innerHTML = item.name;
                item.portLabel.style.lineHeight = visualLabelLineHeight + 'px';
                let style;
                if (side === 'bottom') {
                    style = {
                        writingMode: 'vertical-rl',
                        left: (x - visualLabelPadding) + "px",
                        top: (y - visualLabelPadding - visualPortInset) + "px",
                        paddingTop: visualLabelLineHeight + "px",
                        paddingBottom: visualLabelPadding + "px",
                        width: visualLabelLineHeight + "px",
                    };
                } else if (side === 'top') {
                    style = {
                        writingMode: 'sideways-lr',
                        left: (x - visualLabelPadding) + "px",
                        bottom: (this.visualHeight - visualPortSize - visualLabelPadding + visualPortInset) + "px",
                        paddingTop: visualLabelPadding + "px",
                        paddingBottom: visualLabelLineHeight + "px",
                        width: visualLabelLineHeight + "px",
                    };
                } else if (side === 'left') {
                    style = {
                        writingMode: 'horizontal-tb',
                        top: (y - visualLabelPadding) + "px",
                        right: (this.visualWidth - visualPortSize - visualLabelPadding + visualPortInset) + "px",
                        paddingLeft: visualLabelPadding + "px",
                        paddingRight: visualLabelLineHeight + "px",
                        height: visualLabelLineHeight + "px",
                    };
                } else if (side === 'right') {
                    style = {
                        writingMode: 'horizontal-tb',
                        left: (x - visualLabelPadding - visualPortInset) + "px",
                        top: (y - visualLabelPadding) + "px",
                        paddingLeft: visualLabelLineHeight + "px",
                        paddingRight: visualLabelPadding + "px",
                        height: visualLabelLineHeight + "px",
                    };
                }
                for (const property of properties) {
                    item.portLabel.style[property] = style[property] ?? '';
                }
            }
        });
    }

    get rotatedTop() {
        return Component.SIDES[(0 + this.rotation) % 4];
    }
    get rotatedRight() {
        return Component.SIDES[(1 + this.rotation) % 4];
    }
    get rotatedBottom() {
        return Component.SIDES[(2 + this.rotation) % 4];
    }
    get rotatedLeft() {
        return Component.SIDES[(3 + this.rotation) % 4];
    }

    // Update component width/height from given ports.
    updateDimensions() {
        this.width = Math.max(Grid.SPACING * 2, (this.#ports[this.rotatedTop].length + 1) * Grid.SPACING, (this.#ports[this.rotatedBottom].length + 1) * Grid.SPACING);
        this.height = Math.max(Grid.SPACING * 2, (this.#ports[this.rotatedLeft].length + 1) * Grid.SPACING, (this.#ports[this.rotatedRight].length + 1) * Grid.SPACING);
    }
}
