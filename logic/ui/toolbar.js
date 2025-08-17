class Toolbar {

    element;

    constructor(parent) {
        this.element = document.createElement('div');
        parent.appendChild(this.element);
    }

    createButton(label, hoverMessage, create) {
        let button = document.createElement('div');
        button.innerHTML = label;
        button.classList.add('toolbar-button');
        button.onmousedown = function(e) {
            e.preventDefault();
            e.stopPropagation();
            let [ x, y ] = mainGrid.screenToGrid(e.clientX, e.clientY);
            let component = create(mainGrid, x, y);
            component.dragStart(x, y, { type: "component", grabOffsetX: component.width / 2, grabOffsetY: component.height / 2 });
            component.render();
        };
        this.element.appendChild(button);
        button.onmouseenter = () => mainGrid.setStatus(hoverMessage);
        button.onmouseleave = () => mainGrid.clearStatus();
    }

}