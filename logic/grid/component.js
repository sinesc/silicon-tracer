"use strict";

// IO port on a component.
class ComponentPort {
    name;
    originalSide;
    index;
    color;
    element;
    labelElement;
    netId = null;
    constructor(name, originalSide, index, color = null, element = null, labelElement = null) {
        assert.string(name, true);
        assert.string(originalSide);
        assert.number(index);
        assert.number(color, true);
        assert.object(element, true);
        assert.object(labelElement, true);
        this.name = name;
        this.originalSide = originalSide;
        this.index = index;
        this.color = color;
        this.element = element;
        this.labelElement = labelElement;
    }
    // Removes port dom elements from grid.
    unlink() {
        this.labelElement?.remove();
        this.labelElement = null;
        this.element?.remove();
        this.element = null;
    }
    // Returns port coordinates for the given parent component width/height.
    static portCoords(width, height, side, index, offsetCenter) {
        // for correct rotation required: top: left->right, right: top->bottom, bottom: right->left, left: bottom->top
        const map = {
            'top'   : { x: Grid.SPACING,            y: 0,                       stepX: Grid.SPACING },
            'right' : { x: width,                   y: Grid.SPACING,            stepY: Grid.SPACING },
            'bottom': { x: width - Grid.SPACING,    y: height,                  stepX: -Grid.SPACING },
            'left'  : { x: 0,                       y: height - Grid.SPACING,   stepY: -Grid.SPACING },
        };
        let x = map[side].x + (map[side].stepX ?? 0) * index - (offsetCenter ? Component.PORT_SIZE / 2 : 0);
        let y = map[side].y + (map[side].stepY ?? 0) * index - (offsetCenter ? Component.PORT_SIZE / 2 : 0);
        return new Point(x, y);
    }
    // Returns the port side name after given component rotation is considered.
    static portSide(rotation, originalSide) {
        let index = Component.SIDES.indexOf(originalSide);
        return Component.SIDES[(index + rotation) % 4];
    }
    // Returns the port coordinates after component rotation is considered. Also requires component width and height as input.
    coords(width, height, rotation, offsetCenter) {
        return ComponentPort.portCoords(width, height, this.side(rotation), this.index, offsetCenter);
    }
    // Returns the port side name after component rotation is considered.
    side(rotation) {
        let index = Component.SIDES.indexOf(this.originalSide);
        return Component.SIDES[(index + rotation) % 4];
    }
}

// General component used as a base class for Gates/Builtins or user defined circuits when represented within other circuits.
class Component extends GridItem {

    static SIDES = [ 'top', 'right', 'bottom', 'left' ];
    static PORT_SIZE = 14;
    static INNER_MARGIN = 5;

    #element;
    #inner;
    #dropPreview;
    #ports;
    #type;
    #width;
    #height;
    #rotation = 0;

    constructor(x, y, ports, type) {
        assert.string(type);
        super(x, y);
        this.setPortsFromNames(ports);
        this.#type = type;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.#ports.map((p) => p.name), this.#type ]},
            rotation: this.#rotation,
            width: this.#width,
            height: this.#height,
        };
    }

    // Sets port names/locations
    setPortsFromNames(ports) {
        assert.object(ports, false);
        this.#ports = { left: [], right: [], top: [], bottom: [], ...ports };
        for (let [ side, other ] of Object.entries({ 'left': 'right', 'right': 'left', 'top': 'bottom', 'bottom': 'top' })) {
            while (this.#ports[side].length < this.#ports[other].length) {
                this.#ports[side].push(null);
            }
        }
        this.#ports = this.#ports.map((side, sidePorts) => sidePorts.map((name, index) => new ComponentPort(name, side, index)));
        this.updateDimensions();
    }

    // Link component to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);

        // container
        this.#element = document.createElement('div');
        this.#element.classList.add('component');
        this.#element.setAttribute('data-component-type', this.#type);

        // inner area with name
        this.#inner = document.createElement('div');
        this.#inner.innerHTML = '<span>' + this.label + '</span>';
        this.#inner.classList.add('component-inner');
        this.registerDrag(this.#inner, { type: "component", grabOffsetX: null, grabOffsetY: null });
        this.#element.appendChild(this.#inner);

        // ports
        this.getPorts().forEach((item) => {
            // TODO: add and call link() method on ComponentPort instead?
            let port = document.createElement('div');
            port.classList.add('component-port');
            this.#element.appendChild(port);
            this.setHoverMessage(port, () => 'Port <b>' + item.name + '</b> of <b>' + this.#type + '</b>. <i>LMB</i>: Drag to connect.', { type: 'hover-port' });
            // port hover label
            let labelElement = document.createElement('div');
            labelElement.classList.add('component-port-label');
            this.#element.appendChild(labelElement);
            // update this.ports with computed port properties
            item.element = port;
            item.labelElement = labelElement;
            // register a drag event for the port, will trigger onDrag with the port name
            this.registerDrag(port, { type: "port", name: item.name });
        });

        grid.addVisual(this.#element);
    }

    // Removes the component from the grid.
    unlink() {
        this.getPorts().forEach((item) => {
            item.unlink();
        });
        this.#inner?.remove();
        this.#inner = null;
        this.grid.removeVisual(this.#element);
        this.#element = null;
        this.#dropPreview?.remove();
        this.#dropPreview = null;
        super.unlink();
    }

    // Detach component ports from simulation.
    detachSimulation() {
        this.getPorts().forEach((item) => {
            item.netId = null;
        });
    }

    // Implement to return whether the element is selected.
    get selected() {
        return this.#element.classList.contains('selected');
    }

    // Implement to apply/remove component selection effect.
    set selected(status) {
        assert.bool(status, true);
        this.#element.classList.toggle('selected', status);
    }

    // Return grid item width.
    get width() {
        return this.#width;
    }

    // Set grid item width.
    set width(value) {
        assert.number(value);
        this.dirty ||= this.#width !== value;
        this.#width = value;
    }

    // Return grid item height.
    get height() {
        return this.#height;
    }

    // Set grid item height.
    set height(value) {
        assert.number(value);
        this.dirty ||= this.#height !== value;
        this.#height = value;
    }

    // Return grid item rotation.
    get rotation() {
        return this.#rotation;
    }

    // Set grid item rotation.
    set rotation(value) {
        assert.number(value);
        this.dirty ||= this.#rotation !== value;
        this.#rotation = value;
    }

    // Get component type string.
    get type() {
        return this.#type;
    }

    // Set component type string.
    set type(val) {
        this.#type = val;
        if (this.#element) {
            this.#element.setAttribute('data-component-type', this.#type);
        }
        if (this.#inner) {
            this.#inner.innerHTML = '<span>' + this.label + '</span>';
        }
    }

    // Returns the component label string.
    get label() {
        return this.#type.toUpperFirst()
    }

    // Returns the component root element.
    get element() {
        return this.#element;
    }

    // Returns the inner element of the component.
    get inner() {
        return this.#inner;
    }

    // Gets the screen width for this component.
    get visualWidth() {
        return this.width * this.grid.zoom;
    }

    // Gets the screen height for this component.
    get visualHeight() {
        return this.height * this.grid.zoom;
    }

    // Returns the name of the side that is currently rotated to the top of the component.
    get rotatedTop() {
        assert(this.rotation >= 0);
        return Component.SIDES[(0 + this.rotation) % 4];
    }

    // Returns the name of the side that is currently rotated to the right of the component.
    get rotatedRight() {
        assert(this.rotation >= 0);
        return Component.SIDES[(1 + this.rotation) % 4];
    }

    // Returns the name of the side that is currently rotated to the bottom of the component.
    get rotatedBottom() {
        assert(this.rotation >= 0);
        return Component.SIDES[(2 + this.rotation) % 4];
    }

    // Returns the name of the side that is currently rotated to the left of the component.
    get rotatedLeft() {
        assert(this.rotation >= 0);
        return Component.SIDES[(3 + this.rotation) % 4];
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        if (key === 'r' && what.type === 'hover') {
            // rotate component with R while mouse is hovering
            this.rotation = (this.rotation + 1) & 3;
            this.x += (this.width - this.height) / 2;
            this.y -= (this.width - this.height) / 2;
            [ this.x, this.y ] = Grid.align(this.x, this.y);
            this.updateDimensions();
            this.#element.classList.add('component-rotate-animation');
            setTimeout(() => {
                this.#element.classList.remove('component-rotate-animation');
                app.restartSimulation();
                this.dirty = true;
                this.render();
            }, 150);
        } else if (key === 'd' && what.type === 'hover') {
            this.#element.classList.add('component-delete-animation');
            setTimeout(() => {
                if (this.#element) { // deletion might already be in progress
                    this.#element.classList.remove('component-delete-animation');
                    this.grid.removeItem(this);
                }
            }, 150);
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
            let [ alignedX, alignedY ] = Grid.align(this.x, this.y);
            let [ visualX, visualY ] = this.gridToVisual(alignedX, alignedY);
            this.#dropPreview.style.left = visualX + "px";
            this.#dropPreview.style.top = visualY + "px";
            this.#dropPreview.style.width = this.visualWidth + "px";
            this.#dropPreview.style.height = this.visualHeight + "px";
        } else {
            this.grid.removeVisual(this.#dropPreview);
            this.#dropPreview = null;
            what.grabOffsetX = null;
            what.grabOffsetY = null;
            app.restartSimulation();
        }
    }

    // Create connection from port.
    onConnect(x, y, status, what) {
        this.dragStop(x, y, what);
        this.grid.releaseHotkeyTarget(this, true);
        let port = this.portByName(what.name);
        let portCoords = port.coords(this.width, this.height, this.rotation);
        let portSide = port.side(this.rotation);
        let ordering = portSide === 'top' || portSide === 'bottom' ? 'vh' : 'hv';
        let px = this.x + portCoords.x;
        let py = this.y + portCoords.y;
        const MINIMA = {
            left: (x, y) => x > px,
            right: (x, y) => x < px,
            top: (x, y) => y > py,
            bottom: (x, y) => y < py,
        };
        let wireBuilder = new WireBuilder(px, py, x, y, ordering, port.color, MINIMA[portSide]);
        wireBuilder.render();
        wireBuilder.dragStart(x, y, what);
    }

    // Called while a registered visual is being dragged.
    onDrag(x, y, status, what) {
        if (what.type === 'component') {
            this.onMove(x, y, status, what);
        } else if (what.type === 'port' && status === 'start') {
            this.onConnect(x, y, status, what);
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

    // Update component width/height from given ports.
    updateDimensions() {
        this.width = Math.max(Grid.SPACING * 2, (this.#ports[this.rotatedTop].length + 1) * Grid.SPACING, (this.#ports[this.rotatedBottom].length + 1) * Grid.SPACING);
        this.height = Math.max(Grid.SPACING * 2, (this.#ports[this.rotatedLeft].length + 1) * Grid.SPACING, (this.#ports[this.rotatedRight].length + 1) * Grid.SPACING);
    }

    // Renders the component onto the grid.
    render() {

        if (this.#element.classList.contains('component-rotate-animation')) {
            return;
        }

        // don't need to update ports when only moving
        if (this.dirty) {
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

    // Renders a label next to a port.
    renderLabel(element, side, x, y, label, containPort = true, force = false) {
        if (label.length <= 1 && !force) {
            element.style.display = 'none';
        } else {
            const visualPortSize = Component.PORT_SIZE * this.grid.zoom;
            const visualPortInset = visualPortSize / 4 + (visualPortSize * (containPort ? 0 : (side === 'left' || side === 'top' ? 1.1 : -1.1)));
            const visualLabelPadding = 1 * this.grid.zoom;
            const visualLabelLineHeight = visualPortSize + 2 * visualLabelPadding;
            const visualPortPadding = containPort ? visualLabelLineHeight : 0;
            const properties = [ 'writingMode', 'left', 'top', 'right', 'bottom','paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'width', 'height', ];
            element.style.display = 'block';
            element.innerHTML = label;
            element.style.lineHeight = visualLabelLineHeight + 'px';
            let style;
            if (side === 'bottom') {
                style = {
                    writingMode: 'vertical-rl',
                    left: (x - visualLabelPadding) + "px",
                    top: (y - visualLabelPadding - visualPortInset) + "px",
                    paddingTop: visualPortPadding + "px",
                    paddingBottom: visualLabelPadding + "px",
                    width: visualLabelLineHeight + "px",
                };
            } else if (side === 'top') {
                style = {
                    writingMode: 'sideways-lr',
                    left: (x - visualLabelPadding) + "px",
                    bottom: (this.visualHeight - visualPortSize - visualLabelPadding + visualPortInset) + "px",
                    paddingTop: visualLabelPadding + "px",
                    paddingBottom: visualPortPadding + "px",
                    width: visualLabelLineHeight + "px",
                };
            } else if (side === 'left') {
                style = {
                    writingMode: 'horizontal-tb',
                    top: (y - visualLabelPadding) + "px",
                    right: (this.visualWidth - visualPortSize - visualLabelPadding + visualPortInset) + "px",
                    paddingLeft: visualLabelPadding + "px",
                    paddingRight: visualPortPadding + "px",
                    height: visualLabelLineHeight + "px",
                };
            } else if (side === 'right') {
                style = {
                    writingMode: 'horizontal-tb',
                    left: (x - visualLabelPadding - visualPortInset) + "px",
                    top: (y - visualLabelPadding) + "px",
                    paddingLeft: visualPortPadding + "px",
                    paddingRight: visualLabelPadding + "px",
                    height: visualLabelLineHeight + "px",
                };
            }
            for (const property of properties) {
                element.style[property] = style[property] ?? '';
            }
        }
    }

    // Renders component ports. Only required during scaling/rotation.
    #renderPorts() {
        const visualPortSize = Component.PORT_SIZE * this.grid.zoom;
        const visualPortInset = visualPortSize / 4;
        this.getPorts().forEach((item) => {
            const side = item.side(this.rotation);
            let { x, y } = item.coords(this.width, this.height, this.rotation, true);
            // minor inset to move ports inward into the component just a little
            const visualPortInsetX = side === 'left' ? visualPortInset : (side === 'right' ? -visualPortInset : 0);
            const visualPortInsetY = side === 'top' ? visualPortInset : (side === 'bottom' ? -visualPortInset : 0);
            // apply port center offset and grid zoom
            x *= this.grid.zoom;
            y *= this.grid.zoom;
            // set visual coordinates
            item.element.style.left = (x + visualPortInsetX) + "px";
            item.element.style.top = (y + visualPortInsetY) + "px";
            item.element.style.width = visualPortSize + "px";
            item.element.style.height = visualPortSize + "px";
            item.element.style.lineHeight = visualPortSize + 'px';
            item.element.innerHTML = '<span>' + item.name.slice(0, 1) + '</span>';
            item.element.setAttribute('data-net-color', item.color ?? '');
            this.renderLabel(item.labelElement, side, x, y, item.name);
        });
    }

    // Renders/updates the current net state of the component ports to the grid.
    renderNetState() {
        this.getPorts().forEach((item) => {
            let state = item.netId !== null && app.sim ? '' + app.sim.engine.getNetValue(item.netId) : '';
            if (item.element.getAttribute('data-net-state') !== state) {
                item.element.setAttribute('data-net-state', state);
            }
        });
    }
}
