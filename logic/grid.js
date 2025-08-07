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