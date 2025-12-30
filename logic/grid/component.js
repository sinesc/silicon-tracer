"use strict";

// IO port on a component.
class ComponentPort {

    name;
    originalSide;
    index;
    color;
    element;
    labelElement;

    // Net-id for this item. Directly set by Circuit.attachSimulation()
    netId = null;

    constructor(name, originalSide, index, color = null, element = null, labelElement = null) {
        assert.string(name, true);
        assert.string(originalSide);
        assert.integer(index);
        assert.integer(color, true);
        assert.class(Node, element, true);
        assert.class(Node, labelElement, true);
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
        const x = map[side].x + (map[side].stepX ?? 0) * index - (offsetCenter ? Component.PORT_SIZE / 2 : 0);
        const y = map[side].y + (map[side].stepY ?? 0) * index - (offsetCenter ? Component.PORT_SIZE / 2 : 0);
        return new Point(x, y);
    }

    // Returns the port side name after given component rotation is considered.
    static portSide(rotation, originalSide) {
        const index = Component.SIDES.indexOf(originalSide);
        return Component.SIDES[(index + rotation) % 4];
    }

    // Returns the port coordinates after component rotation is considered. Also requires component width and height as input.
    coords(width, height, rotation, offsetCenter) {
        return ComponentPort.portCoords(width, height, this.side(rotation), this.index, offsetCenter);
    }

    // Returns the port side name after component rotation is considered.
    side(rotation) {
        const index = Component.SIDES.indexOf(this.originalSide);
        return Component.SIDES[(index + rotation) % 4];
    }
}

// General component used as a base class for Gates/Builtins or user defined circuits when represented within other circuits.
class Component extends GridItem {

    static HOTKEYS = '<i>LMB</i> Drag to move, <i>R</i> Rotate, <i>DEL</i> Delete, ' + GridItem.HOTKEYS;

    static EDIT_DIALOG = [
        { name: 'rotation', label: 'Rotation', type: 'select', options: { 0: "Default", 1: "90°", 2: "180°", 3: "270°" }, apply: (v, f) => parseInt(v) },
    ];

    static SIDES = [ 'top', 'right', 'bottom', 'left' ];
    static PORT_SIZE = 14;
    static INNER_MARGIN = 5;

    #element;
    #inner;
    #dropPreview;
    #ports;
    #type;
    #rotation = 0;

    // An id for the simulated component. This could be a constId, clockId, ....
    simId = null;

    constructor(app, x, y, ports, type) {
        assert.string(type);
        super(app, x, y);
        this.setPortsFromNames(ports);
        this.#type = type;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.#ports.map((p) => p.name), this.#type ]},
            rotation: this.#rotation,
        };
    }

    // Sets port names/locations
    setPortsFromNames(ports) {
        assert.object(ports, false);
        this.#ports = { left: [], right: [], top: [], bottom: [], ...ports };
        for (const [ side, other ] of Object.entries({ 'left': 'right', 'right': 'left', 'top': 'bottom', 'bottom': 'top' })) {
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

        // container and inner area with name
        this.#element = element(null, 'div', 'component');
        this.#element.setAttribute('data-component-type', this.#type);
        this.#inner = element(this.#element, 'div', 'component-inner', `<span>${this.label}</span>`);
        this.registerMouseAction(this.#inner, { type: "component", grabOffsetX: null, grabOffsetY: null });

        // ports
        this.getPorts().forEach((item) => {
            // TODO: add and call link() method on ComponentPort instead?
            const port = element(this.#element, 'div', 'component-port');
            this.setHoverMessage(port, () => `Port <b>${item.name}</b> of <b>${this.#type}</b>. <i>LMB</i> Drag to connect.`, { type: 'hover-port' });
            // port hover label
            const labelElement = element(this.#element, 'div', 'component-port-label');
            // update component port with linked dom nodes
            item.element = port;
            item.labelElement = labelElement;
            // register a drag event for the port, will trigger onDrag with the port name
            this.registerMouseAction(port, { type: "port", name: item.name });
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

    // Return whether the element is selected.
    get selected() {
        return this.#element.classList.contains('selected');
    }

    // Apply/remove component selection effect.
    set selected(status) {
        assert.bool(status, true);
        this.#element.classList.toggle('selected', status);
    }

    // Return grid item rotation.
    get rotation() {
        return this.#rotation;
    }

    // Set grid item rotation.
    set rotation(value) {
        assert.integer(value);
        value = value & 3; // clamp to 0-3
        this.dirty ||= this.#rotation !== value;
        if (this.grid && (value & 1) !== (this.#rotation & 1)) {
            const x = this.x + (this.width - this.height) / 2;
            const y = this.y - (this.width - this.height) / 2;
            [ this.x, this.y ] = Grid.align(x, y);
            this.#rotation = value;
            this.updateDimensions();
        } else {
            this.#rotation = value;
        }
    }

    // Get component type string.
    get type() {
        return this.#type;
    }

    // Set component type string.
    set type(value) {
        assert.string(value);
        this.#type = value;
        if (this.#element) {
            this.#element.setAttribute('data-component-type', this.#type); // TODO set dirty instead
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
            this.rotation += 1;
            this.#element.classList.add('component-rotate-animation');
            setTimeout(() => {
                // queue class removal for next render call to avoid brief flickering
                this.redraw(() => this.#element.classList.remove('component-rotate-animation'));
            }, 150);
            return true;
        } else if (key === 'Delete' && what.type === 'hover') {
            this.#element.classList.add('component-delete-animation');
            setTimeout(() => {
                if (this.#element) { // deletion might already be in progress
                    this.#element.classList.remove('component-delete-animation');
                    this.grid.removeItem(this);
                }
            }, 150);
            return true;
        } else if (key === 'e' && what.type === 'hover') {
            this.onEdit();
            return true;
        }
    }

    // Implement to handle edit hotkey.
    async onEdit() {
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
                this.#dropPreview = element(null, 'div', 'component-drop-preview');
                this.grid.addVisual(this.#dropPreview);
            }
            const [ alignedX, alignedY ] = Grid.align(this.x, this.y);
            const [ visualX, visualY ] = this.gridToVisual(alignedX, alignedY);
            this.#dropPreview.style.left = visualX + "px";
            this.#dropPreview.style.top = visualY + "px";
            this.#dropPreview.style.width = this.visual.width + "px";
            this.#dropPreview.style.height = this.visual.height + "px";
        } else {
            this.grid.removeVisual(this.#dropPreview);
            this.#dropPreview = null;
            what.grabOffsetX = null;
            what.grabOffsetY = null;
            this.redraw();
        }
    }

    // Create connection from port.
    onConnect(x, y, status, what) {
        this.dragStop(x, y, what);
        this.grid.releaseHotkeyTarget(this, true);
        const port = this.portByName(what.name);
        const portCoords = port.coords(this.width, this.height, this.rotation);
        const portSide = port.side(this.rotation);
        const ordering = portSide === 'top' || portSide === 'bottom' ? 'vh' : 'hv';
        const px = this.x + portCoords.x;
        const py = this.y + portCoords.y;
        const MINIMA = {
            left: (x, y) => x > px,
            right: (x, y) => x < px,
            top: (x, y) => y > py,
            bottom: (x, y) => y < py,
        };
        const wireBuilder = new WireBuilder(this.app, this.grid, px, py, x, y, ordering, port.color, MINIMA[portSide]);
        wireBuilder.dragStart(x, y, what);
    }

    // Called while a registered visual is being dragged.
    onDrag(x, y, status, what) {
        if (super.onDrag(x, y, status, what)) {
            return true;
        } else if (what.type === 'component') {
            this.onMove(x, y, status, what);
            return true;
        } else if (what.type === 'port' && status === 'start') {
            this.onConnect(x, y, status, what);
            return true;
        }
    }

    // Returns flat list of ports.
    getPorts() {
        const ports = [  ];
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

        if (!super.render()) {
            return false;
        }

        if (this.#element.classList.contains('component-rotate-animation')) {
            return false;
        }

        // don't need to update ports when only moving
        if (this.dirty) {
            this.#renderPorts();
        }

        const v = this.visual;
        this.#element.style.left = v.x + "px";
        this.#element.style.top = v.y + "px";
        this.#element.style.width = v.width + "px";
        this.#element.style.height = v.height + "px";
        this.element.setAttribute('data-component-rotation', this.rotation);

        if ((this.width < this.height || (this.width === this.height && this.#ports[this.rotatedTop].length === 0 && this.#ports[this.rotatedBottom].length === 0)) && v.width < 200) {
            this.#inner.style.lineHeight = (v.width- (Component.INNER_MARGIN * 2)) + "px";
            this.#inner.style.writingMode = 'vertical-rl';
        } else {
            this.#inner.style.lineHeight = (v.height - (Component.INNER_MARGIN * 2)) + "px";
            this.#inner.style.writingMode = 'horizontal-tb';
        }

        return true;
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
                    bottom: (this.visual.height - visualPortSize - visualLabelPadding + visualPortInset) + "px",
                    paddingTop: visualLabelPadding + "px",
                    paddingBottom: visualPortPadding + "px",
                    width: visualLabelLineHeight + "px",
                };
            } else if (side === 'left') {
                style = {
                    writingMode: 'horizontal-tb',
                    top: (y - visualLabelPadding) + "px",
                    right: (this.visual.width - visualPortSize - visualLabelPadding + visualPortInset) + "px",
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
            const state = this.getNetState(item.netId);
            if (item.element.getAttribute('data-net-state') !== state) {
                item.element.setAttribute('data-net-state', state);
            }
        });
    }
}
