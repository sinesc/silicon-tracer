# Conflict Path Highlight Through Sub-Circuits — Implementation Plan

## Goal

Output ports driving a conflicted net are already highlighted (orange outline, single-step + "Show net conflicts" mode). Extend the highlight so that **CustomComponent ports that lead (recursively) into a sub-instance containing a driver of a conflicted net are marked too**. The user can then follow the orange trail from a conflicted net at the current level into a sub-circuit, level by level, until reaching the actual driving output ports.

Example (`res/dev/conflict-nesting.stc`, circuit `Outer`): `InnerConflict` has a tri-state buffer and an inverter both driving its output port `q` (conflict). While `Outer` is on the grid, the `q` port of the `InnerConflict` component must be highlighted; the `a` port of `InnerOk` (also on that net, but its internal switch is disabled, so no driver inside that instance) must **not** be highlighted.

## Background (verified facts about the existing machinery)

- `NetList.identify()` **flattens the hierarchy**: `#assembleNet()`/`#recurseNet()` follow `ascend` (Port inside a sub-circuit) and `descend` (CustomComponent port in the parent) ports and merge all ports/wires of all levels into a single net object. For `conflict-nesting.stc` the net containing the conflict holds: `buffer3.q` (inst 1), `not3.q` (inst 1), `InnerConflict.q` (descend, inst 0), `InnerOk.a` (descend, inst 0), plus the ascend ports of the sub-circuits. So one engine net covers all nesting levels; no separate "sub-circuit net" exists.
- NetPort `ioType` is `null` for `CustomComponent`/`Port` entries (their ComponentPorts carry no ioType), so the direction of a CustomComponent port cannot be taken from the netlist. Instead, treat a port as a "conflict path" port when its sub-instance subtree actually contains a driver of the conflicted net — this also correctly skips high-impedance sub-circuit outputs.
- `Simulation.resolveNetConflictDrivers()` (`src/sim/simulation.js`) returns a Set of engine port names (e.g. `q@g4@1_0`, i.e. `<name>@<gid>@<instanceId>_<channel>`, which equals `NetList.NetPort.uniqueName`) of currently driven output ports on conflicted nets; pull-resistor ports are excluded. Verified for `conflict-nesting.stc`: it returns the two `q` names of instance 1 (InnerConflict) and nothing for the root instance, which is why nothing is highlighted while `Outer` is shown (`Circuit.markConflictDrivers()` only marks ports whose `instanceId` matches the instance being marked).
- `netList.instances[i]` is `{ circuit, netItems, gid, subInstances, parentInstanceId, simIds }`: `gid` is the CustomComponent gid **in the parent instance**, `parentInstanceId` is `null` for the root instance (0). `Circuit.itemByGID(gid).portByName(name)` maps a netlist port to a grid `ComponentPort`.
- Mark plumbing today: `Simulations.updateConflictDriverMarks()` → `Circuit.markConflictDrivers(netList, instanceId, driverPortNames)` → `ComponentPort.conflictDriver` → CSS class `net-conflict-driver` toggled in `Component.renderNetState()`. Trigger points (`checkDirty`/`reattach`/`attach`/`#singleStep`/`#stepToClockFlip`/toolbar toggles) stay unchanged. No CSS changes are needed — path ports get the same outline as real drivers ("follow the orange trail").

Marking rule to implement: for every conflicted net, walk from the instance of each of its driver ports up the `parentInstanceId` chain and mark, in each ancestor instance, the `descend` port of the child instance's CustomComponent that sits on that net. Repeat for every nesting level (the flattened netlist guarantees the intermediate level's descend port is on the same net).

Only the **currently displayed simulation instance** (`Simulations.#instanceId`) is ever marked: `ComponentPort` objects are shared by all instances of the same sub-circuit (one `Circuit` object per uid, see `NetList.#buildInstanceTree()`), so per-instance precision is only achievable for the instance that is actually on the grid — and only that one is rendered anyway.

## Changes

### 1. `Simulation` — group drivers by conflicted net (`src/sim/simulation.js`)

Replace the body of `resolveNetConflictDrivers()` with a per-net map plus a thin compatibility wrapper (existing unit tests keep using the Set version):

```js
    // Returns a Map of conflicted engine net id => Set of engine port names of output ports driving that net.
    // Nets with conflicts but no non-pull drivers appear with an empty Set.
    resolveNetConflictDriversByNet() {
        const result = new Map();
        const mem = this.#backend.mem;
        for (const net of this.#nets.all) {
            if (net.elementIndexC === null) continue; // net conflicts not compiled/enabled
            if ((mem[net.elementIndexC] & (1 << net.bitIndex)) === 0) continue; // no conflict on this net
            const drivers = new Set();
            for (const portName of net.ports) {
                const port = this.#ports.byName[portName];
                if (!port || port.ioType !== 'o' || port.elementIndex2 === null) continue;
                if (port.isPull) continue; // pull resistors never cause conflicts (they only drive undriven nets)
                const driven = port.elementIndex3 === null || (mem[port.elementIndex3] & (1 << port.bitIndex)) !== 0;
                if (driven) drivers.add(portName);
            }
            result.set(net.id, drivers);
        }
        return result;
    }

    // Returns a Set of port names of output ports that drive a net currently in conflict state.
    resolveNetConflictDrivers() {
        const drivers = new Set();
        for (const set of this.resolveNetConflictDriversByNet().values()) {
            for (const name of set) drivers.add(name);
        }
        return drivers;
    }
```

### 2. `Circuit` — mark drivers and ancestor path ports (`src/ui/circuit.js`)

Clearing moves out of `markConflictDrivers` into a new method (the caller clears first, then marks, so a Circuit that is re-marked for a different instance starts clean). `markConflictDrivers` now takes the Map from step 1 and marks both kinds of ports:

```js
    // Clears all net conflict driver marks on this circuit's component ports.
    clearConflictDrivers() {
        for (const component of this.#data) {
            if (!component.ports) continue;
            for (const port of component.ports) {
                port.conflictDriver = false;
            }
        }
    }

    // Applies net conflict marks (Simulation.resolveNetConflictDriversByNet(): net id => driving engine port names)
    // to this circuit instance's ports: the driving ports themselves, plus CustomComponent ports of ancestor
    // instances whose subtree contains a driver of a conflicted net (leads into the conflict when followed).
    // Engine port names equal NetList.NetPort.uniqueName ('<name>@<gid>@<instanceId>_<channel>').
    markConflictDrivers(netList, subCircuitInstance, conflictDrivers) {
        assert.class(NetList, netList);
        assert.integer(subCircuitInstance);
        assert.class(Map, conflictDrivers);
        for (const net of netList.nets) {
            if (net.netId === null) continue;
            const drivers = conflictDrivers.get(net.netId);
            if (!drivers || drivers.size === 0) continue;
            // descend ports of this net, keyed by 'parentInstanceId:customComponentGid'
            const descend = new Map();
            for (const port of net.ports) {
                if (port.type === 'descend') descend.set(port.instanceId + ':' + port.gid, port);
            }
            const mark = (port) => {
                const component = this.itemByGID(port.gid);
                const gridPort = component?.portByName(port.name);
                if (gridPort) gridPort.conflictDriver = true;
            };
            for (const port of net.ports) {
                if (port.instanceId === subCircuitInstance && drivers.has(port.uniqueName)) mark(port); // actual driver on the conflicted net
            }
            for (const port of net.ports) {
                if (!drivers.has(port.uniqueName)) continue;
                // walk up the instance chain from every driver's instance and mark the port of the sub-circuit we came from
                for (let child = port.instanceId; netList.instances[child].parentInstanceId !== null; ) {
                    const parent = netList.instances[child].parentInstanceId;
                    const pathPort = descend.get(parent + ':' + netList.instances[child].gid);
                    if (pathPort && pathPort.instanceId === subCircuitInstance) mark(pathPort);
                    child = parent;
                }
            }
        }
    }
```

Notes:
- `netList.instances[child].gid` is the CustomComponent gid in the parent instance, so `descend.get(parent + ':' + gid)` finds exactly the port of the sub-instance we came from (e.g. `InnerConflict.q` in `Outer`).
- Multi-channel ports yield several netlist entries per port; setting the flag repeatedly is harmless.
- CustomComponent `Port`s that are high-impedance are never marked because their subtree contributes no driver names.

### 3. `Simulations.updateConflictDriverMarks()` (`src/ui/simulations.js`)

Pass the Map and mark **only the currently attached instance** (`#instanceId`), after clearing that circuit:

```js
    // Recomputes conflict-driver port highlights for the circuit instance currently shown on the grid (only marks in single-step mode with net conflict checking enabled, clears marks otherwise).
    updateConflictDriverMarks() {
        if (!this.#netList) return;
        const circuit = this.#netList.instances[this.#instanceId].circuit;
        circuit.clearConflictDrivers();
        const enabled = this.#app.config.singleStep && this.#app.config.checkNetConflicts && !!this.#engine;
        if (enabled) circuit.markConflictDrivers(this.#netList, this.#instanceId, this.#engine.resolveNetConflictDriversByNet());
    }
```

All existing call sites already run with the correct `#instanceId`: `attach()` sets it to 0, `reattach()` sets it to the target instance (and switches the grid circuit) before calling `updateConflictDriverMarks()`, `checkDirty()` attaches `this.#netList.instances[this.#instanceId].circuit`. So navigating with `W` (which goes through `reattach()`) immediately re-marks for the newly displayed instance. No other call-site changes; `Component.detachSimulation()` still resets `conflictDriver = false`.

## Tests

1. **Test data**: copy `res/dev/conflict-nesting.stc` to `test/data/conflict-nesting.stc` (tests must not depend on scratch files in `res/dev/`). Instance ids when compiling `Outer`: 0 = `Outer`, 1 = `InnerConflict`, 2 = `InnerOk`.
2. **Engine test** in `test/test.js` (next to the existing `resolveNetConflictDrivers` tests):
   ```js
   const sim = compileCircuit('data/conflict-nesting.stc', 'Outer');
   sim.simulate(5);
   const byNet = sim.resolveNetConflictDriversByNet();
   assert(byNet.size === 1, `expected exactly 1 conflicted net, got ${byNet.size}`);
   const [ netId, drivers ] = [ ...byNet.entries() ][0];
   assert(sim.getNetConflict(netId) === true);
   assert(drivers.size === 2, `expected 2 drivers, got ${[ ...drivers ]}`);
   // all drivers live in the InnerConflict instance (1); the root instance has none -> no conflict visible at this level
   assert([ ...drivers ].every((n) => /@1_0$/.test(n)), `expected drivers only in instance 1, got ${[ ...drivers ]}`);
   ```
   `resolveNetConflictDrivers()` must still return the union of both driver names (regression check for the wrapper).
3. **UI-layer smoke test** `test/smoke_conflict_nested_marks.js` (same pattern as `test/smoke_conflict_marks.js`, uses `test/lib/runner` VM context, loads `../test/data/conflict-nesting.stc`): compile `Outer` with `NetList.identify(circuit, app.circuits.all)` + `compileSimulation(...)`, `engine.simulate(5)`; call `netList.instances[instanceId].circuit.clearConflictDrivers()` and `.markConflictDrivers(netList, instanceId, engine.resolveNetConflictDriversByNet())` once per instance and collect marked ports as `constructor.name + '.' + port.name` per circuit (the test drives `markConflictDrivers` per instance directly; production only ever calls it for the displayed instance):
   - instance 0 (`Outer`): exactly the `CustomComponent.q` port of the component whose `uid` resolves to label `InnerConflict` is marked; no `InnerOk` component port (`a`, `q`) is marked. (`Circuit.items` is not a plain array — use `circuit.items.filter(...).toArray()` when collecting.)
   - instance 1 (`InnerConflict`): exactly two `Builtin.q` ports marked.
   - instance 2 (`InnerOk`): nothing marked.
   - clearing: set both `Outer` Button components' consts to 0 (`circuit.attachSimulation(netList, 0)` gives `button.simIds[0]`; `engine.setConstValue(id, 0)`), `engine.simulate(5)`, re-mark for all instances → no marks anywhere (`resolveNetConflictDriversByNet()` is empty; only the two buttons drive the conflicting net, the `InnerOk` switch stays off and the root `o` port is undriven).
4. Update `test/smoke_conflict_marks.js` for the new API: call `circuit.clearConflictDrivers()` before `circuit.markConflictDrivers(netList, 0, engine.resolveNetConflictDriversByNet())`.
5. Run `node test/test.js` (all tests pass) and `node test/smoke_conflict_marks.js` + `node test/smoke_conflict_nested_marks.js`.

## Manual verification

Open `index.html`, load `res/dev/conflict-nesting.stc`, select circuit `Outer`, attach the simulation, enable **Show net conflicts** and **Single step**. Single-step: the `q` port of `InnerConflict` gets the orange outline, `InnerOk`'s ports do not. Hover `InnerConflict.q` and press `W` to navigate into the sub-circuit: the two `buffer3`/`not3` `q` ports are outlined there. Toggling one button so only one output drives clears all outlines.

Per-instance check with a duplicated sub-circuit: paste a second copy of the `InnerConflict` component into `Outer` (both instances are not wired, so only the first still conflicts), navigate into the **second** instance's sub-circuit with `W` — no outlines must appear there even though the first instance's internal ports are marked when viewed (both instances share one `Circuit`).

## Known limitations (accepted)

- Marks exist only for the currently displayed simulation instance; circuits of other instances carry no marks (they are not rendered, and their `ComponentPort` objects are shared with the displayed instance, so per-instance marks are not representable).
- A conflict that is completely internal to a sub-circuit and does not sit on a net connected to one of its ports produces no highlight at the parent level (nothing to follow).
