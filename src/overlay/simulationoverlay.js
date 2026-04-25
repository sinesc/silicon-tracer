"use strict";

// Overlay section displaying simulation label and performance stats.
class SimulationOverlay extends Overlay {
    #label = null;
    #lastHtml = undefined;
    #cachedHtml = null;

    setLabel(label) {
        this.#label = label;
    }

    #computeHtml() {
        const stats = this.app.stats;
        const load = Math.round(stats.load * 100);
        const loadClass = stats.load >= stats.loadLimit ? 'warning' : '';
        const details = `<span class="${loadClass}">${load}%</span> core load<br>${stats.fps} frames/s`;
        if (!this.app.simulations.current) {
            return `<div class="info-details">${details}</div>`;
        } else {
            const simStats = this.app.simulations.current.stats;
            const ticks = `${Number.formatSI(this.app.config.targetTPS)} ticks/s limit<br>${Number.formatSI(Math.round(stats.tps))} ticks/s actual<br>`;
            const simDetails = `Gates: ${simStats.gates}<br>Nets: ${simStats.nets}<br>Max delay: ${simStats.maxDelay}<br>`;
            const isLocked = this.app.config.lockSimulation ? '<span class="warning">Locked</span> ' : '';
            const singleStep = this.app.config.singleStep ? '<span class="warning">Single Step</span> ' : '';
            return `<div class="info-section">${singleStep}${isLocked}Simulation</div><div class="info-title">${this.#label}</div><div class="info-details">${simDetails}${ticks}${details}</div>`;
        }
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
