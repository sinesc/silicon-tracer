"use strict";

// Main application class, handles UI interaction.
class Application {

    grid;
    toolbar;
    circuits;

    autoCompile = true;
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

        setInterval(() => { // TODO: bleh
            if (this.autoCompile || this.sim) {
                this.startSimulation();
                for (let i = 0; i < 10; ++i) {  // TODO: bleh temp code, look into webworkers
                    this.sim.engine.simulate();
                }
                this.grid.render();
            }
        }, 180);
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

    // Start or continue current simulation.
    startSimulation() {
        let circuit = this.circuits.current;

        if (this.#currentSimulation !== circuit.uid) {
            this.#currentSimulation = circuit.uid;
            if (this.#simulations[this.#currentSimulation]) {
                // resume existing
                let existingSimulation = this.#simulations[this.#currentSimulation];
                existingSimulation.tickListener = circuit.attachSimulation(existingSimulation.netList);
                this.grid.setSimulationLabel(circuit.label);
            } else {
                // start new
                let netList = circuit.identifyNets(true);
                let engine = circuit.compileSimulation(netList);
                let tickListener = circuit.attachSimulation(netList);
                let start = performance.now();
                this.#simulations[this.#currentSimulation] = { engine, start, netList, tickListener };
                this.grid.setSimulationLabel(circuit.label);
            }
        }
        // apply manual simulation states each tick
        let currentSimulation = this.#simulations[this.#currentSimulation];
        for (let { portName, component } of currentSimulation.tickListener) {
            component.applyState(portName, currentSimulation.engine);
        }
    }

    // Stop current simulation.
    stopSimulation() {
        if (!this.#currentSimulation) {
            return;
        }
        delete this.#simulations[this.#currentSimulation];
        this.#currentSimulation = null;
        this.grid.setSimulationLabel(null);
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
        this.#statusMessage = String.isString(message) ? message : null;
        this.#status.innerHTML = this.#statusMessage ?? '';
        if (this.#statusMessage) {
            this.#status.classList.remove('app-status-faded');
        } else if (!this.#statusMessage) {
            // set default help text when no status message has been set for a while
            this.#statusTimer = setTimeout(() => {
                if (!this.#statusMessage) {
                    this.#status.classList.remove('app-status-faded');
                    this.#status.innerHTML = 'Grid. <i>LMB</i>: Drag component, <i>MMB</i>: Drag grid, <i>MW</i>: Zoom grid';
                }
            }, 1000);
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
            updateFileMenu();
            updateCircuitMenu();
        });
        let [ addButton ] = fileMenu.createActionButton('Open additional...', 'Load additional circuits from a file, keeping open circuits.', async () => {
            fileMenuState(false);
            await this.circuits.loadFile(false);
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
            if (this.circuits.allEmpty) {
                addButton.classList.add('toolbar-menu-button-disabled');
            } else {
                addButton.classList.remove('toolbar-menu-button-disabled');
            }
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
                // place circuit as component
                if (uid !== this.circuits.current.uid) {
                    let [ componentButton ] = circuitMenu.createComponentButton('&#9094;', label + '. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => grid.addItem(new CustomComponent(x, y, 0, uid, label)));
                    componentButton.classList.add('toolbar-circuit-place');
                }
                // circuit select
                let [ switchButton ] = circuitMenu.createActionButton(label, 'Switch grid to circuit "' + label + '".', () => {
                    circuitMenuState(false);
                    this.circuits.current.detachSimulation();
                    this.circuits.select(uid);
                    this.startSimulation();
                });
                switchButton.classList.add(uid !== this.circuits.current.uid ? 'toolbar-circuit-select' : 'toolbar-circuit-select-fullrow');
            }
        }

        // Simulation menu

        let updateSimulationMenu;
        let [ , simulationMenuState, simulationMenu ] = this.toolbar.createMenuButton('Simulation', 'Simulation management menu. <i>LMB</i> Open menu.', () => updateSimulationMenu());

        updateSimulationMenu = () => {
            simulationMenu.clear();
            let toggleButton;
            let toggleButtonText = () => this.sim ? 'Stop simulation' : 'Start at "' + this.circuits.current.label + '"';
            // Continuous simulation toggle
            simulationMenu.createToggleButton('Autostart', 'Automatically starts a new simulation when switching circuits.', this.autoCompile, (enabled) => {
                this.autoCompile = enabled;
                if (enabled) {
                    this.startSimulation();
                }
                updateSimulationMenu();
            });
            // Simulate current grid
            [ toggleButton ] = simulationMenu.createActionButton(toggleButtonText(), 'Toggle simulation on/off.', () => {
                simulationMenuState(false);
                if (this.sim) {
                    this.autoCompile = false;
                    this.stopSimulation();
                    this.grid.render();
                } else {
                    this.startSimulation();
                }
            });
            simulationMenu.createSeparator();
            for (let [ uid, label ] of this.simulations()) {
                simulationMenu.createActionButton(label, 'Switch to simulation "' + label + '".', () => {
                    simulationMenuState(false);
                    // TODO
                });
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