# Simulation snapshots plan

Add Debugger-menu support for capturing and restoring the state of a running simulation ("snapshots").

## Requirements
- Debugger menu: new entry `Create snapshot...` with a separator above it → opens a dialog with a `Snapshot name` input; Ok creates a snapshot of the current simulation's state.
- Debugger menu: new `Snapshots` menu category, only shown while at least one snapshot exists. Entries are labeled `<Simulation name>: <Snapshot name>`; clicking restores that snapshot.
- Each snapshot row gets a right-aligned `❌` delete button (same style/behavior as the break-condition delete buttons).
- Snapshots live only in memory (never serialized) and are cleared when circuits are closed (File > Close).

## Design

A snapshot is a copy of the simulation engine's memory (`backend.mem` — it holds all net/port/constant/clock-counter/RAM-ROM-data state) tagged with the engine's structural key so it can be rejected after the circuit structure changed.

Snapshots are owned by the `Simulations.Simulation` instance of their simulation. That gives the required lifecycle for free:
- `Simulations.delete()` (stop simulation, delete circuit) and `Simulations.clear()` (File > Close, open/new file, remove library) drop the Simulation instance → its snapshots are garbage-collected automatically.
- Nothing is serialized anywhere → gone on page reload.
- The `Simulations.Simulation` object is stable while its circuit exists (the `#simulations` map reuses instances), so menu entries reference live objects.

Layout-compatibility rule: a snapshot is restorable iff `snapshot.key === engine.#structuralKey()` (same idiom already used by `#compileTicks()` to retain `mem` across recompiles). If the simulation was recompiled with retained state, the layout is identical and snapshots stay valid; if the structure changed, restore is refused with a notice (the snapshot is kept — an Undo can make it valid again).

## 1. Engine API — `src/sim/simulation.js`

Add after `reset()`:

```js
// Captures the complete current simulation state (all net/port/const/clock/memory bits in mem) for later restore.
createStateSnapshot() {
    return { key: this.#structuralKey(), mem: this.#backend.mem.slice() };
}

// Returns whether a snapshot created by createStateSnapshot() can be restored into this simulation.
canRestoreStateSnapshot(snapshot) {
    assert.object(snapshot);
    return snapshot.key === this.#structuralKey();
}

// Restores a snapshot created by createStateSnapshot(). Layout must match (see canRestoreStateSnapshot).
restoreStateSnapshot(snapshot) {
    assert.object(snapshot);
    assert(snapshot.key === this.#structuralKey(), 'Snapshot does not match the current simulation layout');
    assert(snapshot.mem.length === this.#backend.mem.length, 'Snapshot memory size mismatch');
    this.#backend.mem.set(snapshot.mem);
    this.#clockFlipBits = null;
    // discard any partially executed single step so stepping restarts from the tick's beginning (mirrors reset())
    this.#compiledStep = { generator: null, iterator: null };
}
```

`#structuralKey()` already exists (ignores probes and const initial values — exactly what we want, const *current* values live in `mem` and are captured).

## 2. `Simulations` — `src/ui/simulations.js`

- On class `Simulations`, add a getter so the menu can reach all live simulations:

```js
// Returns all live simulation instances.
get all() {
    return values(this.#simulations);
}
```

- On `Simulations.Simulation`, add session-only snapshot storage:

```js
#snapshots = [];   // { name, state } - state comes from engine.createStateSnapshot()

// Returns this simulation's snapshots (session-only, not serialized).
get snapshots() { return this.#snapshots; }

// Captures the current simulation state under the given name.
createSnapshot(name) {
    assert.string(name);
    this.#snapshots.push({ name, state: this.#engine.createStateSnapshot() });
}

// Removes the given snapshot.
deleteSnapshot(snapshot) {
    assert.object(snapshot);
    this.#snapshots.splice(this.#snapshots.indexOf(snapshot), 1);
}

// Restores the given snapshot into this simulation. Caller must have checked engine.canRestoreStateSnapshot().
restoreSnapshot(snapshot) {
    assert.object(snapshot);
    this.#engine.restoreStateSnapshot(snapshot.state);
    this.updateConflictMarks();
}
```

## 3. Action — `src/ui/action.js`

New `Action.createSnapshot(app)` (follow `addBreakCondition` dialog style):

```js
// Captures the current simulation state as a named session snapshot.
static async createSnapshot(app) {
    assert.class(Application, app);
    const sim = app.simulations.current;
    if (!sim) return;
    sim.checkDirty(true); // sync the engine with the current circuit first so the snapshot matches what is on screen
    const result = await dialog('Create snapshot', [
        { text: `Capture the current state of simulation "<b>${escapeHTML(sim.label)}</b>". Snapshots are kept until the circuit is closed.` },
        { label: 'Snapshot name', name: 'name', type: 'string', check: (v) => v.trim() !== '' }
    ], { name: `Snapshot ${sim.snapshots.length + 1}` });
    if (result) {
        sim.createSnapshot(result.name.trim());
        app.showNotice(`Snapshot "${sim.label}: ${result.name.trim()}" created.`);
    }
}
```

Names may be duplicated (the simulation prefix + insertion order disambiguate); no uniqueness check.

## 4. Debugger menu — `src/ui/application.js`

In the `this.#debuggerMenu` builder, after the existing Conditions category block, append:

```js
// Simulation snapshots.
debuggerMenu.createSeparator();
const snapshotButton = debuggerMenu.createActionButton('Create snapshot...', 'Capture the current simulation state as a restorable snapshot. Snapshots are kept until the circuit is closed.', async () => {
    debuggerMenu.close();
    await Action.createSnapshot(this);
});
snapshotButton.node.classList.toggle('toolbar-menu-button-disabled', !this.simulations.current);
// Snapshot list category; only shown while at least one snapshot exists.
const simulations = this.simulations.all;
if (simulations.some((sim) => sim.snapshots.length > 0)) {
    const snapshotsCategory = debuggerMenu.createMenuCategory('Snapshots', 'Saved simulation states. <i>Click</i> an entry to restore it, <i>❌</i> to delete it.', (snapshotsMenu) => {
        snapshotsMenu.clear();
        for (const sim of simulations) {
            for (const snapshot of sim.snapshots) {
                const safeLabel = `${escapeHTML(sim.label)}: ${escapeHTML(snapshot.name)}`; // labels/hover messages are set via innerHTML
                // The absolutely positioned side button must precede its row entry (its static position is below the preceding in-flow entry).
                const deleteButton = snapshotsMenu.createActionButton('&#10060;', `Delete snapshot: <b>${safeLabel}</b>`, () => {
                    sim.deleteSnapshot(snapshot);
                    debuggerMenu.open(); // rebuild the open menu; drops the category when the list became empty
                });
                deleteButton.node.classList.add('toolbar-snapshot-delete');
                const restoreButton = snapshotsMenu.createActionButton(safeLabel, `Restore simulation state: ${safeLabel}`, () => {
                    debuggerMenu.close();
                    this.#restoreSnapshot(sim, snapshot);
                });
                restoreButton.node.classList.add('toolbar-snapshot-entry');
            }
        }
    });
    snapshotsCategory.subToolbar.node.classList.add('toolbar-snapshot-rows'); // CSS anchor + row layout for the snapshot entries
}
```

Restore helper on `Application`:

```js
// Restores a simulation snapshot: selects/attaches the owning simulation first (applies any pending recompile),
// then writes the captured state back into the engine.
#restoreSnapshot(sim, snapshot) {
    assert.class(Simulations.Simulation, sim);
    assert.object(snapshot);
    const circuit = this.circuits.byUID(sim.uid);
    if (!circuit) return; // owning circuit is gone (snapshots die with the simulation anyway)
    Action.selectSimulation(this, sim.uid); // switches to the circuit and attaches the simulation (checkDirty recompile may run first)
    if (!sim.engine.canRestoreStateSnapshot(snapshot.state)) {
        this.showNotice(`Cannot restore snapshot "${sim.label}: ${snapshot.name}": the simulation structure changed.`);
        return; // keep the snapshot, an Undo can make it restorable again
    }
    sim.restoreSnapshot(snapshot);
    this.showNotice(`Restored snapshot "${sim.label}: ${snapshot.name}".`);
}
```

Notes:
- `Action.selectSimulation` mirrors the Simulation menu's switch behavior (it exits single-step mode; the restored state is then live/resumable).
- Menu entries/hover texts interpolate user text → `escapeHTML()` (from `src/common.js`) on both simulation label and snapshot name.
- `debuggerMenu.open()` after delete reuses the existing refresh-while-open idiom.

## 5. CSS — `src/ui.css`

Extend the existing condition-row side-button rules (the comment there already says "Row plus square side-button: circuit select/place, break-condition edit/delete" — add snapshots to it). For each of the five rule groups, add the snapshot variants next to the condition ones:

```css
/* anchor */
... > .toolbar.toolbar-condition-rows,
... > .toolbar.toolbar-snapshot-rows { position: relative; }

/* row indent for side button */
... .toolbar-condition-edit,
... .toolbar-snapshot-entry { margin-right: 30px; }

/* absolute 30px square box */
... .toolbar-condition-delete,
... .toolbar-snapshot-delete { border: 2px solid ...; border-radius: 3px; margin: 0; min-width: 30px; width: 30px; position: absolute; right: 0; }

/* ❌ glyph sizing (wide emoji must not overflow the 30px box) */
... .toolbar-condition-delete,
... .toolbar-snapshot-delete { font-size: var(--font-size-normal); height: 28px; line-height: 24px; text-align: center; }

/* long label wrapping: snapshot labels are "sim: name" and can be long */
... .toolbar-condition-edit,
... .toolbar-snapshot-entry { white-space: normal; overflow-wrap: anywhere; max-width: calc(min(60vw, 400px) - 30px); }
```

(`...` = the existing long prefix `.toolbar > .toolbar-menu-button > .toolbar-menu-container > .toolbar > .toolbar-menu-category > .toolbar-menu-container > .toolbar`.)

## 6. Tests — `test/test.js`

Engine-level tests (JS backend, `createSimulationWithBackend` pattern):

```js
test("simulation state snapshot capture and restore", () => {
    // reuse the d-flip-flop circuit of the "d flip-flop rising-edge timing" test:
    // clock + const + dflipflop + probe 'pq'
    sim.compile(); // enable clock like in that test
    // step until probe pq === 1, then:
    const snap = sim.createStateSnapshot();
    sim.setConstValue(sim.getConstId? ...) // drive data to 0 (set const port like compile() does), simulate enough ticks so q === 0 again
    assert(sim.getProbeValue('pq') === 0);
    assert(sim.canRestoreStateSnapshot(snap));
    sim.restoreStateSnapshot(snap);
    assert(sim.getProbeValue('pq') === 1, 'probe should be back at snapshot state');
    // and the clock keeps running from the restored counter values: stepping further still toggles correctly
});

test("snapshot compatibility check", () => {
    // sim A: compile, snapshot.
    // sim B: same circuit + one extra gate (different structural key).
    assert(!simB.canRestoreStateSnapshot(snapA));
});
```

Named constants make `setConstValue` easy: `sim.declareConst(1, '@d0', 'data')` then `sim.setConstValue(sim.getConstId('data'), 0)`.

## 7. Manual verification
- Start a simulation, tick a bit, `Create snapshot...` (dialog prefilled with `Snapshot 1`) → `Snapshots` category appears with entry `"<Sim>: Snapshot 1"` and a `❌` button aligned with its row.
- Click the entry → notice `Restored snapshot ...`, on-grid probe/wire values jump back.
- `❌` removes the entry; with zero snapshots the category disappears and the menu still renders.
- Stop the simulation (Simulation > Stop) → its snapshots vanish.
- File > Close → all snapshots gone; Debugger menu shows no `Snapshots` category.
- Edit the circuit so the simulation recompiles with a changed structure → restore attempt shows the "structure changed" notice; snapshots of an unchanged recompile still restore fine.
- Long simulation/snapshot names wrap inside the menu; the ❌ button stays inside its 30px box.

## Out of scope / non-goals
- No persistence of snapshots into .stc files (session-only by requirement).
- Snapshots of stopped/deleted simulations are simply gone (no orphan restoration).
- WASM backend ignored (JS backend only, consistent with existing debugger features).
