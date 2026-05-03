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
            const circuit = app.grid.circuit;
            const libLabel = nonPackagedLibs.find(([ lid ]) => lid === result.lib)[1];
            circuit.lid = result.lib;
            app.showNotice(`Circuit "${circuit.label}" was moved to "${libLabel}".`);
            app.haveChanges = true;
        }
    }

    // Move current grid circuit from a library to the the main circuits list.
    static moveCircuitToCircuits(app) {
        assert.class(Application, app);
        const circuit = app.grid.circuit;
        circuit.lid = null;
        app.showNotice(`Circuit "${circuit.label}" was moved to circuits.`);
        app.haveChanges = true;
    }

    // Delete current circuit from the project after user confirmation.
    static async deleteCircuit(app) {
        assert.class(Application, app);
        const circuit = app.grid.circuit;
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
        if (await app.circuits.loadFile(false, false)) {
            app.haveChanges = true;
        }
    }

    // Load a file as a library into the Component menu.
    static async includeLibrary(app) {
        assert.class(Application, app);
        if (await app.circuits.loadFile(false, false, true)) {
            app.haveChanges = true;
        }
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

    // Prune unused circuits via a two-step dialog.
    static async pruneUnused(app) {
        assert.class(Application, app);
        const nonPackagedLibs = [ ...app.circuits.libraries ].filter(([ lid ]) => !app.circuits.isPackaged(lid));
        const groupOptions = { '__main__': 'Main circuits' };
        for (const [ lid, label ] of nonPackagedLibs) {
            groupOptions[lid] = label;
        }
        const step1Result = await dialog('Prune unused circuits', [
            { text: 'Select which groups of circuits to check for unused circuits. Circuits without dependents will be listed for deletion.', separator: 'after' },
            { name: 'groups', label: 'Check groups', type: 'checklist', options: groupOptions },
        ], { groups: [ '__main__' ] });
        if (!step1Result) {
            return;
        }
        const selectedGroups = step1Result.groups;
        if (selectedGroups.length === 0) {
            return;
        }
        // Find circuits with no dependents in selected groups.
        const allCircuits = Object.values(app.circuits.all);
        const unusedByGroup = {};
        for (const group of selectedGroups) {
            const lid = group === '__main__' ? null : group;
            const groupCircuits = allCircuits.filter((c) => c.lid === lid);
            const unused = groupCircuits.filter((c) => app.circuits.circuitDependents(c.uid).size === 0);
            if (unused.length > 0) {
                unusedByGroup[group] = unused;
            }
        }
        if (Object.keys(unusedByGroup).length === 0) {
            await infoDialog('Prune unused circuits', 'No unused circuits found in the selected groups.');
            return;
        }
        // Build step 2 dialog fields.
        const step2Fields = [
            { text: 'The following circuits have no reachable dependents. Select which ones are to be deleted. Circuits that are solely depended on by these will also be deleted.', separator: 'after' },
            { text: 'Be sure to exclude any root circuits you want to keep.', separator: 'after' },
        ];
        const step2Defaults = {};
        for (const group of selectedGroups) {
            if (!unusedByGroup[group]) continue;
            const label = groupOptions[group];
            const options = Object.fromEntries(unusedByGroup[group].map((c) => [ c.uid, c.label ]));
            step2Fields.push({ name: group, label, type: 'checklist', options });
            step2Defaults[group] = unusedByGroup[group].map((c) => c.uid);
        }
        const step2Result = await dialog('Prune unused circuits', step2Fields, step2Defaults);
        if (!step2Result) {
            return;
        }
        // Collect UIDs to delete: selected circuits plus anything that becomes solely dependent on them.
        const toDelete = new Set();
        for (const group of selectedGroups) {
            if (!step2Result[group]) continue;
            for (const uid of step2Result[group]) {
                toDelete.add(uid);
            }
        }
        if (toDelete.size === 0) {
            app.showNotice('No circuits found eligible for pruning.');
            return;
        }
        // Iteratively find circuits whose only dependents are already in toDelete.
        let changed = true;
        while (changed) {
            changed = false;
            for (const circuit of Object.values(app.circuits.all)) {
                if (toDelete.has(circuit.uid)) continue;
                if (circuit.lid && app.circuits.isPackaged(circuit.lid)) continue;
                const dependents = app.circuits.circuitDependents(circuit.uid);
                if (dependents.size > 0 && [ ...dependents ].every((uid) => toDelete.has(uid))) {
                    toDelete.add(circuit.uid);
                    changed = true;
                }
            }
        }
        const libLabels = Object.fromEntries([ ...app.circuits.libraries ]);
        const deletedItems = [ ...toDelete ].map((uid) => {
            const circuit = app.circuits.byUID(uid);
            const libLabel = circuit.lid ? libLabels[circuit.lid] : null;
            return { uid, label: circuit.label, libLabel };
        });
        for (const { uid } of deletedItems) {
            app.simulations.delete(app.circuits.byUID(uid));
            app.circuits.delete(uid);
        }
        app.simulations.select(app.circuits.current, app.config.autoCompile);
        app.haveChanges = true;
        const listItems = deletedItems.map(({ label, libLabel }) =>
            `<li>${label}${libLabel ? ` (${libLabel})` : ''}</li>`
        ).join('');
        await infoDialog('Pruned unused circuits', `The following circuits were deleted:<ul>${listItems}</ul>`);
    }

    // Import circuits from a foreign file format.
    static async importFile(app) {
        assert.class(Application, app);
        if (await app.circuits.importFile()) {
            app.haveChanges = true;
        }
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

    // Stop the current simulation.
    static stopSimulation(app) {
        assert.class(Application, app);
        const sim = app.simulations.current;
        app.config.autoCompile = false;
        const circuit = app.circuits.byUID(sim.uid);
        if (circuit) {
            app.simulations.delete(circuit);
        }
        app.simulations.select(null);
        app.circuits.select(app.grid.circuit.uid);
    }

    // Start a simulation rooted at the current grid circuit.
    static startSimulation(app) {
        assert.class(Application, app);
        app.config.singleStep = false;
        app.simulations.select(app.grid.circuit, true);
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
        app.grid.markTopologyChanged();
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
        const perStack = app.grid.circuit?.undoStack;
        const globalStack = app.circuits.globalUndoStack;
        if (globalStack.undoTimestamp > (perStack?.undoTimestamp ?? -Infinity) && globalStack.canUndo) {
            const { snapshot } = globalStack.undo();
            app.circuits.restoreDeletedCircuit(snapshot);
        } else if (perStack?.canUndo) {
            const { snapshot } = perStack.undo();
            app.grid.restoreFromUndo(snapshot);
            app.simulations.markDirty(app.grid.circuit);
            app.haveChanges = true;
        }
        app.refreshUndoButtons();
    }

    // Performs redo on the current circuit's undo stack.
    static redo(app) {
        assert.class(Application, app);
        const perStack = app.grid.circuit?.undoStack;
        if (perStack?.canRedo) {
            const { snapshot } = perStack.redo();
            app.grid.restoreFromUndo(snapshot);
            app.simulations.markDirty(app.grid.circuit);
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
