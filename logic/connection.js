class Connection extends GridElement {

    thickness = 4;

    elementH;
    elementV;
    ordering;

    constructor(grid, x1, y1, x2, y2, ordering) {

        super(grid);
        [ x1, y1 ] = this.gridAlign(x1, y1);
        [ x2, y2 ] = this.gridAlign(x2, y2);
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
        this.ordering = ordering;

        this.elementH = document.createElement('div');
        this.elementH.classList.add('connection-h');
        this.registerDrag(this.elementH);
        this.grid.setHoverStatus(this.elementH, 'Connection. <i>LMB</i>: Drag along the normal. <i>Shift+LMB</i>: Branch off new connection.');
        this.grid.addVisual(this.elementH);

        this.elementV = document.createElement('div');
        this.elementV.classList.add('connection-v');
        this.registerDrag(this.elementV);
        this.grid.setHoverStatus(this.elementV, 'Connection. <i>LMB</i>: Drag along the normal. <i>Shift+LMB</i>: Branch off new connection.');
        this.grid.addVisual(this.elementV);

        this.render();
    }

    onDrag(x, y, done) {
        this.setPosition(x, y, done);
    }

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

    render() {

        let thickness = this.thickness * this.grid.zoom;
        let x = this.visualX;
        let y = this.visualY ;
        let width = this.visualWidth;
        let height = this.visualHeight;
        let t = thickness / 2;

        this.elementH.style.display = this.width !== 0 ? 'block' : 'none';
        this.elementV.style.display = this.height !== 0 ? 'block' : 'none';

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
