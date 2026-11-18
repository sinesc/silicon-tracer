"use strict";

// Simulation management.
class Simulations {

    #simulations = { };
    #currentSimulation = null;
    #app;

    constructor(app) {
        assert.class(Application, app);
        this.#app = app;
    }

    // Returns list of simulations
    list() {
        const simulations = Object.keys(this.#simulations).map((uid) => [ uid, this.#app.circuits.byUID(uid).label ]);
        simulations.sort((a, b) => a[1].localeCompare(b[1], 'en', { numeric: true }));
        return simulations;
    }

    // Returns all live simulation instances as an array (note: values() is a generator and would be single-use).
    get all() {
        return [...values(this.#simulations)];
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
        assert.class(Circuit, circuit, true);
        assert.bool(create);
        assert.bool(attach);
        const oldUid = this.#currentSimulation;
        let simulation;
        if (circuit && this.#simulations[circuit.uid]) {
            this.#currentSimulation = circuit.uid;
            simulation = this.#simulations[this.#currentSimulation];
        } else if (circuit && create) {
            this.#currentSimulation = circuit.uid;
            simulation = this.create(circuit);
        } else {
            this.#app.grid.simulationOverlay.setLabel(null);
            this.#app.grid.circuit.detachSimulation();
            this.#currentSimulation = null;
            simulation = null;
        }
        if (oldUid !== this.#currentSimulation) {
            this.#app.grid.monitorOverlay.switchContext(oldUid, this.#currentSimulation);
        }
        if (simulation && attach) {
            simulation.attach();
        }
        return simulation;
    }

    // Creates a simulation for the given circuit.
    create(circuit) {
        assert.class(Circuit, circuit);
        this.#simulations[circuit.uid] = new Simulations.Simulation(this.#app, circuit);
        return this.#simulations[circuit.uid];
    }

    // Deletes the simulation for the given circuit.
    delete(circuit) {
        assert.class(Circuit, circuit);
        delete this.#simulations[circuit.uid];
        this.#app.grid.monitorOverlay.clearSaved(circuit.uid);
        if (circuit.uid === this.#currentSimulation) {
            this.#app.grid.simulationOverlay.setLabel(null);
            this.#app.grid.circuit.detachSimulation();
            this.#currentSimulation = null;
        }
    }

    // Marks the given circuit (or all circuits if null) as modified causing simulations that include it to be recompiled.
    markDirty(circuit) {
        assert.class(Circuit, circuit, true);
        for (const simulation of values(this.#simulations)) {
            if (circuit === null || simulation.includes(circuit)) {
                simulation.markDirty();
            }
        }
    }

    // Update clock ticks/cycle value. Required when simulation tickrate is changed.
    updateClocks(targetTPS) {
        assert.integer(targetTPS);
        for (const simulation of values(this.#simulations)) {
            simulation.engine.updateClocks(targetTPS);
        }
    }
}

Simulations.Simulation = class {
    #app;
    #circuit;
    #netList;
    #engine;
    #instanceId = 0;
    #dirty = true;
    #attached = false;
    #stats;
    #snapshots = []; // session-only state snapshots: { name, state } (state from engine.createStateSnapshot())

    constructor(app, circuit) {
        assert.class(Application, app);
        assert.class(Circuit, circuit);
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
    get instanceId() {
        return this.#instanceId;
    }

    // Returns the parent instance id of the currently attached simulation subcomponent.
    get parentInstanceId() {
        return this.#netList.instances[this.instanceId].parentInstanceId;
    }

    // Returns the simulation engine used to compile this simulation.
    get engine() {
        return this.#engine;
    }

    get attached() {
        return this.#attached;
    }

    // Returns simulation-wide circuit stats (all instances combined).
    get stats() {
        return this.#stats;
    }

    // Returns stats for an instance and all instances nested within it.
    instanceStats(instanceId) {
        assert.integer(instanceId);
        const subtree = new Set();
        const collect = (id) => {
            subtree.add(id);
            for (const subId of Object.values(this.#netList.instances[id].subInstances)) {
                collect(subId);
            }
        };
        collect(instanceId);
        let gates = 0;
        for (const id of subtree) {
            for (const item of this.#netList.instances[id].circuit.items) {
                if (item instanceof Gate) {
                    gates += 1;
                } else if (item instanceof Builtin) {
                    gates += item.gates;
                }
            }
        }
        const nets = this.#netList.nets.filter((n) => n.ports.some((p) => subtree.has(p.instanceId))).length;
        return { gates, nets };
    }

    get instances() {
        return this.#netList.instances;
    }

    // Marks the simulation as modified and in need of a recompilation.
    markDirty() {
        this.#dirty = true;
    }

    // Checks if the simulation requires recompilation/attachment (and does so if required).
    checkDirty(reattach = true) {
        assert.bool(reattach);
        if (this.#dirty && !this.#app.config.lockSimulation) {
            this.#compile();
            const circuit = this.#netList.instances[this.#instanceId].circuit
            if (reattach && this.#attached) {
                circuit.attachSimulation(this.#netList, this.#instanceId);
                this.updateMarks();
            }
            this.#app.grid.markSimulationRecompiled();
            return true;
        }
        return false;
    }

    // Re-attach simulation to a subcircuit.
    reattach(instanceId) {
        assert.integer(instanceId);
        this.checkDirty(false);
        const circuit = this.#netList.instances[instanceId].circuit;
        if (this.#app.grid.circuit !== circuit) {
            this.#app.grid.setCircuit(circuit);
        }
        this.#app.grid.circuitOverlay.setInstanceId(instanceId);
        this.#instanceId = instanceId;
        circuit.attachSimulation(this.#netList, instanceId);
        this.updateMarks();
        this.#app.history.record();
    }

    // Recomputes net-related port marks for the circuit instance currently shown on the grid: conflict marks (driving/path port
    // outlines and outlines of components containing a conflict, only in single-step mode with net conflict checking enabled)
    // and net-driver marks (outlines of ports currently driving their net, in single-step mode regardless of conflict checking;
    // all cleared otherwise).
    // Only the current instance is marked because one Circuit (and thus its ComponentPorts) backs all instances of a sub-circuit.
    updateMarks() {
        if (!this.#netList) return;
        const circuit = this.#netList.instances[this.#instanceId].circuit;
        circuit.clearNetConflicts();
        circuit.clearNetDrivers();
        if (this.#app.config.singleStep && this.#engine) {
            if (this.#app.config.checkNetConflicts) circuit.markNetConflicts(this.#netList, this.#instanceId, this.#engine.resolveNetConflictDriversByNet());
            circuit.markDrivers(this.#netList, this.#instanceId, this.#engine.resolveNetDriversByNet());
        }
    }

    // Restarts the simulation from its initial state.
    reset() {
        this.#engine.reset();
        this.updateMarks();
    }

    // Returns this simulation's snapshots (session-only, not serialized).
    get snapshots() {
        return this.#snapshots;
    }

    // Captures the current simulation state under the given name.
    createSnapshot(name) {
        assert.string(name);
        this.#snapshots.push({ name, state: this.#engine.createStateSnapshot() });
    }

    // Removes the given snapshot.
    deleteSnapshot(snapshot) {
        assert.object(snapshot);
        this.#snapshots.splice(this.#snapshots.indexOf(snapshot), 1);
    }

    // Restores the given snapshot into this simulation. Caller must have checked engine.canRestoreStateSnapshot().
    restoreSnapshot(snapshot) {
        assert.object(snapshot);
        this.#engine.restoreStateSnapshot(snapshot.state);
        this.updateMarks();
    }

    // Ticks the current simulation for the given amount of ticks.
    // Returns 1 if a break-on-conflict fired mid-run, 0 otherwise.
    tick(ticks) {
        assert.integer(ticks);
        return this.#engine.simulate(ticks);
    }

    // Steps to the next output flip of any clock, at most maxTicks ticks. Returns { ticks, flipped, broke }.
    // Truthy ignoreBreaks ignores all breakpoints (conflict/condition) while stepping.
    stepToClockFlip(maxTicks = 1000000, ignoreBreaks = false) {
        assert.integer(maxTicks);
        return this.#engine.stepToClockFlip(maxTicks, ignoreBreaks);
    }

    // Returns whether the simulation includes the given circuit.
    includes(circuit) {
        assert.class(Circuit, circuit);
        return this.#netList.instances.some((i) => i.circuit === circuit);
    }

    // Attach simulation to its root circuit.
    attach() {
        this.checkDirty(false);
        this.#circuit.attachSimulation(this.#netList, 0);
        this.#instanceId = 0;
        this.updateMarks();
        this.#app.grid.simulationOverlay.setLabel(this.#circuit.label);
        this.#app.grid.markSimulationRecompiled();
        this.#attached = true;
    }

    // Detach simulation.
    detach() {
        this.#app.grid.circuit.detachSimulation();
        this.#app.grid.simulationOverlay.setLabel(null);
        this.#app.grid.markSimulationRecompiled();
        this.#attached = false;
    }

    // Compiles the simulation.
    #compile() {
        this.#netList = NetList.identify(this.#circuit, this.#app.circuits.all);
        const config = this.#app.config;
        const [ engine, retained ] = this.#netList.compileSimulation(this.#engine ?? null, {
            debug:              config.debugCompileComments,
            checkNetConflicts:  config.checkNetConflicts,
            breakOnConflict:    config.breakOnConflict,
            breakConditions:    config.breakOnCondition ? config.breakConditions : [],
            backend:            config.simulationBackend,
            targetTPS:          config.targetTPS,
        });
        this.#engine = engine;
        if (!retained) {
            this.#computeCircuitStats();
        }
        this.#dirty = false;
    }

    // Computes circuit statistics
    #computeCircuitStats() {
        let gates = 0;
        for (const instance of values(this.#netList.instances)) {
            for (const item of instance.circuit.items) {
                if (item instanceof Gate) {
                    gates += 1;
                } else if (item instanceof Builtin) {
                    gates += item.gates;
                }
            }
        }
        const netDepth = this.#netList.statsLongestSignalPath.length; // depth in nets, gates sit between nets, so we have to subtract 1 to get gate propagations
        this.#stats = { nets: this.#netList.statsCompiledNets ?? this.#netList.nets.length, gates, maxDelay: Math.max(0, netDepth - 1) };
    }
}