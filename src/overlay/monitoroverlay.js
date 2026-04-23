"use strict";

// Overlay section displaying live probe values from the active simulation.
class MonitorOverlay extends Overlay {
    static #MSG_UNNAMED_PROBE = 'Cannot monitor unnamed probe, please set a name';
    #monitor = [];
    #monitorsBySimUid = new Map();
    #lastHtml = undefined;
    #cachedHtml = null;

    // Adds/removes a probe from the monitor list.
    toggleProbe(probe) {
        assert.class(Probe, probe);
        if (!probe.name) {
            this.app.showNotice(MonitorOverlay.#MSG_UNNAMED_PROBE);
            return;
        }
        const probeName = probe.instanceId != null && probe.instanceId !== 0
            ? `${probe.name}@${probe.instanceId}` : probe.name;
        const idx = this.#monitor.findIndex(m => m.probeName === probeName);
        if (idx >= 0) {
            this.#monitor.splice(idx, 1);
        } else {
            this.#monitor.push({ probeName, probe });
        }
    }

    // Adds all instances of the named probe to the list.
    addProbesByName(probeName) {
        assert.string(probeName);
        if (!probeName) {
            this.app.showNotice(MonitorOverlay.#MSG_UNNAMED_PROBE);
            return;
        }
        const items = this.#probeInstances(probeName) ?? [];
        const existing = new Set(this.#monitor.map(m => m.probeName));
        this.#monitor.push(...items.filter(item => !existing.has(item.probeName)));
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

    // Re-resolves probe references after a simulation recompile. Called by Grid.markSimulationRecompiled().
    refresh() {
        if (this.#monitor.length === 0) return;
        if (!this.app.simulations.current) {
            this.#monitor = [];
        } else {
            this.#monitor = this.#monitor
                .map(({ probeName }) => ({ probeName, probe: this.#findProbeByDisplayName(probeName) }))
                .filter(({ probe }) => probe !== null);
        }
    }

    // Returns all probe instances matching the given base name across all circuit instances.
    // Each entry has { probeName, probe } where probeName includes the @instanceId suffix when non-root.
    #probeInstances(baseName) {
        if (!this.app.simulations.current) return [];
        const instances = this.app.simulations.current.instances;
        const result = [];
        for (const [instanceId, { circuit }] of instances.entries()) {
            const probe = circuit.items.find(i => i instanceof Probe && i.name === baseName);
            if (probe) {
                const probeName = instanceId !== 0 ? `${baseName}@${instanceId}` : baseName;
                result.push({ probeName, probe });
            }
        }
        return result;
    }

    // Resolves a probe display name (e.g. "myprobe@3") back to its Probe instance, or null if not found.
    #findProbeByDisplayName(displayName) {
        assert.string(displayName);
        if (!this.app.simulations.current) return null;
        const atIdx = displayName.lastIndexOf('@');
        const baseName = atIdx >= 0 ? displayName.slice(0, atIdx) : displayName;
        const instanceId = atIdx >= 0 ? Number(displayName.slice(atIdx + 1)) : 0;
        const instance = this.app.simulations.current.instances[instanceId];
        if (!instance) return null;
        return instance.circuit.items.find(i => i instanceof Probe && i.name === baseName) ?? null;
    }

    #buildHtml() {
        if (this.#monitor.length === 0) return '';
        const sim = this.app.simulations.current;
        return '<div class="info-section">Monitor</div>' +
            this.#monitor.map(({ probeName, probe }) =>
                `<div class="info-details">${probeName}: ${sim ? Probe.getDisplayValue(sim.engine, probeName, probe.displayFormat) : '~'}</div>`
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
