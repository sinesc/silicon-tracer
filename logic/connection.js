class Connection extends GridElement {

    thickness = 6;

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

        if (this.width > 0 && !this.elementH) {
            this.elementH = document.createElement('div');
            this.elementH.classList.add('connection');
            this.elementH.style.minWidth = this.thickness + 'px';
            this.elementH.style.minHeight = this.thickness + 'px';
            this.registerDrag(this.elementH);
            grid.element.appendChild(this.elementH);
        } else if (this.width === 0 && this.elementH) {
            this.elementH.remove();
            this.elementH = null;
        }

        if (this.height > 0 && !this.elementV) {
            this.elementV = document.createElement('div');
            this.elementV.classList.add('connection');
            this.elementV.style.minWidth = this.thickness + 'px';
            this.elementV.style.minHeight = this.thickness + 'px';
            grid.element.appendChild(this.elementV);
        } else if (this.height === 0 && this.elementV) {
            this.elementV.remove();
            this.elementV = null;
        }

        let x = this.offsetX - this.thickness / 2;
        let y = this.offsetY - this.thickness / 2;
        let width = this.width + this.thickness;
        let height = this.height + this.thickness;

        if (this.elementH) {
            this.elementH.style.left = x + "px";
            this.elementH.style.top = y + "px";
            this.elementH.style.width = width + "px";
            if (this.elementV) {
                this.elementH.style.borderRight = "none";
                this.elementV.style.left = (x + this.width) + "px";
                this.elementV.style.top = y + "px";
                this.elementV.style.height = height + "px";
            }
        } else if (this.elementV) {
            this.elementV.style.left = x + "px";
            this.elementV.style.top = y + "px";
            this.elementV.style.height = height + "px";
        }
    }
}