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

        if (this.width !== 0 && !this.elementH) {
            this.elementH = document.createElement('div');
            this.elementH.classList.add('connection-h');
            this.registerDrag(this.elementH);
            grid2.addVisual(this.elementH);
        } else if (this.width === 0 && this.elementH) {
            grid2.removeVisual(this.elementH);
            this.elementH = null;
        }

        if (this.height !== 0 && !this.elementV) {
            this.elementV = document.createElement('div');
            this.elementV.classList.add('connection-v');
            this.registerDrag(this.elementV);
            grid2.addVisual(this.elementV);
        } else if (this.height === 0 && this.elementV) {
            grid2.removeVisual(this.elementV);
            this.elementV = null;
        }

        if (this.ordering === 'hv') {

            if (this.elementH) {
                let hx = width < 0 ? x + width : x;
                let hw = Math.abs(width);
                this.elementH.style.left = (hx - t) + "px";
                this.elementH.style.top = (y - t) + "px";
                this.elementH.style.width = (hw + 2 * t) + "px";
                this.elementH.style.minWidth = thickness + 'px';
                this.elementH.style.minHeight = thickness + 'px';
            }

            if (this.elementV) {
                let vy = height < 0 ? y + height :  y;
                let vh = Math.abs(height);
                this.elementV.style.left = (x + width - t) + "px";
                this.elementV.style.top = (vy - t) + "px";
                this.elementV.style.height = (vh + 2 * t) + "px";
                this.elementV.style.minWidth = thickness + 'px';
                this.elementV.style.minHeight = thickness + 'px';
            }

        } else {

            if (this.elementV) {
                let vy = height < 0 ? y + height : y;
                let vh = Math.abs(height);
                this.elementV.style.left = (x - t) + "px";
                this.elementV.style.top = (vy - t) + "px";
                this.elementV.style.height = (vh + 2 * t) + "px";
                this.elementV.style.minWidth = thickness + 'px';
                this.elementV.style.minHeight = thickness + 'px';
            }

            if (this.elementH) {
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