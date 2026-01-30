"use strict";

// Main application class, handles UI interaction.
class Application {

    config = {
        targetTPS: 10000,
        autoCompile: true,
        singleStep: false,
        checkNetConflicts: true,
        lockSimulation: false,
        debugCompileComments: false,
        debugShowGid: false,
        debugShowCoords: false,
        debugShowWireBox: false,
        rotationDefaults: {
            port: 1,
            tunnel: 1,
            splitter: 0,
            clock: 0,
            pull: 1,
            gate: 0,
            builtin: 0,
            text: 0,
            constant: 1,
        },
    };

    grid;
    toolbar;
    circuits;
    simulations;

    #status = {
        element: null,
        message: null,
        timer: null,
        locked: false,
    }

    #renderLoop = {
        renderLast: 0,
        nextTick: 0,
        intervalComputed: 0.016,
        ticksPerFrameComputed: 0,
        ticksFraction: 0,
        load: 0,
        ticksCounted: 0,
        framesCounted: 0,
    };

    constructor(gridParent, toolbarParent) {
        assert.class(Node, gridParent);
        assert.class(Node, toolbarParent);
        this.grid = new Grid(this, gridParent);
        this.toolbar = new Toolbar(this, toolbarParent);
        this.circuits = new Circuits(this);
        this.simulations = new Simulations(this);
        this.#status.element = element(gridParent, 'div', 'app-status');
        this.#initMenu();
        this.#initToolbar();
        this.#initFocusMonitor();
        this.#initRenderLoop();
        this.circuits.clear();
        this.simulations.select(this.circuits.current, this.config.autoCompile);
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
        this.#status.element.innerHTML = messageText !== null ? (this.config.debugShowGid && item ? item.gid.slice(0, 6) + ': ' : '') + messageText : '';
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

    // Called periodically to update stats overlay.
    #renderStats() {
        const load = Math.round(this.#renderLoop.load);
        const loadClass = load >= 95 ? 'error' : (load >= 90 ? 'warning' : '');
        const ticks = this.simulations.current ? `${Number.formatSI(this.config.targetTPS)} ticks/s target<br>${Number.formatSI(Math.round(this.#renderLoop.ticksCounted))} ticks/s actual<br>` : '';
        this.grid.setSimulationDetails(`${ticks}<span class="${loadClass}">${load}%</span> core load<br>${this.#renderLoop.framesCounted} frames/s`);
        this.#renderLoop.ticksCounted = 0;
        this.#renderLoop.framesCounted = 0;
    }

    // Called each animation-frame to render elements.
    #render() {
        const lastFrame = this.#renderLoop.renderLast;
        this.#renderLoop.renderLast = performance.now();
        this.#renderLoop.intervalComputed = this.#renderLoop.renderLast - lastFrame;
        requestAnimationFrame(() => this.#render());
        const sim = this.simulations.current;
        // after each circuit modification the simulation will not have been ticked yet and net-state won't be known. this causes a brief flickering each time the circuit changes, so we skip that single frame
        if (!sim || !sim.checkDirty()) {
            this.grid.render();
        }
        if (sim) {
            this.grid.setCircuitDetails(`Gates: ${sim.stats.gates}<br>Max delay: ${sim.stats.maxDelay}<br>Nets: ${sim.stats.nets}`);
        }
        this.#renderLoop.framesCounted += 1;
        // handle both TPS smaller or larger than FPS
        this.#renderLoop.ticksPerFrameComputed = this.config.targetTPS / (1000 / this.#renderLoop.intervalComputed);
        this.#renderLoop.nextTick += this.#renderLoop.ticksPerFrameComputed;
        if (this.#renderLoop.nextTick >= 1) {
            this.#renderLoop.nextTick -= Math.floor(this.#renderLoop.nextTick);
            if (!this.config.singleStep) {
                const ticksCapped = this.config.targetTPS / (1000 / 60);                            // cap is used to work around large intervals when browser window is not focused
                const ticks = Math.max(1, Math.min(this.#renderLoop.ticksPerFrameComputed, ticksCapped));
                this.#renderLoop.ticksFraction += Math.fract(ticks);                                // accumulate fractional ticks
                const ticksTotal = Math.trunc(ticks) + Math.trunc(this.#renderLoop.ticksFraction);  //   and apply once at least one full tick has accumulated
                this.#renderLoop.ticksCounted += ticksTotal;
                sim?.tick(ticksTotal);
                this.#renderLoop.ticksFraction -= Math.trunc(this.#renderLoop.ticksFraction);       // subtract applied number of fractional ticks from remaining fractional ticks
            }
        }
        // compute load (time spent computing/time available)
        const elapsedTime = performance.now() - this.#renderLoop.renderLast;
        this.#renderLoop.load = elapsedTime / this.#renderLoop.intervalComputed * 100;
    }

    // Initialize main menu entries.
    #initMenu() {

        // Add file operations to toolbar
        const [ , fileMenuState, fileMenu ] = this.toolbar.createMenuButton('File', 'File operations menu. <i>LMB</i> Open menu.', () => {
            fileMenu.clear();
            // Open circuit file.
            fileMenu.createActionButton('Open...', 'Close all circuits and load new circuits from a file.', async () => {
                fileMenuState(false);
                await this.circuits.loadFile(true);
                this.simulations.clear();
                this.simulations.select(this.circuits.current, this.config.autoCompile);
                document.title = this.circuits.fileName + ' - Silicon Tracer';
            });
            // Open and merge circuits from file to currently loaded circuits.
            const [ addButton ] = fileMenu.createActionButton('Merge...', 'Load additional circuits from a file, keeping open circuits.', async () => {
                fileMenuState(false);
                await this.circuits.loadFile(false, false);
            });
            addButton.classList.toggle('toolbar-menu-button-disabled', this.circuits.allEmpty());
            // Import circuits and add to currently loaded circuits.
            fileMenu.createActionButton('Import...', 'Import .circ file.', async () => {
                fileMenuState(false);
                await this.circuits.importFile();
            });
            fileMenu.createSeparator();
            // Save circuits to last opened file.
            const [ saveButton ] = fileMenu.createActionButton(this.circuits.fileName ? 'Save <i>' + this.circuits.fileName + '</i>' : 'Save', 'Save circuits to file.', async () => {
                fileMenuState(false);
                await this.circuits.saveFile();
            });
            saveButton.classList.toggle('toolbar-menu-button-disabled', !this.circuits.fileName);
            // Save circuits as new file.
            fileMenu.createActionButton('Save as...', 'Save circuits to a new file.', async () => {
                fileMenuState(false);
                await this.circuits.saveFileAs();
                document.title = this.circuits.fileName + ' - Silicon Tracer';
            });
            fileMenu.createSeparator();
            // Close circuits.
            fileMenu.createActionButton('Close', 'Close all open circuits.', async () => {
                fileMenuState(false);
                this.circuits.closeFile();
                this.simulations.clear();
                this.simulations.select(this.circuits.current, this.config.autoCompile);
                document.title = 'Silicon Tracer';
            });
        });

        // Circuit selection menu
        const [ , circuitMenuState, circuitMenu ] = this.toolbar.createMenuButton('Circuit', 'Circuit management menu. <i>LMB</i> Open menu.', () => {
            const circuitList = this.circuits.list();
            circuitMenu.clear();
            // Create new circuit.
            circuitMenu.createActionButton('New...', 'Create a new circuit.', async () => {
                circuitMenuState(false);
                if (await this.circuits.create()) {
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                }
            });
            // Remove current circuit.
            const [ button ] = circuitMenu.createActionButton(`Remove "${this.circuits.current.label}"`, circuitList.length <= 1 ? 'Cannot remove last remaining circuit.' : 'Remove current circuit.', async () => {
                circuitMenuState(false);
                if (await confirmDialog('Confirm deletion',`Delete "${this.circuits.current.label}" from project?`)) {
                    this.simulations.delete(this.circuits.current);
                    this.circuits.delete(this.circuits.current.uid);
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                }
            });
            button.classList.toggle('toolbar-menu-button-disabled', circuitList.length <= 1);
            circuitMenu.createSeparator();
            // Switch circuit. Generate menu items for each circuit.
            for (const [ uid, label ] of circuitList) {
                const isCurrentGrid = uid === this.grid.circuit.uid; // grid circuit may be different from current circuit when navigating through simulation subcomponents
                // place circuit as component
                if (uid !== this.grid.circuit.uid && !this.circuits.subcircuitUIDs(uid).has(this.grid.circuit.uid)) {
                    const [ componentButton ] = circuitMenu.createComponentButton('&#9094;', label + '. <i>LMB</i> Drag to move onto grid.', (grid, x, y) => grid.addItem(new CustomComponent(this, x, y, 0, uid)));
                    componentButton.classList.add('toolbar-circuit-place');
                }
                // circuit select
                const [ switchButton ] = circuitMenu.createActionButton(label, isCurrentGrid ? 'This is the current circuit on the grid' : 'Switch grid to circuit "' + label + '".', () => {
                    circuitMenuState(false);
                    this.circuits.select(uid);
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                });
                switchButton.classList.add(!isCurrentGrid ? 'toolbar-circuit-select' : 'toolbar-circuit-select-fullrow');
                switchButton.classList.toggle('toolbar-menu-button-disabled', isCurrentGrid);
            }
        });

        // Component selection menu
        const [ , componentMenuState, componentMenu ] = this.toolbar.createMenuButton('Component', 'Component palette. <i>LMB</i> Open menu.', () => {
            componentMenu.clear();
            for (const [ lid, label ] of this.circuits.libraries) {

                const componentList = this.circuits.list(lid);
                // Switch component. Generate menu items for each component.
                for (const [ uid, label ] of componentList) {
                    const isCurrentGrid = uid === this.grid.circuit.uid; // grid component may be different from current component when navigating through simulation subcomponents
                    const isCurrentCircuit = uid === this.circuits.current.uid;
                    // place component as component
                    if (!isCurrentGrid) {
                        const [ componentButton ] = componentMenu.createComponentButton('&#9094;', label + '. <i>LMB</i> Drag to move onto grid.', (grid, x, y) => grid.addItem(new CustomComponent(this, x, y, 0, uid)));
                        componentButton.classList.add('toolbar-circuit-place');
                    }
                    // component select
                    const [ switchButton ] = componentMenu.createActionButton(label, isCurrentCircuit ? 'This is the current component' : 'Switch grid to component "' + label + '".', () => {
                        componentMenuState(false);
                        this.circuits.select(uid);
                        this.simulations.select(this.circuits.current, this.config.autoCompile);
                    });
                    switchButton.classList.add(!isCurrentGrid ? 'toolbar-circuit-select' : 'toolbar-circuit-select-fullrow');
                    switchButton.classList.toggle('toolbar-menu-button-disabled', isCurrentCircuit);
                }

            }
        });

        // Simulation menu
        let updateSimulationMenu;
        const [ , simulationMenuState, simulationMenu ] = this.toolbar.createMenuButton('Simulation', 'Simulation management menu. <i>LMB</i> Open menu.', () => updateSimulationMenu());

        updateSimulationMenu = () => {
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
                updateSimulationMenu();
            });
            // Recompile simulation to flag conflicting networks (and show them in UI).
            simulationMenu.createToggleButton('Show net conflicts', 'Networks with conflicting gate outputs will be highlighted. Increases simulation complexity.', this.config.checkNetConflicts, (enabled) => {
                this.config.checkNetConflicts = enabled;
                this.simulations.markDirty(null)
                if (enabled) {
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                }
                updateSimulationMenu();
            });
            // Lock simulation.
            simulationMenu.createToggleButton('Lock simulation', 'Prevents accidental changes from resetting the simulation. Does not prevent the changes but they won\'t be included in the simulation.', this.config.lockSimulation, (enabled) => {
                this.config.lockSimulation = enabled;
                updateSimulationMenu();
            });
            // Simulate current grid
            simulationMenu.createActionButton(toggleButtonText(toggleAction()), 'Toggle simulation on/off.', () => {
                simulationMenuState(false);
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
            simulationMenu.createActionButton(`Set ticks/s (${Number.formatSI(this.config.targetTPS)})...`, 'Configure simulation speed.', async () => {
                simulationMenuState(false);
                const result = await dialog('Simulation speed', [ { label: "Ticks per second", name: "targetTPS", type: "int", check: (v, f) => { const p = Number.parseSI(v); return Number.isInteger(p) && p >= 1; } } ], { targetTPS: Number.formatSI(this.config.targetTPS, true) });
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
                const [ button ] = simulationMenu.createActionButton(label, isCurrent ? 'This is the current simulation' : 'Switch to/resume simulation "' + label + '".', () => {
                    simulationMenuState(false);
                    this.circuits.select(uid);
                    this.config.singleStep = false;
                    this.simulations.select(this.circuits.current, this.config.autoCompile);
                });
                button.classList.toggle('toolbar-menu-button-disabled', isCurrent);
            }
        };
    }

    // Initialize tool bar entries.
    #initToolbar() {
        const DRAG_MSG = '<i>LMB</i> Drag to move onto grid.';
        const rotation = this.config.rotationDefaults;

        // add ports
        this.toolbar.createComponentButton('Port', `<b>Component IO pin</b>. ${DRAG_MSG}`, (grid, x, y) => {
            return grid.addItem(new Port(this, x, y, rotation.port))
        });

        // add tunnels
        this.toolbar.createComponentButton('Tunnel', `<b>Network tunnel</b>. ${DRAG_MSG}`, (grid, x, y) => {
            return grid.addItem(new Tunnel(this, x, y, rotation.tunnel))
        });

        // add a splitter component
        this.toolbar.createComponentButton('Splitter', `<b>Wire splitter/joiner</b>. ${DRAG_MSG}`, (grid, x, y) => {
            let numChannels = 8; // TODO: configurable somewhere
            return grid.addItem(new Splitter(this, x, y, rotation.splitter, numChannels));
        });

        // add a clock component
        this.toolbar.createComponentButton('Clock', `<b>Clock</b>. ${DRAG_MSG}`, (grid, x, y) => {
            return grid.addItem(new Clock(this, x, y, rotation.clock));
        });

        // add a pull resistor component
        this.toolbar.createComponentButton('Pull', `<b>Pull up/down resistor</b>. ${DRAG_MSG}`, (grid, x, y) => {
            return grid.addItem(new PullResistor(this, x, y, rotation.pull));
        });

        // add a constant component
        this.toolbar.createComponentButton('Constant', `<b>Constant value</b>. ${DRAG_MSG}`, (grid, x, y) => {
            return grid.addItem(new Constant(this, x, y, rotation.constant));
        });

        // add toggle buttons
        this.toolbar.createComponentButton('Toggle', `<b>Toggle button</b> with permanently saved state. ${DRAG_MSG}`, (grid, x, y) => {
            return grid.addItem(new Toggle(this, x, y, rotation.port));
        });

        // add text
        this.toolbar.createComponentButton('Text', `<b>Userdefined text message</b>. ${DRAG_MSG}`, (grid, x, y) => {
            return grid.addItem(new TextLabel(this, x, y, rotation.text));
        });

        // add gates
        for (const [ gateType, { joinOp } ] of Object.entries(Simulation.GATE_MAP)) {
            const gateLabel = gateType.toUpperFirst();
            this.toolbar.createComponentButton(gateLabel, `<b>${gateLabel} gate</b>. ${DRAG_MSG}`, (grid, x, y) => {
                let numInputs = 2; // TODO: configurable somewhere
                return grid.addItem(new Gate(this, x, y, rotation[gateType] ?? rotation.gate, gateType, joinOp !== null ? numInputs : 1));
            });
        }

        // add extra gate-like builtins
        for (const builtinType of keys(Simulation.BUILTIN_MAP)) {
            const builtinLabel = Builtin.LABELS[builtinType] ?? builtinType.toUpperFirst();
            this.toolbar.createComponentButton(builtinLabel, `<b>${builtinLabel}</b> builtin. ${DRAG_MSG}`, (grid, x, y) => {
                return grid.addItem(new Builtin(this, x, y, rotation[builtinType] ?? rotation.builtin, builtinType));
            });
        }
    }

    // Initialize render loop and other periodic events.
    #initRenderLoop() {
        // start simulation/render loop
        this.#renderLoop.renderLast = performance.now();
        requestAnimationFrame(() => this.#render());
        // update stats overlay once a second
        setInterval(() => this.#renderStats(), 1000);
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