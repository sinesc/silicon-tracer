# Nested Conflict Driver Highlight — Implementation Plan

Extension of the implemented conflict driver highlight (`res/plans/conflict-net-driver-highlight-plan.md`, commits `c3ff7f6`, `700947f`). Read that plan first; everything below builds on it.

## Goal

Conflicts deep inside nested sub-circuits are hard to locate from an outer circuit. Extend the driver marking to the **full driver chain (fan-in) of a conflicted net across nesting boundaries**, using the existing 3px orange outline: the driving outputs of the conflicted net, the output Ports/pins feeding it, and transitively the driving outputs feeding those pins, at every instance level. Input ports are never marked. Scope unchanged: computed only while `singleStep` and `checkNetConflicts` are active, on step/attach events.

Reference scenario (`res/dev/conflict-nesting.stc`, circuit `Outer` with instances `InnerConflict` (IC) and `InnerOk` (IO)): IC's enabled `buffer3` and `not3` drive a conflict on their internal net and output via pin `q`, wired to input pin `a` of IO (IO's toggle switch is open → undriven). Required result:

- `Outer` grid: the `q` pin of the IC instance **is** highlighted; the `a` pin of IO is **not**.
- Zoomed into IC: `buffer3.q`, `not3.q` and the `q` Port component are highlighted; `a`/`b` Port components are not.
- Zoomed into IO: nothing highlighted.

## Background (extension-relevant facts)

- `NetList` flattens nets across instance levels into single netlist net objects. A netlist net's `ports` list contains, on **the same object**: parent-side `'descend'` pins (CustomComponent `ComponentPort`s, `gid` = the CustomComponent, parent `instanceId`), sub-side `'ascend'` ports (named `Port` components inside sub-circuits, sub `instanceId`), and internal component ports (`type === null`). An ascend/descend pair shares the netlist net object and `compareName`.
- An `ascend` NetPort (a Port component) appears in **two** netlist nets: the parent-side net (together with its paired `descend` pin) and the sub-side internal net (together with the internal components driving/reading it). This is the nesting boundary: the parent-side net is the "downstream" side, the sub-side net is the "upstream" side of the pipe.
- Netlist nets are channel-split versions of engine nets (netlist net → engine `netId` is N:1); tunnels exist only engine-side (both tunnel ports share one engine net id).
- Engine ports exist only for simulation-declared components. `Port` components declare a const **only in the root instance** (`Port.declare()` returns `null` for `instanceId !== 0`); CustomComponent pins declare nothing. So `ascend` ports in sub-instances and all `descend` pins have **no engine port**.
- `NetPort.ioType` is `null` for Port/CustomComponent-derived ports → classify by netlist `type` (`'ascend'`, `'descend'`, `null`) and by the **engine port's** `ioType` for regular ports. Never use `NetPort.ioType` for output classification.
- Driving-state rule from the base plan: an engine output port drives if its driven/signal bit (`elementIndex3`, `null` = always driven) is set; pull ports never count as drivers.
- `Circuit.markConflictDrivers(netList, instanceId, driverPortNames)` matches netlist ports by `uniqueName` via `itemByGID(gid).portByName(name)`; this lookup works for regular ports, ascend `Port` components and descend CustomComponent pins (the pin's `ComponentPort.name` equals the NetPort `name`).

## Marking rules (fixed point)

A net is **driving-active** if it is conflicted or contains a marked driving port. Marks are computed as the least fixed point of:

1. **Regular port** on a driving-active net: marked iff `isPortDriving(engineName)` (engine output port, driven, not a pull port). Tunnel/splitter ports have no engine ports → never marked.
2. **Ascend** (Port pipe, sits on its parent-side net): marked iff the net on its **sub-side** is driving-active. Marking an ascend also marks its paired **descend** pin (same net, same `compareName`) — this is the highlight visible on the outer circuit — and enqueues the sub-side net ids.
3. Every marked net joins `driving-active`; seeding starts from the conflicted net ids. Monotone → converges in O(netlist size).

This marks exactly the fan-in of each conflict: outputs driving conflicted nets (base behavior), the output Ports carrying those drivers outward, their pins at all outer levels, and the drivers feeding those pins — recursively. Inputs, undriven (high-impedance) outputs, pull ports, tunnels, splitters are never marked.

Reference scenario check (root inst 0, IC inst 1, IO inst 2): the conflict is on IC's internal net (netlist net 1: `buffer3.q`, `not3.q`, `a`/`b` ascends, IC-`q` ascend). Seeding from the conflict: rule 1 marks `buffer3.q`/`not3.q`; the IC-`q` ascend's sub-side net is driving-active → ascend marked → paired `q` descend pin (on root netlist net 0) marked → `Outer` grid shows the outline on the IC `q` pin. The `a`/`b` ascends' sub-side nets (button→enable nets) contain no driving outputs → not marked. The IO-`a` pair's sub-side net (netlist net 4: gate input, switch `q` undriven) is not driving-active → IO `a` pin and IO internals never marked. ✓

## Changes

### 1. Engine: replace the drivers query with two primitives — `src/sim/simulation.js`

Remove `resolveNetConflictDrivers()` (its two tests are adapted, see Tests). Keep `getNetConflict(id)`. Add:

```js
// Returns whether the port with the given engine port name is an output port currently in low-impedance (driving) state.
isPortDriving(name) {
    assert.string(name);
    const port = this.#ports.byName[name];
    if (!port || port.ioType !== 'o' || port.elementIndex2 === null) return false;
    if (port.isPull) return false; // pull resistors never cause conflicts (they only drive undriven nets)
    if (port.elementIndex3 === null) return true;
    return (this.#backend.mem[port.elementIndex3] & (1 << port.bitIndex)) !== 0;
}

// Returns a Set of net ids of nets currently in conflict state.
getConflictNetIds() {
    const ids = new Set();
    const mem = this.#backend.mem;
    for (const net of this.#nets.all) {
        if (net.elementIndexC !== null && (mem[net.elementIndexC] & (1 << net.bitIndex)) !== 0) ids.add(net.id);
    }
    return ids;
}
```

### 2. Cascade: `NetList.computeConflictDriverMarks()` — `src/sim/netlist.js`

Static method on `NetList` (netlist.js is loaded in the test VM, so the cascade becomes unit-testable):

```js
// Computes the set of NetPort.uniqueName values marking the driver chain (fan-in) of conflicted nets:
// driving outputs on driving-active nets and the Port/pin pairs carrying driving signals across nesting
// boundaries. isDrivingFn maps engine port names to booleans (driving output state).
static computeConflictDriverMarks(netList, conflictNetIds, isDrivingFn) {
    const netsByEngineId = new Map();   // engine net id -> [ netlist nets ]
    const subSideNetIds = new Map();    // ascend uniqueName -> [ engine net ids of the netlist nets containing it ]
    for (const net of netList.nets) {
        if (net.netId === null) continue;
        if (!netsByEngineId.has(net.netId)) netsByEngineId.set(net.netId, []);
        netsByEngineId.get(net.netId).push(net);
        for (const p of net.ports) {
            if (p.type === 'ascend') {
                if (!subSideNetIds.has(p.uniqueName)) subSideNetIds.set(p.uniqueName, new Set());
                subSideNetIds.get(p.uniqueName).add(net.netId);
            }
        }
    }
    const marked = new Set();
    const active = new Set(conflictNetIds); // driving-active engine net ids
    const queue = [...conflictNetIds];
    while (queue.length > 0) {
        const netId = queue.shift();
        for (const net of netsByEngineId[netId] ?? []) {
            for (const p of net.ports) {
                const isDriver = p.type === null ? isDrivingFn(p.uniqueName)
                    : p.type === 'ascend' ? [...(subSideNetIds[p.uniqueName] ?? [])].some((id) => active.has(id))
                    : false; // 'descend' and other types: pins mark via their paired ascend, splitters/tunnels never drive
                if (!isDriver || marked.has(p.uniqueName)) continue;
                marked.add(p.uniqueName);
                if (p.type === 'ascend') { // mark the pin(s) of this Port on the parent side (same netlist net)
                    for (const q of net.ports) {
                        if (q.type === 'descend' && q.compareName === p.compareName) marked.add(q.uniqueName);
                    }
                }
                if (!active.has(net.netId)) { active.add(net.netId); queue.push(net.netId); }
                for (const subId of subSideNetIds[p.uniqueName] ?? []) {
                    if (!active.has(subId)) { active.add(subId); queue.push(subId); }
                }
            }
        }
    }
    return marked;
}
```

(Notes: the ascend's marking loop over same-net descend ports is what makes the pin visible on the outer circuit; the sub-side enqueue (`subSideNetIds`) walks the chain one level deeper into the sub-circuit (an ascend appears in both the parent-side and the sub-side netlist nets, so its sub-side net ids include the net being processed plus the sub-circuit's internal net). The loop terminates because `active` and `marked` only grow. Multi-level nesting: the BFS walks the pin chain outward level by level (conflict net → sub-side Port → parent net → parent's Port → ...), marking pins at every level.)

### 3. `Simulations` — `src/ui/simulations.js`

Replace `updateConflictDriverMarks()` with `updateConflictMarks()`; rename the call sites in `src/ui/application.js` (`#singleStep`, `#stepToClockFlip`, "Show net conflicts" and "Single step" toggles) and in `Simulations.checkDirty`/`reattach`/`attach`:

```js
// Recomputes conflict driver port highlights for all circuit instances of this simulation (only marks in
// single-step mode with net conflict checking enabled, clears marks otherwise).
updateConflictMarks() {
    if (!this.#netList) return;
    const enabled = this.#app.config.singleStep && this.#app.config.checkNetConflicts && !!this.#engine;
    const marks = enabled
        ? NetList.computeConflictDriverMarks(this.#netList, this.#engine.getConflictNetIds(), (name) => this.#engine.isPortDriving(name))
        : new Set();
    for (const [ instanceId, instance ] of this.#netList.instances.entries()) {
        instance.circuit.markConflictMarks(this.#netList, instanceId, marks);
    }
}
```

Rename `Circuit.markConflictDrivers` → `markConflictMarks` (body unchanged; it now receives cascade marks and its `uniqueName` matching already handles ascend/descend ports).

### 4. No rendering/CSS changes

`ComponentPort.conflictDriver`, the `detachSimulation()` reset, the `renderNetState()` `net-conflict-driver` class toggle and the existing CSS outline rule stay as implemented. No new fields, no new CSS classes. (An earlier "glow on all ports of conflicted nets" draft is dropped — it would wrongly mark `InnerOk.a`.)

## Cost

Per event (step, recompile/attach, toggle): one engine pass O(nets) + one cascade pass O(netlist ports). Per-frame render cost unchanged (two `classList.toggle` calls per port, no-op when unchanged; class count unchanged).

## Tests

1. **Unit tests** (`test/test.js`), adapt the two existing tests to the new engine API:
   - "conflict driver port resolution": `getConflictNetIds()` empty before conflict / contains the pOutput net id during conflict; `isPortDriving` true for the two enabled buffer `q` ports, false for the disabled buffer's `q`; no-conflict state yields empty conflict ids.
   - "pull resistors are not conflict drivers": conflict present; `isPortDriving('q@pul0@0_0') === false`; constant and gate ports `true`.
2. **Cascade unit test** (VM realm, uses `NetList.computeConflictDriverMarks` directly): copy `res/dev/conflict-nesting.stc` to `test/data/nested_conflict.stc` (self-contained, no library dependency). Load `Outer`, `NetList.identify(circuit, app.circuits.all)`, compile with `checkNetConflicts: true`, simulate into conflict, compute marks. Assert the marked set is **exactly**:
   - IC-internal `buffer3.q` and `not3.q` regular port uniqueNames,
   - the IC-internal `q` ascend uniqueName (`compareName === 'q'`, `instanceId === IC instance`),
   - the IC `q` descend uniqueName (`compareName === 'q'`, root instance) —
   identified by `type`/`instanceId`/`compareName` over netlist ports (no gid literals). Assert no marks with `compareName === 'a'`/`'b'`/`'o'`, no marks in IO instances, no marks when the conflict is resolved (one enable low → `getConflictNetIds().size === 0`).
3. **Smoke test** (`test/smoke_conflict_marks.js`, new scenario in the VM realm): same setup, then per-instance `circuit.markConflictMarks(netList, instanceId, marks)`:
   - root circuit: IC CustomComponent's `q` port `conflictDriver === true`; IO's `a`/`q` pins and root `Port o`'s port not marked;
   - IC circuit: `buffer3.q`, `not3.q` and the `q` Port component's port marked; `a`/`b` Port components not marked;
   - IO circuit: nothing marked;
   - after resolving the conflict (enable low): marks cleared on re-mark.
4. `node test/test.js` and `node test/smoke_conflict_marks.js` pass.

## Manual verification

Open `res/dev/conflict-nesting.stc`, select `Outer`, enable "Show net conflicts", enter single-step (`T`): the `InnerConflict` `q` pin shows the orange outline, `InnerOk.a` stays plain. Zoom into `InnerConflict` (`W`): `buffer3.q`, `not3.q` and the `q` port outlined. Toggle one buffer's enable low: conflict gone, all outlines clear.
