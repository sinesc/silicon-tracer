"use strict";

// IO port on a component.
class ComponentPort {

    name; // simulation port name
    label; // visible port name
    originalSide;
    index;
    color = null;
    element = null;
    labelElement = null;
    shadow = false; // shadow ports share coordinates with another port and are not rendered

    // Net-id for this item. Directly set by Circuit.attachSimulation()
    netIds = null;

    numChannels = null;
    ioType = null;

    constructor(name, originalSide, index, numChannels, ioType) {
        assert.string(name, true);
        assert.string(originalSide);
        assert.integer(index);
        assert.integer(numChannels, true);
        assert.enum(['in', 'out'], ioType, true);
        this.name = name;
        this.label = name;
        this.originalSide = originalSide;
        this.index = index;
        this.numChannels = numChannels;
        this.ioType = ioType;
    }

    // Removes port dom elements from grid.
    unlink() {
        this.labelElement?.remove();
        this.labelElement = null;
        this.element?.remove();
        this.element = null;
    }

    // Returns port coordinates for the given parent component width/height.
    static portCoords(width, height, side, index, offsetCenter = false) {
        assert.integer(width);
        assert.integer(height);
        assert.enum(Component.SIDES, side);
        assert.integer(index);
        assert.bool(offsetCenter);
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
        assert.integer(rotation);
        assert.enum(Component.SIDES, originalSide);
        const index = Component.SIDES.indexOf(originalSide);
        return Component.SIDES[(index + rotation) % 4];
    }

    // Returns the port coordinates after component rotation is considered. Also requires component width and height as input.
    coords(width, height, rotation, offsetCenter = false) {
        return ComponentPort.portCoords(width, height, this.side(rotation), this.index, offsetCenter);
    }

    // Returns the port side name after component rotation is considered.
    side(rotation) {
        assert.integer(rotation);
        const index = Component.SIDES.indexOf(this.originalSide);
        return Component.SIDES[(index + rotation) % 4];
    }

    // Renders the port onto the given component
    render(component, labelCharPos = 0) {
        assert.class(Component, component);
        assert.integer(labelCharPos);
        const visualPortSize = Component.PORT_SIZE * component.grid.zoom;
        const visualPortInset = visualPortSize / 4;
        const side = this.side(component.rotation);
        let { x, y } = this.coords(component.width, component.height, component.rotation, true);
        // minor inset to move ports inward into the component just a little
        const visualPortInsetX = side === 'left' ? visualPortInset : (side === 'right' ? -visualPortInset : 0);
        const visualPortInsetY = side === 'top' ? visualPortInset : (side === 'bottom' ? -visualPortInset : 0);
        // apply port center offset and grid zoom
        x *= component.grid.zoom;
        y *= component.grid.zoom;
        // set visual coordinates
        this.element.style.left = (x + visualPortInsetX) + "px";
        this.element.style.top = (y + visualPortInsetY) + "px";
        this.element.style.width = visualPortSize + "px";
        this.element.style.height = visualPortSize + "px";
        this.element.style.lineHeight = visualPortSize + 'px';
        this.element.innerHTML = '<span>' + this.label.slice(labelCharPos, labelCharPos + 1) + '</span>';
        this.element.setAttribute('data-net-color', this.color ?? '');
        ComponentPort.renderLabel(component, this.labelElement, side, x, y, this.label);
    }

    // Renders a label next to a port.
    static renderLabel(component, element, side, x, y, label, containPort = true, force = false) {
        assert.class(Component, component);
        assert.class(Node, element);
        assert.enum(Component.SIDES, side);
        assert.number(x);
        assert.number(y);
        assert.string(label);
        assert.bool(containPort);
        assert.bool(force);
        if (label.length <= 1 && !force) {
            element.style.display = 'none';
        } else {
            const visualPortSize = Component.PORT_SIZE * component.grid.zoom;
            const visualPortInset = visualPortSize / 4 + (visualPortSize * (containPort ? 0 : (side === 'left' || side === 'top' ? 1.1 : -1.1)));
            const visualLabelPadding = 1 * component.grid.zoom;
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
                    bottom: (component.visual.height - visualPortSize - visualLabelPadding + visualPortInset) + "px",
                    paddingTop: visualLabelPadding + "px",
                    paddingBottom: visualPortPadding + "px",
                    width: visualLabelLineHeight + "px",
                };
            } else if (side === 'left') {
                style = {
                    writingMode: 'horizontal-tb',
                    top: (y - visualLabelPadding) + "px",
                    right: (component.visual.width - visualPortSize - visualLabelPadding + visualPortInset) + "px",
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
}

// General component used as a base class for Gates/Builtins or user defined circuits when represented within other circuits.
class Component extends GridItem {

    static TYPE_LABEL = null;
    static TYPE_LABEL_LONG = null;
    static TYPE_DESCRIPTION = null;

    static HOTKEYS = '<i>Drag</i> Move, <i>SHIFT+Drag</i> Move and adjust wire length, <i>ALT+Drop</i> Accept ghost wires, <i>R</i> Rotate, <i>DEL</i> Delete, ' + GridItem.HOTKEYS;

    static EDIT_DIALOG = [
        { name: 'rotation', label: 'Rotation', type: 'select', options: { 0: "Default", 1: "90°", 2: "180°", 3: "270°" }, apply: (v, f) => parseInt(v) },
    ];

    static SIDES = [ 'top', 'right', 'bottom', 'left' ];
    static PORT_SIZE = 14;

    static #OPPOSING_SIDES = [
        { side: 'left',   other: 'right',  axis: 'y' },
        { side: 'right',  other: 'left',   axis: 'y' },
        { side: 'top',    other: 'bottom', axis: 'x' },
        { side: 'bottom', other: 'top',    axis: 'x' },
    ];

    static #MAX_GHOST_DISTANCE = 3;
    static #INNER_MARGIN = 5;

    #element;
    #inner;
    #dropPreview;
    #ghostWires = [];
    #ports;
    #type;
    #rotation = 0;
    #portLabelCharPos;

    constructor(app, x, y, rotation, ports, type = null, portChannels = null, portIoTypes = null) {
        assert.integer(rotation);
        assert.string(type, true);
        super(app, x, y);
        this.#rotation = rotation & 3;
        this.#type = type ?? this.constructor.name.toLowerCase();
        this.setPortsFromNames(ports, portChannels, portIoTypes);
    }

    // Builds ComponentPort instances from map of list of ports.
    // shadowPorts mirrors the portNames structure: each name at position i on a side is placed at the
    // same coordinates as portNames[side][i] but marked as shadow (not rendered, participates in netlist only).
    buildPortsFromNames(portNames, portChannels = null, portIoTypes = null, shadowPorts = null) {
        assert.object(portNames);
        assert.object(portIoTypes, true);
        assert.object(shadowPorts, true);
        if (!Number.isInteger(portChannels)) {
            assert.object(portChannels, true);
        }
        const ports = { left: [], right: [], top: [], bottom: [], ...portNames };
        // ensure same number of ports on opposing sides of the component by filling up the shorter side with null ports
        for (const { side, other } of Component.#OPPOSING_SIDES) {
            while (ports[side].length < ports[other].length) {
                ports[side].push(null);
            }
        }
        // convert port names to ComponentPort instances
        const result = Object.map(ports, (side, sidePorts) => sidePorts.map((name, index) => new ComponentPort(name, side, index, Number.isInteger(portChannels) ? portChannels : (portChannels?.[name] ?? null), portIoTypes?.[name] ?? null)));
        // add shadow ports co-located with their corresponding portNames entries
        if (shadowPorts) {
            for (const [ side, names ] of Object.entries(shadowPorts)) {
                for (let i = 0; i < names.length; i++) {
                    const name = names[i];
                    if (!name) continue;
                    const port = new ComponentPort(name, side, i, Number.isInteger(portChannels) ? portChannels : (portChannels?.[name] ?? 1), portIoTypes?.[name] ?? null);
                    port.shadow = true;
                    result[side].push(port);
                }
            }
        }
        return result;
    }

    // Sets port names/locations and optionally channels per port or for all ports.
    setPortsFromNames(portNames, portChannels = null, portIoTypes = null, shadowPorts = null) {
        this.#ports = this.buildPortsFromNames(portNames, portChannels, portIoTypes, shadowPorts);
        this.updateDimensions();
    }

    // Link component to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);

        // container and inner area with name
        this.#element = html(null, 'div', 'component');
        this.#element.setAttribute('data-component-type', this.#type);
        this.#inner = html(this.#element, 'div', 'component-inner', `<span>${this.topMarkings}</span>`);
        this.registerMouseAction(this.#inner, { type: "component", grabOffsetX: null, grabOffsetY: null });
        this.#findPortLabelCharPos();

        // ports
        for (const item of this.ports) {
            if (item.shadow) continue; // shadow ports share coordinates with another port and are not rendered
            // TODO: add and call link() method on ComponentPort instead?
            const port = html(this.#element, 'div', 'component-port');
            const message = () => {
                const channels = item.netIds?.length ?? 1;
                const kind = channels === 1 ? 'Port' : `<b>${channels}-bit</b> port`;
                return `${kind} <b>${item.label}</b> of <b>${this.#type}</b>. <i>Drag</i> Connect.`;
            };
            this.setHoverMessage(port, message, { type: 'hover-port' });
            // port hover label
            const labelElement = html(this.#element, 'div', 'component-port-label');
            // update component port with linked dom nodes
            item.element = port;
            item.labelElement = labelElement;
            // register a drag event for the port, will trigger onDrag with the port name
            this.registerMouseAction(port, { type: "port", name: item.name });
        }

        grid.addVisual(this.#element);
    }

    // Removes the component from the grid.
    unlink() {
        for (const item of this.ports) {
            item.unlink();
        }
        this.#inner?.remove();
        this.#inner = null;
        this.grid.removeVisual(this.#element);
        this.#element = null;
        this.#dropPreview?.remove();
        this.#dropPreview = null;
        super.unlink();
    }

    // Return false to completely ignore this component in netlist/simulation.
    disregard() {
        return false;
    }

    // Detach component ports from simulation.
    detachSimulation() {
        this.simIds = [];
        for (const item of this.ports) {
            item.netIds = null;
        }
    }

    // Return whether the element is selected.
    get selected() {
        return this.#element?.classList.contains('selected') ?? false;
    }

    // Apply/remove component selection effect.
    set selected(status) {
        assert.bool(status, true);
        this.#element?.classList.toggle('selected', status);
    }

    // Return whether the element is highlighted.
    get highlighted() {
        return this.#element?.classList.contains('highlighted') ?? false;
    }

    // Apply/remove component highlight effect.
    set highlighted(status) {
        assert.bool(status);
        this.#element?.classList.toggle('highlighted', status);
    }

    // Returns true if the search string matches this component.
    match(string) {
        assert.string(string);
        return this.topMarkings.toLowerCase().includes(string);
    }

    // Return grid item rotation.
    get rotation() {
        return this.#rotation;
    }

    // Set grid item rotation.
    set rotation(value) {
        assert.integer(value);
        value = value & 3; // clamp to 0-3
        const changed = this.#rotation !== value;
        if (this.grid && (value & 1) !== (this.#rotation & 1)) {
            const offset = this.#rotationOffset(value);
            this.x += offset.x;
            this.y += offset.y;
            this.#rotation = value;
            this.updateDimensions();
        } else {
            this.#rotation = value;
        }
        if (changed) {
            this.app.config.placementDefaults[this.#type] ??= {};
            this.app.config.placementDefaults[this.#type].rotation = value;
            if (this.grid) {
                this.renderFlags |= GridItem.NEEDS_FULL_RENDER;
                this.grid?.markTopologyChanged();
            }
        }
    }

    // Get component type string (used for CSS styling, base value for default topMarkings and typeLabel)
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
            this.#inner.innerHTML = '<span>' + this.topMarkings + '</span>';
        }
    }

    // Returns the text displayed ontop of the component.
    get topMarkings() {
        return this.#type.toUpperFirst()
    }

    // Returns the component type label used in text referring to what the component is.
    get typeLabel() {
        return this.topMarkings;
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

    // Computes required x/y offset for a rotation.
    #rotationOffset(value, align = true) {
        if ((value & 1) !== (this.#rotation & 1)) {
            let x = this.x + (this.width - this.height) / 2;
            let y = this.y - (this.width - this.height) / 2;
            // Rotating a rectangle with differing side length parity on a grid causes the sides to become unaligned with the grid.
            // This is because for an odd length side the center must be between two grid points but for an even length it must be
            // on a grid point if the edges of the rectangle are supposed to align with the grid. Therefore a 90° turn around a fixed
            // center would cause the edges to fall between two grid points. To correct this, half a grid unit is added to x or y of
            // the center. To prevent the component from "walking away" each time it is rotated, we switch between adding to x or y.
            if (((this.width / Grid.SPACING) % 2) !== ((this.height / Grid.SPACING) % 2)) {
                if (this.width < this.height) {
                    x += Grid.SPACING / 2;
                } else {
                    y += Grid.SPACING / 2;
                }
            }
            if (align) {
                [ x, y ] = this.align(x, y);
            }
            return new Point(x - this.x, y - this.y);
        } else {
            return new Point(0, 0);
        }
    }

    // Hover hotkey actions
    onHotkey(key, action, what) {
        if (action !== 'down') {
            return;
        }
        if (key === 'r' && what.type === 'hover') {
            // rotate component with R while mouse is hovering
            this.#element.classList.add('component-rotate-animation');
            // animation only: CSS transition is an in-place rotation, but in reality we also move the component to maintain grid snap (required if width%2 != height%2)
            // this computes the visual offset and updates the component left/top position immediately so that these can also be animated via the transition
            if (((this.width / Grid.SPACING) % 2) !== ((this.height / Grid.SPACING) % 2)) {
                // compute total offset
                const rawOffset = this.#rotationOffset(this.rotation+1, false);
                const alignedOffset = this.#rotationOffset(this.rotation+1, true);
                // we only need to fix the difference between this and the aligned value and reinterpret 0 offset-components as 10 to counter the 'walking away' fix in rotationOffset
                const differenceOffset = new Point(alignedOffset.x - rawOffset.x, alignedOffset.y - rawOffset.y);
                const v = this.visual;
                this.#element.style.left = (v.x + (differenceOffset.x || 10) * this.grid.zoom)  + "px";  //
                this.#element.style.top = (v.y + (differenceOffset.y || 10) * this.grid.zoom) + "px";
                // FIXME: there is another glitch that appears to delay the style application during high-load simulations which makes it look like this has no effect.
                // animation is correct with simulation stopped though
            }
            this.rotation += 1;
            setTimeout(() => {
                // queue class removal for next render call to avoid brief flickering
                this.redraw(true, () => this.#element.classList.remove('component-rotate-animation'));
            }, 150);
            this.grid.trackAction(`Rotate ${this.typeLabel}`);
            return true;
        } else if (key === 'Delete' && what.type === 'hover') {
            const grid = this.grid;
            const label = this.typeLabel;
            this.#element.classList.add('component-delete-animation');
            setTimeout(() => {
                if (this.#element) { // deletion might already be in progress
                    this.#element.classList.remove('component-delete-animation');
                    grid.removeItem(this);
                    grid.trackAction(`Delete ${label}`);
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
                this.#dropPreview = html(null, 'div', 'component-drop-preview');
                this.grid.addVisual(this.#dropPreview);
            }
            const [ alignedX, alignedY ] = this.align(this.x, this.y);
            const [ visualX, visualY ] = this.gridToVisual(alignedX, alignedY);
            this.#dropPreview.style.left = visualX + "px";
            this.#dropPreview.style.top = visualY + "px";
            this.#dropPreview.style.width = this.visual.width + "px";
            this.#dropPreview.style.height = this.visual.height + "px";
            if (!what.isLengthDrag) {
                this.#updateGhostWires(alignedX, alignedY);
            }
        } else {
            this.grid.removeVisual(this.#dropPreview);
            this.#dropPreview = null;
            what.grabOffsetX = null;
            what.grabOffsetY = null;
            if (!what.isLengthDrag) {
                if (this.app.modifierKeys.altKey) {
                    this.#commitGhostWires();
                } else {
                    this.#clearGhostWires();
                }
            }
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
            if (status === 'start' && this.app.modifierKeys.shiftKey) {
                what.singleLengthDrag = Wire.findSelectionAttachedWires(this.grid, [this], x, y);
            }
            const [ effectiveX, effectiveY ] = what.singleLengthDrag
                ? Wire.updateSelectionAttachedWires(x, y, what.singleLengthDrag, status)
                : [ x, y ];
            this.onMove(effectiveX, effectiveY, status, what);
            if (status === 'stop') {
                if (what.singleLengthDrag) {
                    delete what.singleLengthDrag;
                    this.grid.markWiresChanged();
                }
                this.grid.trackAction(what.isNew ? `Add ${this.typeLabel}` : `Move ${this.typeLabel}`);
            }
            return true;
        } else if (what.type === 'port' && status === 'start') {
            this.onConnect(x, y, status, what);
            return true;
        }
    }

    // Returns iterator over flat list of ports.
    get ports() {
        return values(Object.values(this.#ports).flat()).filter((i) => i.name !== null);
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
        const len = (side) => this.#ports[side].filter((p) => !p.shadow).length;
        this.width = Math.max(Grid.SPACING * 2, (len(this.rotatedTop) + 1) * Grid.SPACING, (len(this.rotatedBottom) + 1) * Grid.SPACING);
        this.height = Math.max(Grid.SPACING * 2, (len(this.rotatedLeft) + 1) * Grid.SPACING, (len(this.rotatedRight) + 1) * Grid.SPACING);
    }

    // Renders the component onto the grid.
    renderFull() {

        if (!super.renderFull()) {
            return false;
        }

        if (this.#element.classList.contains('component-rotate-animation')) {
            return false;
        }

        this.renderDetail();

        const v = this.visual;
        this.#element.style.left = v.x + "px";
        this.#element.style.top = v.y + "px";
        this.#element.style.width = v.width + "px";
        this.#element.style.height = v.height + "px";
        this.element.setAttribute('data-component-rotation', this.rotation);

        if ((this.width < this.height || (this.width === this.height && this.#ports[this.rotatedTop].length === 0 && this.#ports[this.rotatedBottom].length === 0)) && v.width < 200) {
            this.#inner.style.lineHeight = (v.width- (Component.#INNER_MARGIN * 2)) + "px";
            this.#inner.style.writingMode = 'vertical-rl';
        } else {
            this.#inner.style.lineHeight = (v.height - (Component.#INNER_MARGIN * 2)) + "px";
            this.#inner.style.writingMode = 'horizontal-tb';
        }

        return true;
    }

    // Updates port labels and colors.
    renderDetail() {
        for (const port of this.ports) {
            if (port.shadow) continue;
            if (this instanceof Port || this instanceof Tunnel || port.name !== '') {
                port.render(this, this.#portLabelCharPos[port.originalSide]);
            }
        }
    }

    // Updates CSS left/top position only.
    renderPosition() {
        const v = this.visual;
        this.#element.style.left = v.x + "px";
        this.#element.style.top = v.y + "px";
    }

    // Override redraw to also update the inner label.
    redraw(recompile = true, beforeRender = null) {
        super.redraw(recompile, beforeRender);
        this.#inner.innerHTML = `<span>${this.topMarkings}</span>`;
    }

    // Renders/updates the current net state of the component ports to the grid.
    renderNetState() {
        for (const item of this.ports) {
            if (item.shadow) continue;
            const state = this.getNetState(item.netIds);
            if (item.element.getAttribute('data-net-state') !== state) {
                item.element.setAttribute('data-net-state', state);
            }
        }
    }

    // Returns default button label and hover message for component factory buttons.
    static descriptorInfo(_desc) {
        return { label: this.TYPE_LABEL ?? this.name /*the classname*/, hoverMessage: `<b>${this.TYPE_LABEL_LONG ?? this.TYPE_LABEL ?? this.name}</b>. ${this.TYPE_DESCRIPTION ?? ''}` };
    }

    // Removes all current ghost wires from the grid.
    #clearGhostWires() {
        for (const wire of this.#ghostWires) {
            this.grid.removeItem(wire, false);
        }
        this.#ghostWires = [];
    }

    // Commits ghost wires, making them real permanent wires.
    #commitGhostWires() {
        for (const wire of this.#ghostWires) {
            wire.element.classList.remove('wire-ghost');
            wire.limbo = false;
        }
        this.#ghostWires = [];
        this.grid.markWiresChanged();
    }

    // Builds ghost wires between this component (at alignedX/Y) and neighboring components.
    #updateGhostWires(alignedX, alignedY) {
        this.#clearGhostWires();
        for (const neighbor of this.grid.items.filter(i => i instanceof Component && i !== this).toArray()) {
            for (const { side, other, axis } of Component.#OPPOSING_SIDES) {
                // Compute gap between facing edges, must be within limit.
                let gap;
                if (side === 'right') {
                    gap = neighbor.x - (alignedX + this.width);
                } else if (side === 'left') {
                    gap = (alignedX) - (neighbor.x + neighbor.width);
                } else if (side === 'bottom') {
                    gap = neighbor.y - (alignedY + this.height);
                } else { // top
                    gap = (alignedY) - (neighbor.y + neighbor.height);
                }
                if (gap <= 0 || gap > Component.#MAX_GHOST_DISTANCE * Grid.SPACING) continue;

                // Collect ports on each side (exclude shadows)
                const selfPorts = this.ports.filter(p => !p.shadow && p.side(this.rotation) === side).toArray();
                const neighborPorts = neighbor.ports.filter(p => !p.shadow && p.side(neighbor.rotation) === other).toArray();

                for (const sp of selfPorts) {
                    const sc = sp.coords(this.width, this.height, this.rotation);
                    const spAbsAxis  = axis === 'y' ? alignedY + sc.y : alignedX + sc.x;

                    for (const np of neighborPorts) {
                        const nc = np.coords(neighbor.width, neighbor.height, neighbor.rotation);
                        const [ neighborAlignedX, neighborAlignedY ] = this.align(neighbor.x, neighbor.y);
                        const npAbsAxis = axis === 'y' ? neighborAlignedY + nc.y : neighborAlignedX + nc.x;

                        if (spAbsAxis !== npAbsAxis) continue;

                        // Determine wire endpoints.
                        let wx, wy, wLen, wDir;
                        if (axis === 'y') {
                            // horizontal wire
                            const selfAbsX     = alignedX + sc.x;
                            const neighborAbsX = neighborAlignedX + nc.x;
                            wx   = Math.min(selfAbsX, neighborAbsX);
                            wy   = spAbsAxis;
                            wLen = Math.abs(selfAbsX - neighborAbsX);
                            wDir = 'h';
                        } else {
                            // vertical wire
                            const selfAbsY     = alignedY + sc.y;
                            const neighborAbsY = neighborAlignedY + nc.y;
                            wx   = spAbsAxis;
                            wy   = Math.min(selfAbsY, neighborAbsY);
                            wLen = Math.abs(selfAbsY - neighborAbsY);
                            wDir = 'v';
                        }
                        if (wLen === 0) continue;

                        const wire = new Wire(this.app, wx, wy, wLen, wDir, this.grid.netColor);
                        wire.limbo = true;
                        this.grid.addItem(wire, false);
                        wire.element.classList.add('wire-ghost');
                        this.#ghostWires.push(wire);
                    }
                }
            }
        }
    }

    // Finds first distinct character in port labels per component-side.
    #findPortLabelCharPos() {
        const abbrev = { };
        for (const [ key, rawPorts ] of Object.entries(this.#ports)) {
            const ports = rawPorts.filter((p) => p.name !== null && !p.shadow);
            let pos = 0;
            seeker: do {
                let known = [];
                for (const port of ports) {
                    if (pos >= port.label.length) {
                        pos = 0;
                        break;
                    }
                    const char = port.label.slice(pos, pos + 1);
                    if (known.includes(char)) {
                        ++pos;
                        continue seeker;
                    }
                    known.push(char);
                }
                break;
            } while (true);
            abbrev[key] = pos;
        }
        this.#portLabelCharPos = abbrev;
    }
}

// Component subclass used to identify components that are removed/replaced during NetList processing. These are components
// that exist in the UI but are not actually "real" in the simulation, e.g. wire splitters.
class VirtualComponent extends Component { }

// Component subclass used to identify components that are compiled into the simulation.
class SimulationComponent extends Component {
    // IDs for the simulated component (constId, clockId, ...), one per channel.
    // Used by the UI to SET constant values, clock frequencies etc.
    // By contrast, netIds are used during rendering to GET the state of a port or wire.
    simIds = [];
    // Instance ID of the circuit instance this component belongs to. Set by Circuit.attachSimulation(),
    // reset to null on detach. Used by components (e.g. Probe) to disambiguate across multiple instances.
    instanceId = null;
    detachSimulation() {
        super.detachSimulation();
        this.instanceId = null;
    }
    // Implement to declare component simulation item.
    declare(sim, config, suffix, instanceId) {
        return null;
    }
}

// Base class for display components (Constant, Probe) that format bus values as strings.
class DisplayComponent extends SimulationComponent {

    static DISPLAY_FORMATS = { 'auto': 'Auto', 'hex': 'Hex', 'dec': 'Decimal', 'bin': 'Binary' };

    static SIZE_MAP = {
        "1":  { bin: 1, hex: 1, dec: 1 },
        "2":  { bin: 2, hex: 1, dec: 1 },
        "4":  { bin: 2, hex: 1, dec: 1 },
        "8":  { bin: 3, hex: 2, dec: 2 },
        "16": { bin: 5, hex: 2, dec: 2 },
        "32": { bin: 9, hex: 3, dec: 3 },
    };

    // Looks up a visual size value from SIZE_MAP for the given channel count and display format.
    static lookupSize(channels, format) {
        assert.integer(channels);
        assert.string(format);
        let result = 1;
        for (const key of Object.keys(DisplayComponent.SIZE_MAP).map(Number).sort((a, b) => a - b)) {
            if (key > channels) break;
            const entry = DisplayComponent.SIZE_MAP[String(key)];
            if (format in entry) result = entry[format];
        }
        return result;
    }

    // Resolves 'auto' display format to a concrete format ('hex', 'dec', or 'bin').
    static resolveFormat(displayFormat, channels) {
        if (displayFormat !== 'auto') return displayFormat;
        return channels === 1 ? 'dec' : 'hex';
    }

    // Formats value/driven bits as a display string.
    // Accepts Number (up to 32 bits, converted via >>> 0) or BigInt for any width.
    static formatValue(valueBits, drivenBits, dataWidth, displayFormat) {
        const bigValue = typeof valueBits === 'bigint' ? valueBits : BigInt(valueBits >>> 0);
        const bigDriven = typeof drivenBits === 'bigint' ? drivenBits : BigInt(drivenBits >>> 0);
        const bigMask = (1n << BigInt(dataWidth)) - 1n;
        const drivenMasked = bigDriven & bigMask;
        if (drivenMasked === 0n) return '~';
        const allDriven = drivenMasked === bigMask;
        const v = bigValue & bigMask;
        const fmt = displayFormat === 'auto' ? (dataWidth === 1 ? 'dec' : (allDriven ? 'hex' : 'bin')) : displayFormat;
        if (fmt === 'hex') {
            return allDriven ? '0x' + v.toString(16).toUpperCase() : '~';
        } else if (fmt === 'dec') {
            return allDriven ? String(v) : '~';
        } else {
            // bin: represent each bit; '~' for undriven bits
            let result = '';
            for (let i = dataWidth - 1; i >= 0; i--) {
                const bit = BigInt(i);
                result += (drivenMasked >> bit) & 1n ? String(Number((v >> bit) & 1n)) : '~';
            }
            return dataWidth === 1 ? result : '0b' + result;
        }
    }
}
