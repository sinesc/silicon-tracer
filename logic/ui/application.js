"use strict";

// Main application class, handles UI interaction.
class Application {

    config = {
        targetTPS: 10000,
        autoCompile: true,
        singleStep: false,
    };

    grid;
    toolbar;
    circuits;
    simulations;

    // move all into single object, e.g. #status = { ..
    #status;
    #statusMessage = null;
    #statusTimer = null;
    #statusLocked = false;
    #logo;

    #renderLoop = {
        renderLast: 0,
        nextTick: 0,
        intervalComputed: 0.016,
        ticksPerFrameComputed: 0,
        load: 0,
        ticksCounted: 0,
        framesCounted: 0,
    };

    constructor(gridParent, toolbarParent, logo = null) {
        assert.class(Node, gridParent);
        assert.class(Node, toolbarParent);
        assert.class(Node, logo, true);

        this.grid = new Grid(gridParent);
        this.toolbar = new Toolbar(toolbarParent);
        this.circuits = new Circuits(this);
        this.simulations = new Simulations(this);

        this.#status = document.createElement('div');
        this.#status.classList.add('app-status');
        gridParent.appendChild(this.#status);
        this.#logo = logo;
    }

    start() {
        // finish init
        this.#initMenu();
        this.#initToolbar();
        this.#startFocusMonitor();
        this.#startLogoMonitor();
        this.circuits.clear();
        this.simulations.select(this.circuits.current).start();
        // start simulation/render loop
        this.#renderLoop.renderLast = performance.now();
        requestAnimationFrame(() => this.#render());
        // update stats overlay once a second
        setInterval(() => this.#renderStats(), 1000);
    }

    // Sets a status message. Pass null to unset and revert back to default status.
    setStatus(message, lock) {
        if (this.#statusLocked && !lock) {
            return;
        }
        this.#statusLocked = lock ?? false;
        if (this.#statusTimer) {
            clearTimeout(this.#statusTimer);
        }
        this.#statusMessage = message;
        const messageText = String.isString(message) ? message : (Function.isFunction(message) ? message() : null);
        this.#status.innerHTML = messageText ?? '';
        if (messageText) {
            this.#status.classList.remove('app-status-faded');
        } else if (!messageText) {
            // set default help text when no status message has been set for a while
            this.#statusTimer = setTimeout(() => {
                if (!messageText) {
                    this.#status.classList.remove('app-status-faded');
                    this.#status.innerHTML = this.grid.defaultStatusMessage();
                }
            }, 500);
        }
    }

    // Immediately update status with previously set message(-function).
    updateStatus() {
        if (this.#statusTimer) {
            clearTimeout(this.#statusTimer);
        }
        const message = this.#statusMessage;
        const messageText = String.isString(message) ? message : (Function.isFunction(message) ? message() : null);
        this.#status.classList.remove('app-status-faded');
        this.#status.innerHTML = messageText ?? this.grid.defaultStatusMessage();
    }

    // Clears the current status message.
    clearStatus(unlock) {
        if (this.#statusLocked && !unlock) {
            return;
        }
        this.#statusLocked = false;
        if (this.#statusTimer) {
            clearTimeout(this.#statusTimer);
        }
        this.#status.classList.add('app-status-faded');
        this.#statusTimer = setTimeout(() => this.setStatus(), Grid.STATUS_DELAY);
    }

    // Called periodically to update stats overlay.
    #renderStats() {
        this.grid.setSimulationDetails(`${Number.formatSI(this.config.targetTPS)} ticks/s target<br>${Number.formatSI(Math.round(this.#renderLoop.ticksCounted))} ticks/s actual<br>${Math.round(this.#renderLoop.load)}% core load<br>${this.#renderLoop.framesCounted} frames/s`);
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
        if (!(sim && sim.running && !sim.started)) {
            this.grid.render();
        }
        this.#renderLoop.framesCounted += 1;
        // handle both TPS smaller or larger than FPS
        this.#renderLoop.ticksPerFrameComputed = this.config.targetTPS / (1000 / this.#renderLoop.intervalComputed);
        this.#renderLoop.nextTick += this.#renderLoop.ticksPerFrameComputed;
        if (this.#renderLoop.nextTick >= 1) {
            this.#renderLoop.nextTick -= Math.floor(this.#renderLoop.nextTick);
            if (!this.config.singleStep) {
                const ticksCapped = this.config.targetTPS / (1000 / 60); // cap is used to work around large intervals when browser window not focused
                const ticks = Math.max(1, Math.min(this.#renderLoop.ticksPerFrameComputed, ticksCapped));
                this.#renderLoop.ticksCounted += ticks;
                sim?.tick(ticks);
            }
        }
        // compute load (time spent computing/time available)
        const elapsedTime = performance.now() - this.#renderLoop.renderLast;
        this.#renderLoop.load = elapsedTime / this.#renderLoop.intervalComputed * 100;
    }

    // Initialize main menu entries.
    #initMenu() {

        // Add file operations to toolbar
        let updateFileMenu;
        let [ , fileMenuState, fileMenu ] = this.toolbar.createMenuButton('File', 'File operations menu. <i>LMB</i> Open menu.', () => updateFileMenu());

        fileMenu.createActionButton('Open...', 'Close all circuits and load new circuits from a file.', async () => {
            fileMenuState(false);
            await this.circuits.loadFile(true);
            this.simulations.clear();
            this.#maybeStartSimulation();
            updateFileMenu();
            updateCircuitMenu();
        });
        let [ addButton ] = fileMenu.createActionButton('Open additional...', 'Load additional circuits from a file, keeping open circuits.', async () => {
            fileMenuState(false);
            await this.circuits.loadFile(false); // TODO don't switch to new circuit
            if (this.config.autoCompile) {
                this.simulations.select(this.circuits.current).start();
            }
            updateFileMenu();
            updateCircuitMenu();
        });
        fileMenu.createSeparator();
        let [ saveButton ] = fileMenu.createActionButton('Save', 'Save circuits to file.', async () => {
            fileMenuState(false);
            await this.circuits.saveFile();
        });
        fileMenu.createActionButton('Save as...', 'Save circuits to a new file.', async () => {
            fileMenuState(false);
            await this.circuits.saveFileAs();
            updateFileMenu();
        });
        fileMenu.createSeparator();
        fileMenu.createActionButton('Close', 'Close all open circuits.', async () => {
            fileMenuState(false);
            this.circuits.closeFile();
            this.simulations.clear();
            this.#maybeStartSimulation();
            updateFileMenu();
            updateCircuitMenu();
        });

        updateFileMenu = () => {
            if (this.circuits.fileName) {
                saveButton.innerHTML = 'Save <i>' + this.circuits.fileName + '</i>';
                saveButton.classList.remove('toolbar-menu-button-disabled');
                document.title = this.circuits.fileName + ' - Silicon Tracer';
            } else {
                saveButton.innerHTML = 'Save';
                document.title = 'Silicon Tracer';
                saveButton.classList.add('toolbar-menu-button-disabled');
            }
            addButton.classList.toggle('toolbar-menu-button-disabled', this.circuits.allEmpty);
        }

        // Circuit selection menu

        let updateCircuitMenu;
        let [ , circuitMenuState, circuitMenu ] = this.toolbar.createMenuButton('Circuit', 'Circuit management menu. <i>LMB</i> Open menu.', () => updateCircuitMenu());

        updateCircuitMenu = () => {
            circuitMenu.clear();
            circuitMenu.createActionButton('New...', 'Create a new circuit.', async () => {
                circuitMenuState(false);
                if (await this.circuits.create()) {
                    this.#maybeStartSimulation();
                }
                addButton.classList.remove('toolbar-menu-button-disabled');
                updateCircuitMenu();
            });
            circuitMenu.createSeparator();
            for (let [ uid, label ] of this.circuits.list()) {
                let isCurrentGrid = uid === this.grid.circuit.uid; // grid circuit may be different from current circuit when navigating through simulation subcomponents
                let isCurrentCircuit = uid === this.circuits.current.uid;
                // place circuit as component
                if (!isCurrentGrid) {
                    let [ componentButton ] = circuitMenu.createComponentButton('&#9094;', label + '. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => grid.addItem(new CustomComponent(x, y, 0, uid, label)));
                    componentButton.classList.add('toolbar-circuit-place');
                }
                // circuit select
                let [ switchButton ] = circuitMenu.createActionButton(label, isCurrentCircuit ? 'This is the current circuit' : 'Switch grid to circuit "' + label + '".', () => {
                    circuitMenuState(false);
                    this.circuits.select(uid);
                    this.#maybeStartSimulation();
                });
                switchButton.classList.add(!isCurrentGrid ? 'toolbar-circuit-select' : 'toolbar-circuit-select-fullrow');
                switchButton.classList.toggle('toolbar-menu-button-disabled', isCurrentCircuit);
            }
        }

        // Simulation menu

        let updateSimulationMenu;
        let [ , simulationMenuState, simulationMenu ] = this.toolbar.createMenuButton('Simulation', 'Simulation management menu. <i>LMB</i> Open menu.', () => updateSimulationMenu());

        updateSimulationMenu = () => {
            simulationMenu.clear();
            let toggleAction = () => {
                const sim = this.simulations.current;
                const isCurrent = this.circuits.current.uid === sim?.uid;
                if (isCurrent && sim) {
                    return sim.running ? 'stop' : (sim.started ? 'resume' : 'start');
                } else {
                    return 'new';
                }
            };
            let toggleButtonText = (action) => {
                if (action === 'start') {
                    return `Start at "${this.simulations.current.label}"`;
                } else if (action === 'resume') {
                    return `Resume "${this.simulations.current.label}"`;
                } else if (action === 'stop') {
                    return `Stop "${this.simulations.current.label}"`;
                } else if (action === 'new') {
                    return `Start at "${this.circuits.current.label}"`;
                }
            };
            // Continuous simulation toggle
            simulationMenu.createToggleButton('Autostart', 'Automatically starts a new simulation when switching circuits.', this.config.autoCompile, (enabled) => {
                this.config.autoCompile = enabled;
                if (enabled) {
                    this.config.singleStep = false;
                    this.simulations.select(this.circuits.current).start();
                }
                updateSimulationMenu();
            });
            // Simulate current grid
            simulationMenu.createActionButton(toggleButtonText(toggleAction()), 'Toggle simulation on/off.', () => {
                simulationMenuState(false);
                let action = toggleAction();
                if (action === 'stop') {
                    this.config.autoCompile = false;
                    this.simulations.current.stop();
                    // switch to whatever circuit was being viewed when the simulation ended
                    app.circuits.select(app.grid.circuit.uid);
                } else if (action === 'resume' || action === 'start') {
                    // start will just resume if the simulation already exists
                    this.config.singleStep = false;
                    this.simulations.current.start();
                } else if (action === 'new') {
                    // start new simulation for current circuit
                    this.simulations.select(this.circuits.current).start();
                }
            });
            // Simulate current grid
            simulationMenu.createActionButton(`Set ticks/s (${Number.formatSI(this.config.targetTPS)})...`, 'Configure simulation speed', async () => {
                simulationMenuState(false);
                let result = await dialog('Simulation speed', [ { label: "Ticks per second", name: "targetTPS", type: "int", check: (v, f) => { const p = Number.parseSI(v, true); return isFinite(p) && p >= 1; } } ], { targetTPS: Number.formatSI(this.config.targetTPS, true) });
                if (result) {
                    this.config.targetTPS = result.targetTPS;
                }
            });
            if (this.simulations.list().length > 0) {
                simulationMenu.createSeparator();
            }
            for (let [ uid, label ] of this.simulations.list()) {
                let isCurrent = uid === this.simulations.current?.uid;
                let [ button ] = simulationMenu.createActionButton(label, isCurrent ? 'This is the current simulation' : 'Switch to/resume simulation "' + label + '".', () => {
                    simulationMenuState(false);
                    app.circuits.select(uid);
                    this.config.singleStep = false;
                    this.simulations.select(this.circuits.current).start();
                });
                button.classList.toggle('toolbar-menu-button-disabled', isCurrent);
            }
        }
    }

    // Starts a simulation for the current circuit if autocompile is enabled, otherwise unsets current simulation.
    #maybeStartSimulation() {
        if (this.config.autoCompile) {
            this.simulations.select(this.circuits.current).start();
        } else {
            this.simulations.select(this.circuits.current, false);
        }
    }

    // Initialize tool bar entries.
    #initToolbar() {
        // add conveniently pre-rotated ports
        this.toolbar.createComponentButton('Port ·', 'Component IO pin. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => grid.addItem(new Port(x, y, 'right')));
        this.toolbar.createComponentButton('· Port', 'Component IO pin. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => grid.addItem(new Port(x, y, 'left')));

        // add gates
        for (let [ gateType, { joinOp } ] of Object.entries(Simulation.GATE_MAP)) {
            let gateLabel = gateType.toUpperFirst();
            this.toolbar.createComponentButton(gateLabel, '<b>' + gateLabel + '</b> gate. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => {
                let numInputs = 2; // TODO: configurable somewhere
                return grid.addItem(new Gate(x, y, gateType, joinOp !== null ? numInputs : 1));
            });
        }

        // add extra gate-like builtins
        for (let [ builtinType, ] of Object.entries(Simulation.BUILTIN_MAP)) {
            let builtinLabel = builtinType.toUpperFirst();
            this.toolbar.createComponentButton(builtinLabel, '<b>' + builtinLabel + '</b> builtin. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => {
                return grid.addItem(new Builtin(x, y, builtinType));
            });
        }

        // add a clock component
        this.toolbar.createComponentButton('Clock', '<b>Clock</b>. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => {
            return grid.addItem(new Clock(x, y));
        });
    }

    // Show warning when not focussed to avoid confusion. In this state mouse wheel events still register but hotkeys don't.
    #startFocusMonitor() {
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

    // Monitor logo for clicks.
    #startLogoMonitor() {
        if (this.#logo) {
            // A blast from when we still owned our stuff.
            this.#logo.onmouseenter = () => this.setStatus('Cheesy 80s logo. It is ticklish.');
            this.#logo.onmouseleave = () => this.clearStatus();
            this.#logo.onclick = () => this.#logo.setAttribute('data-c', ((parseInt(this.#logo.getAttribute('data-c') ?? 0) + 1) % 6));
        }
    }
}