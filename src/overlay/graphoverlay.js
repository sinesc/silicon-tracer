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

    // Returns the set of instance ids on the path from the root down to (and including) the given instance.
    #pathToInstance(instances, instanceId) {
        const ids = new Set();
        for (let id = instanceId; id !== null && instances[id]; id = instances[id].parentInstanceId) {
            ids.add(id);
        }
        return ids;
    }

    #buildTree(instances, instanceId, activeInstanceId, pathIds) {
        const instance = instances[instanceId];
        if (!instance) return '';
        const onPath = pathIds.has(instanceId);
        // Circuits with an export name are shown as opaque; but the path to the active instance must stay visible.
        if (instanceId !== 0 && instance.circuit.exportName && !onPath) return '';
        const label = `${instance.circuit.label}@${instanceId}`;
        const active = instanceId === activeInstanceId ? ' class="graph-tree-active"' : '';
        let childrenHtml = '';
        // Show root children, one level below the active instance, and the path nodes in between.
        const showAllChildren = instanceId === 0 || instanceId === activeInstanceId;
        for (let id = 0; id < instances.length; id++) {
            if (instances[id] && instances[id].parentInstanceId === instanceId) {
                if (showAllChildren || pathIds.has(id)) {
                    childrenHtml += this.#buildTree(instances, id, activeInstanceId, pathIds);
                }
            }
        }
        return `<li${active} data-iid="${instanceId}">${label}${childrenHtml ? `<ul>${childrenHtml}</ul>` : ''}</li>`;
    }

    #buildHtml() {
        const sim = this.app.simulations.current;
        if (!sim) return '';
        const instances = sim.instances;
        if (!instances || instances.length <= 1) return '';
        const tree = this.#buildTree(instances, 0, sim.instanceId, this.#pathToInstance(instances, sim.instanceId));
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
