"use strict";

// Base class for a section of the grid info overlay.
class Overlay {
    #app;

    constructor(app) {
        assert.class(Application, app);
        this.#app = app;
    }

    get app() {
        return this.#app;
    }

    // Returns true if the overlay contents have changed and need to be re-rendered.
    dirty() {
        return false;
    }

    // Renders overlay contents into the given DOM node.
    render(node) {}
}
