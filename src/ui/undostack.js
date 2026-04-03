"use strict";

// Undo/redo stack. Each entry stores before/after circuit snapshots for a single recorded change.
// Entry format: { label, before, after, timestamp, redoable }
//   label    - human-readable action name shown in "Undo: X" / "Redo: X"
//   before   - state snapshot to restore when undoing (circuit state before the change,
//               or deleted circuit data for global stack entries)
//   after    - state snapshot to restore when redoing (null when redoable=false)
//   timestamp - Date.now() at push time, used to pick which stack to undo from
//   redoable  - whether this entry can be redone
//
// A floor entry (index 0, label=null) created by init() anchors the baseline state.
// pointer=-1 means uninitialized; pointer=0 means at baseline (nothing to undo).
class UndoStack {
    #entries = [];
    #pointer = -1;

    // Initialize with the baseline state snapshot. Must be called before push().
    // Safe to call multiple times — subsequent calls are no-ops.
    init(snapshot) {
        assert.object(snapshot, true);
        if (this.#pointer >= 0) return;
        this.#entries = [{ label: null, before: null, after: snapshot, timestamp: 0, redoable: false }];
        this.#pointer = 0;
    }

    // The most recently recorded after-state (what the stack considers "current"), or null if uninitialized.
    get currentSnapshot() {
        return this.#pointer >= 0 ? this.#entries[this.#pointer].after : null;
    }

    get canUndo() { return this.#pointer > 0; }

    get canRedo() {
        const next = this.#pointer + 1;
        return next < this.#entries.length && this.#entries[next].redoable;
    }

    // Label of the action that would be undone, or null if nothing to undo.
    get undoLabel() { return this.#pointer > 0 ? this.#entries[this.#pointer].label : null; }

    // Label of the action that would be redone, or null if nothing to redo.
    get redoLabel() {
        const next = this.#pointer + 1;
        if (next < this.#entries.length && this.#entries[next].redoable) return this.#entries[next].label;
        return null;
    }

    // Timestamp of the most recent undoable action, or -Infinity if nothing to undo.
    get undoTimestamp() { return this.#pointer > 0 ? this.#entries[this.#pointer].timestamp : -Infinity; }

    // Updates the after-state of the current top entry without creating a new undo step.
    // Used to record non-circuit-state changes (e.g. selection) into the current snapshot so
    // that future actions see them as their 'before' state.
    updateCurrentSnapshot(snapshot) {
        assert.object(snapshot);
        if (this.#pointer >= 0) {
            this.#entries[this.#pointer].after = snapshot;
        }
    }

    // Push a new undo entry. Drops any redo history above the current pointer.
    push(label, before, after, redoable = true) {
        assert.string(label);
        assert.object(before);
        assert.object(after, true);
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

    // Serializes the stack for file storage.
    serialize() {
        const entries = this.#entries.map(({ label, before, after, timestamp, redoable }, i) => {
            const entry = { label, after, timestamp, redoable };
            const expected = i === 0 ? null : this.#entries[i - 1].after;
            if (before !== expected) entry.before = before;
            return entry;
        });
        return { entries, pointer: this.#pointer };
    }

    // Reconstructs a stack from serialized file data.
    static unserialize(data) {
        assert.object(data);
        const stack = new UndoStack();
        stack.#entries = data.entries.map((entry, i) => ({
            ...entry,
            before: 'before' in entry ? entry.before : (i > 0 ? data.entries[i - 1].after : null),
        }));
        stack.#pointer = data.pointer;
        return stack;
    }
}
