"use strict";

// Main application class, handles UI interaction.
class Application {

    static MAX_TPS = 5000;

    grid;
    toolbar;
    circuits;

    autoCompile = true;
    singleStep = false;
    adaptiveTPS = true;
    #simulations = {};
    #currentSimulation;

    #status;
    #statusMessage = null;
    #statusTimer = null;
    #statusLocked = false;

    constructor(gridParent, toolbarParent) {
        assert.class(Node, gridParent);
        assert.class(Node, toolbarParent);

        this.grid = new Grid(gridParent);
        this.toolbar = new Toolbar(toolbarParent);
        this.circuits = new Circuits();

        this.#status = document.createElement('div');
        this.#status.classList.add('app-status');
        gridParent.appendChild(this.#status);

        // run simulation

        let ticksPerPeriod = 0;
        let ticksPerInterval = 100000;

        setInterval(() => { // TODO: look into webworkers
            if (!this.singleStep && this.sim) {
                this.runSimulation(ticksPerInterval);
                ticksPerPeriod += ticksPerInterval;
            }
        }, 0);

        // auto adapt ticks per interval

        const AUTO_ADAPT_PERIOD = 100;
        const MAX_INTERVALS_PER_PERIOD = 250 / 1000 * AUTO_ADAPT_PERIOD; // browser limited to 250/s
        let overlayRefresh = 0;

        setInterval(() => { // TODO: crap, instead measure time taken for n ticks, then compute number of ticks that fit into one animationframe
            if (!this.singleStep && this.sim) {
                if (overlayRefresh >= 1000) {
                    const tps = Number.formatSI(ticksPerPeriod * 1000 / AUTO_ADAPT_PERIOD);
                    const tpi = Number.formatSI(Math.round(ticksPerInterval));
                    this.grid.setSimulationDetails(`Single core<br>${tps} ticks/s<br>${tpi} ticks/interval`);
                    overlayRefresh = 0;
                }
                overlayRefresh += AUTO_ADAPT_PERIOD;
                if (this.adaptiveTPS) {
                    if (ticksPerPeriod >= (0.95 * ticksPerInterval * MAX_INTERVALS_PER_PERIOD)) {
                        ticksPerInterval *= 1.1;
                    } else {
                        ticksPerInterval /= 1.1;
                    }
                    ticksPerInterval = Math.min(Application.MAX_TPS / MAX_INTERVALS_PER_PERIOD * AUTO_ADAPT_PERIOD / 1000, Math.max(10, ticksPerInterval));
                }
                ticksPerPeriod = 0;
            }
        }, AUTO_ADAPT_PERIOD);
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
    initMenu() {

        // Add file operations to toolbar
        let updateFileMenu;
        let [ , fileMenuState, fileMenu ] = this.toolbar.createMenuButton('File', 'File operations menu. <i>LMB</i> Open menu.', () => updateFileMenu());

        fileMenu.createActionButton('Open...', 'Close all circuits and load new circuits from a file.', async () => {
            fileMenuState(false);
            await this.circuits.loadFile(true);
            this.clearSimulations();
            if (this.autoCompile) {
                this.startSimulation();
            }
            updateFileMenu();
            updateCircuitMenu();
        });
        let [ addButton ] = fileMenu.createActionButton('Open additional...', 'Load additional circuits from a file, keeping open circuits.', async () => {
            fileMenuState(false);
            await this.circuits.loadFile(false);
            if (this.autoCompile) {
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

        this.circuits.clear();
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
                    if (this.autoCompile) {
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
            simulationMenu.createToggleButton('Autostart', 'Automatically starts a new simulation when switching circuits.', this.autoCompile, (enabled) => {
                this.autoCompile = enabled;
                if (enabled) {
                    this.singleStep = false;
                    this.startSimulation();
                }
                updateSimulationMenu();
            });
            // Simulate current grid
            simulationMenu.createActionButton(toggleButtonText(toggleAction()), 'Toggle simulation on/off.', () => {
                simulationMenuState(false);
                let action = toggleAction();
                if (action === 'stop') {
                    this.autoCompile = false;
                    this.stopSimulation();
                    // switch to whatever circuit was being viewed when the simulation ended
                    app.circuits.select(app.grid.circuit.uid);
                } else if (action === 'resume' || action === 'stop') {
                    // startSimulation resumes if a simulation for the current circuit already exists
                    this.singleStep = false;
                    this.startSimulation();
                }
            });
            simulationMenu.createSeparator();
            for (let [ uid, label ] of this.simulations()) {
                let isCurrent = uid === this.#currentSimulation;
                let [ button ] = simulationMenu.createActionButton(label, isCurrent ? 'This is the current simulation' : 'Switch to/resume simulation "' + label + '".', () => {
                    simulationMenuState(false);
                    app.circuits.select(uid);
                    this.singleStep = false;
                    this.startSimulation();
                });
                button.classList.toggle('toolbar-menu-button-disabled', isCurrent);
            }
        }
    }

    // Initialize tool bar entries.
    initToolbar() {
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
    startFocusMonitor() {
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
    startLogoMonitor(logo) {
        // A blast from when we still owned our stuff.
        logo.onmouseenter = () => this.setStatus('Cheesy 80s logo. It is ticklish.');
        logo.onmouseleave = () => this.clearStatus();
        logo.onclick = () => logo.setAttribute('data-c', ((parseInt(logo.getAttribute('data-c') ?? 0) + 1) % 6));
    }
}