"use strict";

// Overlay section displaying a hierarchical tree of all circuit instances in the current simulation.
class GraphOverlay extends Overlay {
    #lastHtml = undefined;
    #cachedHtml = null;

    #setHovered(instanceId) {
        const sim = this.app.simulations.current;
        if (!sim) return;
        const circuit = sim.instances[sim.instanceId]?.circuit;
        if (!circuit) return;
        for (const item of circuit.items) {
            if (item instanceof CustomComponent) {
                item.highlighted = item.instanceId === instanceId;
            }
        }
    }

    #buildTree(instances, instanceId, activeInstanceId) {
        const instance = instances[instanceId];
        if (!instance) return '';
        // Circuits with an export name are shown as opaque; their sub-instances are hidden.
        if (instanceId !== 0 && instance.circuit.exportName) return '';
        const label = `${instance.circuit.label}@${instanceId}`;
        const active = instanceId === activeInstanceId ? ' class="graph-tree-active"' : '';
        let childrenHtml = '';
        for (let id = 0; id < instances.length; id++) {
            if (instances[id] && instances[id].parentInstanceId === instanceId) {
                childrenHtml += this.#buildTree(instances, id, activeInstanceId);
            }
        }
        return `<li${active} data-iid="${instanceId}">${label}${childrenHtml ? `<ul>${childrenHtml}</ul>` : ''}</li>`;
    }

    #buildHtml() {
        const sim = this.app.simulations.current;
        if (!sim) return '';
        const instances = sim.instances;
        if (!instances || instances.length <= 1) return '';
        const tree = this.#buildTree(instances, 0, sim.instanceId);
        return `<div class="info-section">Simulation graph</div>` +
            `<div class="graph-tree"><ul>${tree}</ul></div>`;
    }

    dirty() {
        this.#cachedHtml = this.#buildHtml();
        return this.#cachedHtml !== this.#lastHtml;
    }

    render(node) {
        const html = this.#cachedHtml ?? this.#buildHtml();
        this.#cachedHtml = null;
        this.#lastHtml = html;
        const prev = node.querySelector('.graph-tree');
        const scrollTop = prev ? prev.scrollTop : 0;
        node.innerHTML = html;
        const next = node.querySelector('.graph-tree');
        if (next) {
            next.scrollTop = scrollTop;
            next.onclick = (e) => {
                const li = e.target.closest('li[data-iid]');
                if (li) this.app.simulations.current?.reattach(Number(li.dataset.iid));
            };
            next.onmouseover = (e) => {
                const li = e.target.closest('li[data-iid]');
                if (li) this.#setHovered(Number(li.dataset.iid));
            };
            next.onmouseout = (e) => {
                const li = e.target.closest('li[data-iid]');
                if (li) this.#setHovered(null);
            };
        }
    }
}
