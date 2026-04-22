"use strict";

// Main application class, handles UI interaction.
class Application {

    // Default toolbar pins pre-populated on a fresh start (Routing & labeling + Basic gates).
    static DEFAULT_TOOLBAR_PINS = [
        { descriptor: { '#c': 'Port' } },
        { descriptor: { '#c': 'Splitter' } },
        { descriptor: { '#c': 'Tunnel' } },
        { descriptor: { '#c': 'Probe' } },
        { descriptor: { '#c': 'TextLabel' } },
        { descriptor: { '#c': 'Gate', '#t': 'buffer' } },
        { descriptor: { '#c': 'Gate', '#t': 'not' } },
        { descriptor: { '#c': 'Gate', '#t': 'and' } },
        { descriptor: { '#c': 'Gate', '#t': 'nand' } },
        { descriptor: { '#c': 'Gate', '#t': 'or' } },
        { descriptor: { '#c': 'Gate', '#t': 'nor' } },
        { descriptor: { '#c': 'Gate', '#t': 'xor' } },
        { descriptor: { '#c': 'Gate', '#t': 'xnor' } },
    ];

    static TOOLTIP_HINT_MENU = '<i>Drag</i> Move onto grid or toolbar.';
    static TOOLTIP_HINT_PIN = '<i>Drag</i> Move onto grid, <i>E</i> Configure defaults for this pin.';

    config = {
        targetTPS: 10000,
        autoCompile: true,
        singleStep: false,
        checkNetConflicts: false,
        breakOnConflict: false,
        breakOnCondition: false,
        breakConditions: [],
        lockSimulation: false,
        simulationBackend: 'js',
        debugCompileComments: false,
        debugShowGid: false,
        debugShowCoords: false,
        debugShowWireBox: false,
        debugSingleStep: false,
        debugSerializeSimulation: false,
        placementDefaults: {
            port: { rotation: 1, },
            tunnel: { rotation: 1, },
            splitter: { rotation: 0, numSplits: 8 },
            clock: { rotation: 0, },
            pull: { rotation: 1, },
            gate: { rotation: 0, numInputs: 2 },
            builtin: { rotation: 0, },
            textlabel: { rotation: 0, },
            constant: { rotation: 1, },
            switch: { rotation: 0, },
            probe: { rotation: 1, },
            rom: { rotation: 0, addressWidth: 4, dataWidth: 8 },
            ram: { rotation: 0, addressWidth: 4, dataWidth: 8, combinedPorts: true },
        },
    };

    grid;
    toolbar;
    circuits;
    simulations;
    history;
    haveChanges = false;
    #hotkeyDefs = [];
    #undoButton = null;
    #redoButton = null;
    #noticeTimer = null;

    #modifierKeys = {
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
    };

    #status = {
        element: null,
        message: null,
        timer: null,
        locked: false,
    }

    #renderLoop = {
        loadLimit: 0.95,
        refresh: null,
        nextTick: 0,
        ticksPerFrameComputed: 0,
        ticksFraction: 0,
        load: 0,
        countStart: null,
        ticksCounted: 0,
        framesCounted: 0,
        tps: 0,
        fps: 0,
    };

    constructor(gridParent, toolbarParent) {
        assert.class(Node, gridParent);
        assert.class(Node, toolbarParent);
        document.addEventListener('keydown', this.#handleHotkey.bind(this));
        document.addEventListener('keyup', this.#handleHotkey.bind(this));
        this.#initHotkeys(); // must happen before grid creation or global hotkeys may be overriden by per-component hotkeys
        this.grid = new Grid(this, gridParent);
        this.toolbar = new ComponentToolbar(this, toolbarParent);
        this.circuits = new Circuits(this);
        this.simulations = new Simulations(this);
        this.#status.element = html(gridParent, 'div', 'app-status');
        this.#initToolbar();
        this.#initFocusMonitor();
        this.#initRenderLoop();
        this.circuits.reset();
        this.simulations.select(this.circuits.current, this.config.autoCompile);
        this.history = new NavigationHistory(this);
        this.history.init();
    }

    // Returns performance stats.
    get stats() {
        const rl = this.#renderLoop;
        return { load: rl.load, loadLimit: rl.loadLimit, tps: rl.tps, fps: rl.fps };
    }

    // Creates a new application and returns it.
    static create(gridParent, toolbarParent) {
        return new Application(gridParent, toolbarParent);
    }

    // Sets a status message. Pass null to unset and revert back to default status.
    setStatus(message, lock = false, item = null) {
        assert.bool(lock);
        assert.class(GridItem, item, true);
        if (this.#status.locked && !lock) {
            return;
        }
        this.#status.locked = lock ?? false;
        if (this.#status.timer) {
            clearTimeout(this.#status.timer);
        }
        this.#status.message = message;
        const messageText = String.isString(message) ? message : (Function.isFunction(message) ? message() : null);
        this.#status.element.innerHTML = messageText !== null ? (this.config.debugShowGid && item ? item.gid + ': ' : '') + messageText : '';
        if (messageText) {
            this.#status.element.classList.remove('app-status-faded');
        } else if (!messageText) {
            // set default help text when no status message has been set for a while
            this.#status.timer = setTimeout(() => {
                if (!messageText) {
                    this.#status.element.classList.remove('app-status-faded');
                    this.#status.element.innerHTML = this.grid.defaultStatusMessage();
                }
            }, 500);
        }
    }

    // Immediately update status with previously set message(-function).
    updateStatus() {
        if (this.#status.timer) {
            clearTimeout(this.#status.timer);
        }
        const message = this.#status.message;
        const messageText = String.isString(message) ? message : (Function.isFunction(message) ? message() : null);
        this.#status.element.classList.remove('app-status-faded');
        this.#status.element.innerHTML = messageText ?? this.grid.defaultStatusMessage();
    }

    // Clears the current status message.
    clearStatus(unlock) {
        if (this.#status.locked && !unlock) {
            return;
        }
        this.#status.locked = false;
        if (this.#status.timer) {
            clearTimeout(this.#status.timer);
        }
        this.#status.element.classList.add('app-status-faded');
        this.#status.timer = setTimeout(() => this.setStatus(), Grid.STATUS_DELAY);
    }

    // Registers a hotkey (e.g. 'ctrl+v', 'ctrl+alt+x', ...) with an optional condition check to trigger the given handler.
    // If hotkey is null the handler will be called whenever the condition is met.
    registerHotkey(hotkey, mode, condition, handler) {
        assert.string(hotkey, true);
        assert.function(condition, true);
        assert.enum([ 'up', 'down', 'press' ], mode);
        assert.function(handler);
        // parse hotkey string into key definition
        let keyDef = { catchAll: hotkey === null, ctrlKey: false, altKey: false, shiftKey: false, key: null, condition: condition ?? (() => true), handler, mode };
        if (hotkey !== null) {
            for (let part of hotkey.split('+')) {
                if (part === 'ctrl') {
                    keyDef.ctrlKey = true;
                } else if (part === 'alt') {
                    keyDef.altKey = true;
                } else if (part === 'shift') {
                    keyDef.shiftKey = true;
                } else {
                    keyDef.key = part;
                }
            }
        }
        this.#hotkeyDefs.push(keyDef);
    }

    // Returns status of modifier-keys.
    get modifierKeys() {
        return this.#modifierKeys;
    }

    // Called when a key is pressed and then repeatedly while being held.
    async #handleHotkey(e) {
        this.#modifierKeys.ctrlKey = e.ctrlKey;
        this.#modifierKeys.altKey = e.altKey;
        this.#modifierKeys.shiftKey = e.shiftKey;
        for (let keyDef of this.#hotkeyDefs) {
            if ((keyDef.catchAll || (e.key === keyDef.key && e.ctrlKey === keyDef.ctrlKey && e.altKey === keyDef.altKey && e.shiftKey === keyDef.shiftKey)) && keyDef.condition(e)) {
                e.preventDefault();
                if ((e.type === 'keydown' && keyDef.mode !== 'up') || (e.type === 'keyup' && keyDef.mode !== 'down')) {
                    await keyDef.handler(e);
                }
                break;
            }
        }
    }

    // Called each animation-frame to render elements.
    #render() {
        const renderStart = performance.now();
        const rl = this.#renderLoop;
        this.grid.render();
        rl.framesCounted += 1;
        // handle both TPS smaller or larger than FPS
        rl.ticksPerFrameComputed = this.config.targetTPS / (1000 / rl.refresh.med);
        rl.nextTick += rl.ticksPerFrameComputed;
        if (rl.nextTick >= 1) {
            rl.nextTick -= Math.floor(rl.nextTick);
            if (!this.config.singleStep) {
                const ticks = Math.max(1, rl.ticksPerFrameComputed);
                rl.ticksFraction += Math.fract(ticks);                                // accumulate fractional ticks
                const ticksTotal = Math.trunc(ticks) + Math.trunc(rl.ticksFraction);  //   and apply once at least one full tick has accumulated
                const ticksActual = this.#tickSimulation(ticksTotal);
                rl.ticksCounted += ticksActual;
                rl.ticksFraction -= Math.trunc(rl.ticksFraction);       // subtract applied number of fractional ticks from remaining fractional ticks
            }
        }
        // compute load (time spent computing/time available)
        const elapsedTime = performance.now() - renderStart;
        rl.load = elapsedTime / rl.refresh.med;
        // handle counted ticks/frames
        if (renderStart - rl.countStart >= 1000) {
            rl.countStart = renderStart;
            rl.tps = rl.ticksCounted;
            rl.fps = rl.framesCounted;
            rl.ticksCounted = 0;
            rl.framesCounted = 0;
        }
        requestAnimationFrame(() => this.#render());
    }

    // Ticks the simulation up to 'ticks' times but tries to stay within the amount of time available per frame.
    #tickSimulation(ticks) {
        const maxTiming = this.#renderLoop.refresh.med / 15;
        let tickLimit = 10;
        let ticksDone = 0;
        const sim = this.simulations.current;
        if (!sim || ticks <= 0) {
            return 0;
        }
        // run limited number of ticks to measure time it takes to run them, repeat until we have enough time for extrapolation
        // this is looping until elapsed is large enough for a reliable computation (because elapsed can be 0 on low tick counts).
        const start = performance.now();
        let elapsed;
        do  {
            let ticksNow = Math.min(tickLimit, ticks - ticksDone);
            const broke = sim.tick(ticksNow);
            ticksDone += ticksNow;
            elapsed = performance.now() - start;
            if (broke) { // 1 = conflict break, 2 = condition break
                this.#singleStep(0, broke);
                return ticksDone;
            }
        } while (ticksDone < ticks && elapsed < maxTiming && (tickLimit *= 10));
        // based on elapsed time and number of performed ticks we compute how many ticks we should be able to do in the timelimit.
        if (ticks > ticksDone) {
            const maxTicks = ticksDone * ((this.#renderLoop.refresh.med - elapsed) / elapsed) * this.#renderLoop.loadLimit;
            const stillDoable = 0 | Math.min(ticks - ticksDone, maxTicks);
            const broke = sim.tick(stillDoable);
            if (broke) { // 1 = conflict break, 2 = condition break
                this.#singleStep(0, broke);
            }
            return stillDoable + ticksDone;
        } else {
            return ticksDone;
        }
    }

    // Create main menu entries and toolbar.
    #initToolbar() {

        // Add file operations to toolbar
        this.toolbar.createMenuButton('File', 'File operations menu.', (fileMenu) => {
            fileMenu.clear();
            // Open circuit file.
            fileMenu.createActionButton('Open...', 'Close all circuits and load new circuits from a file.', async () => {
                fileMenu.state(false);
                if (!this.haveChanges || await unsavedDialog('Click Ok to discard and open another project anyway or Cancel to abort.')) {
                    await this.circuits.loadFile(true);
                    this.simulations.clear();
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                    this.history.init();
                    document.title = this.circuits.fileName + ' - Silicon Tracer';
                    this.haveChanges = false;
                }
            });
            // Open and merge circuits from file to currently loaded circuits.
            const addButton = fileMenu.createActionButton('Merge...', 'Load additional circuits from a file, keeping open circuits.', async () => {
                fileMenu.state(false);
                await this.circuits.loadFile(false, false);
                this.haveChanges = true;
            });
            addButton.node.classList.toggle('toolbar-menu-button-disabled', this.circuits.allEmpty());
            fileMenu.createSeparator();
            // Open as library
            fileMenu.createActionButton('Include library...', 'Add circuits in file as library components. These are accessible via the <i>Component</i> menu and do not show in <i>Circuit</i>.', async () => {
                fileMenu.state(false);
                await this.circuits.loadFile(false, false, true);
                this.haveChanges = true;
            });
            // Create a new empty library.
            fileMenu.createActionButton('Create library...', 'Create a new empty library accessible via the <i>Component</i> menu.', async () => {
                fileMenu.state(false);
                const result = await dialog('Create library', [
                    { name: 'label', label: 'Library name', type: 'string', postCheck: (v) => v.length > 0 },
                ], { label: '' });
                if (result) {
                    this.circuits.addLibrary(result.label, null, false);
                    this.showNotice(`Added empty library "${result.label}" to the Component menu.`);
                    this.haveChanges = true;
                }
            });
            // Extract a non-packaged library to a file.
            const hasCircuit = (lid) => Object.values(this.circuits.all).some((c) => c.lid === lid);
            const nonPackagedForExtract = [ ...this.circuits.libraries ].filter(([ lid ]) => !this.circuits.isPackaged(lid) && hasCircuit(lid));
            const extractButton = fileMenu.createActionButton('Extract library...', 'Save all circuits belonging to a library to a file.', async () => {
                fileMenu.state(false);
                const libs = [ ...this.circuits.libraries ].filter(([ lid ]) => !this.circuits.isPackaged(lid) && hasCircuit(lid));
                const options = Object.fromEntries(libs.map(([ lid, label ]) => [ lid, label ]));
                const result = await dialog('Extract library', [
                    { name: 'lib', label: 'Library', type: 'select', options },
                ], { lib: libs[0][0] });
                if (result) {
                    await this.circuits.extractLibrary(result.lib);
                }
            });
            extractButton.node.classList.toggle('toolbar-menu-button-disabled', nonPackagedForExtract.length === 0);
            // Remove a non-packaged library and its circuits from memory.
            const nonPackagedForRemove = [ ...this.circuits.libraries ].filter(([ lid ]) => !this.circuits.isPackaged(lid));
            const removeLibButton = fileMenu.createActionButton('Remove library...', 'Remove a library and its circuits from memory.', async () => {
                fileMenu.state(false);
                const libs = [ ...this.circuits.libraries ].filter(([ lid ]) => !this.circuits.isPackaged(lid));
                const removable = libs.filter(([ lid ]) => this.circuits.libraryDependents(lid).size === 0);
                const nonRemovable = libs.filter(([ lid ]) => this.circuits.libraryDependents(lid).size > 0);
                const fields = [];
                fields.push({ name: 'lib', label: 'Library', type: 'select', options: Object.fromEntries(removable.map(([ lid, label ]) => [ lid, label ])) });
                if (nonRemovable.length > 0) {
                    fields.push({ separator: 'before', text: `The following libraries cannot be removed because other circuits depend on them: ${nonRemovable.map(([ , label ]) => `<b>${label}</b>`).join(', ')}.` });
                }
                const result = await dialog('Remove library', fields, { lib: removable[0]?.[0] ?? '' });
                if (result) {
                    const libLabel = removable.find(([ lid ]) => lid === result.lib)[1];
                    this.circuits.removeLibrary(result.lib);
                    this.simulations.clear();
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                    this.showNotice(`Removed library "${libLabel}".`);
                    this.haveChanges = true;
                }
            });
            removeLibButton.node.classList.toggle('toolbar-menu-button-disabled', nonPackagedForRemove.length === 0);
            fileMenu.createSeparator();
            // Import circuits and add to currently loaded circuits.
            fileMenu.createActionButton('Import...', 'Import files produced by other applications.', async () => {
                fileMenu.state(false);
                await this.circuits.importFile();
                this.haveChanges = true;
            });
            fileMenu.createSeparator();
            // Save circuits to last opened file.
            const saveButton = fileMenu.createActionButton(this.circuits.fileName ? 'Save <i>' + this.circuits.fileName + '</i>' : 'Save', 'Save circuits to file. Hotkey: <i>CTRL+S</i>', async () => {
                fileMenu.state(false);
                await this.circuits.saveFile();
                this.haveChanges = false;
            });
            saveButton.node.classList.toggle('toolbar-menu-button-disabled', !this.circuits.fileName);
            // Save circuits as new file.
            fileMenu.createActionButton('Save as...', 'Save circuits to a new file.', async () => {
                fileMenu.state(false);
                await this.circuits.saveFileAs();
                this.haveChanges = false;
                document.title = this.circuits.fileName + ' - Silicon Tracer';
            });
            fileMenu.createSeparator();
            // Close circuits.
            fileMenu.createActionButton('Close', 'Close all open circuits. Hold <i>CTRL</i> to include packaged libraries.', async () => {
                fileMenu.state(false);
                if (!this.haveChanges || await unsavedDialog('Click Ok to close it anyway or Cancel to abort.')) {
                    this.circuits.closeFile(this.modifierKeys.ctrlKey);
                    this.simulations.clear();
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                    this.history.init();
                    this.haveChanges = false;
                    document.title = 'Silicon Tracer';
                }
            });
        });

        // Edit menu with undo/redo/cut/copy/paste
        this.toolbar.createMenuButton('Edit', 'Edit operations menu.', (editMenu) => {
            editMenu.clear();
            this.#undoButton = editMenu.createActionButton('Undo', 'Undo last change. Hotkey: <i>CTRL+Z</i>.', () => this.#undoAction());
            this.#redoButton = editMenu.createActionButton('Redo', 'Redo last undone change. Hotkey: <i>CTRL+Y</i>.', () => this.#redoAction());
            this.refreshUndoButtons();
            editMenu.createSeparator();
            const cutButton = editMenu.createActionButton('Cut', 'Cut selected items. Hotkey: <i>CTRL+X</i>.', () => this.grid.actionCutSelection());
            const copyButton = editMenu.createActionButton('Copy', 'Copy selected items to clipboard. Hotkey: <i>CTRL+C</i>.', () => this.grid.copySelection());
            const pasteButton = editMenu.createActionButton('Paste', 'Paste items from clipboard. Hotkey: <i>CTRL+V</i>.', () => this.grid.actionPasteSelection());
            cutButton.node.classList.toggle('toolbar-menu-button-disabled', this.grid.selection.items.length === 0 || this.grid.readonly);
            copyButton.node.classList.toggle('toolbar-menu-button-disabled', this.grid.selection.items.length === 0);
            //pasteButton.node.classList.toggle('toolbar-menu-button-disabled', await navigator.clipboard.readText().length === 0); // cannot currently do this without annoying confirmation popup
        });

        // Circuit selection menu
        this.toolbar.createMenuButton('Circuit', 'Circuit management menu.', (circuitMenu) => {
            const circuitList = this.circuits.list();
            circuitMenu.clear();
            // Create new circuit.
            circuitMenu.createActionButton('New...', 'Create a new circuit.', async () => {
                circuitMenu.state(false);
                if (await this.circuits.create()) {
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                    this.haveChanges = true;
                }
            });
            // Remove current circuit.
            const dependentUids = this.circuits.circuitDependents(this.circuits.current.uid);
            const dependentLabels = [ ...dependentUids ].map((uid) => this.circuits.byUID(uid)?.label).filter(Boolean);
            const dependentsStr = dependentLabels.join(', ');
            const truncatedDependents = dependentsStr.length > 50 ? dependentsStr.slice(0, 50) + '...' : dependentsStr;
            const removeDisabled = circuitList.length <= 1 || dependentUids.size > 0;
            const removeHoverMessage = circuitList.length <= 1
                ? 'Cannot remove last remaining circuit.'
                : dependentUids.size > 0
                    ? `Cannot remove, still used by: ${truncatedDependents}`
                    : 'Remove current circuit.';
            const button = circuitMenu.createActionButton(`Remove "${this.circuits.current.label}"`, removeHoverMessage, async () => {
                circuitMenu.state(false);
                if (await confirmDialog('Confirm deletion',`Delete "${this.circuits.current.label}" from project?`)) {
                    const deletedCircuit = this.circuits.current;
                    this.circuits.globalUndoStack.push(`Delete "${deletedCircuit.label}"`, deletedCircuit.serialize(), null, false);
                    this.simulations.delete(deletedCircuit);
                    this.circuits.delete(deletedCircuit.uid);
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                    this.history.record();
                    this.haveChanges = true;
                    this.refreshUndoButtons();
                }
            });
            button.node.classList.toggle('toolbar-menu-button-disabled', removeDisabled);
            // Move current circuit to/from a library.
            const currentLid = this.circuits.current.lid;
            const nonPackagedLibs = [ ...this.circuits.libraries ].filter(([ lid ]) => !this.circuits.isPackaged(lid));
            if (currentLid === null) {
                const moveToLibButton = circuitMenu.createActionButton('Move to library...', nonPackagedLibs.length > 0 ? 'Move this circuit into a library.' : 'No non-packaged libraries loaded.', async () => {
                    circuitMenu.state(false);
                    const options = Object.fromEntries(nonPackagedLibs.map(([ lid, label ]) => [ lid, label ]));
                    const result = await dialog('Move to library', [
                        { name: 'lib', label: 'Library', type: 'select', options },
                    ], { lib: nonPackagedLibs[0][0] });
                    if (result) {
                        const circuit = this.circuits.current;
                        const libLabel = nonPackagedLibs.find(([ lid ]) => lid === result.lib)[1];
                        circuit.lid = result.lib;
                        this.showNotice(`Circuit "${circuit.label}" was moved to "${libLabel}".`);
                        this.haveChanges = true;
                    }
                });
                moveToLibButton.node.classList.toggle('toolbar-menu-button-disabled', nonPackagedLibs.length === 0);
            } else if (!this.circuits.isPackaged(currentLid)) {
                circuitMenu.createActionButton('Move to circuits', 'Move this library circuit into regular circuits.', () => {
                    circuitMenu.state(false);
                    const circuit = this.circuits.current;
                    circuit.lid = null;
                    this.showNotice(`Circuit "${circuit.label}" was moved to circuits.`);
                    this.haveChanges = true;
                });
            }
            circuitMenu.createSeparator();
            // Switch circuit. Generate menu items for each circuit.
            for (const [ uid, label, description ] of circuitList) {
                const isCurrentGrid = uid === this.grid.circuit.uid; // grid circuit may be different from current circuit when navigating through simulation subcomponents
                const text = label + (description ? ' (' + description + ').' : '.');
                // place circuit as component
                if (uid !== this.grid.circuit.uid && !this.circuits.subcircuitUIDs(uid).has(this.grid.circuit.uid)) {
                    const componentButton = circuitMenu.createPinnableComponentButton('&#9094;', text,
                        (grid, x, y) => grid.addItem(new CustomComponent(this, x, y, 0, uid), false), { '#c': 'CustomComponent', '#u': uid }, label);
                    componentButton.node.classList.add('toolbar-circuit-place');
                }
                // circuit select
                const switchButton = circuitMenu.createActionButton(label, text + (isCurrentGrid ? 'Currently on the grid.' : '<i>Click</i> Edit on the grid.'), () => {
                    circuitMenu.state(false);
                    this.circuits.select(uid);
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                    this.history.record();
                });
                switchButton.node.classList.add(!isCurrentGrid ? 'toolbar-circuit-select' : 'toolbar-circuit-select-fullrow');
                switchButton.node.classList.toggle('toolbar-menu-button-disabled', isCurrentGrid);
            }
        });

        // Component selection menu
        this.toolbar.createMenuButton('Component', 'Component palette.', (componentMenu) => {
            componentMenu.clear();
            const defaults = this.config.placementDefaults;

            // routing/utilities
            componentMenu.createMenuCategory('Routing &amp; labeling', 'Ports, tunnels, splitters, text.', (routingMenu) => {
                routingMenu.clear();
                routingMenu.createPinnableComponentButton('Port', `<b>Component IO pin</b>.`,
                    (grid, x, y) => grid.addItem(new Port(this, x, y, defaults.port.rotation), false), { '#c': 'Port' });
                routingMenu.createPinnableComponentButton('Splitter', `<b>Wire splitter/joiner</b>.`,
                    (grid, x, y) => grid.addItem(new Splitter(this, x, y, defaults.splitter.rotation, defaults.splitter.numSplits), false), { '#c': 'Splitter' });
                routingMenu.createPinnableComponentButton('Tunnel', `<b>Network tunnel</b>.`,
                    (grid, x, y) => grid.addItem(new Tunnel(this, x, y, defaults.tunnel.rotation), false), { '#c': 'Tunnel' });
                routingMenu.createPinnableComponentButton('Probe', `<b>Net state probe</b>. Displays the state of attached net.`,
                    (grid, x, y) => grid.addItem(new Probe(this, x, y, defaults.probe.rotation), false), { '#c': 'Probe' });
                routingMenu.createPinnableComponentButton('Text', `<b>Userdefined text message</b>.`,
                    (grid, x, y) => grid.addItem(new TextLabel(this, x, y, defaults.textlabel.rotation), false), { '#c': 'TextLabel' });

            });

            // io/utilities
            componentMenu.createMenuCategory('IO/Control', 'Clocks, constants, ...', (ioMenu) => {
                ioMenu.clear();
                ioMenu.createPinnableComponentButton('Clock', `<b>Clock</b>.`,
                    (grid, x, y) => grid.addItem(new Clock(this, x, y, defaults.clock.rotation), false), { '#c': 'Clock' });
                ioMenu.createPinnableComponentButton('Constant', `<b>Constant value</b>.`,
                    (grid, x, y) => grid.addItem(new Constant(this, x, y, defaults.constant.rotation), false), { '#c': 'Constant' });
                ioMenu.createPinnableComponentButton('Pull resistor', `<b>Pull up/down resistor</b>.`,
                    (grid, x, y) => grid.addItem(new PullResistor(this, x, y, defaults.pull.rotation), false), { '#c': 'PullResistor' });
                ioMenu.createPinnableComponentButton('Toggle switch', `<b>Toggle switch</b> with permanently saved state.`,
                    (grid, x, y) => grid.addItem(new Switch(this, x, y, defaults.switch.rotation, 'toggle'), false), { '#c': 'Switch', '#t': 'toggle' });
                ioMenu.createPinnableComponentButton('Momentary switch', `<b>Momentary switch</b>.`,
                    (grid, x, y) => grid.addItem(new Switch(this, x, y, defaults.switch.rotation, 'momentary'), false), { '#c': 'Switch', '#t': 'momentary' });
                ioMenu.createPinnableComponentButton('ROM', `<b>Read-only memory</b>.`,
                    (grid, x, y) => grid.addItem(new Memory(this, x, y, defaults.rom.rotation, 'rom', defaults.rom.addressWidth, defaults.rom.dataWidth), false), { '#c': 'Memory', '#t': 'rom' });
                ioMenu.createPinnableComponentButton('RAM', `<b>Read/write memory</b>.`,
                    (grid, x, y) => grid.addItem(new Memory(this, x, y, defaults.ram.rotation, 'ram', defaults.ram.addressWidth, defaults.ram.dataWidth, null, defaults.ram.combinedPorts), false), { '#c': 'Memory', '#t': 'ram' });
            });

            // add gates
            componentMenu.createMenuCategory('Gates', 'Basic gates.', (gatesMenu) => {
                gatesMenu.clear();
                for (const [ gateType, { joinOp } ] of Object.entries(Simulation.GATE_MAP)) {
                    const gateLabel = gateType.toUpperFirst();
                    gatesMenu.createPinnableComponentButton(gateLabel, `<b>${gateLabel} gate</b>.`,
                        (grid, x, y) => {
                            const numInputs = defaults[gateType]?.numInputs ?? defaults.gate.numInputs;
                            return grid.addItem(new Gate(this, x, y, defaults[gateType]?.rotation ?? defaults.gate.rotation, gateType, joinOp !== null ? numInputs : 1), false);
                        }, { '#c': 'Gate', '#t': gateType });
                }
            });

            // add extra gate-like builtins
            componentMenu.createMenuCategory('Logic components', 'Latches, muxes, ...', (builtinMenu) => {
                builtinMenu.clear();
                const builtins = [];
                for (const [ builtinType, builtin ] of pairs(Builtin.META_INFO)) {
                    builtins.push([ builtinType, builtin.label ?? builtinType.toUpperFirst() ]);
                }
                builtins.sort((a, b) => a[1].localeCompare(b[1], 'en', { numeric: true }));
                for (const [ builtinType, builtinLabel ] of values(builtins)) {
                    builtinMenu.createPinnableComponentButton(builtinLabel, `<b>${builtinLabel}</b> builtin.`,
                        (grid, x, y) => grid.addItem(new Builtin(this, x, y, defaults[builtinType]?.rotation ?? defaults.builtin.rotation, builtinType), false),
                        { '#c': 'Builtin', '#t': builtinType });
                }
            });

            // add libraries
            if (first(this.circuits.libraries)) {
                componentMenu.createSeparator();
            }
            for (const [ lid, label ] of this.circuits.libraries) {
                componentMenu.createMenuCategory(label, label + ' components.', (libraryMenu) => {
                    libraryMenu.clear();
                    const componentList = this.circuits.list(lid);
                    // Switch component. Generate menu items for each component.
                    for (const [ uid, label, description ] of componentList) {
                        const isCurrentGrid = uid === this.grid.circuit.uid; // grid component may be different from current component when navigating through simulation subcomponents
                        const isCurrentCircuit = uid === this.circuits.current.uid;
                        const text = label + (description ? ' (' + description + ').' : '.');
                        // place component as component
                        if (!isCurrentGrid) {
                            const componentButton = libraryMenu.createPinnableComponentButton('&#9094;', text,
                                (grid, x, y) => grid.addItem(new CustomComponent(this, x, y, 0, uid), false), { '#c': 'CustomComponent', '#u': uid }, label);
                            componentButton.node.classList.add('toolbar-circuit-place');
                        }
                        // component select
                        const switchButton = libraryMenu.createActionButton(label, text + (isCurrentGrid ? 'Currently on the grid.' : '<i>Click</i> Edit on the grid.'), () => {
                            componentMenu.state(false);
                            this.circuits.select(uid);
                            this.simulations.select(this.circuits.current, this.config.autoCompile);
                            this.history.record();
                        });
                        switchButton.node.classList.add(!isCurrentGrid ? 'toolbar-circuit-select' : 'toolbar-circuit-select-fullrow');
                        switchButton.node.classList.toggle('toolbar-menu-button-disabled', isCurrentCircuit);
                    }
                });
            }
        });

        // Simulation menu
        this.toolbar.createMenuButton('Simulation', 'Simulation management menu.', (simulationMenu) => {
            simulationMenu.clear();
            const toggleAction = () => {
                const sim = this.simulations.current;
                const isCurrent = this.circuits.current.uid === sim?.uid;
                return isCurrent && sim ? 'stop' : 'start';
            };
            const toggleButtonText = (action) => {
                if (action === 'start') {
                    return `Start at "${this.circuits.current.label}"`;
                } else if (action === 'stop') {
                    return `Stop "${this.simulations.current.label}"`;
                }
            };
            // Continuous simulation toggle.
            simulationMenu.createToggleButton('Autostart', 'Automatically starts a new simulation when switching circuits.', this.config.autoCompile, (enabled) => {
                this.config.autoCompile = enabled;
                if (enabled) {
                    this.config.singleStep = false;
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                }
                simulationMenu.open(); // update menu
            });
            // Lock simulation.
            simulationMenu.createToggleButton('Lock simulation', 'Prevents accidental changes from resetting the simulation. Does not prevent the changes but they won\'t be included in the simulation.', this.config.lockSimulation, (enabled) => {
                this.config.lockSimulation = enabled;
                simulationMenu.open();
            });
            // Simulate current grid
            simulationMenu.createActionButton(toggleButtonText(toggleAction()), 'Toggle simulation on/off.', () => {
                simulationMenu.state(false);
                const action = toggleAction();
                if (action === 'stop') {
                    this.config.autoCompile = false;
                    if (this.simulations.current) {
                        const circuit = this.circuits.byUID(this.simulations.current.uid);
                        if (circuit) {
                            this.simulations.delete(circuit);
                        }
                    }
                    this.simulations.select(null);
                    // switch to whatever circuit was being viewed when the simulation ended
                    this.circuits.select(this.grid.circuit.uid);
                } else if (action === 'resume' || action === 'start') {
                    // start will just resume if the simulation already exists
                    this.config.singleStep = false;
                    this.simulations.select(this.circuits.current, true);
                }
            });
            // Configure simulation speed.
            simulationMenu.createActionButton(`Set ticks/s limit (${Number.formatSI(this.config.targetTPS)})...`, 'Configure simulation speed.', async () => {
                simulationMenu.state(false);
                const result = await dialog('Simulation speed', [ { label: "Ticks per second", name: "targetTPS", type: "int", postCheck: (v, f) => v >= 1 } ], { targetTPS: this.config.targetTPS });
                if (result) {
                    this.config.targetTPS = result.targetTPS;
                    this.simulations.updateClocks(this.config.targetTPS);
                }
            });
            // Switch simulation. Generate menu items for each running simulation.
            if (this.simulations.list().length > 0) {
                simulationMenu.createSeparator();
            }
            for (const [ uid, label ] of this.simulations.list()) {
                const isCurrent = uid === this.simulations.current?.uid;
                const button = simulationMenu.createActionButton(label, isCurrent ? 'This is the current simulation' : 'Switch to/resume simulation "' + label + '".', () => {
                    simulationMenu.state(false);
                    this.circuits.select(uid);
                    this.config.singleStep = false;
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                    this.history.record();
                });
                button.node.classList.toggle('toolbar-menu-button-disabled', isCurrent);
            }
        });

        // Debugger menu
        this.toolbar.createMenuButton('Debugger', 'Debugging tools.', (debuggerMenu) => {
            debuggerMenu.clear();
            // Recompile simulation to flag conflicting networks (and show them in UI).
            debuggerMenu.createToggleButton('Show net conflicts', 'Networks with conflicting gate outputs will be highlighted. Increases simulation complexity.', this.config.checkNetConflicts, (enabled) => {
                this.config.checkNetConflicts = enabled;
                if (!enabled) this.config.breakOnConflict = false;
                this.simulations.markDirty(null);
                if (enabled) {
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                }
                debuggerMenu.open();
            });
            // Pause simulation when a net conflict is detected.
            debuggerMenu.createToggleButton('Break on conflict', 'Pause simulation when a net conflict is detected. Enables "Show net conflicts".', this.config.breakOnConflict, (enabled) => {
                this.config.breakOnConflict = enabled;
                if (enabled) this.config.checkNetConflicts = true;
                this.simulations.markDirty(null);
                this.simulations.select(this.circuits.current, this.config.autoCompile);
                debuggerMenu.open();
            });
            // Pause simulation when any break condition is met.
            debuggerMenu.createToggleButton('Break on condition', 'Pause simulation when a user-defined probe expression becomes true.', this.config.breakOnCondition, (enabled) => {
                this.config.breakOnCondition = enabled;
                this.simulations.markDirty(null);
                debuggerMenu.open();
            });
            debuggerMenu.createSeparator();
            // Toggle single-step mode. When enabled, T advances by one tick.
            const stepToggle = debuggerMenu.createToggleButton('Single step', 'Pause simulation and step one tick at a time using hotkey <i>T</i>.', this.config.singleStep, (enabled) => {
                if (enabled) {
                    this.#singleStep(0);
                } else {
                    this.config.singleStep = false;
                }
                debuggerMenu.open();
            });
            stepToggle.node.classList.toggle('toolbar-menu-button-disabled', !this.simulations.current && !this.config.singleStep);
            // Advance by one tick. Only usable while single-step mode is active.
            const stepButton = debuggerMenu.createActionButton('Step once', 'Advance simulation by one tick. Hotkey: <i>T</i>.', () => {
                this.#singleStep();
            });
            stepButton.node.classList.toggle('toolbar-menu-button-disabled', !this.config.singleStep);
            // Break-on-condition expressions.
            debuggerMenu.createSeparator();
            const EXPRESSION_HELP = 'Probe labels are available as variables, e.g. <code>!pA &amp;&amp; (pB || pC)</code>. Undriven probes return <code>null</code>, conflicting probes <code>-1</code>.';
            debuggerMenu.createActionButton('Add condition...', 'Break simulation on a custom probe expression.', async () => {
                debuggerMenu.state(false);
                const result = await dialog('Add break condition', [
                    { text: 'Enter an expression.' + EXPRESSION_HELP },
                    { label: 'Expression', name: 'expression', type: 'string', check: (v) => v.trim() !== '' }
                ], { expression: '' });
                if (result) {
                    this.config.breakConditions.push(result.expression.trim());
                    this.simulations.markDirty(null);
                }
            });
            if (this.config.breakConditions.length > 0) {
                debuggerMenu.createSeparator();
            }
            for (let i = 0; i < this.config.breakConditions.length; i++) {
                const expr = this.config.breakConditions[i];
                debuggerMenu.createActionButton(expr, 'Click to edit. Clear expression to delete.', async () => {
                    debuggerMenu.state(false);
                    const result = await dialog('Edit break condition', [
                        { text: 'Edit the expression below. Clear expression and confirm to delete. ' + EXPRESSION_HELP },
                        { label: 'Expression', name: 'expression', type: 'string' }
                    ], { expression: expr });
                    if (result) {
                        if (result.expression.trim() === '') {
                            this.config.breakConditions.splice(i, 1);
                        } else {
                            this.config.breakConditions[i] = result.expression.trim();
                        }
                        this.simulations.markDirty(null);
                        debuggerMenu.open();
                    }
                });
            }
        });

        // Add dropzone for custom toolbar elements
        this.toolbar.createDropZone();
        this.toolbar.createTrashZone();
    }

    // Enables single-step mode (if not already) and advances the simulation by one tick.
    #singleStep(ticks = 1, reason = 0) {
        if (!this.simulations.current) {
            this.simulations.select(this.circuits.current, true);
        }
        const sim = this.simulations.current;
        if (!sim) return;
        const alreadySingleStep = this.config.singleStep;
        this.config.singleStep = true;
        sim.tick(ticks);
        if (!alreadySingleStep) {
            this.showNotice(reason === 1 ? 'Breaking on conflict' : (reason === 2 ? 'Breaking on condition' : 'Simulation single-step enabled' ));
        }
    }

    // Updates the undo/redo button labels and enabled state.
    refreshUndoButtons() {
        if (!this.#undoButton || !this.#redoButton) return;
        const perStack = this.circuits.current?.undoStack;
        const globalStack = this.circuits.globalUndoStack;
        const useGlobal = globalStack.undoTimestamp > (perStack?.undoTimestamp ?? -Infinity) && globalStack.canUndo;
        const undoLabel = useGlobal ? globalStack.undoLabel : (perStack?.undoLabel ?? null);
        const redoLabel = perStack?.redoLabel ?? null;
        this.#undoButton.node.textContent = undoLabel ? `Undo: ${undoLabel}` : 'Undo';
        this.#redoButton.node.textContent = redoLabel ? `Redo: ${redoLabel}` : 'Redo';
        this.#undoButton.node.classList.toggle('toolbar-menu-button-disabled', !undoLabel);
        this.#redoButton.node.classList.toggle('toolbar-menu-button-disabled', !redoLabel);
    }

    // Performs undo on the most recently changed stack (per-circuit or global, whichever is newer).
    #undoAction() {
        const perStack = this.circuits.current?.undoStack;
        const globalStack = this.circuits.globalUndoStack;
        if (globalStack.undoTimestamp > (perStack?.undoTimestamp ?? -Infinity) && globalStack.canUndo) {
            const { snapshot } = globalStack.undo();
            this.circuits.restoreDeletedCircuit(snapshot);
        } else if (perStack?.canUndo) {
            const { snapshot } = perStack.undo();
            this.circuits.current.restoreFromUndo(snapshot);
            this.simulations.markDirty(this.circuits.current);
            this.haveChanges = true;
        }
        this.refreshUndoButtons();
    }

    // Performs redo on the current circuit's undo stack.
    #redoAction() {
        const perStack = this.circuits.current?.undoStack;
        if (perStack?.canRedo) {
            const { snapshot } = perStack.redo();
            this.circuits.current.restoreFromUndo(snapshot);
            this.simulations.markDirty(this.circuits.current);
            this.haveChanges = true;
        }
        this.refreshUndoButtons();
    }

    // Define hotkey actions.
    #initHotkeys() {
        this.registerHotkey('e', 'down', () => this.toolbar.hoveredPin !== null, async () => {
            await this.toolbar.editPin(this.toolbar.hoveredPin, this.toolbar.hoveredPinButton);
        });
        this.registerHotkey('ctrl+s', 'down', null, async (e) => {
            await this.circuits.saveFile();
            this.haveChanges = false;
        });
        this.registerHotkey('t', 'down', null, () => {
            this.#singleStep();
        });
        this.registerHotkey('ctrl+z', 'down', null, () => {
            this.#undoAction();
        });
        this.registerHotkey('ctrl+y', 'down', null, () => {
            this.#redoAction();
        });
    }

    // Initialize render loop and other periodic events.
    async #initRenderLoop() {
        // start simulation/render loop
        this.#renderLoop.refresh = await measureRefreshRate();
        requestAnimationFrame(() => this.#render());
    }

    // Display a brief overlay notice message.
    showNotice(message, duration = 2) {
        assert.string(message);
        assert.number(duration, false, 0);
        const el = document.getElementById('notice');
        el.textContent = message;
        el.classList.remove('hiding');
        el.classList.add('visible');
        clearTimeout(this.#noticeTimer);
        this.#noticeTimer = setTimeout(() => {
            el.classList.remove('visible');
            el.classList.add('hiding');
            // wait for fade-out transition before hiding
            setTimeout(() => { el.classList.remove('hiding'); el.style.display = ''; }, 550);
        }, duration * 1000);
    }

    // Show warning when not focussed to avoid confusion. In this state mouse wheel events still register but hotkeys don't.
    #initFocusMonitor() {
        let hadFocus = null;
        let focusTimer = null;
        setInterval(() => {
            let hasFocus = document.hasFocus();
            if (hasFocus !== hadFocus) {
                // remove display: none first
                document.body.classList.add('focus-changing');
                // then change focus class
                setTimeout(hasFocus ? () => document.body.classList.remove('no-focus') : () => document.body.classList.add('no-focus'), 1);
                hadFocus = hasFocus;
                // later add general display none again, but overriden by focus state
                clearTimeout(focusTimer);
                focusTimer = setTimeout(() => document.body.classList.remove('focus-changing'), 750);
            }
        }, 100);
    }
}