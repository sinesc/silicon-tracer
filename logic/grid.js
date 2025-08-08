class Grid {

    spacing = 15;

    zoom = 1.0;
    offsetX = 0;
    offsetY = 0;
    element;

    components = [];

    constructor(parent) {
        this.element = document.createElement('div');
        this.element.classList.add('grid');
        this.element.onmousedown = this.dragStart.bind(this);
        this.element.onwheel = this.wheelZoom.bind(this);

this.inner = document.createElement('div');
this.element.appendChild(this.inner);
document.onmousemove = this.coords.bind(this);

        parent.appendChild(this.element);
        this.render();
    }

    coords(e) {
        let mouseX = e.clientX - this.element.offsetLeft;
        let mouseY = e.clientY - this.element.offsetTop;

        let mouseGridX = -this.offsetX + mouseX / this.zoom;
        let mouseGridY = -this.offsetY + mouseY / this.zoom;

        this.inner.innerHTML =
            'pix: x: ' + mouseX + ' y: ' +  mouseY +
            '<br><b>spc: x: ' + Math.round(mouseGridX) + ' y: ' + Math.round(mouseGridY) + ' zoom: ' + this.zoom + '</b>';
    }

    register(component) {
        this.components.push(new WeakRef(component));
    }

    render() {

        let spacing = this.spacing * this.zoom;
        let offsetX = this.offsetX * this.zoom;
        let offsetY = this.offsetY * this.zoom;

        this.element.style.backgroundSize = spacing + 'px ' + spacing + 'px';
        this.element.style.backgroundPositionX = (offsetX % spacing) + 'px';
        this.element.style.backgroundPositionY = (offsetY % spacing) + 'px';

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

    align(x, y) {
        return [
            Math.ceil(x / this.spacing) * this.spacing - 0.5 * this.spacing,
            Math.ceil(y / this.spacing) * this.spacing - 0.5 * this.spacing
        ];
    }

    wheelZoom(e) {
        // my mouse has a delta of 120, not sure if this is always the case
        let delta = e.deltaY / 120;

        // mouse pixel coordinates within grid view element
        let mouseX = e.clientX - this.element.offsetLeft;
        let mouseY = e.clientY - this.element.offsetTop;

        // compute mouse on-grid coordinates
        let mouseGridX = -this.offsetX + mouseX / this.zoom;
        let mouseGridY = -this.offsetY + mouseY / this.zoom;

        // apply zoom in 25% steps
        delta *= 0.25;
        this.zoom = Math.max(0.25, delta > 0 ? this.zoom * (1 - delta) : this.zoom / (1 + delta));

        // compute new mouse on-grid coordinates after the zoom
        let mouseGridXAfter = -this.offsetX + mouseX / this.zoom;
        let mouseGridYAfter = -this.offsetY + mouseY / this.zoom;

        // move grid to compensate so that the point we zoomed into is still at the cursor
        this.offsetX -= mouseGridX - mouseGridXAfter;
        this.offsetY -= mouseGridY - mouseGridYAfter;

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
        this.offsetX = originalX + deltaX / this.zoom;
        this.offsetY = originalY + deltaY / this.zoom;
        this.render();
    }

    dragStop(e) {
        document.onmouseup = null;
        document.onmousemove = null;
document.onmousemove = this.coords.bind(this);
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

    get visualX() {
        return (this.x + this.grid.offsetX) * this.grid.zoom;
    }

    get visualY() {
        return (this.y + this.grid.offsetY) * this.grid.zoom;
    }

    get visualWidth() {
        return this.width * this.grid.zoom;
    }

    get visualHeight() {
        return this.height * this.grid.zoom;
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
        let dragOffsetX = e.clientX / this.grid.zoom - this.x;
        let dragOffsetY = e.clientY / this.grid.zoom - this.y;
        document.onmousemove = this.dragMove.bind(this, args, dragOffsetX, dragOffsetY);
        document.onmouseup = this.dragStop.bind(this, args, dragOffsetX, dragOffsetY);
    }

    dragMove(args, dragOffsetX, dragOffsetY, e) {
        e.preventDefault();
        e.stopPropagation();
        this.onDrag(e.clientX / this.grid.zoom - dragOffsetX, e.clientY / this.grid.zoom - dragOffsetY, false, ...args);
        this.render();
    }

    dragStop(args, dragOffsetX, dragOffsetY, e) {
        document.onmouseup = null;
        document.onmousemove = null;
        this.onDrag(e.clientX / this.grid.zoom - dragOffsetX, e.clientY / this.grid.zoom - dragOffsetY, true, ...args);
        this.render();
    }
}