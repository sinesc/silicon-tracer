# Conflict Net Driver Highlight — Implementation Plan

## Goal

Conflicted nets are rendered as striped red/yellow wires, but the user cannot see **which ports** cause the conflict. Highlight every output port on a conflicted net that is currently in a low-impedance (driving) state with a 3px orange outline. Driver states change every simulation tick, so the lookup is only performed in **single-step mode** (`config.singleStep`), combined with the existing `checkNetConflicts` option; the marks are static between steps/reattaches.

## Background (relevant existing machinery)

- `Simulation` (`src/sim/simulation.js`) stores all net/port states in a `Uint32Array` (`mem`): `elementIndex2` = value bit, `elementIndex3` = driven/signal bit (tri-state; `null` = always driven), `elementIndexC` = conflict bit. Nets are `#nets.all` (public getter `nets`), ports are `#ports.all` / `#ports.byName` (public getter `ports`). Port names are `<portName>@<gid>@<instanceId>_<channel>` (`NetList.suffix`), net ids are indices into `nets.all`.
- `getNetValue(id)` returns `-1` for a conflict, `null` for undriven. Conflict bits are only compiled/maintained when `checkNetConflicts` is enabled.
- A net is driven by output ports; the "driver" of a conflicted net is an output port whose driven bit (`elementIndex3`) is set (gates/constants have `elementIndex3 === null`, i.e. always driven).
- `Circuit.attachSimulation(netList, subCircuitInstance)` (`src/ui/circuit.js`) already maps every `net.ports` entry (`{ name, gid, instanceId, channel }`) of the given instance to the grid component's `ComponentPort` via `itemByGID(gid).portByName(name)`; `net.netId` is the engine net id. Marks for the highlight reuse this exact mapping.
- `Component.renderNetState()` (`src/griditem/component.js`) runs for every component on every grid frame and syncs `data-net-state` on port elements; CSS for port elements is `.component-port` in `src/ui.css`.
- Single-step entry points: `Application.#singleStep()` (`src/ui/application.js`); recompile/reattach paths: `Simulations.checkDirty()`, `.reattach()`, `.attach()` (`src/ui/simulations.js`).

## Changes

### 1. Engine: `Simulation.resolveNetConflictDrivers()` — `src/sim/simulation.js`

Returns the set of engine port names driving currently conflicted nets. Public API → `assert` on entry.

```js
// Returns a Set of port names of output ports that drive a net currently in conflict state.
resolveNetConflictDrivers() {
    const drivers = new Set();
    const mem = this.#backend.mem;
    for (const net of this.#nets.all) {
        if (net.elementIndexC === null) continue;
        if ((mem[net.elementIndexC] & (1 << net.bitIndex)) === 0) continue; // no conflict on this net
        for (const portName of net.ports) {
            const port = this.#ports.byName[portName];
            if (!port || port.ioType !== 'o' || port.elementIndex2 === null) continue;
            const driven = port.elementIndex3 === null || (mem[port.elementIndex3] & (1 << port.bitIndex)) !== 0;
            if (driven) drivers.add(portName);
        }
    }
    return drivers;
}
```

Complexity is O(nets + ports-on-conflicted-nets); call only on step/attach events, never per frame.

### 2. `Circuit` mark application — `src/ui/circuit.js`

New method, mirrors the port-linking loop of `attachSimulation`:

```js
// Applies net conflict driver marks (from Simulation.resolveNetConflictDrivers()) to component ports of this circuit's instance.
// Driver names are engine port names, which equal NetList.NetPort.uniqueName ('<name>@<gid>@<instanceId>_<channel>').
markConflictDrivers(netList, subCircuitInstance, driverPortNames) {
    assert.class(NetList, netList);
    assert.integer(subCircuitInstance);
    assert.class(Set, driverPortNames);
    for (const component of this.#data) {
        if (!component.ports) continue;
        for (const port of component.ports) {
            port.conflictDriver = false; // cleared here, re-marked below
        }
    }
    for (const net of netList.nets) {
        if (net.netId === null) continue;
        for (const { name, gid, instanceId, uniqueName } of net.ports) {
            if (instanceId !== subCircuitInstance) continue;
            if (!driverPortNames.has(uniqueName)) continue;
            const component = this.itemByGID(gid);
            const port = component?.portByName(name);
            if (port) port.conflictDriver = true;
        }
    }
}
```

### 3. `ComponentPort` mark — `src/griditem/component.js`

- Add field to `ComponentPort`: `conflictDriver = false;`
- In `Component.renderNetState()`, sync the class alongside the existing state attribute:

```js
renderNetState() {
    for (const item of this.ports) {
        if (item.shadow) continue;
        const state = this.getNetState(item.netIds);
        if (item.element.getAttribute('data-net-state') !== state) {
            item.element.setAttribute('data-net-state', state);
        }
        item.element.classList.toggle('net-conflict-driver', item.conflictDriver);
    }
}
```

(`classList.toggle(cls, bool)` is a no-op when the state already matches, so per-frame cost is trivial.)

### 4. Trigger points — `src/ui/simulations.js`

Helper on `Simulations`; call it from `checkDirty()` (after the `attachSimulation` call), `reattach()` (after `attachSimulation`), `attach()` (after `attachSimulation`), and `detach()` clears marks:

```js
// Recomputes conflict-driver port highlights for all attached circuit instances (single-step mode only).
updateConflictDriverMarks() {
    const enabled = this.#app.config.singleStep && this.#app.config.checkNetConflicts && !!this.#engine;
    const drivers = enabled ? this.#engine.resolveNetConflictDrivers() : new Set();
    for (const [ instanceId, instance ] of this.#netList.instances.entries()) {
        instance.circuit.markConflictDrivers(this.#netList, instanceId, drivers);
    }
}
```

Call sites:

- `Simulations.checkDirty()`, `reattach()`, `attach()`: call `this.updateConflictDriverMarks()` right after `attachSimulation(...)`.
- `Application.#singleStep()` and `Application.#stepToClockFlip()` (`src/ui/application.js`): call `sim.updateConflictDriverMarks()` at the end of the method, after the step (`sim.tick(...)` / `sim.stepToClockFlip()`) has been performed and `config.singleStep` has been set (covers step-by-tick, step-to-clock-flip, and break-on-conflict entry into single-step mode).
- The "Show net conflicts" / "Single step" toolbar toggles (`#initToolbar`): after changing `checkNetConflicts` / `singleStep` and recompiling, call `this.simulations.current?.updateConflictDriverMarks()` so enabling/disabling immediately marks/clears. Turning free-run mode on clears all marks (empty driver set).
- `Simulations.detach()` already calls `detachSimulation()`, which resets `netIds`; add `port.conflictDriver = false` to `Component.detachSimulation()`'s port loop so marks cannot survive a detach.

### 5. CSS — `src/ui.css`

New root color variable next to the existing conflict colors:

```css
--net-conflict-driver-color: orange;
```

New rule after the `.component-port` block:

```css
/* output port actively driving a conflicted net */
.component-port.net-conflict-driver {
    outline: calc(3px * var(--zoom-factor)) solid var(--net-conflict-driver-color);
    outline-offset: calc(1px * var(--zoom-factor));
}
```

(`calc(3px * var(--zoom-factor))` keeps the outline proportional to grid zoom, matching the existing border convention. `outline` is used rather than `border` to avoid changing port layout.)

## Behavior summary

- Highlight appears only while `singleStep` and `checkNetConflicts` are both active (conflicted nets are only rendered/detected with conflicts enabled, and per-step lookup keeps free-run performance unchanged).
- Marks are recomputed at every single step, at simulation recompile/reattach, and on toggle changes; cleared when simulation is detached, conflicts are disabled, or single-step is disabled.
- Nets in conflict mark every driving output port: gate/builtin/constant/clock/RAM outputs, tri-state outputs with enabled output signal (enabled `buffer3`/`not3`/`mux3`/`demux3`/`switch`/memory `oe`), i.e. any output port whose driven bit is set. Input ports, undriven (high-impedance) outputs, and ports on non-conflicted nets are never marked.

## Tests — `test/test.js`

Extend the existing simulation unit tests (runner compiles circuits with `checkNetConflicts: true`):

1. `resolveNetConflictDrivers` on `data/tests.stc` circuit `ConflictBuffer` (existing):
   - After `simulate(5)` with `cEnable1=1, cEnable2=0` (no conflict): `sim.resolveNetConflictDrivers().size === 0`.
   - With both enables high (`pOutput === -1` conflict): driver set contains exactly the engine `q` port names of the drivers of the `pOutput` net (names of the form `q@<gid>@0_0`); the `q` of the disabled (`enable=0`) buffer on the undriven `pIntermediate` net is **not** included.
2. Circuit `ConflictGate` (existing): with no conflict the driver set is empty (single-driver nets are not marked, no false positives).
3. Run `node test/test.js`; all tests pass.

## Manual verification

Open `res/examples/` conflict scenario (or build a small circuit: two constants bridged through a `buffer3` and a second constant onto one net with a probe), enable "Show net conflicts", enter single-step (hotkey `T`) → the net renders striped and both driving output ports show the orange outline; disabling the second buffer's enable removes its outline.
