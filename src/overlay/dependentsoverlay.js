"use strict";

// Overlay section listing circuits that directly or indirectly depend on the current circuit.
class DependentsOverlay extends Overlay {
    #lastHtml = undefined;
    #cachedHtml = null;

    #buildHtml() {
        const circuit = this.app.grid.circuit;
        if (!circuit) return '';
        const dependentUids = this.app.circuits.circuitDependents(circuit.uid);
        if (dependentUids.size === 0) return '';
        const items = [...dependentUids]
            .map((uid) => ({ uid, label: this.app.circuits.byUID(uid).label }))
            .sort((a, b) => a.label.localeCompare(b.label))
            .map(({ uid, label }) => `<div class="info-details dependents-item" data-uid="${uid}">${label}</div>`)
            .join('');
        return `<div class="info-section">Used by</div><div class="dependents-list">${items}</div>`;
    }

    dirty() {
        this.#cachedHtml = this.#buildHtml();
        return this.#cachedHtml !== this.#lastHtml;
    }

    render(node) {
        const html = this.#cachedHtml ?? this.#buildHtml();
        this.#cachedHtml = null;
        this.#lastHtml = html;
        const prev = node.querySelector('.dependents-list');
        const scrollTop = prev ? prev.scrollTop : 0;
        node.innerHTML = html;
        const next = node.querySelector('.dependents-list');
        if (next) {
            next.scrollTop = scrollTop;
            next.onclick = (e) => {
                const item = e.target.closest('[data-uid]');
                if (!item) return;
                Action.selectCircuit(this.app, item.dataset.uid);
            };
        }
    }
}
