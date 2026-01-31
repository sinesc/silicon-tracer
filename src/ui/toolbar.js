"use strict";

// Handles tool/menubar.
class Toolbar {

    #app;
    #element;
    #menuStates;
    #menuOpen = null;

    constructor(app, parent) {
        assert.class(Application, app);
        assert.class(Node, parent);
        this.#app = app;
        this.#menuStates = new WeakUnorderedSet();
        this.#element = element(parent, 'div', 'toolbar');
    }

    // Returns the DOM Node.
    get node() {
        return this.#element;
    }

    // Returns the parent DOM Node.
    get parentNode() {
        return this.#element.parentNode;
    }

    // Removes all buttons from the toolbar.
    clear() {
        this.#element.textContent = '';
    }

    // Creates a button that can be dragged onto the grid.
    createComponentButton(label, hoverMessage, create) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.function(create);
        const button = element(this.#element, 'div', 'toolbar-button toolbar-component-button', label);
        button.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!button.classList.contains('toolbar-menu-button-disabled')) {
                const [ x, y ] = this.#app.grid.screenToGrid(e.clientX, e.clientY);
                const component = create(this.#app.grid, x, y);
                component.dragStart(x, y, { type: "component", grabOffsetX: component.width / 2, grabOffsetY: component.height / 2 });
            }
        };
        button.onmouseenter = () => this.#app.setStatus(hoverMessage);
        button.onmouseleave = () => this.#app.clearStatus();
        return [ button ];
    }

    // Creates a button that can be clicked to trigger an action.
    createActionButton(label, hoverMessage, action) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.function(action);
        const button = element(this.#element, 'div', 'toolbar-button toolbar-action-button', label);
        button.onclick= (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!button.classList.contains('toolbar-menu-button-disabled')) {
                action();
            }
        };
        button.onmouseenter = () => this.#app.setStatus(hoverMessage);
        button.onmouseleave = () => this.#app.clearStatus();
        return [ button ];
    }

    // Creates a button that can be toggled on or off. Returns a function that sets/returns the current button state.
    createToggleButton(label, hoverMessage, defaultState, action) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.bool(defaultState);
        assert.function(action);
        const [ button, stateFn ] = this.#createToggleButton(label, hoverMessage, defaultState, action);
        this.#element.appendChild(button);
        return [ button, stateFn ];
    }

    // Creates a menu-button to open/close a sub-toolbar acting as a menu. Returns a new toolbar
    // as well as a state function to get/set the menu state.
    createMenuButton(label, hoverMessage, openAction) {
        return this.#createMenuButton(label, hoverMessage, openAction, 'toolbar-menu-root toolbar-menu-', true, true);
    }

    // Creates a menu-category to open/close a sub-menu. Returns a new toolbar
    // as well as a state function to get/set the menu state.
    createMenuCategory(label, hoverMessage, openAction) {
        return this.#createMenuButton(label, hoverMessage, openAction, 'toolbar-menu-category toolbar-menu-', false, false);
    }

    // Creates a separator
    createSeparator() {
        const separator = element(this.#element, 'div', 'toolbar-separator');
        return [ separator ];
    }

    // Creates a menu or submenu/category. Returns a new toolbar as well as a state function to get/set the menu state.
    #createMenuButton(label, hoverMessage, openAction, classPrefix, hoverOpens, documentCloses) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.function(openAction);
        const [ button, stateFn ] = this.#createToggleButton(label, hoverMessage, false, (open) => {
            if (open) {
                if (openAction) {
                    openAction();
                }
                // close other menus
                for (const otherstateFn of this.#menuStates) {
                    if (otherstateFn !== stateFn) {
                        otherstateFn(false);
                    }
                }
                this.#menuOpen = button;
                // close menu on click outside of menu
                if (documentCloses) {
                    document.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        document.onclick = null;
                        this.#menuOpen = null;
                        stateFn(false);
                    }
                }
            } else if (documentCloses) {
                document.onclick = null;
                this.#menuOpen = null;
            }
        });
        this.#menuStates.add(stateFn);
        button.classList.add(...(classPrefix + 'button').split(' '));
        const subToolbarContainer = element(button, 'div', classPrefix + 'container');
        // hover-open: modify mouse-enter to open another menu if one is already open, modify stateFn to disable hover-open when a menu is intentionally closed
        if (hoverOpens) {
            const originalMouseEnter = button.onmouseenter;
            button.onmouseenter = (e) => {
                if (this.#menuOpen && this.#menuOpen !== button) {
                    button.onclick(e);
                }
                originalMouseEnter.call(button, e);
            };
        }
        const menuStateFn = (state) => {
            if (!state) {
                this.#menuOpen = null;
            }
            return stateFn(state);
        };
        this.#element.appendChild(button);
        const subToolbar = new Toolbar(this.#app, subToolbarContainer);
        return [ button, menuStateFn, subToolbar ];
    }

    // Creates a toggle button and returns the button element as well as a function that sets/returns the current button state.
    #createToggleButton(label, hoverMessage, defaultState, action) {
        let state = defaultState;
        const button = element(null, 'div', `toolbar-button toolbar-toggle-button toolbar-toggle-button-${state ? 'on' : 'off'}`, '<div class="toolbar-button-label">' + label + '</div>');
        const stateFn = (newState) => {
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
            if (!button.classList.contains('toolbar-menu-button-disabled')) {
                stateFn(!state);
                action(state);
            }
        };
        button.onmouseenter = () => this.#app.setStatus(hoverMessage);
        button.onmouseleave = () => this.#app.clearStatus();
        return [ button, stateFn ];
    }
}