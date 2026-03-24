"use strict";

// An item of a toolbar (e.g. a button or menu)
class ToolbarItem {
    #parent;
    #element;
    #stateFn;
    #toolbar;
    #openAction;
    constructor(parent, element, stateFn = null, toolbar = null, openAction = null) {
        assert.class(Toolbar, parent);
        assert.class(Node, element);
        assert.function(stateFn, true);
        assert.class(Toolbar, toolbar, true);
        assert.function(openAction, true);
        this.#parent = parent;
        this.#element = element;
        this.#stateFn = stateFn;
        this.#toolbar = toolbar;
        this.#openAction = openAction;
    }
    get parent() {
        return this.#parent;
    }
    get node() {
        return this.#element;
    }
    get toolbar() {
        return this.#toolbar;
    }
    get path() {
        return this.#toolbar.path;
    }
    state(newState) {
        return this.#stateFn(newState);
    }
    open() {
        assert(this.#toolbar, 'This item does not contain a sub-toolbar');
        this.#openAction(this.#toolbar);
    }
    clear() {
        assert(this.#toolbar, 'This item does not contain a sub-toolbar');
        return this.#toolbar.clear();
    }
    createComponentButton(...args) {
        assert(this.#toolbar, 'This item does not contain a sub-toolbar');
        return this.#toolbar.createComponentButton(...args);
    }
    createActionButton(...args) {
        assert(this.#toolbar, 'This item does not contain a sub-toolbar');
        return this.#toolbar.createActionButton(...args);
    }
    createToggleButton(...args) {
        assert(this.#toolbar, 'This item does not contain a sub-toolbar');
        return this.#toolbar.createToggleButton(...args);
    }
    createMenuButton(...args) {
        assert(this.#toolbar, 'This item does not contain a sub-toolbar');
        return this.#toolbar.createMenuButton(...args);
    }
    createMenuCategory(...args) {
        assert(this.#toolbar, 'This item does not contain a sub-toolbar');
        return this.#toolbar.createMenuCategory(...args);
    }
    createSeparator(...args) {
        assert(this.#toolbar, 'This item does not contain a sub-toolbar');
        return this.#toolbar.createSeparator(...args);
    }
}

// Handles tool/menubar.
class Toolbar {

    // Application reference.
    #app;

    // The toolbar element.
    #element;

    // Array of menu state toggle functions.
    #menuStates;

    // The curently open menu button.
    #menuOpen = null;

    // Textual path of this toolbar (concatentation of parent and current toolbar labels).
    #path = '';

    // Creates a new toolpar within the given DOM parent.
    constructor(app, domParent) {
        assert.class(Application, app);
        assert.class(Node, domParent);
        this.#app = app;
        this.#menuStates = new WeakUnorderedSet();
        this.#element = html(domParent, 'div', 'toolbar');
    }

    // Returns the DOM Node.
    get node() {
        return this.#element;
    }

    // Returns the parent DOM Node.
    get parentNode() {
        return this.#element.parentNode;
    }

    get path() {
        return this.#path;
    }

    // Removes all buttons from the toolbar.
    clear() {
        this.#element.textContent = '';
        this.#menuOpen = null;
        this.#menuStates = new WeakUnorderedSet();
    }

    // Creates a button that can be dragged onto the grid.
    createComponentButton(label, hoverMessage, create) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.function(create);
        const button = html(this.#element, 'div', 'toolbar-button toolbar-component-button', label);
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
        return new ToolbarItem(this, button);
    }

    // Creates a button that can be clicked to trigger an action.
    createActionButton(label, hoverMessage, action) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.function(action);
        const button = html(this.#element, 'div', 'toolbar-button toolbar-action-button', label);
        button.onclick= (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!button.classList.contains('toolbar-menu-button-disabled')) {
                action();
            }
        };
        button.onmouseenter = () => this.#app.setStatus(hoverMessage);
        button.onmouseleave = () => this.#app.clearStatus();
        return new ToolbarItem(this, button);
    }

    // Creates a button that can be toggled on or off.
    createToggleButton(label, hoverMessage, defaultState, action) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.bool(defaultState);
        assert.function(action);
        const [ button, stateFn ] = this.#createToggleButton(label, hoverMessage, defaultState, action);
        this.#element.appendChild(button);
        return new ToolbarItem(this, button, stateFn);
    }

    // Creates a menu-button to open/close a sub-toolbar acting as a menu.
    createMenuButton(label, hoverMessage, openAction) {
        return this.#createSubToolbar(label, hoverMessage, openAction, 'toolbar-menu-root toolbar-menu-', true, true);
    }

    // Creates a menu-category to open/close a sub-menu.
    createMenuCategory(label, hoverMessage, openAction) {
        return this.#createSubToolbar(label, hoverMessage, openAction, 'toolbar-menu-category toolbar-menu-', false, false);
    }

    // Creates a separator.
    createSeparator() {
        const separator = html(this.#element, 'div', 'toolbar-separator');
        return new ToolbarItem(this, separator);
    }

    // Creates a menu or submenu/category.
    #createSubToolbar(label, hoverMessage, openAction, classPrefix, hoverOpens, documentCloses) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.function(openAction);
        let actionFn;
        const [ button, stateFn ] = this.#createToggleButton(label, hoverMessage, false, actionFn = (open, toolbarItem) => {
            if (open) {
                if (openAction) {
                    openAction(toolbarItem);
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
        const subToolbarContainer = html(button, 'div', classPrefix + 'container');
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
        this.#element.appendChild(button);
        const subToolbar = new Toolbar(this.#app, subToolbarContainer);
        subToolbar.#path = this.#path + ' / ' + label;
        let toolbarItem;
        const menuStateFn = (state) => {
            if (!state) {
                this.#menuOpen = null;
            }
            let resultState = stateFn(state);
            if (state !== undefined) {
                actionFn(state, toolbarItem);
            }
            return resultState;
        };
        return toolbarItem = new ToolbarItem(this, button, stateFn, subToolbar, menuStateFn);
    }

    // Creates a toggle button and returns the button element as well as a function that sets/returns the current button state.
    #createToggleButton(label, hoverMessage, defaultState, action) {
        let state = defaultState;
        const button = html(null, 'div', `toolbar-button toolbar-toggle-button toolbar-toggle-button-${state ? 'on' : 'off'}`, '<div class="toolbar-button-label">' + label + '</div>');
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
                action(state, this);
            }
        };
        button.onmouseenter = () => this.#app.setStatus(hoverMessage);
        button.onmouseleave = () => this.#app.clearStatus();
        return [ button, stateFn ];
    }
}