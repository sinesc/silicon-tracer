class Toolbar {

    element;

    constructor(parent) {
        this.element = document.createElement('div');
        this.element.classList.add('toolbar');
        parent.appendChild(this.element);
    }

    // Creates a button that can be dragged onto the grid.
    createComponentButton(label, hoverMessage, create) {
        let button = document.createElement('div');
        button.innerHTML = label;
        button.classList.add('toolbar-button', 'toolbar-component-button');
        button.onmousedown = function(e) {
            e.preventDefault();
            e.stopPropagation();
            let [ x, y ] = mainGrid.screenToGrid(e.clientX, e.clientY);
            let component = create(mainGrid, x, y);
            component.dragStart(x, y, { type: "component", grabOffsetX: component.width / 2, grabOffsetY: component.height / 2 });
            component.render();
        };
        this.element.appendChild(button);
        button.onmouseenter = () => mainGrid.setMessage(hoverMessage);
        button.onmouseleave = () => mainGrid.clearMessage();
    }

    // Creates a button that can be clicked to trigger an action
    createActionButton(label, hoverMessage, action) {
        let button = document.createElement('div');
        button.innerHTML = label;
        button.classList.add('toolbar-button', 'toolbar-action-button');
        button.onmousedown= function(e) {
            e.preventDefault();
            e.stopPropagation();
            action();
        };
        this.element.appendChild(button);
        button.onmouseenter = () => mainGrid.setMessage(hoverMessage);
        button.onmouseleave = () => mainGrid.clearMessage();
    }

}