class Connection extends GridElement {

    static HOVER_MESSAGE = 'Connection. <i>LMB</i>: Branch off new connection. <i>0</i> - <i>9</i>: Set net color.';// TODO: <i>Shift+LMB</i>: Drag along the normal.

    thickness = 4;

    elementH;
    elementV;
    ordering;
    color;
    dragConnection;

    net;

    constructor(grid, x1, y1, x2, y2, ordering, color, net) {

        super(grid);

        [ x1, y1 ] = this.gridAlign(x1, y1);
        [ x2, y2 ] = this.gridAlign(x2, y2);
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
        this.ordering = ordering ?? 'hv';
        this.color = color ?? 0;
        this.net = net ?? new Net();

        this.elementH = document.createElement('div');
        this.elementH.classList.add('connection-h');
        this.elementH.classList.add('connection-color-' + this.color);
        this.registerDrag(this.elementH, { ordering: 'vh' });
        this.setHoverMessage(this.elementH, Connection.HOVER_MESSAGE);
        this.grid.addVisual(this.elementH);

        this.elementV = document.createElement('div');
        this.elementV.classList.add('connection-v');
        this.elementV.classList.add('connection-color-' + this.color);
        this.registerDrag(this.elementV, { ordering: 'hv' });
        this.setHoverMessage(this.elementV, Connection.HOVER_MESSAGE);
        this.grid.addVisual(this.elementV);

        this.render();
    }

    // Create connection from port.
    onConnect(x, y, status, what) {
        if (status === 'start') {
            what.startX = x;
            what.startY = y;
        }
        if (!this.dragConnection) {
            this.dragConnection = new Connection(this.grid, what.startX, what.startY, x, y, what.ordering, this.color);
            this.dragConnection.render();
        } else if (status !== 'stop') {
            this.dragConnection.setEndpoints(what.startX, what.startY, x, y, true);
            this.dragConnection.render();
        } else {
            this.dragConnection = null;
        }
    }

    // Called while a registered visual is being dragged.
    onDrag(x, y, status, what) {
        this.onConnect(x, y, status, what);
    }

    // Hover hotkey actions
    onHotkey(key, status, ...args) {
        if (key >= '0' && key <= '9') {
            this.color = parseInt(key);
            this.render();
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

    // Renders the component onto the grid.
    render() {

        let thickness = this.thickness * this.grid.zoom;
        let x = this.visualX;
        let y = this.visualY ;
        let width = this.visualWidth;
        let height = this.visualHeight;
        let t = thickness / 2;

        this.elementH.style.display = this.width !== 0 ? 'block' : 'none';
        this.elementV.style.display = this.height !== 0 ? 'block' : 'none';

        for (let c = 0; c < 10; ++c) {
            this.elementH.classList.remove('connection-color-' + c);
            this.elementV.classList.remove('connection-color-' + c);
        }
        
        this.elementH.classList.add('connection-color-' + this.color);
        this.elementV.classList.add('connection-color-' + this.color);

        if (this.ordering === 'hv') {
            // horizontal first, then vertical
            if (this.width !== 0) {
                let hx = width < 0 ? x + width : x;
                let hw = Math.abs(width);
                this.elementH.style.left = (hx - t) + "px";
                this.elementH.style.top = (y - t) + "px";
                this.elementH.style.width = (hw + 2 * t) + "px";
                this.elementH.style.minWidth = thickness + 'px';
                this.elementH.style.minHeight = thickness + 'px';
            }
            if (this.height !== 0) {
                let vy = height < 0 ? y + height :  y;
                let vh = Math.abs(height);
                this.elementV.style.left = (x + width - t) + "px";
                this.elementV.style.top = (vy - t) + "px";
                this.elementV.style.height = (vh + 2 * t) + "px";
                this.elementV.style.minWidth = thickness + 'px';
                this.elementV.style.minHeight = thickness + 'px';
            }
        } else {
            // vertical first, then horizontal
            if (this.height !== 0) {
                let vy = height < 0 ? y + height : y;
                let vh = Math.abs(height);
                this.elementV.style.left = (x - t) + "px";
                this.elementV.style.top = (vy - t) + "px";
                this.elementV.style.height = (vh + 2 * t) + "px";
                this.elementV.style.minWidth = thickness + 'px';
                this.elementV.style.minHeight = thickness + 'px';
            }
            if (this.width !== 0) {
                let hx = width < 0 ? x + width : x;
                let hw = Math.abs(width);
                this.elementH.style.left = (hx - t) + "px";
                this.elementH.style.top = (y + height - t) + "px";
                this.elementH.style.width = (hw + 2 * t) + "px";
                this.elementH.style.minWidth = thickness + 'px';
                this.elementH.style.minHeight = thickness + 'px';
            }
        }
    }
}
