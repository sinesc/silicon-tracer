class Grid {

    spacing = 15;

    element;

    constructor(parent, width, height) {
        this.element = document.createElement('div');
        this.element.classList.add('grid');
        this.element.style.backgroundSize = this.spacing + 'px ' + this.spacing + 'px';
        this.element.onmousedown = this.dragStart.bind(this);

        parent.appendChild(this.element);
        this.setDimensions(width, height);
    }

    dimensions() {
        return [ parseInt(this.element.style.width.replace('px', '')), parseInt(this.element.style.height.replace('px', '')) ];
    }

    setDimensions(width, height) {
        this.element.style.width = width + "px";
        this.element.style.height = height + "px";
    }

    position() {
        return [ parseInt(this.element.style.left.replace('px', '')), parseInt(this.element.style.top.replace('px', '')) ];
    }

    setPosition(x, y) {
        this.element.style.left = x + "px";
        this.element.style.top = y + "px";
    }

    align(x, y) {
        return [
            Math.ceil(x / this.spacing) * this.spacing - 0.5 * this.spacing,
            Math.ceil(y / this.spacing) * this.spacing - 0.5 * this.spacing
        ];
    }

    dragStart(e) {
        e.preventDefault();
    }
}

class GridElement {

    grid;

    x;
    y;
    width;
    height;

    dragOffsetX;
    dragOffsetY;

    constructor(grid) {
        this.grid = grid;
    }

    render() { }

    dragTo(x, y, done) { }

    position() {
        return [ this.x, this.y ];
    }

    setPosition(x, y, aligned) {
        if (aligned) {
            [ x, y ] = this.grid.align(x, y);
        }
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

    dragStart(e) {
        e.preventDefault();
        this.dragOffsetX = e.clientX - this.x;
        this.dragOffsetY = e.clientY - this.y;
        document.onmousemove = this.dragMove.bind(this);
        document.onmouseup = this.dragStop.bind(this);
    }

    dragMove(e) {
        e.preventDefault();
        this.dragTo(e.clientX - this.dragOffsetX, e.clientY - this.dragOffsetY, false);
        this.render();
    }

    dragStop(e) {
        document.onmouseup = null;
        document.onmousemove = null;
        this.dragTo(e.clientX - this.dragOffsetX, e.clientY - this.dragOffsetY, true);
        this.render();
    }
}