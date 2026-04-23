"use strict";

// ToolbarItem subclass that adds delegation for ComponentToolbar-specific methods.
class ComponentToolbarItem extends ToolbarItem {
    createComponentButton(...args) {
        assert(this.subToolbar, 'This item does not contain a sub-toolbar');
        return this.subToolbar.createComponentButton(...args);
    }
    createPinnableComponentButton(...args) {
        assert(this.subToolbar, 'This item does not contain a sub-toolbar');
        return this.subToolbar.createPinnableComponentButton(...args);
    }
    createPinnedComponentButton(...args) {
        assert(this.subToolbar, 'This item does not contain a sub-toolbar');
        return this.subToolbar.createPinnedComponentButton(...args);
    }
    clearPins(...args) {
        assert(this.subToolbar, 'This item does not contain a sub-toolbar');
        return this.subToolbar.clearPins(...args);
    }
    createTrashZone(...args) {
        assert(this.subToolbar, 'This item does not contain a sub-toolbar');
        return this.subToolbar.createTrashZone(...args);
    }
}

// Toolbar subclass that adds component-button creation, toolbar pinning, and drag-to-grid support.
class ComponentToolbar extends Toolbar {

    // Drop zone element for pinning components to the toolbar.
    #dropZone = null;

    // Trash zone element for unpinning components from the toolbar.
    #trashZone = null;

    // Currently hovered pinned-component button and its associated pin object.
    #hoveredPin = null;
    #hoveredPinButton = null;

    // Insertion indicator shown during toolbar reorder drags.
    #reorderIndicator = null;

    // Pinned toolbar buttons: array of { label, descriptor, defaults?, factory } stored in the circuit file.
    #toolbarPins = [];

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

    // Returns the trash zone element, if created.
    get trashZone() {
        return this.#trashZone;
    }

    // Creates a button that can be dragged onto the grid or toolbar.
    createComponentButton(label, hoverMessage, create, onPin = null) {
        assert.string(label);
        assert.string(hoverMessage);
        assert.function(create);
        assert.function(onPin, true);
        const button = this.#makeComponentButtonNode(label, hoverMessage, create, onPin);
        this.node.appendChild(button);
        return this._makeItem(button);
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
            this.node.insertBefore(button, this.#dropZone);
        } else {
            this.node.appendChild(button);
        }
        return this._makeItem(button);
    }

    // Removes all pinned component buttons from the toolbar.
    clearPins() {
        for (const el of [...this.node.querySelectorAll('[data-pin]')]) {
            el.remove();
        }
    }

    // Returns pinned toolbar button descriptors for serialization.
    get toolbarPins() {
        return this.#toolbarPins;
    }

    // Creates a component button (on this toolbar/submenu) that, when dragged onto the drop zone, pins to the main toolbar.
    createPinnableComponentButton(create, descriptor, label = null) {
        assert.function(create);
        assert.object(descriptor);
        assert.string(label, true);
        const mainToolbar = this.app.toolbar;
        const cls = GridItem.CLASSES[descriptor['#c']];
        const descriptorInfo = cls?.descriptorInfo?.(descriptor);
        const descriptorLabel = descriptorInfo?.label;
        const buttonLabel = label ?? descriptorLabel;
        const hoverMessage = descriptorInfo?.hoverMessage ?? `${descriptorLabel ?? label}.`;
        return this.createComponentButton(buttonLabel, hoverMessage + ` ${Application.TOOLTIP_HINT_MENU}`, create,
            () => {
                // Adds a pinned button to the main toolbar and records it for serialization.
                const pin = cls?.descriptorInfo ? { descriptor } : { label: buttonLabel, descriptor };
                pin.factory = create;
                const createFromPin = (grid, x, y) => pin.factory(grid, x, y);
                const item = mainToolbar.createPinnedComponentButton(descriptorLabel, hoverMessage + ` ${Application.TOOLTIP_HINT_PIN}`, createFromPin,
                    (buttonNode) => mainToolbar.#removePin(pin, buttonNode),
                    () => mainToolbar.#syncPinsFromDOM());
                item.node.__pin = pin;
                mainToolbar.#toolbarPins.push(pin);
                mainToolbar.dropZone.classList.add('toolbar-drop-zone-has-pins');
                this.app.haveChanges = true;
            });
    }

    // Rebuilds pinned toolbar buttons from stored descriptors (called on file load/reset).
    loadPins(pins) {
        this.clearPins();
        this.#toolbarPins = [];
        for (const pin of (pins ?? [])) {
            const cls = GridItem.CLASSES[pin.descriptor['#c']];
            const create = cls?.fromDescriptor?.(this.app, pin.descriptor, pin.defaults ?? {}) ?? null;
            if (create) {
                const meta = cls.descriptorInfo?.(pin.descriptor);
                const label = pin.label ?? meta?.label;
                if (!label) continue;
                const storedPin = meta
                    ? { descriptor: pin.descriptor, defaults: pin.defaults, ...(pin.label ? { label: pin.label } : {}) }
                    : { label, descriptor: pin.descriptor, defaults: pin.defaults };
                storedPin.factory = create;
                const createFromPin = (grid, x, y) => storedPin.factory(grid, x, y);
                const item = this.createPinnedComponentButton(label, (meta?.hoverMessage ?? `${label}.`) + ` ${Application.TOOLTIP_HINT_PIN}`, createFromPin,
                    (buttonNode) => this.#removePin(storedPin, buttonNode),
                    () => this.#syncPinsFromDOM());
                item.node.__pin = storedPin;
                this.#toolbarPins.push(storedPin);
            }
        }
        this.dropZone.classList.toggle('toolbar-drop-zone-has-pins', this.#toolbarPins.length > 0);
    }

    // Opens the edit dialog for a pinned toolbar button to configure its placement defaults.
    async editPin(pin, buttonNode) {
        const cls = GridItem.CLASSES[pin.descriptor['#c']];
        if (!cls?.editDialogConfig) return;
        const base = cls.getPlacementDefaults?.(this.app, pin.descriptor) ?? {};
        const merged = { ...base, ...(pin.defaults ?? {}) };
        const { title, fields, data } = cls.editDialogConfig(pin.descriptor, merged);
        const pinLabelField = [
            { name: 'pinLabel', label: 'Button label', type: 'string' },
            { separator: 'before', text: 'Configure defaults for the created component:' },
        ];
        const config = await dialog(title, [...pinLabelField, ...fields], { pinLabel: pin.label ?? '', ...data });
        if (config) {
            const { _changed, pinLabel, ...defaults } = config;
            pin.label = pinLabel || undefined;
            pin.defaults = defaults;
            // Update descriptor for components where config fields map back to '#t' (e.g. Gate type, Switch mode).
            if (cls.updateDescriptorFromConfig) {
                cls.updateDescriptorFromConfig(pin.descriptor, config);
            }
            const meta = cls.descriptorInfo?.(pin.descriptor);
            buttonNode.textContent = pin.label ?? meta?.label ?? buttonNode.textContent;
            pin.factory = cls.fromDescriptor(this.app, pin.descriptor, pin.defaults);
            this.app.haveChanges = true;
        }
    }

    // Removes a pin entry and its button node from the toolbar.
    #removePin(pin, buttonNode) {
        buttonNode.remove();
        this.#toolbarPins.splice(this.#toolbarPins.indexOf(pin), 1);
        this.dropZone.classList.toggle('toolbar-drop-zone-has-pins', this.#toolbarPins.length > 0);
        this.app.haveChanges = true;
    }

    // Re-syncs toolbar pin order from the current DOM order of pinned buttons.
    #syncPinsFromDOM() {
        const pinElements = [...this.node.querySelectorAll('[data-pin]')];
        this.#toolbarPins = pinElements.map(el => el.__pin).filter(Boolean);
        this.dropZone.classList.toggle('toolbar-drop-zone-has-pins', this.#toolbarPins.length > 0);
        this.app.haveChanges = true;
    }

    // Creates a drop zone element at the end of the toolbar for pinning components.
    createDropZone() {
        this.#dropZone = html(this.node, 'div', 'toolbar-button toolbar-drop-zone');
        this.#dropZone.onmouseenter = () => this.app.setStatus('Drag a component from the Component menu here to pin it to the toolbar.');
        this.#dropZone.onmouseleave = () => this.app.clearStatus();
        return this.#dropZone;
    }

    // Creates a trash zone element at the end of the toolbar for unpinning components.
    createTrashZone() {
        this.#trashZone = html(this.node, 'div', 'toolbar-button toolbar-trash-zone');
        this.#trashZone.onmouseenter = () => this.app.setStatus('Drop here to remove from toolbar.');
        this.#trashZone.onmouseleave = () => this.app.clearStatus();
        return this.#trashZone;
    }

    // Factory override: sub-menus of a ComponentToolbar are also ComponentToolbars.
    _makeSubToolbar(app, container, parent) {
        return new ComponentToolbar(app, container, parent);
    }

    // Factory override: items of a ComponentToolbar are ComponentToolbarItems.
    _makeItem(element, stateFn = null) {
        return new ComponentToolbarItem(this, element, stateFn);
    }

    // Returns the drag status bar message for the given multi-drop state.
    #buildDragStatusMessage(multiState) {
        const count = multiState.count;
        const distanceInfo = `+${multiState.additionalDist / Grid.SPACING}`;
        const isSingle = count <= 1;
        return `Place one or more component instances. <i>R</i> Rotate instances, <i>E</i> / <i>Q</i> Increase/decrease count (${count}), ${isSingle ? '<u>' : ''}<i>W</i> / <i>A</i> / <i>S</i> / <i>D</i> Stack direction/spacing (${distanceInfo})${isSingle ? ',</u>' : ''} `
                + ' <i>ALT+Drop</i> Accept ghost wires.';
    }

    // Repositions all active multi-drop overlay divs to match the current drag position and stacking config.
    #updateDragOverlays(component, multiState, ax, ay) {
        const dir = multiState.direction;
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
    }

    // Creates or removes multi-drop overlay divs to match multiState.count, then repositions them.
    #syncDragOverlays(component, grid, multiState) {
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
            this.#updateDragOverlays(component, multiState, ax, ay);
        }
    }

    // Mousemove handler: repositions overlay divs while dragging.
    #onDragMove(moveEvent, component, what, grid, multiState) {
        if (multiState.overlays.length > 0) {
            const [mx, my] = grid.screenToGrid(moveEvent.clientX, moveEvent.clientY);
            this.#updateDragOverlays(component, multiState, ...component.align(mx - what.grabOffsetX, my - what.grabOffsetY));
        }
    }

    // Keydown handler during drag: q/e adjust count, w/a/s/d adjust stacking, r rotates.
    #handleDragKey(keyEvent, component, what, grid, multiState) {
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
            this.#syncDragOverlays(component, grid, multiState);
        } else if (key === 'q') {
            multiState.count = Math.max(1, multiState.count - 1);
            this.#syncDragOverlays(component, grid, multiState);
        } else if (key === 'e') {
            multiState.count++;
            this.#syncDragOverlays(component, grid, multiState);
        } else {
            if (multiState.count === 1) {
                this.app.showNotice('Requires placing multiple components.');
                return;
            }
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
                this.#updateDragOverlays(component, multiState, ax, ay);
            }
        }
        this.app.setStatus(this.#buildDragStatusMessage(multiState), true);
    }

    // Removes drag event listeners and cleans up any overlay divs.
    #cleanupDrag(dragKeyHandler, onDragMove, grid, multiState) {
        document.removeEventListener('keydown', dragKeyHandler, true);
        document.removeEventListener('mousemove', onDragMove);
        for (const el of multiState.overlays) grid.removeVisual(el);
        multiState.overlays = [];
        this.app.clearStatus(true);
    }

    // Places the additional N-1 components for a multi-drop, then chains to prevUp.
    #placeMultiDropComponents(upEvent, multiState, component, what, grid, create, prevUp) {
        if (multiState.count > 1) {
            const [mx, my] = grid.screenToGrid(upEvent.clientX, upEvent.clientY);
            const [ax, ay] = component.align(mx - what.grabOffsetX, my - what.grabOffsetY);
            const dir = multiState.direction;
            const isHoriz = dir === 'left' || dir === 'right';
            const step = (isHoriz ? component.width : component.height) + multiState.additionalDist;
            const dirX = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
            const dirY = dir === 'down' ? 1 : dir === 'up' ? -1 : 0;
            for (let i = 1; i < multiState.count; i++) {
                create(grid, ax + dirX * step * i, ay + dirY * step * i);
            }
        }
        prevUp.call(document, upEvent);
    }

    // Mousemove handler during a pinned-button reorder drag: shows/hides the insertion indicator.
    #onReorderMove(moveEvent) {
        const target = this.#findInsertionTarget(moveEvent.clientX, moveEvent.clientY);
        if (target !== undefined) {
            this.#showReorderIndicator(target);
        } else {
            this.#hideReorderIndicator();
        }
    }

    // Mouseup handler during a pinned-button reorder drag: completes or aborts the reorder.
    #handleReorderDrop(upEvent, moveFn, savedOnClick, component, button, onReorder, prevUp) {
        document.removeEventListener('mousemove', moveFn);
        this.#hideReorderIndicator();
        const insertBefore = this.#findInsertionTarget(upEvent.clientX, upEvent.clientY);
        if (insertBefore !== undefined) {
            document.body.classList.remove('dragging-from-toolbar');
            document.body.classList.remove('dragging');
            document.onmouseup = null;
            document.onmousemove = null;
            setTimeout(() => document.onclick = savedOnClick, 10);
            this.app.grid.removeItem(component);
            if (insertBefore !== button) {
                this.node.insertBefore(button, insertBefore);
            }
            onReorder();
        } else {
            prevUp.call(document, upEvent);
        }
    }

    // Sets up the full drag session when a component button is pressed.
    #startComponentDrag(button, create, onPin, onTrash, onReorder, e) {
        const savedOnClick = document.onclick;
        const grid = this.app.grid;
        const [x, y] = grid.screenToGrid(e.clientX, e.clientY);
        const component = create(grid, x, y);
        const what = { type: "component", grabOffsetX: component.width / 2, grabOffsetY: component.height / 2, isNew: true };
        component.dragStart(x, y, what);

        // Multi-drop state: q/e change count, w/a/s/d change stacking direction/distance.
        const multiState = { count: 1, direction: 'right', additionalDist: 0, overlays: [] };

        const onDragMove = (ev) => this.#onDragMove(ev, component, what, grid, multiState);
        const dragKeyHandler = (ev) => this.#handleDragKey(ev, component, what, grid, multiState);
        const cleanup = () => this.#cleanupDrag(dragKeyHandler, onDragMove, grid, multiState);

        this.app.setStatus(this.#buildDragStatusMessage(multiState), true);
        document.addEventListener('keydown', dragKeyHandler, true);
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', cleanup, { once: true, capture: true });

        // Wrap onmouseup (before #interceptDrop may wrap it) to place extra components
        // before trackAction fires, so all N drops form a single undo point.
        const prevUp = document.onmouseup;
        document.onmouseup = (upEvent) => this.#placeMultiDropComponents(upEvent, multiState, component, what, grid, create, prevUp);

        if (onPin) {
            const dropZone = this.app.toolbar.dropZone;
            if (dropZone) this.#interceptDrop(dropZone, 'dragging-from-menu', savedOnClick, component, onPin);
        }
        if (onTrash) {
            const trashZone = this.app.toolbar.trashZone;
            if (trashZone) this.#interceptDrop(trashZone, 'dragging-from-toolbar', savedOnClick, component, onTrash);
        }
        if (onReorder) {
            const moveFn = (ev) => this.#onReorderMove(ev);
            document.addEventListener('mousemove', moveFn);
            const prevUpReorder = document.onmouseup;
            document.onmouseup = (upEvent) => this.#handleReorderDrop(upEvent, moveFn, savedOnClick, component, button, onReorder, prevUpReorder);
        }
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
                this.app.grid.removeItem(component, false);
                callback();
            } else {
                originalUp.call(document, upEvent);
            }
        };
    }

    // Finds the toolbar element to insert before when reordering, or undefined if not over toolbar.
    #findInsertionTarget(clientX, clientY) {
        const toolbarRect = this.node.getBoundingClientRect();
        if (clientY < toolbarRect.top || clientY > toolbarRect.bottom) return undefined;
        if (this.#trashZone) {
            const trashRect = this.#trashZone.getBoundingClientRect();
            if (clientX >= trashRect.left && clientX <= trashRect.right) return undefined;
        }
        for (const btn of this.node.querySelectorAll('[data-pin]')) {
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
        this.node.insertBefore(this.#reorderIndicator, insertBefore ?? null);
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
            if (!button.classList.contains('toolbar-menu-button-disabled') && !this.app.grid.readonly) {
                this.#startComponentDrag(button, create, onPin, onTrash, onReorder, e);
            }
        };
        button.onmouseenter = () => {
            this.app.setStatus(hoverMessage);
            if (button.dataset.pin) {
                this.#hoveredPin = button.__pin;
                this.#hoveredPinButton = button;
            }
        };
        button.onmouseleave = () => {
            this.app.clearStatus();
            if (button.dataset.pin) {
                this.#hoveredPin = null;
                this.#hoveredPinButton = null;
            }
        };
        return button;
    }
}
