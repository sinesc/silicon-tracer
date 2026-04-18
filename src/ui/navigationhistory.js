"use strict";

// Browser circuit navigation history.
class NavigationHistory {

    #app;
    // Unique to this page session so we ignore stale entries from prior sessions.
    #sessionId;
    // Position counter embedded in every pushed state, exit sentinel at -1.
    #pos = 0;
    // Highest pos ever pushed in this session (decreases when user pushes after going back).
    #maxPos = 0;
    // True while we are restoring a history entry - suppresses re-recording.
    #navigating = false;
    // True for one popstate cycle after we call history.go() to undo a skip-that-went-nowhere.
    #undoing = false;

    constructor(app) {
        assert.class(Application, app);
        this.#app = app;
        window.addEventListener('popstate', this.#onPopState.bind(this));
    }

    // Starts a new session and pushes a sentinel entry followed by the current app state.
    init() {
        this.#sessionId = crypto.randomUUID();
        this.#pos = 0;
        this.#maxPos = 0;
        history.pushState({ sessionId: this.#sessionId, sentinel: true, pos: -1 }, '');
        history.pushState(this.#buildState(), '');
    }

    // Returns true if we are currently restoring from a history entry.
    get navigating() {
        return this.#navigating;
    }

    // Pushes the current app state as a new browser history entry. No-op during history restoration.
    record() {
        if (this.#navigating) return;
        this.#pos++;
        this.#maxPos = this.#pos;
        history.pushState(this.#buildState(), '');
    }

    // Builds a state snapshot from the current app state.
    #buildState() {
        const sim = this.#app.simulations.current;
        return {
            sessionId: this.#sessionId,
            circuitUid: this.#app.grid.circuit.uid,
            simulationUid: sim?.uid ?? null,
            instanceId: sim?.instanceId ?? null,
            pos: this.#pos,
        };
    }

    // Handles browser back/forward navigation.
    #onPopState(event) {
        if (this.#undoing) {
            this.#undoing = false;
            return;
        }
        // Auto-skip entries from other sessions or non-app history entries.
        const state = event.state;
        if (!state || state.sessionId !== this.#sessionId) {
            history.go(-1);
            return;
        }
        // Sentinel - warn the user they are about to navigate out of the application.
        if (state.sentinel) {
            this.#pos = -1;
            this.#app.showNotice('You are about to navigate out of the application.');
            return;
        }

        const direction = state.pos < this.#pos ? -1 : 1;
        this.#pos = state.pos;

        if (this.#restore(state)) return;

        // Circuit was deleted - try to skip to the next entry in the same direction.
        this.#app.showNotice('Skipped deleted circuit.');
        const nextPos = this.#pos + direction;
        if (nextPos < -1 || nextPos > this.#maxPos) {
            // No more of our own entries in this direction - undo the navigation.
            this.#undoing = true;
            history.go(-direction);
        } else {
            history.go(direction);
        }
    }

    // Attempts to restores the app to the given history state and returns success.
    #restore(state) {
        if (!this.#app.circuits.byUID(state.circuitUid)) return false;
        this.#navigating = true;
        try {
            if (state.simulationUid !== null) {
                const simRootCircuit = this.#app.circuits.byUID(state.simulationUid);
                if (simRootCircuit) {
                    // Restore the simulation and navigate to the correct instance.
                    this.#app.circuits.select(state.simulationUid);
                    const sim = this.#app.simulations.select(this.#app.circuits.current, true, true);
                    if (state.instanceId !== null && state.instanceId !== 0) {
                        try {
                            sim.reattach(state.instanceId);
                        } catch {
                            // Instance no longer exists after recompile - remain at root.
                        }
                    }
                } else {
                    // Simulation root was deleted - show the circuit without a simulation.
                    this.#app.circuits.select(state.circuitUid);
                    this.#app.simulations.select(null);
                }
            } else {
                this.#app.circuits.select(state.circuitUid);
                this.#app.simulations.select(null);
            }
        } finally {
            this.#navigating = false;
        }
        return true;
    }
}
