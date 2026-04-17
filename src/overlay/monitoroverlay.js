"use strict";

// Overlay section displaying live probe values from the active simulation.
class MonitorOverlay extends Overlay {
    #monitor = [];
    #monitorsBySimUid = new Map();
    #lastHtml = undefined;
    #cachedHtml = null;

    // Toggles a probe in the monitor list. Adds it if absent, removes it if present.
    toggleItem(probe) {
        assert.class(Probe, probe);
        const probeName = probe.instanceId != null && probe.instanceId !== 0
            ? `${probe.name}@${probe.instanceId}` : probe.name;
        const idx = this.#monitor.findIndex(m => m.probeName === probeName);
        if (idx >= 0) {
            this.#monitor.splice(idx, 1);
        } else {
            this.#monitor.push({ probeName, probe });
        }
    }

    // Replaces the monitor list with the given items (Array<{ probeName, probe }>).
    setItems(items) {
        this.#monitor = items;
    }

    // Saves the monitor for oldUid and restores the saved monitor for newUid (or empty if none).
    switchContext(oldUid, newUid) {
        assert.string(oldUid, true);
        assert.string(newUid, true);
        if (oldUid !== null) this.#monitorsBySimUid.set(oldUid, this.#monitor);
        this.#monitor = (newUid !== null ? this.#monitorsBySimUid.get(newUid) : null) ?? [];
    }

    // Removes saved monitor state for a deleted simulation.
    clearSaved(uid) {
        assert.string(uid);
        this.#monitorsBySimUid.delete(uid);
    }

    // Re-resolves probe references after a simulation recompile. Called by Grid.onSimulationRecompiled().
    refresh() {
        if (this.#monitor.length === 0) return;
        const sim = this.app.simulations.current;
        if (!sim) {
            this.#monitor = [];
        } else {
            this.#monitor = this.#monitor
                .map(({ probeName }) => ({ probeName, probe: sim.findProbeByDisplayName(probeName) }))
                .filter(({ probe }) => probe !== null);
        }
    }

    #buildHtml() {
        if (this.#monitor.length === 0) return '';
        const sim = this.app.simulations.current;
        return '<div class="info-section">Monitor</div>' +
            this.#monitor.map(({ probeName, probe }) =>
                `<div class="info-details">${probeName}: ${sim ? Probe.getProbeLabel(sim.engine, probeName, probe.displayFormat) : '~'}</div>`
            ).join('');
    }

    dirty() {
        this.#cachedHtml = this.#buildHtml();
        return this.#cachedHtml !== this.#lastHtml;
    }

    render(node) {
        const html = this.#cachedHtml ?? this.#buildHtml();
        this.#cachedHtml = null;
        this.#lastHtml = html;
        node.innerHTML = html;
    }
}
