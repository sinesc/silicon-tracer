"use strict";

// An item of a toolbar (e.g. a button or menu)
class ToolbarItem {
    #toolbar;
    #node;
    #stateFn;
    #subToolbar = null;
    #menuStateFn = null;
    constructor(toolbar, element, stateFn = null) {
        assert.class(Toolbar, toolbar);
        assert.class(Node, element);
        assert.function(stateFn, true);
        this.#toolbar = toolbar;
        this.#node = element;
        this.#stateFn = stateFn;
    }
    get toolbar() {
        return this.#toolbar;
    }
    get node() {
        return this.#node;
    }
    get path() {
        return this.#subToolbar?.path ?? this.#toolbar.path;
    }
    get stateFn() {
        return this.#stateFn;
    }
    state(newState) {
        assert(this.#stateFn, 'This item does not have state');
        return this.#stateFn(newState);
    }
    menuState(newState) {
        assert(this.#menuStateFn, 'This item does not contain a sub-toolbar');
        return this.#menuStateFn(newState, this);
    }
    open() {
        return this.menuState(true);
    }
    close() {
        return this.menuState(false);
    }
    clear() {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.clear();
    }
    createComponentButton(...args) {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.createComponentButton(...args);
    }
    createActionButton(...args) {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.createActionButton(...args);
    }
    createToggleButton(...args) {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.createToggleButton(...args);
    }
    createMenuButton(...args) {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.createMenuButton(...args);
    }
    createMenuCategory(...args) {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.createMenuCategory(...args);
    }
    createSeparator(...args) {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.createSeparator(...args);
    }
    setSubToolbar(subToolbar, menuStateFn) {
        assert.class(Toolbar, subToolbar, true);
        assert.function(menuStateFn, true);
        this.#subToolbar = subToolbar;
        this.#menuStateFn = menuStateFn;
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

    // Parent toolbar.
    #parent = null;

    // Menu states by textual path.
    #states = {};

    // Creates a new toolpar within the given DOM parent.
    constructor(app, domParent, parent = null) {
        assert.class(Application, app);
        assert.class(Node, domParent);
        assert.class(Toolbar, parent, true);
        this.#app = app;
        this.#menuStates = new WeakUnorderedSet();
        this.#element = html(domParent, 'div', 'toolbar');
        this.#parent = parent;
    }

    // Returns the DOM Node.
    get node() {
        return this.#element;
    }

    // Returns the parent DOM Node.
    get parentNode() {
        return this.#element.parentNode;
    }

    // Returns textual toolbar path.
    get path() {
        return this.#path;
    }

    // Returns the root toolbar.
    get root() {
        let current = this;
        while (current.#parent !== null) {
            current = this.#parent;
        }
        return current;
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
        const item = this.#createToggleButton(label, hoverMessage, defaultState, action);
        this.#element.appendChild(item.node);
        return item;
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
        const item = this.#createToggleButton(label, hoverMessage, false, actionFn = (open, toolbarItem) => {
            assert.class(ToolbarItem, toolbarItem);
            this.root.#states[item.toolbar.path] = open ? item.path : null;// remember state
            if (open) {
                if (openAction) {
                    openAction(toolbarItem);
                }
                // close other menus
                for (const otherstateFn of this.#menuStates) {
                    if (otherstateFn !== item.stateFn) {
                        otherstateFn(false);
                    }
                }
                this.#menuOpen = item.node;
                // close menu on click outside of menu
                if (documentCloses) {
                    document.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        document.onclick = null;
                        this.#menuOpen = null;
                        item.state(false);
                    }
                }
            } else if (documentCloses) {
                document.onclick = null;
                this.#menuOpen = null;
            }
        });
        this.#menuStates.add(item.stateFn);
        item.node.classList.add(...(classPrefix + 'button').split(' '));
        const subToolbarContainer = html(item.node, 'div', classPrefix + 'container');
        // hover-open: modify mouse-enter to open another menu if one is already open, modify item.state to disable hover-open when a menu is intentionally closed
        if (hoverOpens) {
            const originalMouseEnter = item.node.onmouseenter;
            item.node.onmouseenter = (e) => {
                if (this.#menuOpen && this.#menuOpen !== item.node) {
                    item.node.onclick(e);
                }
                originalMouseEnter.call(item.node, e);
            };
        }
        this.#element.appendChild(item.node);
        const subToolbar = new Toolbar(this.#app, subToolbarContainer, this);
        subToolbar.#path = this.#path + ' / ' + label;
        const menuStateFn = (state) => {
            let resultState = item.state(state);
            if (state !== undefined) {
                if (!state) {
                    this.#menuOpen = null;
                }
                actionFn(state, item);
            }
            return resultState;
        };
        item.setSubToolbar(subToolbar, menuStateFn);
        // restore last menu state from textual path (since the menu objects are recreated each time they are not comparable)
        if (this.root.#states[item.toolbar.path] === item.path) {
            menuStateFn(true);
        }
        return item;
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
        const item = new ToolbarItem(this, button, stateFn);
        item.node.onclick= (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!button.classList.contains('toolbar-menu-button-disabled')) {
                stateFn(!state); // note this modifies "state" so action() below also receives the negated state
                action(state, item);
            }
        };
        item.node.onmouseenter = () => this.#app.setStatus(hoverMessage);
        item.node.onmouseleave = () => this.#app.clearStatus();
        return item;
    }
}