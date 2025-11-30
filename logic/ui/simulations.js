"use strict";

// Simulation management.
class Simulations {

    #simulations = { };
    #currentSimulation;
    #app;

    constructor(app) {
        assert.class(Application, app);
        this.#app = app;
    }

    // Returns list of simulations
    list() {
        let simulations = Object.keys(this.#simulations).map((uid) => [ uid, app.circuits.byUID(uid).label ]);
        simulations.sort((a, b) => a[1].toLowerCase() < b[1].toLowerCase() ? -1 : (a[1].toLowerCase() > b[1].toLowerCase() ? 1 : 0));
        return simulations;
    }

    // Clear all simulations.
    clear() {
        this.#currentSimulation = null;
        this.#simulations = { };
    }

    // Returns the current simulation.
    get current() {
        return this.#currentSimulation ? this.#simulations[this.#currentSimulation] : null;
    }

    // Makes the simulation for the given circuit current. Optionally creates a simulation if necessary.
    select(circuit, create = true) {
        assert.class(Circuits.Circuit, circuit, true);
        assert.bool(create);
        this.current?.stop();
        if (circuit === null) {
            this.#currentSimulation = null;
            this.#app.grid.setSimulationLabel(null);
            return null;
        } else {
            if (this.#simulations[circuit.uid]) {
                this.#currentSimulation = circuit.uid;
                return this.#simulations[this.#currentSimulation];
            } else if (create) {
                this.#currentSimulation = circuit.uid;
                return this.create(circuit);
            } else {
                this.#app.grid.setSimulationLabel(null);
                this.#currentSimulation = null;
                return null;
            }
        }
    }

    // Creates a simulation for the given circuit.
    create(circuit) {
        assert.class(Circuits.Circuit, circuit);
        this.#simulations[circuit.uid] = new Simulations.Simulation(this.#app, circuit);
        return this.#simulations[circuit.uid];
    }

    // Deletes the simulation for the given circuit.
    delete(circuit) {
        assert.class(Circuits.Circuit, circuit);
        delete this.#simulations[circuit.uid];
        if (circuit.uid === this.#currentSimulation) {
            this.#app.grid.setSimulationLabel(null);
            this.#currentSimulation = null;
        }
    }

    // Marks the given circuit as modified causing simulations that include it to be recompiled.
    markDirty(circuit) {
        for (let simulation of values(this.#simulations)) {
            if (simulation.includes(circuit)) {
                if (simulation === this.current) {
                    simulation.reset();
                } else {
                    simulation.markDirty();
                }
            }
        }
    }

    // Update clock ticks/cycle value. Required when simulation tickrate is changed.
    updateClocks(targetTPS) {
        assert.number(targetTPS);
        for (let simulation of values(this.#simulations)) {
            simulation.engine.updateClocks(targetTPS);
        }
    }
}

Simulations.Simulation = class {
    #app;
    #circuit;
    #netList;
    #engine;
    #tickListener = [];
    #instance = 0;
    #running = false;
    #started = false;

    constructor(app, circuit) {
        assert.class(Application, app);
        assert.class(Circuits.Circuit, circuit);
        this.#app = app;
        this.#circuit = circuit;
        this.#compile();
    }

    // Returns whether the simulation should be running right now.
    get running() {
        return this.#running;
    }

    // Returns whether the simulation had been started at some point and is no longer in its initial state.
    get started() {
        return this.#started;
    }

    // Returns the UID of the root circuit/simulation.
    get uid() {
        return this.#circuit.uid;
    }

    // Returns the label of the root circuit/simulation.
    get label() {
        return this.#circuit.label;
    }

    // Returns the currently attached simulation subcomponent instance id.
    get instance() {
        return this.#instance;
    }

    // Returns the parent instance id of the currently attached simulation subcomponent.
    get parentInstance() {
        return this.#netList.instances[this.instance].parentInstance;
    }

    // Returns a list of components that requested to have their applyState() function called prior to ticking.
    // These are interactive components that may have to apply user input to the simulation.
    get tickListener() {
        return this.#tickListener;
    }

    // Returns the simulation engine used to compile this simulation.
    get engine() {
        return this.#engine;
    }

    // Set convenience property "running" to true and attach the simulation.
    start() {
        this.#running = true;
        this.#attach();
    }

    // Set convenience property "running" to false and detach the simulation.
    stop() {
        this.#running = false;
        this.#detach();
    }

    // Recompiles and reattaches the simulation if it is running.
    reset() {
        this.#app.grid.circuit.detachSimulation();
        this.#compile();
        if (this.running) {
            this.reattach(this.#instance); // FIXME: only works if recompile didn't change instance ids
        }
    }

    // Marks the simulation as modified and in need of a recompilation.
    markDirty() {
        this.#compile(); // TODO: flag as dirty instead
    }

    // Re-attach simulation to a subcircuit.
    reattach(instance) {
        assert.number(instance);
        const circuit = this.#netList.instances[instance].circuit;
        if (this.#app.grid.circuit !== circuit) {
            this.#app.grid.setCircuit(circuit);
        }
        this.#instance = instance;
        this.#tickListener = circuit.attachSimulation(this.#netList, instance);
    }

    // Ticks the current simulation for the given amount of ticks.
    tick(ticks) {
        assert.number(ticks);
        // apply manual simulation states each tick
        for (let { portName, component } of this.tickListener) {
            component.applyState(portName, this.#engine);
        }
        this.#started = true;
        this.#engine.simulate(ticks);
    }

    // Returns whether the simulation includes the given circuit.
    includes(circuit) {
        assert.class(Circuits.Circuit, circuit);
        return this.#netList.instances.some((i) => i.circuit === circuit);
    }

    // Attach simulation to its root circuit.
    #attach() {
        this.#tickListener = this.#circuit.attachSimulation(this.#netList, 0);
        this.#instance = 0;
        this.#app.grid.setSimulationLabel(this.#circuit.label);
        this.#app.grid.markDirty();
    }

    // Detach simulation.
    #detach() {
        this.#app.grid.circuit.detachSimulation();
        this.#app.grid.setSimulationLabel(null);
        this.#app.grid.markDirty();
    }

    // Compiles the simulation.
    #compile() {
        this.#netList = NetList.identify(this.#circuit, true);
        this.#engine = this.#netList.compileSimulation();
        this.#started = false;
    }
}