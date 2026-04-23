"use strict";

// Undo/redo stack. Each entry stores before/after snapshots for a single recorded change.
// Entry format: { label, before, after, timestamp, redoable }
class UndoStack {
    #entries = [];
    #pointer = -1;

    // Initialize with the baseline state snapshot. Must be called before push().
    init(snapshot) {
        assert.string(snapshot, true);
        if (this.#pointer >= 0) return;
        this.#entries = [{ label: null, before: null, after: snapshot, timestamp: 0, redoable: false }];
        this.#pointer = 0;
    }

    // The most recently recorded after-state (what the stack considers "current"), or null if uninitialized.
    get currentSnapshot() {
        return this.#pointer >= 0 ? this.#entries[this.#pointer].after : null;
    }

    get canUndo() {
        return this.#pointer > 0;
    }

    get canRedo() {
        const next = this.#pointer + 1;
        return next < this.#entries.length && this.#entries[next].redoable;
    }

    // Label of the action that would be undone, or null if nothing to undo.
    get undoLabel() {
        return this.#pointer > 0 ? this.#entries[this.#pointer].label : null;
    }

    // Label of the action that would be redone, or null if nothing to redo.
    get redoLabel() {
        const next = this.#pointer + 1;
        if (next < this.#entries.length && this.#entries[next].redoable) {
            return this.#entries[next].label;
        }
        return null;
    }

    // Timestamp of the most recent undoable action, or -Infinity if nothing to undo.
    get undoTimestamp() {
        return this.#pointer > 0 ? this.#entries[this.#pointer].timestamp : -Infinity;
    }

    // Push a new undo entry. Drops any redo history above the current pointer.
    push(label, before, after, redoable = true) {
        assert.string(label);
        assert.string(before);
        assert.string(after, true);
        assert.bool(redoable);
        this.#entries.splice(this.#pointer + 1);
        this.#entries.push({ label, before, after, timestamp: Date.now(), redoable });
        this.#pointer = this.#entries.length - 1;
    }

    // Undo the last action. Returns { label, snapshot }.
    undo() {
        if (!this.canUndo) return null;
        const entry = this.#entries[this.#pointer--];
        return { label: entry.label, snapshot: entry.before };
    }

    // Redo the last undone action. Returns { label, snapshot }.
    redo() {
        if (!this.canRedo) return null;
        const entry = this.#entries[++this.#pointer];
        return { label: entry.label, snapshot: entry.after };
    }
}
