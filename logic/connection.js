class Connection {

    thickness = 6;

    grid;
    elementH;
    elementV;

    x;
    y;
    width;
    height;

    dragOffsetX;
    dragOffsetY;

    constructor(grid, x1, y1, x2, y2) {

        this.grid = new WeakRef(grid);

        [ x1, y1 ] = grid.align(x1, y1);
        [ x2, y2 ] = grid.align(x2, y2);

        this.setPosition(x1, y1);
        this.setDimensions(x2 - x1, y2 - y1);

        if (x1 !== x2) {
            this.elementH = document.createElement('div');
            this.elementH.classList.add('connection');
            this.elementH.style.minWidth = this.thickness + 'px';
            this.elementH.style.minHeight = this.thickness + 'px';
            grid.element.appendChild(this.elementH);
        }

        if (y1 !== y2) {
            this.elementV = document.createElement('div');
            this.elementV.classList.add('connection');
            this.elementV.style.minWidth = this.thickness + 'px';
            this.elementV.style.minHeight = this.thickness + 'px';
            grid.element.appendChild(this.elementV);
        }

        this.render();
    }

    render() {
        //TODO: offset by grid origin
        let x = this.x - this.thickness / 2;
        let y = this.y - this.thickness / 2;
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

    position() {
        return [ this.x, this.y ];
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }

    dimensions() {
        return [ this.width, this.height ];
    }

    setDimensions(width, height) {
        this.width = width;
        this.height = height;
    }
}