# Conflict Containment Highlight (CustomComponent outlines) — Implementation Plan

## Goal

A CustomComponent whose sub-circuit contains a net conflict — directly or at any nesting depth — gets a 3px orange outline around the whole component, so the user can descend into the component towards the conflict. This covers conflicts that are **not reachable through the existing port highlights** (a conflict that is internal to a sub-circuit and does not sit on a net connected to one of that sub-circuit's ports produces no highlighted port at the parent level, so there is nothing to follow).

Only active in single-step mode with `checkNetConflicts` enabled, exactly like the existing conflict-driver port highlight; same orange color.

## Background (state as built by `c3ff7f6`/`700947f`/`ad456c0`)

- `Simulation.resolveNetConflictDriversByNet()` (`src/sim/simulation.js`) returns a `Map` of conflicted engine net id => Set of engine port names of output ports driving that net (pull-resistor ports are excluded because they only drive undriven nets). Engine port names equal `NetList.NetPort.uniqueName` = `<name>@<gid>@<instanceId>_<channel>`.
- `Circuit.clearConflictDrivers()` / `Circuit.markConflictDrivers(netList, subCircuitInstance, conflictDrivers)` (`src/ui/circuit.js`) set/clear `ComponentPort.conflictDriver`. Marking: for every conflicted net it marks the driving ports of the given instance, and walks up `netList.instances[].parentInstanceId` from every driver's instance to mark the `descend` (CustomComponent) ports on the path. `Component.renderNetState()` toggles the CSS class `net-conflict-driver` on port elements; `.component-port.net-conflict-driver` in `src/ui.css` uses `--net-conflict-driver-color: orange` (root, line ~17) and `calc(Npx * var(--zoom-factor))`.
- `Simulations.Simulation.updateConflictDriverMarks()` (`src/ui/simulations.js`) clears and re-marks **only the currently displayed instance** (`#instanceId`); called from `checkDirty()`, `reattach()`, `attach()`, `Application.#singleStep()`/`#stepToClockFlip()` and the "Single step"/"Show net conflicts" toolbar toggles. Component marks are plain fields, so per-instance correctness comes from clearing the Circuit before marking it for the (single) current instance.
- `netList.instances[i]` = `{ circuit, gid, subInstances, parentInstanceId, simIds, netItems }`; `gid` is the gid of the CustomComponent **in the parent instance** that this instance represents, `parentInstanceId` is `null` for the root instance. `netList.instances[i].simIds[gid]` maps a component gid to its engine id (const id for `Switch`, `Button`, `Constant`, ...; `undefined` for gates/builtins).
- `Circuit.attachSimulation()` uses the same `itemByGID(gid)`/`portByName(name)` mapping; `Component.detachSimulation()` resets port `netIds`/`conflictDriver`; `Component.get element()` returns `null` while the component is not linked to a grid.

Marking rule for this feature (validated on `test/data/conflict-nesting.stc` and a synthetic root circuit containing `ConflictBuffer` from `test/data/tests.stc`): for every conflicted net and every driver port of that net, walk up the instance chain from the driver's instance and mark the CustomComponent of each ancestor instance, i.e. in ancestor instance A the component with gid `netList.instances[child].gid` (child = next instance down the chain). Consequences:

- Works for conflicts that touch none of the component's ports (no `descend` port on the net needed).
- A component is not marked when its subtree contributes no driver of a conflicted net, e.g. a sub-circuit whose output is high-impedance or whose internal switch is off — even though its ports sit on the conflicted net.
- A component is not marked for a conflict inside the currently displayed circuit (its own gates' output ports are ringed instead), and conflicts driven only by pull resistors stay excluded (the engine already filters them).
- Sibling copies of the same sub-circuit stay distinguishable at the parent level (the two CustomComponent items in the parent circuit have different gids).

## Changes

### 1. Mark field + render hook — `src/griditem/component.js`

Add the field next to `ComponentPort.conflictDriver`'s sibling area (on `Component`, used by CustomComponents only):

```js
    containsConflict = false; // true when a net conflict exists somewhere in this component's sub-circuit (set by Circuit.markNetConflicts, CustomComponents only)
```

In `Component.detachSimulation()` (the loop that resets `item.netIds`/`item.conflictDriver`), add:

```js
        this.containsConflict = false;
```

In `Component.renderNetState()`, after the port loop:

```js
        this.element?.classList.toggle('net-conflict-component', this.containsConflict);
```

`renderNetState()` runs for every component on every grid frame and `classList.toggle` is a no-op when the class already matches, so per-frame cost is negligible; applying the class in the render hook keeps it correct after the circuit is relinked (new DOM elements) without extra bookkeeping.

### 2. Circuit marking — `src/ui/circuit.js`

Rename the pair (it now marks ports *and* components): `clearConflictDrivers()` → `clearNetConflicts()`, `markConflictDrivers()` → `markNetConflicts()`.

```js
    // Clears all net conflict marks (component outlines and port marks) of this circuit.
    clearNetConflicts() {
        for (const component of this.#data) {
            if (component.containsConflict !== undefined) component.containsConflict = false; // Component subclasses only
            for (const port of (component.ports ?? [])) {
                port.conflictDriver = false;
            }
        }
    }
```

`markNetConflicts` keeps the existing port marking and adds the component mark inside the existing ancestor walk:

```js
            for (const port of net.ports) {
                if (!drivers.has(port.uniqueName)) continue;
                // walk up the instance chain from every driver's instance and mark the sub-circuit we came from
                for (let child = port.instanceId; netList.instances[child].parentInstanceId !== null; ) {
                    const parent = netList.instances[child].parentInstanceId;
                    if (parent === subCircuitInstance) {
                        const component = this.itemByGID(netList.instances[child].gid); // outline the component containing the conflict
                        if (component) component.containsConflict = true;
                    }
                    const pathPort = descend.get(parent + ':' + netList.instances[child].gid);
                    if (pathPort && pathPort.instanceId === subCircuitInstance) mark(pathPort);
                    child = parent;
                }
            }
```

Update the method's doc comment to mention both marks (driver/path ports and the outline of components whose subtree contains a driver).

### 3. Trigger — `src/ui/simulations.js`

Rename `updateConflictDriverMarks()` → `updateConflictMarks()` and call the renamed Circuit methods:

```js
    // Recomputes net conflict marks (driving/path port outlines and outlines of components containing a conflict) for the circuit instance currently shown on the grid (only marks in single-step mode with net conflict checking enabled, clears marks otherwise).
    // Only the current instance is marked because one Circuit (and thus its ComponentPorts) backs all instances of a sub-circuit.
    updateConflictMarks() {
        if (!this.#netList) return;
        const circuit = this.#netList.instances[this.#instanceId].circuit;
        circuit.clearNetConflicts();
        const enabled = this.#app.config.singleStep && this.#app.config.checkNetConflicts && !!this.#engine;
        if (enabled) circuit.markNetConflicts(this.#netList, this.#instanceId, this.#engine.resolveNetConflictDriversByNet());
    }
```

Update all call sites: `checkDirty()`, `reattach()`, `attach()` (same file) and `src/ui/application.js` (two toolbar/debugger toggle sites, `#singleStep()`, `#stepToClockFlip()`).

### 4. CSS — `src/ui.css`

Next to the existing `.component-port.net-conflict-driver` rule:

```css
/* custom component containing a net conflict in its sub-circuit */
.component.net-conflict-component .component-inner {
    outline: calc(3px * var(--zoom-factor)) solid var(--net-conflict-driver-color);
    outline-offset: calc(2px * var(--zoom-factor));
}
```

The outline goes on the visible component body (`.component-inner`) rather than the outer `.component` container: the container box includes the port overhang, so a container ring would cut through the ports' outer halves; with `.component-inner` the ring follows the body edge and passes behind the port elements (ports have `z-index: 14`, `.component-inner` has `z-index: 12`). Reuses the existing orange color variable so both highlight kinds read as one concept.

### 5. Hover hint — `src/griditem/customcomponent.js`

The hover message is a lazy function, so it can reflect the mark (helps the user understand the ring):

```js
        this.setHoverMessage(this.inner, () => `<b>${this.typeLabel}</b>${this.containsConflict ? ' <b>Contains a net conflict.</b>' : ''}. <i>E</i> Edit, <i>W</i> Switch to sub-circuit ${this.app.simulations.current ? ' simulation, ' : ', '} ${Component.HOTKEYS}.`, { type: 'hover' });
```

## Behavior summary

- Ring appears on a CustomComponent when at least one driving output port of a conflicted net lies inside that component's sub-instance subtree (any depth), including conflicts that do not reach any of the component's ports.
- Both the ring and the port highlight appear when the conflict is reachable through a component port (the path port is already marked); only the ring appears for hidden conflicts.
- No ring for: subtrees without a driver on a conflicted net (high-impedance outputs, disabled buffers/switches), pull-resistor-only drivers, and conflicts inside the currently displayed circuit (driver ports are ringed there).
- Cleared when single-step or conflict checking is disabled, when the simulation is detached, and re-established for the newly displayed instance on `W`-navigation (`reattach()`).

## Tests

1. New `test/smoke_conflict_component_marks.js` (same pattern as `test/smoke_conflict_nested_marks.js`: `test/lib/runner` VM context + `vm.runInContext`, unserializes both `test/data/tests.stc` and `test/data/conflict-nesting.stc` into separate `Application` instances):
   - **Hidden conflict** (`ConflictBuffer` from `tests.stc` has no circuit ports, so its conflicted net touches no CustomComponent port): build a synthetic root circuit `new Circuit(app, 'Root', 'u_test_root', [])` containing `new CustomComponent(app, 100, 100, 0, <ConflictBuffer uid>)`, `NetList.identify(root, app.circuits.all)`, compile with `checkNetConflicts: true`. Set all consts high (`for (const c of engine.consts) engine.setConstValue(c.id, 1)`), `engine.simulate(5)`; assert `resolveNetConflictDriversByNet().size === 1`; after `root.clearNetConflicts()` + `root.markNetConflicts(netList, 0, ...)`: exactly one component marked, named by `item.type` (CustomComponent `type` is the sub-circuit label) = `ConflictBuffer`; no `ComponentPort.conflictDriver` set anywhere. Then set all consts to 0, re-simulate, re-mark → no component and no port marks.
   - **`Outer` of `conflict-nesting.stc`, instance 0**: exactly one component marked — the component whose `type` is `InnerConflict`; the `InnerOk` component is **not** marked although its port sits on the conflicted net (its switch is off, so its subtree has no driver). Then drive that switch: `const instOk = netList.instances.findIndex((i) => i.circuit.label === 'InnerOk')`, `const sw = netList.instances[instOk].circuit.items.filter((i) => i instanceof Switch).toArray()[0]`, `engine.setConstValue(netList.instances[instOk].simIds[sw.gid], 1)` (Switch declares a const, so `simIds` holds its id), `engine.simulate(5)`, re-mark → component marks exactly `InnerConflict,InnerOk`.
   - **Conflict inside the displayed circuit**: mark for the `InnerConflict` instance → no component marks at all, while its two `Builtin.q` ports are marked (port marking unchanged by this feature).
2. Update the three existing smoke scripts (`test/smoke_conflict_marks.js`, `test/smoke_conflict_nested_marks.js`, `test/smoke_conflict_nested_marks_deep.js`) for the renamed `Circuit.clearNetConflicts()` / `Circuit.markNetConflicts()`.
3. Run `node test/test.js` (currently 34 tests, all pass) and all four smoke scripts.

## Manual verification

Open `index.html`, load `res/dev/conflict-nesting.stc`, select `Outer`, attach the simulation, enable **Show net conflicts** and **Single step**: `InnerConflict` is ringed in orange (its `q` port is ringed as well), `InnerOk` is not. Press `W` on `InnerConflict` to descend: no component rings in the sub-circuit, the two `buffer3`/`not3` `q` ports are ringed. Toggle a button so only one output drives → all marks gone. For the hidden case, create a sub-circuit with two opposite Constants wired onto one net (no circuit ports involved), place it as a component and enable single-step: the component gets a ring although no port is marked.

## Notes / limitations

- Only CustomComponents receive the mark; a conflict inside the currently displayed circuit is shown by port outlines only (there is no enclosing component to ring).
- Marks are per Circuit and only maintained for the currently displayed instance (pre-existing design constraint); at the parent level sibling instances of the same sub-circuit are still told apart because they are different items in the parent circuit.
