# Plan: Net-driver port highlight (single-step mode)

## Goal

In single-step mode, outline every output port that is currently actively driving its net (low or high). The outline uses the same visual pattern as the existing net-conflict driver outline, but colored by the attached net/wire color with wire-like brightness (darker = low, brighter + glow = high). Intended to show which port on a multi-driver bus currently drives it.

Rules (agreed requirements):
- Only ports whose driven bit is currently active get the outline. Inputs, high-impedance (non-driving) outputs, and pull resistors are never highlighted.
- Always on in single-step mode (no new toolbar toggle); cleared otherwise.
- Exactly one outline per port: conflict-driver (orange) takes precedence. A net that is currently in conflict state and has conflict checking compiled/enabled is excluded from the driver highlight; conflicted nets keep the existing orange `net-conflict-driver` marks. The two marks are mutually exclusive by construction (see engine method below), so no CSS precedence trickery is needed.
- A CustomComponent whose sub-circuit contains the actual driver of a net on the currently displayed level gets its descend path port marked (same as the conflict feature), so 74-series bus buffers light up on the parent level. No component-body outline: a driven net always touches the sub-circuit port, so port marks are sufficient (unlike fully hidden conflicts).

## Reused facts

- Engine tri-state model: each port has value bit (`elementIndex2`) and driven bit (`elementIndex3`; `elementIndex3 === null` means always-driven); nets have value/driven/conflict bits (`net.elementIndex2/3/C`, `elementIndexC === null` when conflict checking not compiled). See `Simulation.resolveNetConflictDriversByNet()` and `getNetValue()` in `src/sim/simulation.js`.
- Component port elements already carry `data-net-color` (the net color chosen by `Grid.#applyNetColors`, identical to attached wires) and get `data-net-state` (`"" | "-1" | "0" | "1"`) updated every render frame in `Component.renderNetState()`. A driving port's net state always equals its output value (single-driver net), so the outline color can be driven by the existing per-color CSS variables `--net-color-low` / `--net-color-high` / `--net-color-high-alpha` (defined for any element with `data-net-color="0".."9|D"` in `src/ui.css`).
- Engine port names equal `NetList.NetPort.uniqueName` (`'<name>@<gid>@<instanceId>_<channel>'`); netlist hierarchy is flattened by `NetList.identify()`, and the ancestor walk in `Circuit.markNetConflicts()` (via `netList.instances[i].parentInstanceId` / `.gid` + `type === 'descend'` ports) is the template for sub-circuit marking. Only the instance currently displayed on the grid is marked (one Circuit object backs all instances of a duplicated sub-circuit).
- Root-circuit boundary `Port` items are declared as engine consts (ioType 'o', tri-state, driven only when a state is set) - they count as drivers, so a root input port driving a bus gets highlighted (desired).

## 1. Engine: `src/sim/simulation.js`

Add next to `resolveNetConflictDriversByNet()`:

```js
// Returns a Map of engine net id => Set of engine port names of output ports currently actively driving that net.
// Nets in conflict state are excluded (they use the conflict-driver highlight instead); nets with conflicts not
// compiled/enabled are never excluded. Pull ports are never drivers here (they only drive undriven nets).
resolveNetDriversByNet() {
    const result = new Map();
    const mem = this.#backend.mem;
    for (const net of this.#nets.all) {
        if (net.elementIndexC !== null && (mem[net.elementIndexC] & (1 << net.bitIndex)) !== 0) continue; // conflicted net
        const drivers = new Set();
        for (const portName of net.ports) {
            const port = this.#ports.byName[portName];
            if (!port || port.ioType !== 'o' || port.elementIndex2 === null) continue;
            if (port.isPull) continue;
            if (port.elementIndex3 === null || (mem[port.elementIndex3] & (1 << net.bitIndex)) !== 0) drivers.add(portName);
        }
        if (drivers.size > 0) result.set(net.id, drivers);
    }
    return result;
}

// Returns a flat Set of port names of output ports currently driving a net (tests/symmetry with resolveNetConflictDrivers).
resolveNetDrivers() { ... union over resolveNetDriversByNet().values() ... }
```

Note the driven-bit bitIndex: port and net bits use each object's own `bitIndex` - read the port driven bit with `port.bitIndex` (mirror `resolveNetConflictDriversByNet`, which uses `port.bitIndex`).

## 2. Marks: `src/griditem/component.js` + `src/ui/circuit.js`

- `ComponentPort`: new field `netDriver = false; // true when this output port currently drives its net (set by Circuit.markNetDrivers)`.
- `Component.detachSimulation()`: reset `item.netDriver = false` next to `conflictDriver`.
- `Component.renderNetState()`: add `item.element.classList.toggle('net-driver', item.netDriver);`.
- `Circuit.clearNetDrivers()`: like `clearNetConflicts()` but only resets `port.netDriver`.
- `Circuit.markDrivers(netList, subCircuitInstance, netDrivers)`: same shape/`uniqueName` lookup as `markNetConflicts()`; mark netlist ports of the displayed instance whose `uniqueName` is in the driver Set, plus the ancestor-walk descend path ports. Skip the `containsConflict` component-outline marking.
- De-duplicate: extract the shared per-net walk (`mark(netPort)` + descend map + ancestor walk) from `markNetConflicts()` into a private helper `#markNetPortPaths(netList, subCircuitInstance, driversByNet, onSubCircuitComponent)`; `markNetConflicts` passes a callback that sets `containsConflict`, `markDrivers` passes `null`. Both set the port mark via a caller-supplied setter (`conflictDriver` vs `netDriver`).

## 3. Triggers: `src/ui/simulations.js` + `src/ui/application.js`

Rename `Simulations.Simulation.updateConflictMarks()` to `updateMarks()` and extend it to run both passes:

```js
// Recomputes net-related port marks for the circuit instance currently shown on the grid: conflict marks (only in
// single-step mode with checkNetConflicts) and net-driver marks (single-step mode, independent of checkNetConflicts).
updateMarks() {
    if (!this.#netList) return;
    const circuit = this.#netList.instances[this.#instanceId].circuit;
    circuit.clearNetConflicts();
    circuit.clearNetDrivers();
    if (this.#app.config.singleStep && this.#engine) {
        if (this.#app.config.checkNetConflicts) circuit.markNetConflicts(this.#netList, this.#instanceId, this.#engine.resolveNetConflictDriversByNet());
        circuit.markDrivers(this.#netList, this.#instanceId, this.#engine.resolveNetDriversByNet());
    }
}
```

Update all call sites (they stay one-liners): `src/ui/simulations.js` `checkDirty()`, `reattach()`, `reset()`, `restoreSnapshot()`, `attach()`; `src/ui/application.js` conflict-toggle, single-step toggle, `#singleStep()`, `#stepToClockFlip()`. Marks are cleared on detach (fields reset in `detachSimulation`/`clearNetDrivers`) and when single-step mode is left.

## 4. CSS: `src/ui.css`

Next to the existing `.component-port.net-conflict-driver` rule:

```css
/* output port actively driving its net: outline in net/wire color, brightness like wires (per data-net-state) */
.component-port.net-driver {
    outline: calc(3px * var(--zoom-factor)) solid var(--net-color-low, transparent);
    outline-offset: calc(1px * var(--zoom-factor));
}
.component-port.net-driver[data-net-state="1"] {
    outline-color: var(--net-color-high, transparent);
    box-shadow: 1px 1px 3px var(--net-color-high-alpha, transparent), -1px -1px 3px var(--net-color-high-alpha, transparent);
}
```

No rule for `data-net-state="-1"` is needed (conflicted nets are excluded from driver marks while conflict checking is compiled; with checking disabled a conflicted net has no conflict bit and its drivers are marked as normal drivers, state renders `-1` -> outline falls back to the low-state color; acceptable edge).

## 5. Tests

`test/smoke_net_driver_marks.js` (ad-hoc smoke test, same runner-VM pattern as `test/smoke_conflict_component_marks.js`, not part of `node test/test.js`), using the `conflict-nesting.stc` fixture (Outer has two Buttons enabling InnerConflict's tri-state buffer3/not3 outputs onto a shared net, plus InnerOk whose not gate always drives its output net):

1. Single driver (button a on, b off): `resolveNetDriversByNet()` reports exactly buffer3's engine port on the output net; marking at the Outer level marks both Button ports plus the two descend path ports (InnerConflict.q for the sub-circuit driver, InnerOk.q for the always-driving not gate); no conflict marks.
2. Both buffers on (conflict): the conflicted net disappears from the driver map, the InnerConflict.q path port loses `netDriver` and gains `conflictDriver` (precedence), other marks stay.
3. Marking at the InnerConflict instance: only buffer3.q marked, the high-impedance not3.q not marked; with both enables off the net is absent from the driver map and nothing is marked.
4. Compiled with `checkNetConflicts: false`: both buffers appear as normal drivers of the (uncompilable-conflict) net.
Run `node test/test.js` and the other `test/smoke_conflict_*.js` to confirm no regressions.

Manual check: open `res/examples` circuit with tri-state elements or `res/dev/pull-conflict-test.stc`, attach simulation, enable Single step (and optionally Show net conflicts), step with `T` and verify outlines/brightness per bus driver.

## Known limitations (document in as-built plan)

- Marks refresh on step/attach/toggle events (same as conflict marks): toggling a Button/Switch mid-step updates value dots per render frame, but the driver outline updates on the next `updateMarks()` call.
- Multi-channel ports driving mixed 0/1 are colored by the aggregated net state (high wins), identical to wire rendering.
- Only the instance shown on the grid is marked (one Circuit object per sub-circuit label), same as the conflict feature; `W`/reattach re-marks after navigating.
- With `checkNetConflicts` disabled the engine has no conflict bits, so conflicting nets are highlighted as multiple normal drivers (the conflict outline is unavailable in that mode by design).
