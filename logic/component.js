class Component {

    gridSpacing = 25
    element = null;
    prevX = 0;
    prevY = 0;

    constructor(x, y) {
        this.element = document.createElement('div');
        this.element.innerHTML = 'MOVE<br>THIS<br>DIV';
        this.element.onmousedown = this.dragMouseDown.bind(this);
        this.element.classList.add('component');
        this.setPosition(x, y);
        document.getElementById('schematic').appendChild(this.element);
    }

    dragMouseDown(e) {
        e.preventDefault();
        this.prevX = e.clientX;
        this.prevY = e.clientY;
        document.onmouseup = this.closeDragElement.bind(this);
        document.onmousemove = this.elementDrag.bind(this);
    }

    setPosition(x, y) {
        this.element.style.left = x + "px";
        this.element.style.top = y + "px";
    }

    gridAlign() {
        const y = Math.round(this.element.offsetTop / this.gridSpacing) * this.gridSpacing;
        const x = Math.round(this.element.offsetLeft / this.gridSpacing) * this.gridSpacing;
        this.setPosition(x, y);
    }

    elementDrag(e) {
        e.preventDefault();
        let posX = this.prevX - e.clientX;
        let posY = this.prevY - e.clientY;
        this.prevX = e.clientX;
        this.prevY = e.clientY;
        this.setPosition(this.element.offsetLeft - posX, this.element.offsetTop - posY);
    }

    closeDragElement() {
        /* stop moving when mouse button is released:*/
        document.onmouseup = null;
        document.onmousemove = null;
        this.gridAlign();
    }
}