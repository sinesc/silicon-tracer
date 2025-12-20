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

    // Makes the simulation for the given circuit current. Passing null as circuit will detach any attached simulation.
    // Optionally creates a simulation if necessary.
    select(circuit, create = true, attach = true) {
        assert.class(Circuits.Circuit, circuit, true);
        assert.bool(create);
        assert.bool(attach);
        let simulation;
        if (circuit && this.#simulations[circuit.uid]) {
            this.#currentSimulation = circuit.uid;
            simulation = this.#simulations[this.#currentSimulation];
        } else if (circuit && create) {
            this.#currentSimulation = circuit.uid;
            simulation = this.create(circuit);
        } else {
            this.#app.grid.setSimulationLabel(null);
            this.#app.grid.circuit.detachSimulation();
            this.#currentSimulation = null;
            simulation = null;
        }
        if (simulation && attach) {
            simulation.attach();
        }
        return simulation;
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
            this.#app.grid.circuit.detachSimulation();
            this.#currentSimulation = null;
        }
    }

    // Marks the given circuit as modified causing simulations that include it to be recompiled.
    markDirty(circuit) {
        for (let simulation of values(this.#simulations)) {
            if (simulation.includes(circuit)) {
                simulation.markDirty();
            }
        }
    }

    // Update clock ticks/cycle value. Required when simulation tickrate is changed.
    updateClocks(targetTPS) {
        assert.integer(targetTPS);
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
    #dirty = true;
    #attached = false;
    #netListHash;

    constructor(app, circuit) {
        assert.class(Application, app);
        assert.class(Circuits.Circuit, circuit);
        this.#app = app;
        this.#circuit = circuit;
        this.#compile();
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

    get attached() {
        return this.#attached;
    }

    // Marks the simulation as modified and in need of a recompilation.
    markDirty() {
        this.#dirty = true;
    }

    // Checks if the simulation requires recompilation/attachment (and does so if required).
    checkDirty() {
        if (this.#dirty) {
            this.#compile();
            const circuit = this.#netList.instances[this.#instance].circuit
            if (this.#attached) {
                this.#tickListener = circuit.attachSimulation(this.#netList, this.#instance);
            }
            this.#app.grid.markDirty();
            return true;
        }
        return false;
    }

    // Re-attach simulation to a subcircuit.
    reattach(instance) {
        assert.integer(instance);
        const circuit = this.#netList.instances[instance].circuit;
        if (this.#app.grid.circuit !== circuit) {
            this.#app.grid.setCircuit(circuit);
        }
        this.#instance = instance;
        this.#tickListener = circuit.attachSimulation(this.#netList, instance);
    }

    // Ticks the current simulation for the given amount of ticks.
    tick(ticks) {
        assert.integer(ticks);
        // apply manual simulation states each tick
        for (let { portName, component } of this.tickListener) {
            component.applyState(portName, this.#engine);
        }
        this.#engine.simulate(ticks);
    }

    // Returns whether the simulation includes the given circuit.
    includes(circuit) {
        assert.class(Circuits.Circuit, circuit);
        return this.#netList.instances.some((i) => i.circuit === circuit);
    }

    // Attach simulation to its root circuit.
    attach() {
        this.#tickListener = this.#circuit.attachSimulation(this.#netList, 0);
        this.#instance = 0;
        this.#app.grid.setSimulationLabel(this.#circuit.label);
        this.#app.grid.markDirty();
        this.#attached = true;
    }

    // Detach simulation.
    detach() {
        this.#app.grid.circuit.detachSimulation();
        this.#app.grid.setSimulationLabel(null);
        this.#app.grid.markDirty();
        this.#attached = false;
    }

    // Compiles the simulation.
    #compile() {
        this.#netList = NetList.identify(this.#circuit, true);
        const newHash = this.#netList.hash();
        const retainMemory = this.#engine && this.#netListHash === newHash;
        this.#engine = this.#netList.compileSimulation(retainMemory ? this.#engine.rawMem() : null, this.#app.config.debugCompileComments);
        this.#netListHash = newHash;
        this.#dirty = false;
    }
}