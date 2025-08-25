// Handles loading/saving/selecting circuits and keeping the grid updated.
class Circuits {

    #circuits = [];
    #currentCircuit = 0;
    #grid;

    constructor(grid) {
        this.#circuits.push({ label: this.#generateName(), data: [] });
        this.#grid = grid;
    }

    // Returns a list of loaded circuits.
    list() {
        return this.#circuits.map((c) => c.label);
    }

    // Clear all circuits and create a new empty circuit (always need one for the grid).
    clear() {
        this.#circuits = [ ];
        this.#circuits.push({ label: this.#generateName(), data: [] });
        this.#currentCircuit = 0;
        this.#grid.clear();
        this.#grid.render();
    }

    // Selects a circuit by index.
    select(newCircuitIndex) {
        this.#saveGrid();
        this.#setGrid(newCircuitIndex);
        this.#grid.render();
    }

    // Creates a new circuit.
    create() {
        this.#saveGrid();
        this.#grid.clear();
        this.#currentCircuit = this.#circuits.length;
        // TODO: need proper input component
        const name = prompt('Circuit name', this.#generateName()); // TBD: maybe not have the prompt here? but need public generateName then
        this.#circuits.push({ label: name, data: [] });
        this.#grid.render();
    }

    // Serializes loaded circuits for saving to file.
    serialize() {
        this.#saveGrid();
        return { version: 1, circuits: this.#circuits };
    }

    // Unserializes circuits from file.
    unserialize(content, append, filename) { // TODO: option not to append
        this.#saveGrid();
        this.#pruneEmpty();
        const newCircuitIndex = this.#circuits.length;
        if (typeof content.version === 'undefined') {
            // legacy: single circuit in file, name it from the filename, then switch to it
            this.#circuits.push({ label: this.#generateName(filename).replace(/\.stc$/, ''), data: content });
            this.#setGrid(newCircuitIndex);
        } else if (content.circuits.length > 0) {
            // multiple circuits, switch to first of them
            this.#circuits.push(...content.circuits);
            this.#setGrid(newCircuitIndex);
        }
        this.#grid.render();
    }

    // Returns whether at least one circuit is non-empty.
    haveNonEmpty() {
        this.#saveGrid();
        for (let circuit of this.#circuits) {
            if (circuit.data.length > 1 || circuit.data.filter((i) => i['_']['c'] !== 'Grid').length > 0) {
                return true;
            }
        }
        return false;
    }

    // Returns a generated name if the given name is empty.
    #generateName(name) {
        return name || 'New circuit #' + (this.#circuits.length + 1);
    }

    // Saves current grid contents to current circuit.
    #saveGrid() {
        if (this.#currentCircuit !== -1) {
            this.#circuits[this.#currentCircuit].data = this.#grid.serialize();
        }
    }

    // Replaces the current grid contents with the given circuit. Does NOT save current contents.
    #setGrid(newCircuit) {
        this.#grid.clear();
        this.#grid.unserialize(this.#circuits[newCircuit].data);
        this.#currentCircuit = newCircuit;
    }

    // Prunes empty circuits (app starts with one empty circuit and loading appends by default, so the empty circuit should be pruned).
    #pruneEmpty() {
        for (let i = this.#circuits.length - 1; i >= 0; --i) {
            // TODO: don't prune user created empty circuits
            if (this.#circuits[i].data.length <= 1 && this.#circuits[i].data.filter((i) => i['_']['c'] !== 'Grid').length === 0) {
                this.#circuits.splice(i, 1);
                if (this.#currentCircuit === i) {
                    this.#currentCircuit = -1;
                }
            }
        }
    }
}