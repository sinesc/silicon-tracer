"use strict";

// Main application class, handles UI interaction.
class Application {

    grid;
    toolbar;
    circuits;
    config = {
        targetTPS: 100000,
        autoCompile: true,
        singleStep: false,
    };

    #simulations = {};
    #currentSimulation;
    #status;
    #statusMessage = null;
    #statusTimer = null;
    #statusLocked = false;
    #logo;

    #renderLast;
    #nextTick = 0;
    #ticksCounted = 0;
    #framesCounted = 0;
    #load = 0;

    constructor(gridParent, toolbarParent, logo = null) {
        assert.class(Node, gridParent);
        assert.class(Node, toolbarParent);

        this.grid = new Grid(gridParent);
        this.toolbar = new Toolbar(toolbarParent);
        this.circuits = new Circuits();

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
        // start simulation/render loop
        this.#renderLast = performance.now();
        requestAnimationFrame(() => this.#render());
        setInterval(() => this.#renderStats(), 1000);
    }

    #renderStats() {
        this.grid.setSimulationDetails(`${Number.formatSI(this.config.targetTPS)} ticks/s target<br>${Number.formatSI(Math.round(this.#ticksCounted))} ticks/s actual<br>${Math.round(this.#load)}% core load<br>${this.#framesCounted} frames/s`);
        this.#ticksCounted = 0;
        this.#framesCounted = 0;
    }

    #render() {
        let interval = this.#renderLast;
        this.#renderLast = performance.now();
        interval = this.#renderLast - interval;
        requestAnimationFrame(() => this.#render());
        this.grid.render();
        this.#framesCounted += 1;
        // handle both TPS smaller or larger than FPS
        const ticksPerFrame = this.config.targetTPS / (1000 / interval);
        this.#nextTick += ticksPerFrame;
        if (this.#nextTick >= 1) {
            this.#nextTick -= 1;
            if (!this.config.singleStep && this.sim) {
                const ticks = Math.max(1, ticksPerFrame);
                this.#ticksCounted += ticks;
                this.runSimulation(ticks);
            }
        }
        // compute load (time spent computing/time available)
        const elapsedTime = performance.now() - this.#renderLast;
        this.#load = elapsedTime / interval * 100;
    }

    // Returns list of simulations
    simulations() {
        let simulations = Object.keys(this.#simulations).map((uid) => [ uid, this.circuits.byUID(uid).label ]);
        simulations.sort((a, b) => a[1] < b[1] ? -1 : (a[1] > b[1] ? 1 : 0));
        return simulations;
    }

    // Returns the current simulation.
    get sim() {
        return this.#currentSimulation ? this.#simulations[this.#currentSimulation] : null;
    }

    // Start or continue simulation for current circuit.
    startSimulation() {
        let circuit = this.circuits.current;
        if (this.#currentSimulation !== circuit.uid) {
            this.#currentSimulation = circuit.uid;
            if (this.#simulations[this.#currentSimulation]) {
                // resume existing
                let existingSimulation = this.#simulations[this.#currentSimulation];
                existingSimulation.tickListener = circuit.attachSimulation(existingSimulation.netList, 0);
                this.grid.setSimulationLabel(circuit.label);
            } else {
                // start new
                let netList = NetList.identify(circuit, true);
                let engine = netList.compileSimulation();
                let tickListener = circuit.attachSimulation(netList, 0);
                let start = performance.now();
                this.#simulations[this.#currentSimulation] = { engine, start, netList, tickListener, instance: 0 };
                this.grid.setSimulationLabel(circuit.label);
            }
        }
    }

    // Runs the current simulation for the given amount of ticks.
    runSimulation(ticks) {
        assert.number(ticks);
        // apply manual simulation states each tick
        let currentSimulation = this.#simulations[this.#currentSimulation];
        for (let { portName, component } of currentSimulation.tickListener) {
            component.applyState(portName, currentSimulation.engine); // FIXME: net state needs to be applied each actual tick
        }
        this.sim.engine.simulate(ticks);
    }

    // Stop current simulation.
    stopSimulation() {
        if (!this.#currentSimulation) {
            return;
        }
        delete this.#simulations[this.#currentSimulation];
        this.#currentSimulation = null;
        this.grid.circuit.detachSimulation();
        this.grid.setSimulationLabel(null);
        this.grid.markDirty();
    }

    // Restarts a running simulation. Does not start a simulation that isn't already running.
    restartSimulation() {
        if (!this.#currentSimulation) {
            return;
        }
        this.stopSimulation();
        this.startSimulation();
    }

    // Clear all simulations.
    clearSimulations() {
        this.#currentSimulation = null;
        this.#simulations = { };
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
        this.#statusMessage = String.isString(message) ? message : (Function.isFunction(message) ? message() : null);
        this.#status.innerHTML = this.#statusMessage ?? '';
        if (this.#statusMessage) {
            this.#status.classList.remove('app-status-faded');
        } else if (!this.#statusMessage) {
            // set default help text when no status message has been set for a while
            this.#statusTimer = setTimeout(() => {
                if (!this.#statusMessage) {
                    this.#status.classList.remove('app-status-faded');
                    let hasParent = app.sim && app.sim.instance > 0;
                    this.#status.innerHTML = 'Grid. <i>LMB</i>: Select area, <i>SHIFT+LMB</i>: Add to selection, <i>MMB</i>: Drag grid, <i>MW</i>: Zoom grid, <i>E</i>: Rename circuit, ' + (hasParent ? '' : '<u>') + '<i>W</i>: Switch to parent simulation' + (hasParent ? '' : '</u>');
                }
            }, 500);
        }
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

    // Initialize main menu entries.
    #initMenu() {

        // Add file operations to toolbar
        let updateFileMenu;
        let [ , fileMenuState, fileMenu ] = this.toolbar.createMenuButton('File', 'File operations menu. <i>LMB</i> Open menu.', () => updateFileMenu());

        fileMenu.createActionButton('Open...', 'Close all circuits and load new circuits from a file.', async () => {
            fileMenuState(false);
            await this.circuits.loadFile(true);
            this.clearSimulations();
            if (this.config.autoCompile) {
                this.startSimulation();
            }
            updateFileMenu();
            updateCircuitMenu();
        });
        let [ addButton ] = fileMenu.createActionButton('Open additional...', 'Load additional circuits from a file, keeping open circuits.', async () => {
            fileMenuState(false);
            await this.circuits.loadFile(false);
            if (this.config.autoCompile) {
                this.startSimulation();
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
            this.clearSimulations();
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
            circuitMenu.createActionButton('New...', 'Create a new circuit.', () => {
                circuitMenuState(false);
                this.circuits.create();
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
                    if (this.config.autoCompile) {
                        this.startSimulation();
                    }
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
            let toggleAction = () => this.circuits.current.uid === this.#currentSimulation ? 'stop' : (this.#simulations[this.circuits.current.uid] ? 'resume' : 'start');
            let toggleButtonText = (action) => (action === 'stop' ? 'Stop' : (action === 'resume' ? 'Resume' : 'Start at')) + ' "' + this.circuits.current.label + '"';
            // Continuous simulation toggle
            simulationMenu.createToggleButton('Autostart', 'Automatically starts a new simulation when switching circuits.', this.config.autoCompile, (enabled) => {
                this.config.autoCompile = enabled;
                if (enabled) {
                    this.config.singleStep = false;
                    this.startSimulation();
                }
                updateSimulationMenu();
            });
            // Simulate current grid
            simulationMenu.createActionButton(toggleButtonText(toggleAction()), 'Toggle simulation on/off.', () => {
                simulationMenuState(false);
                let action = toggleAction();
                if (action === 'stop') {
                    this.config.autoCompile = false;
                    this.stopSimulation();
                    // switch to whatever circuit was being viewed when the simulation ended
                    app.circuits.select(app.grid.circuit.uid);
                } else if (action === 'resume' || action === 'start') {
                    // startSimulation resumes if a simulation for the current circuit already exists
                    this.config.singleStep = false;
                    this.startSimulation();
                }
            });
            simulationMenu.createSeparator();
            for (let [ uid, label ] of this.simulations()) {
                let isCurrent = uid === this.#currentSimulation;
                let [ button ] = simulationMenu.createActionButton(label, isCurrent ? 'This is the current simulation' : 'Switch to/resume simulation "' + label + '".', () => {
                    simulationMenuState(false);
                    app.circuits.select(uid);
                    this.config.singleStep = false;
                    this.startSimulation();
                });
                button.classList.toggle('toolbar-menu-button-disabled', isCurrent);
            }
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