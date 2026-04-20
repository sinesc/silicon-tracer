"use strict";

// An item of a toolbar (e.g. a button or menu)
class ToolbarItem {
    #toolbar;
    #node;
    #stateFn;
    #subToolbar = null;
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
    open() {
        return this.state(true);
    }
    close() {
        return this.state(false);
    }
    clear() {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.clear();
    }
    createComponentButton(...args) {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.createComponentButton(...args);
    }
    createPinnedComponentButton(...args) {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.createPinnedComponentButton(...args);
    }
    clearPins(...args) {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.clearPins(...args);
    }
    createTrashZone(...args) {
        assert(this.#subToolbar, 'This item does not contain a sub-toolbar');
        return this.#subToolbar.createTrashZone(...args);
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
    setSubToolbar(subToolbar) {
        assert.class(Toolbar, subToolbar, true);
        this.#subToolbar = subToolbar;
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

    // Drop zone element for pinning components to the toolbar.
    #dropZone = null;

    // Trash zone element for unpinning components from the toolbar.
    #trashZone = null;

    // Currently hovered pinned-component button and its associated pin object.
    #hoveredPin = null;
    #hoveredPinButton = null;

    // Insertion indicator shown during toolbar reorder drags.
    #reorderIndicator = null;

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

    // Creates a button that can be dragged onto the grid or toolbar.
    createComponentButton(label, hoverMessage, create, onPin = null) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.function(create);
        assert.function(onPin, true);
        const button = this.#makeComponentButtonNode(label, hoverMessage, create, onPin);
        this.#element.appendChild(button);
        return new ToolbarItem(this, button);
    }

    // Creates a pinned component button (a component dragged onto the toolbar).
    createPinnedComponentButton(label, hoverMessage, create, onTrash = null, onReorder = null) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.function(create);
        assert.function(onTrash, true);
        assert.function(onReorder, true);
        const button = this.#makeComponentButtonNode(label, hoverMessage, create, null,
            onTrash ? () => onTrash(button) : null,
            onReorder ? () => onReorder() : null);
        button.dataset.pin = '1';
        if (this.#dropZone) {
            this.#element.insertBefore(button, this.#dropZone);
        } else {
            this.#element.appendChild(button);
        }
        return new ToolbarItem(this, button);
    }

    // Removes all pinned component buttons from the toolbar.
    clearPins() {
        for (const el of [...this.#element.querySelectorAll('[data-pin]')]) {
            el.remove();
        }
    }

    // Creates a drop zone element at the end of the toolbar for pinning components.
    createDropZone() {
        this.#dropZone = html(this.#element, 'div', 'toolbar-button toolbar-drop-zone');
        this.#dropZone.onmouseenter = () => this.#app.setStatus('Drag a component from the Component menu here to pin it to the toolbar.');
        this.#dropZone.onmouseleave = () => this.#app.clearStatus();
        return this.#dropZone;
    }

    // Returns the currently hovered pinned-button's pin object, or null.
    get hoveredPin() {
        return this.#hoveredPin;
    }

    // Returns the currently hovered pinned-button DOM node, or null.
    get hoveredPinButton() {
        return this.#hoveredPinButton;
    }

    // Returns the drop zone element, if created.
    get dropZone() {
        return this.#dropZone;
    }

    // Creates a trash zone element at the end of the toolbar for unpinning components.
    createTrashZone() {
        this.#trashZone = html(this.#element, 'div', 'toolbar-button toolbar-trash-zone');
        this.#trashZone.onmouseenter = () => this.#app.setStatus('Drop here to remove from toolbar.');
        this.#trashZone.onmouseleave = () => this.#app.clearStatus();
        return this.#trashZone;
    }

    // Returns the trash zone element, if created.
    get trashZone() {
        return this.#trashZone;
    }

    // Creates a button that can be clicked to trigger an action.
    createActionButton(label, hoverMessage, action) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.function(action);
        const button = html(this.#element, 'div', 'toolbar-button toolbar-action-button', label);
        button.onclick= async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!button.classList.contains('toolbar-menu-button-disabled')) {
                await action();
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

    // Wraps onmouseup so that dropping over zoneElement calls callback() instead of completing the normal grid drop.
    #interceptDrop(zoneElement, bodyClass, savedOnClick, component, callback) {
        document.body.classList.add(bodyClass);
        const originalUp = document.onmouseup;
        document.onmouseup = (upEvent) => {
            const rect = zoneElement.getBoundingClientRect();
            document.body.classList.remove(bodyClass);
            if (upEvent.clientX >= rect.left && upEvent.clientX <= rect.right &&
                upEvent.clientY >= rect.top && upEvent.clientY <= rect.bottom) {
                document.onmouseup = null;
                document.onmousemove = null;
                document.body.classList.remove('dragging');
                setTimeout(() => document.onclick = savedOnClick, 10);
                this.#app.grid.removeItem(component);
                callback();
            } else {
                originalUp.call(document, upEvent);
            }
        };
    }

    // Finds the toolbar element to insert before when reordering, or undefined if not over toolbar.
    #findInsertionTarget(clientX, clientY) {
        const toolbarRect = this.#element.getBoundingClientRect();
        if (clientY < toolbarRect.top || clientY > toolbarRect.bottom) return undefined;
        if (this.#trashZone) {
            const trashRect = this.#trashZone.getBoundingClientRect();
            if (clientX >= trashRect.left && clientX <= trashRect.right) return undefined;
        }
        for (const btn of this.#element.querySelectorAll('[data-pin]')) {
            const rect = btn.getBoundingClientRect();
            if (clientX < rect.left + rect.width / 2) return btn;
        }
        return this.#dropZone;
    }

    // Inserts or moves the reorder indicator before the given element.
    #showReorderIndicator(insertBefore) {
        if (!this.#reorderIndicator) {
            this.#reorderIndicator = document.createElement('div');
            this.#reorderIndicator.className = 'toolbar-reorder-indicator';
        }
        this.#element.insertBefore(this.#reorderIndicator, insertBefore ?? null);
    }

    // Removes the reorder indicator from the DOM.
    #hideReorderIndicator() {
        this.#reorderIndicator?.remove();
    }

    // Creates a button element that can be dragged onto the grid or toolbar.
    #makeComponentButtonNode(label, hoverMessage, create, onPin = null, onTrash = null, onReorder = null) {
        const button = html(null, 'div', 'toolbar-button toolbar-component-button', label);
        button.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!button.classList.contains('toolbar-menu-button-disabled') && !this.#app.grid.readonly) {
                const savedOnClick = document.onclick;
                const grid = this.#app.grid;
                const [ x, y ] = grid.screenToGrid(e.clientX, e.clientY);
                const component = create(grid, x, y);
                const what = { type: "component", grabOffsetX: component.width / 2, grabOffsetY: component.height / 2, isNew: true };
                component.dragStart(x, y, what);

                // Multi-drop state: q/e change count, w/a/s/d change stacking direction/distance.
                const multiState = { count: 1, direction: null, additionalDist: 0, overlays: [] };

                const updateOverlays = (ax, ay) => {
                    const dir = multiState.direction ?? 'right';
                    const isHoriz = dir === 'left' || dir === 'right';
                    const step = (isHoriz ? component.width : component.height) + multiState.additionalDist;
                    const dirX = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
                    const dirY = dir === 'down' ? 1 : dir === 'up' ? -1 : 0;
                    const visualW = component.visual.width;
                    const visualH = component.visual.height;
                    for (let i = 0; i < multiState.overlays.length; i++) {
                        const [vx, vy] = component.gridToVisual(ax + dirX * step * (i + 1), ay + dirY * step * (i + 1));
                        const overlay = multiState.overlays[i];
                        overlay.style.left = vx + 'px';
                        overlay.style.top = vy + 'px';
                        overlay.style.width = visualW + 'px';
                        overlay.style.height = visualH + 'px';
                    }
                };

                const syncOverlays = () => {
                    while (multiState.overlays.length < multiState.count - 1) {
                        const el = html(null, 'div', 'component-drop-preview');
                        grid.addVisual(el);
                        multiState.overlays.push(el);
                    }
                    while (multiState.overlays.length > multiState.count - 1) {
                        grid.removeVisual(multiState.overlays.pop());
                    }
                    if (multiState.overlays.length > 0) {
                        const [ax, ay] = component.align(component.x, component.y);
                        updateOverlays(ax, ay);
                    }
                };

                const onDragMove = (moveEvent) => {
                    if (multiState.overlays.length > 0) {
                        const [mx, my] = grid.screenToGrid(moveEvent.clientX, moveEvent.clientY);
                        updateOverlays(...component.align(mx - what.grabOffsetX, my - what.grabOffsetY));
                    }
                };

                const statusMessage = () => {
                    const dir = multiState.direction;
                    const dirInfo = dir !== null && multiState.count > 1
                        ? `${dir}${multiState.additionalDist > 0 ? `, ${multiState.additionalDist}` : ''}`
                        : '';
                    return `Place one or more component instances. <i>R</i> Rotate instances, <i>E</i> / <i>Q</i> Increase/decrease count (${multiState.count}), <i>W</i> / <i>A</i> / <i>S</i> / <i>D</i> Stack direction/distance (${dirInfo})`;
                };

                const dragKeyHandler = (keyEvent) => {
                    const key = keyEvent.key;
                    if (!['q', 'e', 'w', 'a', 's', 'd', 'r'].includes(key)) return;
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    if (key === 'r') {
                        component.rotation += 1;
                        // Grab offsets must reflect new width/height after rotation, otherwise
                        // onMove will mis-position the component on the next mousemove.
                        what.grabOffsetX = component.width / 2;
                        what.grabOffsetY = component.height / 2;
                        syncOverlays();
                    } else if (key === 'q') {
                        multiState.count = Math.max(1, multiState.count - 1);
                        syncOverlays();
                    } else if (key === 'e') {
                        multiState.count++;
                        syncOverlays();
                    } else {
                        const newDir = { w: 'up', a: 'left', s: 'down', d: 'right' }[key];
                        const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
                        if (multiState.direction === newDir) {
                            multiState.additionalDist += Grid.SPACING;
                        } else if (multiState.direction === opposite[newDir]) {
                            if (multiState.additionalDist > 0) {
                                multiState.additionalDist -= Grid.SPACING;
                            } else {
                                multiState.direction = newDir;
                            }
                        } else {
                            multiState.direction = newDir;
                        }
                        if (multiState.overlays.length > 0) {
                            const [ax, ay] = component.align(component.x, component.y);
                            updateOverlays(ax, ay);
                        }
                    }
                    this.#app.setStatus(statusMessage(), true);
                };

                const cleanup = () => {
                    document.removeEventListener('keydown', dragKeyHandler, true);
                    document.removeEventListener('mousemove', onDragMove);
                    for (const el of multiState.overlays) grid.removeVisual(el);
                    multiState.overlays = [];
                    this.#app.clearStatus(true);
                };

                this.#app.setStatus(statusMessage(), true);
                document.addEventListener('keydown', dragKeyHandler, true);
                document.addEventListener('mousemove', onDragMove);
                document.addEventListener('mouseup', cleanup, { once: true, capture: true });

                // Wrap onmouseup (before #interceptDrop may wrap it) to place extra components
                // before trackAction fires, so all N drops form a single undo point.
                const prevUp = document.onmouseup;
                document.onmouseup = (upEvent) => {
                    if (multiState.count > 1) {
                        const [mx, my] = grid.screenToGrid(upEvent.clientX, upEvent.clientY);
                        const [ax, ay] = component.align(mx - what.grabOffsetX, my - what.grabOffsetY);
                        const dir = multiState.direction ?? 'right';
                        const isHoriz = dir === 'left' || dir === 'right';
                        const step = (isHoriz ? component.width : component.height) + multiState.additionalDist;
                        const dirX = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
                        const dirY = dir === 'down' ? 1 : dir === 'up' ? -1 : 0;
                        for (let i = 1; i < multiState.count; i++) {
                            create(grid, ax + dirX * step * i, ay + dirY * step * i);
                        }
                    }
                    prevUp.call(document, upEvent);
                };

                if (onPin) {
                    const dropZone = this.#app.toolbar.dropZone;
                    if (dropZone) this.#interceptDrop(dropZone, 'dragging-from-menu', savedOnClick, component, onPin);
                }
                if (onTrash) {
                    const trashZone = this.#app.toolbar.trashZone;
                    if (trashZone) this.#interceptDrop(trashZone, 'dragging-from-toolbar', savedOnClick, component, onTrash);
                }
                if (onReorder) {
                    const moveFn = (moveEvent) => {
                        const target = this.#findInsertionTarget(moveEvent.clientX, moveEvent.clientY);
                        if (target !== undefined) {
                            this.#showReorderIndicator(target);
                        } else {
                            this.#hideReorderIndicator();
                        }
                    };
                    document.addEventListener('mousemove', moveFn);
                    const prevUp = document.onmouseup;
                    document.onmouseup = (upEvent) => {
                        document.removeEventListener('mousemove', moveFn);
                        this.#hideReorderIndicator();
                        const insertBefore = this.#findInsertionTarget(upEvent.clientX, upEvent.clientY);
                        if (insertBefore !== undefined) {
                            document.body.classList.remove('dragging-from-toolbar');
                            document.body.classList.remove('dragging');
                            document.onmouseup = null;
                            document.onmousemove = null;
                            setTimeout(() => document.onclick = savedOnClick, 10);
                            this.#app.grid.removeItem(component);
                            if (insertBefore !== button) {
                                this.#element.insertBefore(button, insertBefore);
                            }
                            onReorder();
                        } else {
                            prevUp.call(document, upEvent);
                        }
                    };
                }
            }
        };
        button.onmouseenter = () => {
            this.#app.setStatus(hoverMessage);
            if (button.dataset.pin) {
                this.#hoveredPin = button.__pin;
                this.#hoveredPinButton = button;
            }
        };
        button.onmouseleave = () => {
            this.#app.clearStatus();
            if (button.dataset.pin) {
                this.#hoveredPin = null;
                this.#hoveredPinButton = null;
            }
        };
        return button;
    }

    // Creates a menu or submenu/category.
    #createSubToolbar(label, hoverMessage, openAction, classPrefix, hoverOpens, documentCloses) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.function(openAction);
        const item = this.#createToggleButton(label, hoverMessage, false, (open, toolbarItem) => {
            assert.class(ToolbarItem, toolbarItem);
            this.root.#states[item.toolbar.path] = open ? item.path : null;// remember state
            if (open) {
                if (openAction) {
                    openAction(toolbarItem);
                }
                // close other menus
                for (const otherstateFn of this.#menuStates) {
                    if (otherstateFn !== item.stateFn) {
                        otherstateFn(false, false);
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
            } else {
                if (documentCloses) {
                    document.onclick = null;
                }
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
        item.setSubToolbar(subToolbar);
        // restore last menu state from textual path (since the menu objects are recreated each time they are not comparable)
        if (this.root.#states[item.toolbar.path] === item.path) {
            item.state(true);
        }
        return item;
    }

    // Creates a toggle button and returns the button element as well as a function that sets/returns the current button state.
    #createToggleButton(label, hoverMessage, defaultState, action) {
        let state = defaultState;
        const button = html(null, 'div', `toolbar-button toolbar-toggle-button toolbar-toggle-button-${state ? 'on' : 'off'}`, '<div class="toolbar-button-label">' + label + '</div>');
        const stateFn = (newState, triggerAction = true) => {
            if (newState !== undefined) {
                button.classList.remove(state ? 'toolbar-toggle-button-on' : 'toolbar-toggle-button-off');
                state = newState;
                button.classList.add(state ? 'toolbar-toggle-button-on' : 'toolbar-toggle-button-off');
                if (triggerAction) {
                    action(state, item);
                }
            }
            return state;
        };
        const item = new ToolbarItem(this, button, stateFn);
        item.node.onclick= (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!button.classList.contains('toolbar-menu-button-disabled')) {
                stateFn(!state);
            }
        };
        item.node.onmouseenter = () => this.#app.setStatus(hoverMessage);
        item.node.onmouseleave = () => this.#app.clearStatus();
        return item;
    }
}