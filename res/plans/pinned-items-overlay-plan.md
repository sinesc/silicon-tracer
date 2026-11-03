# Pinned Items Overlay — Implementation Plan

## Goal

Add a "Pinned" info-box overlay listing all pinned grid items. Any `GridItem` on the grid (except `WireBuilder`) can be pinned/unpinned by hovering over it and pressing `p`. Clicking a list entry opens the *containing* circuit on the grid — as the correct simulation instance if the pinned item is part of the current simulation. Purpose: quick access to deeply nested items (e.g. inspect a memory inside a sub-circuit) during a simulation.

## Design

- **Pin storage:** `PinsOverlay` keeps one global list (not per-simulation) of entries `{ circuitUid, gid, instanceId }`. The item is re-resolved on demand via `app.circuits.byUID(circuitUid)` + `circuit.itemByGID(gid)`, so entries survive circuit switches and simulation recompiles. Unresolvable entries are silently dropped when the list is built (handles item/circuit deletion).
- **instanceId capture (pin time):** at pin time, if `app.simulations.current` exists and its currently attached instance's circuit (`sim.instances[sim.instanceId].circuit`) is the grid circuit the item is on, store that `instanceId`; otherwise store `null`.
- **Click = open containing circuit:**
  1. If a current simulation exists and `sim.instances[entry.instanceId]?.circuit.uid === entry.circuitUid` → `sim.reattach(entry.instanceId)`.
  2. Else if a current simulation has *any* instance whose circuit uid matches → `sim.reattach(firstMatchId)` (instance ids are treated as stable across recompiles, same assumption as `MonitorOverlay.refresh()`; this is the fallback if the captured id went stale).
  3. Else → `app.circuits.select(entry.circuitUid)` (plain grid navigation, e.g. un-simulated circuits/libraries).
- **Visibility:** renders nothing while the list is empty (same pattern as `MonitorOverlay.#buildHtml()` returning `''`).
- **Hover highlight:** hovering an overlay row sets `item.highlighted = true` on the resolved grid item if it is currently displayed (`Component.highlighted` toggles a CSS class and is safe for unlinked items via `#element?.`); cleared on mouseout. Mirror `GraphOverlay.#setHovered()`.
- **Unpinning:** `p` toggles; each overlay row also gets a small `✕` button so items in non-visible circuits can be unpinned.
- **Persistence (save file):** out of scope; may be added later as a `_`-prefixed or dedicated key, following the `componenttoolbar` `toolbarPins` serialization pattern.

## Implementation steps

### 1. `src/griditem/griditem.js` — pin hotkey in the base class

```js
// Implement to handle hover hotkey events. Should call parent and exit early on true result.
onHotkey(key, action, what) {
    if (key === 'p' && action === 'down' && (what?.type === 'hover' || what?.type === 'hover-port')) {
        this.grid.pinsOverlay.togglePin(this);
        return true;
    }
    return false;
}
```

Accept both hover target types so ports (registered with `{ type: 'hover-port' }`) are pinnable. Extend the hint: `static HOTKEYS = '<i>Click</i> Select, <i>SHIFT/CTRL+Click</i> Add/remove from selection, <i>P</i> Pin';` — `Component.HOTKEYS` and the Wire hover message already interpolate `GridItem.HOTKEYS`, so the hint propagates to nearly all items for free.

`'p'` is not used by any other hotkey (grid: ctrl+f/a/v/c/x, r, Delete, arrows, e, w, 0-9; app: t, u, e, ctrl+s/z/y; hover targets: r, Delete, e, E, m, M, w, 0-3).

### 2. Chain `super.onHotkey()` in subclasses that don't

`onHotkey()` is overridden in: `component.js`, `customcomponent.js`, `button.js`, `switch.js`, `port.js`, `probe.js`, `memory.js`, `group.js`, `textlabel.js`, `wire.js`. Already chaining: button, switch, port, probe, memory, customcomponent. **Fix the four that swallow it** by inserting `if (super.onHotkey(key, action, what)) return true;` at the very top, *before* any `action !== 'down'` early return:

- `src/griditem/component.js` `onHotkey()` (covers gates, builtins, clocks, memories, displays, tunnels, splitters, power, constants, ...)
- `src/griditem/wire.js` `onHotkey()`
- `src/griditem/group.js` `onHotkey()`
- `src/griditem/textlabel.js` `onHotkey()`

`WireBuilder.onHotkey()` (`src/grid/wirebuilder.js`) needs nothing: `WireBuilder` is not a `GridItem`, so it never reaches the base implementation → automatically excluded.

### 3. New file `src/overlay/pinsoverlay.js` — `PinsOverlay extends Overlay`

Follow the `MonitorOverlay` structure (cached-HTML `dirty()`/`render()`, `#lastHtml` compare):

- `togglePin(item)` — `assert.class(GridItem, item)`; look up existing entry by `gid`; remove it, else push `{ circuitUid: item.grid.circuit.uid, gid: item.gid, instanceId }` with `instanceId` captured as described in Design.
- `#resolve(entry)` — returns `{ circuit, item }` or `null` (circuit or item gone).
- `#buildHtml()` — `''` if list empty (after dropping unresolvable entries); otherwise:
  ```html
  <div class="info-section">Pinned</div>
  <div class="pin-item" data-idx="N">…label… <span class="pin-unpin" data-idx="N">✕</span></div>
  ```
  Label: item type/name + containing circuit for orientation, e.g. `Memory ROM` + dim suffix `ALU@7` (instance label from `sim.instances[iid].circuit.label` + `@iid` suffix when a sim instance applies, else plain circuit label; `Wire` → `'Wire'` since it has no `typeLabel`). Use `item.typeLabel` + `item.name` where available.
- `render(node)` — sets innerHTML, then wires delegated handlers on the list wrapper (as `GraphOverlay` does): `onclick` (`✕` → remove entry; row → `#openPin(entry)`), `onmouseover`/`onmouseout` → `#setHovered(idx)` toggling `item.highlighted` (guard: only when `item.grid !== null`, i.e. item is on the visible grid; skip items without a `highlighted` setter).
- `#openPin(entry)` — the 3-step open logic from Design.
- `refresh()` — called after simulation recompile (see step 4); re-resolves all entries and re-validates `instanceId` (`sim.instances[instanceId]?.circuit.uid === circuitUid`, else re-find first matching instance). Same role as `MonitorOverlay.refresh()`.

### 4. `src/grid/grid.js` — register & refresh

- In the `if (!passive)` constructor block, next to the other overlays: `this.pinsOverlay = this.registerOverlay(100, new PinsOverlay(app));` (100 ms interval like the monitor overlay; `dirty()` cheap-guards re-render).
- In the render loop's `if (this.#pending.monitorRefresh)` block, also call `this.pinsOverlay.refresh();` — no new pending flag needed (`markSimulationRecompiled()` already sets `monitorRefresh`).

### 5. Wire highlight support

`Wire` has no `highlighted` accessor. Add getter/setter to `src/griditem/wire.js` mirroring `Component` (`this.#element?.classList.toggle('highlighted', ...)`), plus a `.wire.highlighted` style next to `.component.highlighted` (`src/ui.css` ~line 1158). Also style `.pin-item` (pointer cursor, hover background, `.pin-unpin` hidden until row hover, `.graph-tree li:hover` as visual reference).

### 6. Hover message hints

`GridItem.HOTKEYS` update in step 1 covers Component-family items and wires. `Button`/`Switch` use their own `hotkeyHint()` strings that already embed `Component.HOTKEYS` — verify the pin hint shows there; leave custom-mode-specific hints (button `1`/`2`) untouched.

## Gotchas

- `Component.onHotkey`/`Group`/`TextLabel`/`Wire` currently `return` early for `action !== 'down'` *before* any parent call — super must be chained first, not last.
- SearchBar highlights use the same `highlighted` class; clearing a search can visually drop a pin hover highlight — acceptable, cosmetic.
- One `Circuit` object backs *all* simulation instances of a sub-circuit (`NetList`), so a pinned item inside a doubly-instantiated sub-circuit is inherently ambiguous; the pin-time captured `instanceId` disambiguates it as precisely as possible.
- Hover hotkeys require the grid hover target (`Grid.#hotkeyTarget`), so `p` only works while the mouse is over the item's registered hover element and the grid is not read-only/passive.
- `unsetCircuit()`/`setCircuit()` reset `lastRenderTime` on all overlay sections, so the Pinned list re-renders on circuit switches without waiting for the interval.

## Testing

- `node test/test.js` must pass (pre-existing failures fixed in a separate commit).
- Manual: pin gate/memory/wire/port/probe/custom-component in a nested instance of an example circuit (e.g. merge with `res/libs/74SeriesLogic.stc`), navigate away, click entries → correct instance opens and stays simulated (`W` goes back to parent); `p` on a hovered pinned item unpins; ✕ unpins hidden items; list hidden when empty; hover row highlights item on grid when visible; recompile (edit sub-circuit) keeps pins intact; delete a pinned item → entry disappears.
