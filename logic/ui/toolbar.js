"use strict";

class Toolbar {

    #element;
    #grid;

    constructor(grid, parent) {
        this.#grid = grid;
        this.#element = document.createElement('div');
        this.#element.classList.add('toolbar');
        parent.appendChild(this.#element);
    }

    // Creates a button that can be dragged onto the grid.
    createComponentButton(label, hoverMessage, create) {
        let button = document.createElement('div');
        button.innerHTML = label;
        button.classList.add('toolbar-button', 'toolbar-component-button');
        button.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            let [ x, y ] = this.#grid.screenToGrid(e.clientX, e.clientY);
            let component = create(this.#grid, x, y);
            component.dragStart(x, y, { type: "component", grabOffsetX: component.width / 2, grabOffsetY: component.height / 2 });
            component.render();
        };
        this.#element.appendChild(button);
        button.onmouseenter = () => this.#grid.setMessage(hoverMessage);
        button.onmouseleave = () => this.#grid.clearMessage();
    }

    // Creates a button that can be clicked to trigger an action.
    createActionButton(label, hoverMessage, action) {
        let button = document.createElement('div');
        button.innerHTML = label;
        button.classList.add('toolbar-button', 'toolbar-action-button');
        button.onclick= (e) => {
            e.preventDefault();
            e.stopPropagation();
            action();
        };
        this.#element.appendChild(button);
        button.onmouseenter = () => this.#grid.setMessage(hoverMessage);
        button.onmouseleave = () => this.#grid.clearMessage();
    }

    // Creates a button that can be toggled on or off. Returns a function that sets/returns the current button state.
    createToggleButton(label, hoverMessage, defaultState, action) {
        let button = document.createElement('div');
        button.innerHTML = label;
        let state = defaultState;
        button.classList.add('toolbar-button', 'toolbar-toggle-button', state ? 'toolbar-toggle-button-on' : 'toolbar-toggle-button-off');
        button.onclick= (e) => {
            e.preventDefault();
            e.stopPropagation();
            button.classList.remove(state ? 'toolbar-toggle-button-on' : 'toolbar-toggle-button-off');
            state = !state;
            button.classList.add(state ? 'toolbar-toggle-button-on' : 'toolbar-toggle-button-off');
            action(state);
        };
        this.#element.appendChild(button);
        button.onmouseenter = () => this.#grid.setMessage(hoverMessage);
        button.onmouseleave = () => this.#grid.clearMessage();
        return (newState) => newState !== undefined ? state = newState : state;
    }

}