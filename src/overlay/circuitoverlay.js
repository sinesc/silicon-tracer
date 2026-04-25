"use strict";

// Overlay section displaying circuit name, instance ID, and stats.
class CircuitOverlay extends Overlay {
    #label = null;
    #instanceId = null;
    #lastHtml = undefined;
    #cachedHtml = null;

    setLabel(label) {
        this.#label = label;
    }

    setInstanceId(instanceId) {
        assert.integer(instanceId, true);
        this.#instanceId = instanceId;
    }

    #computeHtml() {
        const isReadonly = this.app.grid.readonly ? '<span class="warning">Read-only</span> ' : '';
        const suffix = this.#instanceId != null && this.#instanceId !== 0 ? `@${this.#instanceId}` : '';
        const sim = this.app.simulations.current;
        const istats = sim ? sim.instanceStats(this.#instanceId ?? 0) : null;
        const details = istats ? `Gates: ${istats.gates}<br>Nets: ${istats.nets}` : null;
        return `<div class="info-section">${isReadonly}Circuit</div><div class="info-title">${this.#label ?? ''}${suffix}</div>` +
            (!details ? '' : `<div class="info-details">${details}</div>`);
    }

    dirty() {
        this.#cachedHtml = this.#computeHtml();
        return this.#cachedHtml !== this.#lastHtml;
    }

    render(node) {
        const html = this.#cachedHtml ?? this.#computeHtml();
        this.#cachedHtml = null;
        this.#lastHtml = html;
        node.innerHTML = html;
    }
}
