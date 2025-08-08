class Connection extends GridElement {

    thickness = 4;

    elementH;
    elementV;

    constructor(grid, x1, y1, x2, y2) {
        super(grid);
        [ x1, y1 ] = grid.align(x1, y1);
        [ x2, y2 ] = grid.align(x2, y2);
        this.x = x1;
        this.y = y1;
        this.width = x2 - x1;
        this.height = y2 - y1;
        this.render();
    }

    onDrag(x, y, done) {
        this.setPosition(x, y, done);
    }

    render() {

        let thickness = this.thickness * this.grid.zoom;
        let x = this.visualX - thickness / 2;
        let y = this.visualY - thickness / 2;
        let width = this.visualWidth + thickness;
        let height = this.visualHeight + thickness;

        if (this.width > 0 && !this.elementH) {
            this.elementH = document.createElement('div');
            this.elementH.classList.add('connection');
            this.registerDrag(this.elementH);
            grid.element.appendChild(this.elementH);
        } else if (this.width === 0 && this.elementH) {
            this.elementH.remove();
            this.elementH = null;
        }

        if (this.height > 0 && !this.elementV) {
            this.elementV = document.createElement('div');
            this.elementV.classList.add('connection');
            this.registerDrag(this.elementV);
            grid.element.appendChild(this.elementV);
        } else if (this.height === 0 && this.elementV) {
            this.elementV.remove();
            this.elementV = null;
        }

        if (this.elementH) {
            this.elementH.style.left = x + "px";
            this.elementH.style.top = y + "px";
            this.elementH.style.width = width + "px";
            this.elementH.style.minWidth = thickness + 'px';
            this.elementH.style.minHeight = thickness + 'px';
            if (this.elementV) {
                this.elementV.style.left = (x + width - thickness) + "px";
                this.elementV.style.top = y + "px";
                this.elementV.style.height = height + "px";
                this.elementV.style.minWidth = thickness + 'px';
                this.elementV.style.minHeight = thickness + 'px';
            }
        } else if (this.elementV) {
            this.elementV.style.left = x + "px";
            this.elementV.style.top = y + "px";
            this.elementV.style.height = height + "px";
            this.elementV.style.minWidth = thickness + 'px';
            this.elementV.style.minHeight = thickness + 'px';
        }
    }
}