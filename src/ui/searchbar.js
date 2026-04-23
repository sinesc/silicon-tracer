"use strict";

// Search bar for finding components in and across circuits.
class SearchBar {

    #app;
    #gridElement;
    #element;
    #input;
    #resultsSection;
    #gridMatchCount;
    #libsBtn;
    #debounceTimer = null;
    #matches = [];                  // matched GridItems in the current circuit
    #matchIndex = -1;               // index into #matches; -1 = no item selected yet
    #selectedItem = null;           // GridItem currently marked as selected for navigation
    #highlightedItems = new Set();  // all currently highlighted GridItems (for efficient clear)
    #includeLibs = false;
    #visible = false;

    constructor(app, parentNode) {
        assert.class(Application, app);
        assert.class(Node, parentNode);
        this.#app = app;
        this.#gridElement = parentNode;
        this.#build();
    }

    get visible() {
        return this.#visible;
    }

    open() {
        if (this.#visible) return;
        this.#visible = true;
        this.#element.classList.remove('hidden');
        this.#input.focus();
        this.#input.select();
        this.#runSearch();
    }

    close() {
        this.#input.value = '';
        if (!this.#visible) return;
        this.#visible = false;
        this.#element.classList.add('hidden');
        this.#clearAll();
    }

    toggle() {
        if (this.#visible) {
            this.close();
        } else {
            this.open();
        }
    }

    #build() {
        this.#element = html(null, 'div', 'search-bar hidden');
        const row = html(this.#element, 'div', 'search-bar-row');

        this.#input = document.createElement('input');
        this.#input.type = 'text';
        this.#input.className = 'search-bar-input';
        this.#input.placeholder = 'Search components, hover for hotkeys\u2026';
        row.appendChild(this.#input);

        const prevBtn = html(row, 'button', 'search-bar-btn', '\u2B06');
        const nextBtn = html(row, 'button', 'search-bar-btn', '\u2B07');
        this.#libsBtn = html(row, 'button', 'search-bar-btn', '\u2699');

        const setHover = (el, msg) => {
            el.addEventListener('mouseenter', () => this.#app.setStatus(msg));
            el.addEventListener('mouseleave', () => this.#app.setStatus(null));
        };
        setHover(prevBtn, '<i>SHIFT+TAB</i> Go to previous grid match.');
        setHover(nextBtn, '<i>TAB</i> Go to next grid match.');
        setHover(this.#input, '<i>TAB/SHIFT+TAB</i> Navigate grid matches, <i>CURSOR UP/DOWN</i> Navigate list results, <i>ENTER</i> Go to circuit/instance or edit, <i>ESC</i> Close search bar.');
        setHover(this.#libsBtn, 'Include library circuits in search');

        this.#gridMatchCount = html(this.#element, 'div', 'search-bar-grid-count hidden');
        this.#resultsSection = html(this.#element, 'div', 'search-bar-results');
        this.#gridElement.appendChild(this.#element);

        this.#element.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
        this.#element.addEventListener('mousedown', (e) => e.stopPropagation());

        document.addEventListener('mousedown', (e) => {
            if (this.#visible && !this.#element.contains(e.target)) this.close();
        }, { capture: true });

        this.#input.oninput = () => {
            clearTimeout(this.#debounceTimer);
            this.#debounceTimer = setTimeout(() => this.#runSearch(), 100);
        };

        this.#input.addEventListener('keydown', (e) => this.#onInputKeydown(e));
        this.#resultsSection.addEventListener('keydown', (e) => this.#onResultsKeydown(e));
        this.#resultsSection.addEventListener('click', (e) => this.#onResultClick(e));

        prevBtn.onclick = () => {
            this.#navigate(-1);
            this.#input.focus();
        };
        nextBtn.onclick = () => {
            this.#navigate(1);
            this.#input.focus();
        };
        this.#libsBtn.onclick = () => {
            this.#includeLibs = !this.#includeLibs;
            this.#libsBtn.classList.toggle('search-bar-libs-active', this.#includeLibs);
            this.#runSearch();
            this.#input.focus();
        };
    }

    // Input navigation.
    #onInputKeydown(e) {
        e.stopPropagation();
        if (e.key === 'Escape') {
            this.close();
            e.preventDefault();
        } else if (e.key === 'f' && e.ctrlKey) {
            this.toggle();
            e.preventDefault();
        } else if (e.key === 'Enter') {
            this.#activateSelected();
            e.preventDefault();
        } else if (e.key === 'Tab') {
            this.#navigate(e.shiftKey ? -1 : 1);
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            const first = this.#resultsSection.querySelector('[data-uid]');
            if (first) {
                first.focus();
                e.preventDefault();
            }
        }
    }

    // Keyboard navigation within the results list.
    #onResultsKeydown(e) {
        e.stopPropagation();
        const item = e.target.closest('[data-uid]');
        if (!item) return;
        if (e.key === 'Tab') {
            this.#navigate(e.shiftKey ? -1 : 1);
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            const next = item.nextElementSibling;
            if (next) {
                next.focus();
            } else {
                this.#input.focus();
            }
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            const prev = item.previousElementSibling;
            if (prev) {
                prev.focus();
            } else {
                this.#input.focus();
            }
            e.preventDefault();
        } else if (e.key === 'Enter') {
            item.click();
            e.preventDefault();
        } else if (e.key === 'Escape') {
            this.close();
            e.preventDefault();
        }
    }

    #onResultClick(e) {
        const item = e.target.closest('[data-uid]');
        if (!item) return;
        const uid = item.dataset.uid;
        this.#app.circuits.select(uid);
        this.#app.simulations.select(this.#app.circuits.current, this.#app.config.autoCompile);
        this.#app.history.record();
        // Re-apply search after the circuit has switched, then restore focus.
        setTimeout(() => {
            this.#runSearch();
            this.#input.focus();
        }, 0);
    }

    #resetState() {
        clearTimeout(this.#debounceTimer);
        this.#debounceTimer = null;
        for (const item of this.#highlightedItems) {
            item.highlighted = false;
        }
        this.#highlightedItems.clear();
        if (this.#selectedItem) {
            this.#selectedItem.selected = false;
            this.#selectedItem = null;
        }
        this.#matches = [];
        this.#matchIndex = -1;
    }

    #clearAll() {
        this.#resetState();
        this.#resultsSection.innerHTML = '';
        this.#gridMatchCount.classList.add('hidden');
        this.#gridMatchCount.textContent = '';
    }

    #collectResults(query) {
        const currentCircuit = this.#app.grid.circuit;
        const labelResults = []; // { uid, label } -> circuit label matches query
        const itemResults  = []; // { uid, label, count } -> circuit has matching items (label didn't match)
        for (const [uid, circuit] of Object.entries(this.#app.circuits.all)) {
            if (circuit.lid !== null && !this.#includeLibs) continue;
            const isCurrent = circuit === currentCircuit;
            let count = 0;
            for (const item of circuit.items) {
                if (item.match(query)) {
                    count++;
                    if (isCurrent) {
                        item.highlighted = true;
                        this.#highlightedItems.add(item);
                        this.#matches.push(item);
                    }
                }
            }
            if (!isCurrent) {
                if (circuit.label.toLowerCase().includes(query)) {
                    labelResults.push({ uid, label: circuit.label });
                } else if (count > 0) {
                    itemResults.push({ uid, label: circuit.label, count });
                }
            }
        }
        return { labelResults, itemResults };
    }

    #updateGridMatchCount(n) {
        if (n > 0) {
            this.#gridMatchCount.textContent = `${n} matching component${n === 1 ? '' : 's'} on this circuit`;
            this.#gridMatchCount.classList.remove('hidden');
        } else {
            this.#gridMatchCount.textContent = '';
            this.#gridMatchCount.classList.add('hidden');
        }
    }

    #renderResults(labelResults, itemResults) {
        if (labelResults.length === 0 && itemResults.length === 0) {
            this.#resultsSection.innerHTML = '';
            return;
        }
        labelResults.sort((a, b) => a.label.localeCompare(b.label));
        itemResults.sort((a, b) => a.label.localeCompare(b.label));
        const labelHtml = labelResults.map(({ uid, label }) =>
            `<div class="search-bar-circuit-item" data-uid="${uid}" tabindex="0">${label} <span class="search-bar-count">(label matches)</span></div>`
        ).join('');
        const itemHtml = itemResults.map(({ uid, label, count }) =>
            `<div class="search-bar-circuit-item" data-uid="${uid}" tabindex="0">${label} <span class="search-bar-count">(${count} components match)</span></div>`
        ).join('');
        this.#resultsSection.innerHTML = labelHtml + itemHtml;
    }

    #runSearch() {
        this.#resetState();
        const query = this.#input.value.trim().toLowerCase();
        if (!query) {
            this.#resultsSection.innerHTML = '';
            this.#gridMatchCount.classList.add('hidden');
            this.#gridMatchCount.textContent = '';
            return;
        }
        const { labelResults, itemResults } = this.#collectResults(query);
        this.#updateGridMatchCount(this.#matches.length);
        this.#renderResults(labelResults, itemResults);
    }

    #activateSelected() {
        if (!this.#selectedItem) return;
        if (this.#selectedItem instanceof CustomComponent) {
            const sim = this.#app.simulations.current;
            if (sim && this.#selectedItem.instanceId !== null) {
                sim.reattach(this.#selectedItem.instanceId);
            } else {
                this.#app.circuits.select(this.#selectedItem.uid);
                const circuit = this.#app.circuits.byUID(this.#selectedItem.uid);
                this.#app.simulations.select(circuit, this.#app.config.autoCompile);
                this.#app.history.record();
            }
        } else {
            this.#selectedItem.onEdit();
        }
    }

    #navigate(direction) {
        if (this.#matches.length === 0) return;
        if (this.#selectedItem) {
            this.#selectedItem.selected = false;
        }
        if (this.#matchIndex === -1) {
            // First press: start at beginning or end depending on direction.
            this.#matchIndex = direction > 0 ? 0 : this.#matches.length - 1;
        } else {
            this.#matchIndex = (this.#matchIndex + direction + this.#matches.length) % this.#matches.length;
        }
        this.#selectedItem = this.#matches[this.#matchIndex];
        this.#selectedItem.selected = true;
        this.#panToItem(this.#selectedItem);
    }

    // Pans the grid to bring item into the visible area if it is outside it.
    #panToItem(item) {
        const gw = this.#gridElement.offsetWidth;
        const gh = this.#gridElement.offsetHeight;
        const zoom = this.#app.grid.zoom;
        const cx = item.x + item.width / 2;
        const cy = item.y + item.height / 2;
        const sx = (cx + this.#app.grid.offsetX) * zoom;
        const sy = (cy + this.#app.grid.offsetY) * zoom;
        const margin = Grid.SPACING * 4 * zoom;
        if (sx < margin || sx > gw - margin || sy < margin || sy > gh - margin) {
            this.#app.grid.offsetX = gw / (2 * zoom) - cx;
            this.#app.grid.offsetY = gh / (2 * zoom) - cy;
        }
    }
}
