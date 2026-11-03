"use strict";

// Overlay section listing pinned grid items across all circuits. Clicking an entry opens the containing circuit on the grid (as the matching simulation instance if part of the current simulation), hovering highlights the item if it's currently displayed.
class PinsOverlay extends Overlay {
    #pins = [];           // Entries: { circuitUid, gid, instanceId (nullable: attached simulation instance id at pin time) }.
    #lastHtml = undefined;
    #cachedHtml = null;

    // Adds or removes the given grid item from the pin list.
    togglePin(item) {
        assert.class(GridItem, item);
        if (!item.grid) return;
        const existing = this.#pins.findIndex((p) => p.gid === item.gid);
        if (existing >= 0) {
            this.#pins.splice(existing, 1);
            return;
        }
        const circuit = item.grid.circuit;
        const sim = this.app.simulations.current;
        // capture the attached simulation instance if the item's circuit is the simulation instance currently shown on the grid
        const instanceId = sim && sim.instances[sim.instanceId] && sim.instances[sim.instanceId].circuit === circuit ? sim.instanceId : null;
        this.#pins.push({ circuitUid: circuit.uid, gid: item.gid, instanceId });
    }

    // Re-validates instance ids after a simulation recompile. Called by Grid.markSimulationRecompiled().
    refresh() {
        const sim = this.app.simulations.current;
        for (const entry of this.#pins) {
            if (entry.instanceId === null) continue;
            if (!sim || !sim.instances[entry.instanceId] || sim.instances[entry.instanceId].circuit.uid !== entry.circuitUid) {
                // instance id went stale: fall back to first instance with a matching circuit, else drop instance association
                entry.instanceId = sim ? sim.instances.findIndex((i) => i && i.circuit.uid === entry.circuitUid) : -1;
                if (entry.instanceId < 0) entry.instanceId = null;
            }
        }
    }

    // Resolves a pin entry to { circuit, item } or null if the circuit or item is gone.
    #resolve(entry) {
        const circuit = this.app.circuits.byUID(entry.circuitUid);
        if (!circuit) return null;
        const item = circuit.itemByGID(entry.gid);
        return item ? { circuit, item } : null;
    }

    // Opens the circuit containing the pinned item on the grid, reattaching the simulation to the matching instance if possible.
    #openPin(entry) {
        assert.object(entry);
        if (!this.#resolve(entry)) return;
        const sim = this.app.simulations.current;
        if (sim) {
            let instanceId = entry.instanceId;
            if (instanceId === null || !sim.instances[instanceId] || sim.instances[instanceId].circuit.uid !== entry.circuitUid) {
                instanceId = sim.instances.findIndex((i) => i && i.circuit.uid === entry.circuitUid);
            }
            if (instanceId >= 0) {
                sim.reattach(instanceId);
                return;
            }
        }
        this.app.circuits.select(entry.circuitUid);
    }

    // Highlights/unhighlights the item of the entry at the given index if it is currently on the grid.
    #setHovered(index, status) {
        const entry = this.#pins[index];
        if (!entry) return;
        const resolved = this.#resolve(entry);
        if (!resolved || !resolved.item.grid) return;
        if (resolved.item instanceof Component || resolved.item instanceof Wire) {
            resolved.item.highlighted = status;
        }
    }

    // Returns the display label for an item, e.g. "Memory ROM" or "Wire".
    #itemLabel(item) {
        const type = item.typeLabel ?? item.constructor.name;
        const name = item.name ? ` <b>${item.name}</b>` : '';
        return `${type}${name}`;
    }

    // Returns the display label of the entry's containing circuit/instance, e.g. "ALU@7".
    #contextLabel(entry, circuit) {
        const sim = this.app.simulations.current;
        if (entry.instanceId !== null && entry.instanceId !== 0 && sim && sim.instances[entry.instanceId] && sim.instances[entry.instanceId].circuit.uid === entry.circuitUid) {
            return `${circuit.label}@${entry.instanceId}`;
        }
        return circuit.label;
    }

    #buildHtml() {
        // drop pins whose circuit or item no longer exists
        this.#pins = this.#pins.filter((entry) => this.#resolve(entry) !== null);
        if (this.#pins.length === 0) return '';
        return '<div class="info-section">Pinned</div>' +
            this.#pins.map((entry, i) => {
                const resolved = this.#resolve(entry);
                return `<div class="info-details pin-item" data-idx="${i}">${this.#itemLabel(resolved.item)} <span class="pin-context">${this.#contextLabel(entry, resolved.circuit)}</span><span class="pin-unpin" title="Unpin" data-idx="${i}">&#x2715;</span></div>`;
            }).join('');
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
        node.onclick = (e) => {
            const unpin = e.target.closest('.pin-unpin');
            if (unpin) {
                const idx = Number(unpin.dataset.idx);
                if (this.#pins[idx]) this.#pins.splice(idx, 1);
                return;
            }
            const row = e.target.closest('.pin-item');
            if (row && this.#pins[Number(row.dataset.idx)]) {
                this.#openPin(this.#pins[Number(row.dataset.idx)]);
            }
        };
        node.onmouseover = (e) => {
            const row = e.target.closest('.pin-item');
            if (row) this.#setHovered(Number(row.dataset.idx), true);
        };
        node.onmouseout = (e) => {
            const row = e.target.closest('.pin-item');
            if (row) this.#setHovered(Number(row.dataset.idx), false);
        };
    }
}
