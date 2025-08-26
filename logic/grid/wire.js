"use strict";

class Wire extends GridItem {

    static DEBUG_BOX = false;
    static HOVER_MESSAGE = 'Connection. <i>LMB</i>: Branch off new connection. <i>D</i> Delete, <i>0</i> - <i>9</i>: Set net color.';// TODO: <i>Shift+LMB</i>: Drag along the normal.
    static THICKNESS = 3;

    #element;
    #dragConnection;
    color;
    netId = null;
    width;
    height;

    constructor(grid, x1, y1, length, direction, color) {

        super(grid);

        [ x1, y1 ] = this.gridAlign(x1, y1);
        this.x = x1;
        this.y = y1;
        this.width = direction === 'h' ? length : 0;
        this.height = direction === 'v' ? length : 0;
        this.color = color ?? 0;

        this.#element = document.createElement('div');
        this.#element.classList.add('connection-' + direction);
        this.registerDrag(this.#element, { type: 'connect', ordering: direction === 'h' ? 'vh' : 'hv' });
        this.setHoverMessage(this.#element, Connection.HOVER_MESSAGE, { type: 'hover' });
        this.grid.addVisual(this.#element);
    }

    // Serializes the object for writing to disk.
    serialize() {
        let direction = this.width > 0 ? 'h' : 'v';
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, direction === 'h' ? this.width : this.height, direction, this.color ]},
        };
    }

    // Removes the component from the grid.
    remove() {
        this.grid.removeVisual(this.#element);
        this.#element = null;
        super.remove();
    }

    // Detach wire from simulation.
    detachSimulation() {
        this.netId = null;
    }

    // Create connection from exiting connection.
    onConnect(x, y, status, what) {
        if (status === 'start') {
            what.startX = x;
            what.startY = y;
        }
        if (!this.#dragConnection) {
            // TODO: when dragging forward (i.e. not perpendicular) from the end of a wire, ordering should be reversed.
            // this requires getting a mouse movement vector because the user might still want to drag along the normal at the end of a wire
            this.grid.setMessage(Connection.DRAWING_CONNECTION_MESSAGE, true);
            this.grid.requestHotkeyTarget(this, true, { ...what, type: 'connect' }); // pass 'what' to onHotkey()
            this.#dragConnection = new Connection(this.grid, what.startX, what.startY, x, y, what.ordering, this.color);
            this.#dragConnection.render();
        } else if (status !== 'stop') {
            this.#dragConnection.setEndpoints(this.#dragConnection.x, this.#dragConnection.y, x, y, true);
            this.#dragConnection.render();
        } else {
            this.#dragConnection = null;
            this.grid.clearMessage(true);
            this.grid.releaseHotkeyTarget(this, true);
            this.grid.invalidateNets();
            this.grid.render();
        }
    }

    // Called while a registered visual is being dragged.
    onDrag(x, y, status, what) {
        this.onConnect(x, y, status, what);
    }

    // Hover hotkey actions
    onHotkey(key, what) {
        if (what.type === 'hover' && key >= '0' && key <= '9') {
            this.color = parseInt(key);
            this.render();
        } else if (key === 'd' && what.type === 'hover') {
            this.#element.classList.add('connection-delete-animation');
            setTimeout(() => {
                this.#element.classList.remove('connection-delete-animation');
                this.grid.invalidateNets();
                this.remove();
            }, 150);
        } else if (what.type === 'connect' && key === 'r') {
            // add connection point when pressing R while dragging a connection
            let x = this.#dragConnection.x + this.#dragConnection.width;
            let y = this.#dragConnection.y + this.#dragConnection.height;
            let color = this.#dragConnection.color;
            this.#dragConnection = new Connection(this.grid, x, y, x, y, what.ordering, color);
            this.grid.invalidateNets();
            this.grid.render();
        }
    }

    // Sets connection endpoints, optionally aligned to the grid.
    setEndpoints(x1, y1, length, direction, aligned) {
        if (aligned) {
            [ x1, y1 ] = this.gridAlign(x1, y1);
            length = Math.ceil(length / Grid.SPACING) * Grid.SPACING;
        }
        this.x = x1;
        this.y = y1;
        this.width = direction === 'h' ? length : 0;
        this.height = direction === 'v' ? length : 0;
    };

    // Returns the 2 or 3 distinct endpoint coordinates of this connection.
    getPoints() {

        let mk = (x, y) => new Point(x, y);
        let points = [ mk(this.x, this.y) ];

        if (this.width !== 0) {
            points.push(this.ordering === 'hv' ? mk(this.x + this.width, this.y) : mk(this.x + (this.height === 0 ? this.width : 0), this.y + this.height));
        }

        if (this.height !== 0) {
            points.push(mk(this.x + this.width, this.y + this.height));
        }

        return points;
    }

    // Renders the connection onto the grid.
    render() {

        let thickness = Connection.THICKNESS * this.grid.zoom;
        let x = this.visualX;
        let y = this.visualY ;
        let width = this.width * this.grid.zoom;
        let height = this.height * this.grid.zoom;
        let t = thickness / 2;

        this.#element.setAttribute('data-net-color', this.color ?? '');
        this.#element.setAttribute('data-net-state', this.netId !== null && this.grid.sim ? this.grid.sim.getNet(this.netId) : '');

        if (this.width !== 0) {
            let hx = width < 0 ? x + width : x;
            let hw = Math.abs(width);
            this.#element.style.left = (hx - t) + "px";
            this.#element.style.top = (y - t) + "px";
            this.#element.style.width = (hw + 2 * t) + "px";
            this.#element.style.height = thickness + "px";
            this.#element.style.minWidth = thickness + 'px';
            this.#element.style.minHeight = thickness + 'px';
        } else if (this.height !== 0) {
            let vy = height < 0 ? y + height : y;
            let vh = Math.abs(height);
            this.#element.style.left = (x + width - t) + "px";
            this.#element.style.top = (vy - t) + "px";
            this.#element.style.width = thickness + "px";
            this.#element.style.height = (vh + 2 * t) + "px";
            this.#element.style.minWidth = thickness + 'px';
            this.#element.style.minHeight = thickness + 'px';
        }
    }
}
