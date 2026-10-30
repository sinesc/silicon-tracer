"use strict";

// Returns the part name for a grid item, or null if the item is not a physical part.
// Non-exported custom components also return null here; countParts() recurses into them.
function partName(app, item) {
    assert.class(Application, app);
    assert.class(GridItem, item);
    if (item instanceof Gate) return `${item.type.toUpperCase()} (${item.inputs.length})`;
    if (item instanceof Builtin || item instanceof Memory) return item.topMarkings;
    if (item instanceof SegmentDisplay) return SegmentDisplay.TYPE_LABEL_LONG;
    if (item instanceof PullResistor) return `Pull-${item.direction} resistor`;
    if (item instanceof CustomComponent) return app.circuits.byUID(item.uid)?.exportName || null;
    return null;
}

// Counts physical parts of a circuit into counts (Map<part name, count>). Custom components
// without export name are counted by recursing into their sub-circuit.
// `path` holds the circuit UIDs of the current recursion branch and breaks reference cycles
// (a circuit that contains itself contributes nothing on the recursive path).
function countParts(app, circuit, counts = new Map(), path = new Set([ circuit.uid ])) {
    assert.class(Application, app);
    assert.class(Circuit, circuit);
    for (const item of circuit.items) {
        const name = partName(app, item);
        if (name !== null) {
            counts.set(name, (counts.get(name) ?? 0) + 1);
        } else if (item instanceof CustomComponent && !path.has(item.uid)) {
            const sub = app.circuits.byUID(item.uid);
            if (sub) countParts(app, sub, counts, new Set([ ...path, sub.uid ]));
        }
    }
    return counts;
}

// Overlay section listing the part counts of the circuit on the grid.
class PartsOverlay extends Overlay {
    #lastHtml = undefined;
    #cachedHtml = null;

    static #escape(text) {
        assert.string(text);
        return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    }

    #buildHtml() {
        const circuit = this.app.grid.circuit;
        if (!circuit) return '';
        const parts = [ ...countParts(this.app, circuit).entries() ]
            .sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
        if (parts.length === 0) return '';
        const total = parts.reduce((sum, [ , count ]) => sum + count, 0);
        const rows = parts.map(([ name, count ]) =>
            `<div class="info-details">${count}x ${PartsOverlay.#escape(name)}</div>`).join('');
        return `<div class="info-section">Parts (${total})</div><div class="parts-list">${rows}</div>`;
    }

    dirty() {
        this.#cachedHtml = this.#buildHtml();
        return this.#cachedHtml !== this.#lastHtml;
    }

    render(node) {
        const html = this.#cachedHtml ?? this.#buildHtml();
        this.#cachedHtml = null;
        this.#lastHtml = html;
        const prev = node.querySelector('.parts-list');
        const scrollTop = prev ? prev.scrollTop : 0;
        node.innerHTML = html;
        const next = node.querySelector('.parts-list');
        if (next) next.scrollTop = scrollTop;
    }
}
