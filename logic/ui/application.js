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
        assert.object(gridParent);
        assert.object(toolbarParent);

        this.grid = new Grid(gridParent);
        this.toolbar = new Toolbar(this.grid, toolbarParent); // TODO: these should just use app.grid
        this.circuits = new Circuits(this.grid);

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
        }, 18);
    }

    // Returns list of simulations
    simulations() {
        let simulations = Object.keys(this.#simulations).map((uid) => [ uid, this.circuits.byUID(uid).label ]);
        simulations.sort((a, b) => {
            if (a[1] < b[1]) {
                return -1;
            } else if (a[1] > b[1]) {
                return 1;
            } else {
                return 0;
            }
        });
        return simulations;
    }

    // Returns the current simulation.
    get sim() {
        return this.#currentSimulation ? this.#simulations[this.#currentSimulation] : null;
    }

    // Start or continue current simulation.
    startSimulation() {
        if (!this.sim) {
            let engine = this.compileSimulation();
            this.grid.setSimulationLabel(this.circuits.current.label);
            let start = performance.now();
            this.#currentSimulation = this.circuits.current.uid;
            this.#simulations[this.#currentSimulation] = { engine, start };
            this.#simulations[this.#currentSimulation].tickListener = this.linkSimulation();
        }
        for (let [ portName, component ] of this.sim.tickListener) {
            component.applyState(portName, this.sim.engine);
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

    // Compiles a simulation for the grid contents and returns it.
    compileSimulation() {

        let netList = this.circuits.current.identifyNets();
        let sim = new Simulation();

        // declare gates from component map
        for (let [ prefix, component ] of netList.map.entries()) {
            if (component instanceof Gate) { // TODO: exclude unconnected gates via netList.unconnected.ports when all gate ports are listed as unconnected
                sim.gateDecl(component.type, component.inputs.map((i) => prefix + i), prefix + component.output);
            } else if (component instanceof Builtin) {
                sim.builtinDecl(component.type, prefix);
            }
        }

        // declare nets
        for (let net of netList.nets) {
            // create new net from connected gate i/o-ports
            let interactiveComponents = net.ports.filter((p) => p.component instanceof Interactive);
            let attachedPorts = net.ports.filter((p) => (p.component instanceof Gate) || (p.component instanceof Builtin)).map((p) => p.uniqueName);
            let netId = sim.netDecl(attachedPorts, interactiveComponents.map((p) => p.uniqueName));
        }

        // compile
        sim.compile();
        return sim;
    }

    // Link simulation to current grid
    linkSimulation() {

        let circuit = this.circuits.current;
        let netList = circuit.identifyNets();
        let sim = this.sim.engine;

        // declare nets
        let tickListener = [];
        for (let net of netList.nets) {
            // create new net from connected gate i/o-ports
            let interactiveComponents = net.ports.filter((p) => p.component instanceof Interactive);
            let attachedPorts = net.ports.filter((p) => (p.component instanceof Gate) || (p.component instanceof Builtin)).map((p) => p.uniqueName);
            let netId = sim.netDecl(attachedPorts, interactiveComponents.map((p) => p.uniqueName)); // FIXME: duplicates compile. probably should be get()?


            // link interactive components on the net to the ui
            for (let netPort of interactiveComponents) {
                tickListener.push([ netPort.name, netPort.component ]);
            }
            // link ports on components
            for (let { name, gid } of net.ports) {
                let component = circuit.itemByGID(gid);
                let port = component.portByName(name);// TODO: getting ports by name might be slow, should also store some kind of id in net.ports
                port.netId = netId;
            }
            // link wires
            for (let { gid } of net.wires) {
                let component = circuit.itemByGID(gid);
                component.netId = netId;
            }
        }
        return tickListener;
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
        fileMenu.createActionButton('Close', 'Close all open circuits', async () => {
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
            } else {
                saveButton.innerHTML = 'Save';
                saveButton.classList.add('toolbar-menu-button-disabled');
            }
            if (this.circuits.allEmpty) {
                addButton.classList.add('toolbar-menu-button-disabled');
            } else {
                addButton.classList.remove('toolbar-menu-button-disabled');
            }
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
                circuitMenu.createActionButton(label, 'Switch grid to circuit "' + label + '"', () => {
                    circuitMenuState(false);
                    this.circuits.select(uid);
                });
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
                simulationMenu.createActionButton(label, 'Switch to simulation "' + label + '"', () => {
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

        this.toolbar.createActionButton('Dump ASM', 'Outputs simulation code to console', () => {
            if (this.sim) {
                let portInfo = [];
                for (let { offset, meta } of this.sim.engine.nets) {
                    for (let port of meta) {
                        portInfo.push('// port ' + port + ' mem[' + offset + ']');
                    }
                }
                console.log(this.sim.engine.code() + portInfo.join("\n"));
            } else {
                console.log('No simulation running');
            }
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