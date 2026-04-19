"use strict";

// Browser circuit navigation history.
class NavigationHistory {

    #app;
    // Unique to this page session so we ignore stale entries from prior sessions.
    #sessionId;
    // True while we are restoring a history entry - suppresses re-recording.
    #navigating = false;
    // Back navigation ended on sentinel value, next forward navigation needs to go 2 forward
    #atSentinel = false;

    constructor(app) {
        assert.class(Application, app);
        this.#app = app;
        window.addEventListener('popstate', this.#onPopState.bind(this));
    }

    // Starts a new session and pushes a sentinel entry followed by the current app state.
    init() {
        this.#sessionId = crypto.randomUUID();
        history.pushState({ sessionId: this.#sessionId, sentinel: true }, '');
        history.pushState(this.#buildState(), '');
    }

    // Pushes the current app state as a new browser history entry. No-op during history restoration.
    record() {
        if (this.#navigating) return;
        this.#atSentinel = false;
        history.pushState(this.#buildState(), '');
    }

    // Handles browser back/forward navigation.
    #onPopState(event) {
        // Auto-skip entries from other sessions or non-app history entries.
        const state = event.state;
        if (!state || state.sessionId !== this.#sessionId) {
            history.go(-1); // direction: pushing init would have cleared any states 'forward' from here, so must be 'backward'
            return;
        }

        // currently on the sentinel entry, navigate forward twice ()
        if (this.#atSentinel) {
            this.#atSentinel = false;
            history.go(1); // direction: we know this is 'forwards' because the sentinel is the first value, 'backwards' would have left this page
            return
        }

        // Sentinel - warn the user they are about to navigate out of the application.
        if (state.sentinel) {
            this.#app.showNotice('Navigate back again to leave this page');
            this.#atSentinel = true;
            return;
        }

        // show message when circuit in history has since been deleted
        if (!this.#restore(state)) {
            this.#app.showNotice('Skipped deleted circuit.');
            history.go(-1); // direction: must be 'backwards' as deletion also triggers a push, clearing any remaining states that are 'forwards' from here
        }
    }

    // Builds a state snapshot from the current app state.
    #buildState() {
        const sim = this.#app.simulations.current;
        return {
            sessionId: this.#sessionId,
            circuitUid: this.#app.grid.circuit.uid,
            simulationUid: sim?.uid ?? null,
            instanceId: sim?.instanceId ?? null,
        };
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
