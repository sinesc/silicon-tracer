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

    constructor(grid) {
        this.grid = grid;
    }

    render() { }

    onDrag(x, y, done, ...args) { }

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

    registerDrag(element, ...args) {
        element.onmousedown = this.dragStart.bind(this, args);
    }

    dragStart(args, e) {
        e.preventDefault();
        let dragOffsetX = e.clientX - this.x;
        let dragOffsetY = e.clientY - this.y;
        document.onmousemove = this.dragMove.bind(this, args, dragOffsetX, dragOffsetY);
        document.onmouseup = this.dragStop.bind(this, args, dragOffsetX, dragOffsetY);
    }

    dragMove(args, dragOffsetX, dragOffsetY, e) {
        e.preventDefault();
        this.onDrag(e.clientX - dragOffsetX, e.clientY - dragOffsetY, false, ...args);
        this.render();
    }

    dragStop(args, dragOffsetX, dragOffsetY, e) {
        document.onmouseup = null;
        document.onmousemove = null;
        this.onDrag(e.clientX - dragOffsetX, e.clientY - dragOffsetY, true, ...args);
        this.render();
    }
}