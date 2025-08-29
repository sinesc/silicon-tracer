"use strict";

// Handles tool/menubar.
class Toolbar {

    #element;
    #grid;
    #menuStates;

    constructor(grid, parent) {
        this.#grid = grid;
        this.#menuStates = new WeakUnorderedSet();
        this.#element = document.createElement('div');
        this.#element.classList.add('toolbar');
        parent.appendChild(this.#element);
    }

    // Removes all buttons from the toolbar.
    clear() {
        this.#element.textContent = '';
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
        return [ button ];
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
        return [ button ];
    }

    // Creates a button that can be toggled on or off. Returns a function that sets/returns the current button state.
    createToggleButton(label, hoverMessage, defaultState, action) {
        let [ button, stateFn ] = this.#createToggleButton(label, hoverMessage, defaultState, action);
        this.#element.appendChild(button);
        return [ button, stateFn ];
    }

    // Creates a menu-button to open/close a sub-toolbar acting as a menu. Returns a new toolbar
    // as well as a state function to get/set the menu state.
    createMenuButton(label, hoverMessage, openAction) {
        let subToolbarContainer = document.createElement('div');
        subToolbarContainer.classList.add('toolbar-menu-container');
        let [ button, stateFn ] = this.#createToggleButton(label, hoverMessage, false, (open) => {
            if (open) {
                if (openAction) {
                    openAction();
                }
                // close other menus
                this.#menuStates.forEach((otherstateFn) => {
                    if (otherstateFn !== stateFn) {
                        otherstateFn(false);
                    }
                });
                // close menu on click outside of menu
                document.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.onclick = null;
                    stateFn(false);
                }
            } else {
                document.onclick = null;
            }
        });
        this.#menuStates.add(stateFn);
        button.classList.add('toolbar-menu-button');
        button.appendChild(subToolbarContainer);
        this.#element.appendChild(button);
        let subToolbar = new Toolbar(this.#grid, subToolbarContainer);
        return [ button, stateFn, subToolbar ];
    }

    // Creates a separator
    createSeparator() {
        let separator = document.createElement('div');
        separator.classList.add('toolbar-separator');
        this.#element.appendChild(separator);
        return [ separator ];
    }

    // Creates a toggle button and returns the button element as well as a function that sets/returns the current button state.
    #createToggleButton(label, hoverMessage, defaultState, action) {
        let button = document.createElement('div');
        button.innerHTML = label;
        let state = defaultState;
        button.classList.add('toolbar-button', 'toolbar-toggle-button', state ? 'toolbar-toggle-button-on' : 'toolbar-toggle-button-off');
        let stateFn = (newState) => {
            if (newState !== undefined) {
                button.classList.remove(state ? 'toolbar-toggle-button-on' : 'toolbar-toggle-button-off');
                state = newState;
                button.classList.add(state ? 'toolbar-toggle-button-on' : 'toolbar-toggle-button-off');
            }
            return state;
        };
        button.onclick= (e) => {
            e.preventDefault();
            e.stopPropagation();
            stateFn(!state);
            action(state);
        };
        button.onmouseenter = () => this.#grid.setMessage(hoverMessage);
        button.onmouseleave = () => this.#grid.clearMessage();
        return [ button, stateFn ];
    }
}