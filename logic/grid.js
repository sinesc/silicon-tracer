class Grid {

    originalSpacing = 15;
    spacing = this.originalSpacing;

    offsetX = 0;
    offsetY = 0;
    element;

    components = [];

    constructor(parent) {
        this.element = document.createElement('div');
        this.element.classList.add('grid');
        this.element.onmousedown = this.dragStart.bind(this);
        this.element.onwheel = this.zoom.bind(this);

        parent.appendChild(this.element);
        this.render();
    }

    register(component) {
        this.components.push(new WeakRef(component));
    }

    render() {
        this.element.style.backgroundSize = this.spacing + 'px ' + this.spacing + 'px';
        this.element.style.backgroundPositionX = (this.offsetX % this.spacing) + 'px';
        this.element.style.backgroundPositionY = (this.offsetY % this.spacing) + 'px';
        for (let i = 0; i < this.components.length; ++i) {
            let component = this.components[i].deref();
            if (component) {
                component.render();
            } else {
                // remove from array by replacing with last entry. afterwards next iteration has to repeat this index.
                if (i < this.components.length - 1) {
                    this.components[i] = this.components.pop();
                    --i;
                } else {
                    this.components.pop()
                }
            }
        }
    }

    get zoomFactor() {
        return this.spacing / this.originalSpacing;
    }

    align(x, y) {
        return [
            Math.ceil(x / this.spacing) * this.spacing - 0.5 * this.spacing,
            Math.ceil(y / this.spacing) * this.spacing - 0.5 * this.spacing
        ];

    }

    zoom(e) {
        let delta = Math.round(e.deltaY / 120);

        let prevFactor = this.spacing / this.originalSpacing;
        this.spacing = Math.max(10, this.spacing - delta);
        let factor = this.spacing / this.originalSpacing;

        let mouseX = e.clientX - this.element.offsetLeft;
        let mouseY = e.clientY - this.element.offsetTop;
        let mouseRatioX = mouseX / this.element.offsetWidth;
        let mouseRatioY = mouseY / this.element.offsetHeight;

        let offsetX = Math.round( (0.5 - mouseRatioX) * (factor - prevFactor) * this.offsetX );
        let offsetY = Math.round( (0.5 - mouseRatioY) * (factor - prevFactor) * this.offsetY );

        this.offsetX += offsetX;
        this.offsetY += offsetY;

        this.render();
    }

    dragStart(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.which !== 2) {
            return;
        }
        document.onmousemove = this.dragMove.bind(this, e.clientX, e.clientY, this.offsetX, this.offsetY);
        document.onmouseup = this.dragStop.bind(this);
    }

    dragMove(dragStartX, dragStartY, originalX, originalY, e) {
        e.preventDefault();
        e.stopPropagation();
        let deltaX = e.clientX - dragStartX;
        let deltaY = e.clientY - dragStartY;
        this.offsetX = originalX + deltaX;
        this.offsetY = originalY + deltaY;
        this.render();
    }

    dragStop(e) {
        document.onmouseup = null;
        document.onmousemove = null;
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
        grid.register(this);
    }

    render() { }

    onDrag(x, y, done, ...args) { }

    get offsetX() {
        return this.x * this.grid.zoomFactor + this.grid.offsetX;
    }

    get offsetY() {
        return this.y * this.grid.zoomFactor + this.grid.offsetY;
    }

    setPosition(x, y, aligned) {
        if (aligned) {
            [ x, y ] = this.grid.align(x, y);
        }
        this.x = x;
        this.y = y;
    }

    registerDrag(element, ...args) {
        element.onmousedown = this.dragStart.bind(this, args);
    }

    dragStart(args, e) {
        e.preventDefault();
        e.stopPropagation();
        let dragOffsetX = e.clientX - this.x;
        let dragOffsetY = e.clientY - this.y;
        document.onmousemove = this.dragMove.bind(this, args, dragOffsetX, dragOffsetY);
        document.onmouseup = this.dragStop.bind(this, args, dragOffsetX, dragOffsetY);
    }

    dragMove(args, dragOffsetX, dragOffsetY, e) {
        e.preventDefault();
        e.stopPropagation();
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