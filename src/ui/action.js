"use strict";

// UI actions
class Action {

    // Move current grid circuit from the the main circuits list to a selectable library.
    static async moveCircuitToLibrary(app) {
        assert.class(Application, app);
        const nonPackagedLibs = app.circuits.libraries.filter(([ lid ]) => !app.circuits.isPackaged(lid)).toArray();
        const options = Object.fromEntries(nonPackagedLibs.map(([ lid, label ]) => [ lid, label ]));
        const result = await dialog('Move to library', [
            { name: 'lib', label: 'Library', type: 'select', options },
        ], { lib: nonPackagedLibs[0][0] });
        if (result) {
            const circuit = app.circuits.current;
            const libLabel = nonPackagedLibs.find(([ lid ]) => lid === result.lib)[1];
            circuit.lid = result.lib;
            app.showNotice(`Circuit "${circuit.label}" was moved to "${libLabel}".`);
            app.haveChanges = true;
        }
    }

    // Move current grid circuit from a library to the the main circuits list.
    static moveCircuitToCircuits(app) {
        assert.class(Application, app);
        const circuit = app.circuits.current;
        circuit.lid = null;
        app.showNotice(`Circuit "${circuit.label}" was moved to circuits.`);
        app.haveChanges = true;
    }

    // Delete a circuit from the project after user confirmation.
    static async deleteCircuit(app, circuit) {
        assert.class(Application, app);
        assert.class(Circuit, circuit);
        if (await confirmDialog('Confirm deletion', `Delete "${circuit.label}" from project?`)) {
            app.circuits.globalUndoStack.push(`Delete "${circuit.label}"`, JSON.stringify(circuit.serialize()), null, false);
            app.simulations.delete(circuit);
            app.circuits.delete(circuit.uid);
            app.simulations.select(app.circuits.current, app.config.autoCompile);
            app.history.record();
            app.haveChanges = true;
            app.refreshUndoButtons();
        }
    }

    // Select a circuit by UID and update the current simulation.
    static selectCircuit(app, uid) {
        assert.class(Application, app);
        assert.string(uid);
        app.circuits.select(uid);
        app.simulations.select(app.circuits.current, app.config.autoCompile);
        app.history.record();
    }

    // Select a simulation by UID, resume continuous mode, and record navigation history.
    static selectSimulation(app, uid) {
        assert.class(Application, app);
        assert.string(uid);
        app.circuits.select(uid);
        app.config.singleStep = false;
        app.simulations.select(app.circuits.current, app.config.autoCompile);
        app.history.record();
    }

    // Open a circuit file, replacing all currently loaded circuits.
    static async openFile(app) {
        assert.class(Application, app);
        if (!app.haveChanges || await unsavedDialog('Click Ok to discard and open another project anyway or Cancel to abort.')) {
            await app.circuits.loadFile(true);
            app.simulations.clear();
            app.simulations.select(app.circuits.current, app.config.autoCompile);
            app.history.init();
            document.title = app.circuits.fileName + ' - Silicon Tracer';
            app.haveChanges = false;
        }
    }

    // Merge circuits from a file into the currently loaded circuits.
    static async mergeFile(app) {
        assert.class(Application, app);
        await app.circuits.loadFile(false, false);
        app.haveChanges = true;
    }

    // Load a file as a library into the Component menu.
    static async includeLibrary(app) {
        assert.class(Application, app);
        await app.circuits.loadFile(false, false, true);
        app.haveChanges = true;
    }

    // Create a new empty library via dialog.
    static async createLibrary(app) {
        assert.class(Application, app);
        const result = await dialog('Create library', [
            { name: 'label', label: 'Library name', type: 'string', postCheck: (v) => v.length > 0 },
        ], { label: '' });
        if (result) {
            app.circuits.addLibrary(result.label, null, false);
            app.showNotice(`Added empty library "${result.label}" to the Component menu.`);
            app.haveChanges = true;
        }
    }

    // Select and extract a library to a file via dialog.
    static async extractLibrary(app) {
        assert.class(Application, app);
        const hasCircuit = (lid) => Object.values(app.circuits.all).some((c) => c.lid === lid);
        const libs = [ ...app.circuits.libraries ].filter(([ lid ]) => !app.circuits.isPackaged(lid) && hasCircuit(lid));
        const options = Object.fromEntries(libs.map(([ lid, label ]) => [ lid, label ]));
        const result = await dialog('Extract library', [
            { name: 'lib', label: 'Library', type: 'select', options },
        ], { lib: libs[0][0] });
        if (result) {
            await app.circuits.extractLibrary(result.lib);
        }
    }

    // Select and remove a non-packaged library via dialog.
    static async removeLibrary(app) {
        assert.class(Application, app);
        const libs = [ ...app.circuits.libraries ].filter(([ lid ]) => !app.circuits.isPackaged(lid));
        const removable = libs.filter(([ lid ]) => app.circuits.libraryDependents(lid).size === 0);
        const nonRemovable = libs.filter(([ lid ]) => app.circuits.libraryDependents(lid).size > 0);
        const fields = [];
        fields.push({ name: 'lib', label: 'Library', type: 'select', options: Object.fromEntries(removable.map(([ lid, label ]) => [ lid, label ])) });
        if (nonRemovable.length > 0) {
            fields.push({ separator: 'before', text: `The following libraries cannot be removed because other circuits depend on them: ${nonRemovable.map(([ , label ]) => `<b>${label}</b>`).join(', ')}.` });
        }
        const result = await dialog('Remove library', fields, { lib: removable[0]?.[0] ?? '' });
        if (result) {
            const libLabel = removable.find(([ lid ]) => lid === result.lib)[1];
            app.circuits.removeLibrary(result.lib);
            app.simulations.clear();
            app.simulations.select(app.circuits.current, app.config.autoCompile);
            app.showNotice(`Removed library "${libLabel}".`);
            app.haveChanges = true;
        }
    }

    // Import circuits from a foreign file format.
    static async importFile(app) {
        assert.class(Application, app);
        await app.circuits.importFile();
        app.haveChanges = true;
    }

    // Save circuits to the previously opened file.
    static async saveFile(app) {
        assert.class(Application, app);
        await app.circuits.saveFile();
        app.haveChanges = false;
    }

    // Save circuits to a new file chosen via dialog.
    static async saveFileAs(app) {
        assert.class(Application, app);
        await app.circuits.saveFileAs();
        app.haveChanges = false;
        document.title = app.circuits.fileName + ' - Silicon Tracer';
    }

    // Close all circuits, prompting for unsaved changes.
    static async closeFile(app, removeLibraries) {
        assert.class(Application, app);
        assert.bool(removeLibraries);
        if (!app.haveChanges || await unsavedDialog('Click Ok to close it anyway or Cancel to abort.')) {
            app.circuits.closeFile(removeLibraries);
            app.simulations.clear();
            app.simulations.select(app.circuits.current, app.config.autoCompile);
            app.history.init();
            app.haveChanges = false;
            document.title = 'Silicon Tracer';
        }
    }

    // Create a new circuit via dialog and update the simulation.
    static async newCircuit(app) {
        assert.class(Application, app);
        if (await app.circuits.create()) {
            app.simulations.select(app.circuits.current, app.config.autoCompile);
            app.haveChanges = true;
        }
    }

    // Toggle the current simulation on or off.
    static toggleSimulation(app) {
        assert.class(Application, app);
        const sim = app.simulations.current;
        const isCurrent = app.circuits.current.uid === sim?.uid;
        if (isCurrent && sim) {
            app.config.autoCompile = false;
            const circuit = app.circuits.byUID(sim.uid);
            if (circuit) {
                app.simulations.delete(circuit);
            }
            app.simulations.select(null);
            app.circuits.select(app.grid.circuit.uid);
        } else {
            app.config.singleStep = false;
            app.simulations.select(app.circuits.current, true);
        }
    }

    // Set the simulation ticks-per-second limit via dialog.
    static async setSimulationSpeed(app) {
        assert.class(Application, app);
        const result = await dialog('Simulation speed', [ { label: "Ticks per second", name: "targetTPS", type: "int", postCheck: (v, f) => v >= 1 } ], { targetTPS: app.config.targetTPS });
        if (result) {
            app.config.targetTPS = result.targetTPS;
            app.simulations.updateClocks(app.config.targetTPS);
        }
    }

    // Add a break condition expression via dialog.
    static async addBreakCondition(app) {
        assert.class(Application, app);
        const EXPRESSION_HELP = 'Probe labels are available as variables, e.g. <code>!pA &amp;&amp; (pB || pC)</code>. Undriven probes return <code>null</code>, conflicting probes <code>-1</code>.';
        const result = await dialog('Add break condition', [
            { text: 'Enter an expression.' + EXPRESSION_HELP },
            { label: 'Expression', name: 'expression', type: 'string', check: (v) => v.trim() !== '' }
        ], { expression: '' });
        if (result) {
            app.config.breakConditions.push(result.expression.trim());
            app.simulations.markDirty(null);
        }
    }

    // Copies selected items to clipboard.
    static copySelection(app) {
        assert.class(Application, app);
        return navigator.clipboard.writeText(JSON.stringify(app.grid.selection.items.map((item) => item.serialize())));
    }

    // Cut the current selection to clipboard.
    static async cutSelection(app) {
        assert.class(Application, app);
        if (app.grid.readonly) return;
        await Action.copySelection(app);
        Action.#deleteSelection(app);
        app.grid.trackAction('Cut selection');
    }

    // Delete the current selection.
    static deleteSelection(app) {
        assert.class(Application, app);
        if (app.grid.readonly) return;
        Action.#deleteSelection(app);
        app.grid.trackAction('Delete selection');
    }

    // Paste items from clipboard onto the grid.
    static async pasteSelection(app) {
        assert.class(Application, app);
        if (app.grid.readonly) return;
        const serialized = JSON.parse(await navigator.clipboard.readText());
        const items = serialized.map((item) => GridItem.unserialize(app, item));
        for (const item of items) {
            item.x += 2 * Grid.SPACING;
            item.y += 2 * Grid.SPACING;
        }
        for (const item of app.grid.circuit.items) {
            item.selected = false;
        }
        for (const item of items) {
            app.grid.addItem(item);
            item.onPaste();
        }
        app.grid.selection.set(items);
        app.haveChanges = true;
        app.grid.trackAction('Paste selection');
    }

    // Rotates the current selection 90° around its center.
    static rotateSelection(app) {
        assert.class(Application, app);
        const center = app.grid.selection.rotationCenter ??= Action.#computeSelectionCenter(app);
        const RAD90 = Math.PI / 2;
        for (const item of app.grid.selection.items) {
            if (item instanceof Component || item instanceof TextLabel) {
                // component.rotation causes a rotation around the component center, so we have to use that as our basis
                const xc = item.x + (item.width / 2);
                const yc = item.y + (item.height / 2);
                const offset = point(xc, yc).rotateAround(center, RAD90).round();
                // offset item by difference so we don't have to compute with center again
                item.x += offset.x - xc;
                item.y += offset.y - yc;
                item.rotation += 1;
            } else if (item instanceof Wire) {
                const start = point(item.x, item.y).rotateAround(center, RAD90).round();
                const end = point(item.x + item.width, item.y + item.height).rotateAround(center, RAD90).round();
                item.setEndpoints(start.x, start.y, end.x, end.y);
            }
        }
        app.grid.onTopologyChanged();
        app.grid.trackAction('Rotate selection');
    }

    // Computes the center point of the current selection for rotation, snapped to the grid.
    static #computeSelectionCenter(app) {
        let bounds = { x1: Number.MAX_SAFE_INTEGER, y1: Number.MAX_SAFE_INTEGER, x2: Number.MIN_SAFE_INTEGER, y2: Number.MIN_SAFE_INTEGER };
        for (const item of app.grid.selection.items) {
            bounds.x1 = Math.min(item.x, bounds.x1);
            bounds.y1 = Math.min(item.y, bounds.y1);
            bounds.x2 = Math.max(item.x + item.width, bounds.x2);
            bounds.y2 = Math.max(item.y + item.height, bounds.y2);
        }
        const centerX = bounds.x1 + (bounds.x2 - bounds.x1) / 2;
        const centerY = bounds.y1 + (bounds.y2 - bounds.y1) / 2;
        return point(Math.round(centerX / Grid.SPACING) * Grid.SPACING, Math.round(centerY / Grid.SPACING) * Grid.SPACING);
    }

    // Deletes selected items from the grid. Helper for cut/delete actions.
    static #deleteSelection(app) {
        app.grid.circuit.detachSimulation();
        for (const item of app.grid.selection.items) {
            app.grid.removeItem(item);
        }
        app.grid.selection.clear();
        app.haveChanges = true;
    }

    // Performs undo on the most recently changed stack (per-circuit or global, whichever is newer).
    static undo(app) {
        assert.class(Application, app);
        const perStack = app.circuits.current?.undoStack;
        const globalStack = app.circuits.globalUndoStack;
        if (globalStack.undoTimestamp > (perStack?.undoTimestamp ?? -Infinity) && globalStack.canUndo) {
            const { snapshot } = globalStack.undo();
            app.circuits.restoreDeletedCircuit(snapshot);
        } else if (perStack?.canUndo) {
            const { snapshot } = perStack.undo();
            app.grid.restoreFromUndo(snapshot);
            app.simulations.markDirty(app.circuits.current);
            app.haveChanges = true;
        }
        app.refreshUndoButtons();
    }

    // Performs redo on the current circuit's undo stack.
    static redo(app) {
        assert.class(Application, app);
        const perStack = app.circuits.current?.undoStack;
        if (perStack?.canRedo) {
            const { snapshot } = perStack.redo();
            app.grid.restoreFromUndo(snapshot);
            app.simulations.markDirty(app.circuits.current);
            app.haveChanges = true;
        }
        app.refreshUndoButtons();
    }

    // Edit or delete a break condition expression at index i via dialog. Returns true if the dialog was confirmed.
    static async editBreakCondition(app, i, expr) {
        assert.class(Application, app);
        assert.integer(i);
        assert.string(expr);
        const EXPRESSION_HELP = 'Probe labels are available as variables, e.g. <code>!pA &amp;&amp; (pB || pC)</code>. Undriven probes return <code>null</code>, conflicting probes <code>-1</code>.';
        const result = await dialog('Edit break condition', [
            { text: 'Edit the expression below. Clear expression and confirm to delete. ' + EXPRESSION_HELP },
            { label: 'Expression', name: 'expression', type: 'string' }
        ], { expression: expr });
        if (result) {
            if (result.expression.trim() === '') {
                app.config.breakConditions.splice(i, 1);
            } else {
                app.config.breakConditions[i] = result.expression.trim();
            }
            app.simulations.markDirty(null);
            return true;
        }
        return false;
    }
}
