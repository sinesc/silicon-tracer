"use strict";

class Connection extends GridItem {

    static DEBUG_BOX = false;
    static HOVER_MESSAGE = 'Connection. <i>LMB</i>: Branch off new connection. <i>0</i> - <i>9</i>: Set net color.';// TODO: <i>Shift+LMB</i>: Drag along the normal.
    static DRAWING_CONNECTION_MESSAGE = 'Drawing connection. <i>R</i>: Add point, continue drawing from here.';
    static THICKNESS = 3;

    #elementH;
    #elementV;
    #dragConnection;
    ordering;
    color;

    constructor(grid, x1, y1, x2, y2, ordering, color) {

        super(grid);

        [ x1, y1 ] = this.gridAlign(x1, y1);
        [ x2, y2 ] = this.gridAlign(x2, y2);
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
        this.ordering = ordering ?? 'hv';
        this.color = color ?? 0;

        this.#elementH = document.createElement('div');
        this.#elementH.classList.add('connection-h');
        this.registerDrag(this.#elementH, { type: 'connect', ordering: 'vh' });
        this.setHoverMessage(this.#elementH, Connection.HOVER_MESSAGE, { type: 'hover' });
        this.grid.addVisual(this.#elementH);

        this.#elementV = document.createElement('div');
        this.#elementV.classList.add('connection-v');
        this.registerDrag(this.#elementV, { type: 'connect', ordering: 'hv' });
        this.setHoverMessage(this.#elementV, Connection.HOVER_MESSAGE, { type: 'hover' });
        this.grid.addVisual(this.#elementV);

        if (Connection.DEBUG_BOX) {
            this.debug = document.createElement('div');
            this.debug.classList.add('connection-debug');
            this.grid.addVisual(this.debug);
            for (let i = 0; i < 3; ++i) {
                this['debug' + i] = document.createElement('div');
                this['debug' + i].classList.add('connection-debug-point', 'connection-debug-point' + i);
                this.grid.addVisual(this['debug' + i]);
            }
        }
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.x + this.width, this.y + this.height, this.ordering, this.color ]},
        };
    }

    // Removes the component from the grid.
    remove() {
        this.grid.removeVisual(this.#elementH);
        this.grid.removeVisual(this.#elementV);
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
    setEndpoints(x1, y1, x2, y2, aligned) {
        if (aligned) {
            [ x1, y1 ] = this.gridAlign(x1, y1);
            [ x2, y2 ] = this.gridAlign(x2, y2);
        }
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
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
        let width = this.visualWidth;
        let height = this.visualHeight;
        let t = thickness / 2;

        this.#elementH.style.display = this.width !== 0 ? 'block' : 'none';
        this.#elementV.style.display = this.height !== 0 ? 'block' : 'none';

        this.#elementH.setAttribute('data-connection-color', this.color ?? '');
        this.#elementV.setAttribute('data-connection-color', this.color ?? '');

        if (this.ordering === 'hv') {
            // horizontal first, then vertical
            if (this.width !== 0) {
                let hx = width < 0 ? x + width : x;
                let hw = Math.abs(width);
                this.#elementH.style.left = (hx - t) + "px";
                this.#elementH.style.top = (y - t) + "px";
                this.#elementH.style.width = (hw + 2 * t) + "px";
                this.#elementH.style.minWidth = thickness + 'px';
                this.#elementH.style.minHeight = thickness + 'px';
            }
            if (this.height !== 0) {
                let vy = height < 0 ? y + height : y;
                let vh = Math.abs(height);
                this.#elementV.style.left = (x + width - t) + "px";
                this.#elementV.style.top = (vy - t) + "px";
                this.#elementV.style.height = (vh + 2 * t) + "px";
                this.#elementV.style.minWidth = thickness + 'px';
                this.#elementV.style.minHeight = thickness + 'px';
            }
        } else {
            // vertical first, then horizontal
            if (this.height !== 0) {
                let vy = height < 0 ? y + height : y;
                let vh = Math.abs(height);
                this.#elementV.style.left = (x - t) + "px";
                this.#elementV.style.top = (vy - t) + "px";
                this.#elementV.style.height = (vh + 2 * t) + "px";
                this.#elementV.style.minWidth = thickness + 'px';
                this.#elementV.style.minHeight = thickness + 'px';
            }
            if (this.width !== 0) {
                let hx = width < 0 ? x + width : x;
                let hw = Math.abs(width);
                this.#elementH.style.left = (hx - t) + "px";
                this.#elementH.style.top = (y + height - t) + "px";
                this.#elementH.style.width = (hw + 2 * t) + "px";
                this.#elementH.style.minWidth = thickness + 'px';
                this.#elementH.style.minHeight = thickness + 'px';
            }
        }

        if (Connection.DEBUG_BOX) {
            let hx = width < 0 ? x + width : x;
            let hy = height < 0 ? y + height : y;
            this.debug.style.left = hx + "px";
            this.debug.style.top = hy + "px";
            this.debug.style.width = Math.abs(width) + "px";
            this.debug.style.height = Math.abs(height) + "px";
            let points = this.getPoints();
            for (let i = 0; i < 3; ++i) {
                this.debugPoint(i, i < points.length ? points[i] : null);
            }
            this.debug.innerHTML = '<span>' + points.map((p) => JSON.stringify(p)).join('<br>') + '</span>';
        }
    }

    // Renders a debug point on one of the 3 distinct connection end points.
    debugPoint(i, c) {
        if (c === null) {
            this['debug' + i].style.display = 'none';
        } else {
            let x = c[0];
            let y = c[1];
            let vx = (x + this.grid.offsetX) * this.grid.zoom;
            let vy = (y + this.grid.offsetY) * this.grid.zoom;
            this['debug' + i].style.display = 'block';
            this['debug' + i].style.left = (vx - 6) + 'px';
            this['debug' + i].style.top = (vy - 6) + 'px';
        }
    }
}
