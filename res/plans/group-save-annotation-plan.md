# Plan: Annotate components inside `Group` boxes on save (`"_group": <label>`)

> Status: Implemented. `Change 1` + `Change 2` are in place, the unit test "group annotation on save" passes (`node test/test.js`), and `util/circuit2txt.js` prints the annotation (see Change 3).

Goal: when a circuit is serialized to file, every grid item that sits inside a `Group` box gets an extra key `"_group": "<group label>"` in its serialized object. The key is purely informational for humans reading `.stc` files. Loading must ignore it completely: no runtime property, no simulation effect, no visual effect.

## Design decisions (fixed)

- **Computed at save time only.** The annotation is generated inside `Circuit.serialize()`; nothing is stored on the items themselves. Therefore moving/resizing/renaming a group needs no bookkeeping, and annotations can never become stale. Undo snapshots (`Grid.#captureUndoState`) and clipboard copy (`Action.copySelection`) use `item.serialize()` directly and therefore stay free of `_group` — intended.
- **Single call site:** `Circuit.serialize()` is the only producer. This covers file save (`Circuits.#serialize`, `saveFile`/`saveFileAs`), library export (`Circuits.serializeLibrary`) and the delete-circuit undo snapshot (`action.js`), all of which round-trip through `Circuit.unserialize` / `GridItem.unserialize`.
- **Key name/value:** `"_group"` with the group's label string, taken verbatim from `group.label` (no trimming, no uniquification). Duplicate labels of nested/adjacent groups are fine. The key is omitted entirely when an item is not inside any group (never write `"_group": null`).
- **Key placement:** appended after the item's own keys, i.e. after `'#c'`, `'#a'` and any existing extra keys such as `displayFormat`. No changes to the existing `serialize()` sorting in `Circuit.serialize()` (it reads `'#a'`/`'#c'` only).
- **Membership rule (center point):** an item belongs to a group box if its center point lies strictly inside the box rect. Grid coordinates are used directly (`Group.x/y` is the box top-left, `Group.width/height` are in grid units = px at zoom 1, exactly like the `visual` rect without zoom). Items sitting exactly on the box border are outside.
- **Nested groups:** the innermost (smallest area) containing group wins. Ties in area are broken by the group that appears first in `#data` (stable iteration → deterministic output). A `Group` box is itself annotatable when it sits inside another group box, but a group never annotates itself.
- **All item types are annotated**, including wires, probes, text labels, tunnels, ports, memories — any `GridItem` in the circuit's item list.
- **Load-side rule:** `GridItem.unserialize` applies unknown non-`'#'` keys as properties (`instance[k] = v`). Keys starting with `'_'` are skipped in addition to `'#'` keys. This makes `_group` (and any future `_`-prefixed informational key) inert on load, and prevents a `_group` property from ever being set on a `GridItem`.

## Change 1: `src/ui/circuit.js`

Rewrite the item mapping inside `serialize()` and add a private static helper.

```js
// Serializes the circuit for saving to file.
serialize() {
    const groups = this.#data.filter((i) => i instanceof Group);
    // sort wires/components by location to minimize diff against previous save (if any)
    const data = this.#data.map((item) => {
        const serialized = item.serialize();
        const groupLabel = Circuit.#enclosingGroupLabel(groups, item);
        if (groupLabel !== null) {
            serialized['_group'] = groupLabel; // informational only; ignored on load (see GridItem.unserialize)
        }
        return serialized;
    }).sort((a, b) => {
        /* ...unchanged sorting body... */
    });
    return { label: this.label, description: this.description, uid: this.uid, data, gridConfig: this.gridConfig, portConfig: this.portConfig, lid: this.#lid, visibleInLib: this.visibleInLib, exportName: this.exportName };
}

// Returns the label of the innermost group box whose rect strictly contains the center point of item, or null. Groups never annotate themselves.
static #enclosingGroupLabel(groups, item) {
    assert.array(groups, false, (g) => assert.class(Group, g));
    assert.class(GridItem, item);
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    let best = null;
    for (const group of groups) {
        if (group === item) {
            continue;
        }
        if (cx <= group.x || cx >= group.x + group.width) continue;
        if (cy <= group.y || cy >= group.y + group.height) continue;
        if (best === null || group.width * group.height < best.width * best.height) {
            best = group;
        }
    }
    return best?.label ?? null;
}
```

Notes:
- `this.#data` is a plain array (constructor / `addItem` / `clearItems`), so `filter`/`map` are fine.
- `GridItem` defines `width`/`height` getters defaulting to `0`, so the center point is safe for every item type (a zero-size item uses its own position).
- `Group` is a top-level `const` loaded via `index.html`; referencing it from `ui/circuit.js` at call time is fine (same pattern as `i instanceof SimulationComponent` in this file).

## Change 2: `src/griditem/griditem.js`

In `static unserialize(...)`, the "set remaining properties" loop becomes:

```js
// set remaining properties
if (!isError) {
    for (const [ k, v ] of Object.entries(item)) {
        // '#' keys are constructor/serialization internals; '_' keys are informational-only (e.g. '_group') and are ignored
        if (k.slice(0, 1) !== '#' && k.slice(0, 1) !== '_') {
            instance[k] = v;
        }
    }
}
```

No other code inspects serialized item keys, so nothing else needs a guard.

## Change 3: `util/circuit2txt.js`

Group boxes usually describe what the contained elements are for (e.g. a "Debug" cluster of extra components), so the annotation is useful context for anyone reading a circuit listing — in particular for models processing `.stc` files. `_group` is therefore listed explicitly as a trailing `[group: "label"]` marker instead of appearing among the generic extra keys:

```js
const extra = Object.entries(item).filter(([ k ]) => k[0] !== '#' && k[0] !== '_').map(([ k, v ]) => `${k}=${JSON.stringify(v)}`); // ignore serialization internals and informational-only keys (shown separately)
items.push({ type, x: args[0], y: args[1], args: args.slice(2), extra, group: item['_group'] ?? null });

for (const item of items) {
    const parts = [
        `${item.type.padEnd(15)} ${String(item.x).padStart(4)},${String(item.y).padStart(4)}`,
        item.args.map(a => JSON.stringify(a)).join(' '),
        item.extra.join(' '),
        item.group === null ? '' : `[group: ${JSON.stringify(item.group)}]`,
    ].filter((part) => part !== '');
    console.log(parts.join(' '));
}
```

Example output (nested boxes `Outer` > `Inner`):

```
Group            100, 100 400 300 "Outer" "small" null null
Group            120, 120 100 100 "Inner" "small" null null [group: "Outer"]
Gate             130, 130 0 "and" 2 [group: "Inner"]
Wire             130, 230 60 "h" null [group: "Outer"]
TextLabel        120, 440 0 100 "outside" "small" null
```

Old files (saved before this feature) simply have no marker. `util/dump.js --mode=raw` shows the raw JSON including `_group`.

## Tests

**Harness constraint:** the scenario must be built *inside the VM realm* (`test/lib/runner.js` loads all browser scripts into a `vm` context). Calling `new c.Application()` from node code fails: `Circuit`'s constructor calls `crypto.randomUUID()`, and inside VM code `crypto` resolves to the injected node object with the VM context object as `this`, which throws a `TypeError` about the context Proxy. Plain values (strings, numbers, booleans, `JSON.parse`d data) cross realms safely, which is why all existing helpers build objects in VM code and return plain data.

### `test/lib/runner.js` — add a VM-realm helper

Append inside the existing `vm.runInContext(\` ... \`, context)` helper block (next to `makeU8`). It is reachable from node as `context._groupAnnotationRoundTrip()`.

```js
    // Builds a circuit with nested Group boxes and items inside/outside, serializes it and
    // round-trips the serialized form back through Circuits.unserialize.
    function _groupAnnotationRoundTrip() {
        const app = new Application();
        const circuit = app.circuits.current;
        circuit.clearItems();
        circuit.addItem(new Group(app, 100, 100, 400, 300, 'Outer'));
        circuit.addItem(new Group(app, 120, 120, 100, 100, 'Inner'));
        circuit.addItem(new Gate(app, 140, 140, 0, 'and', 2));
        circuit.addItem(new Wire(app, 140, 240, 60, 'h'));
        circuit.addItem(new TextLabel(app, 120, 440, 0, 100, 'outside'));
        const serialized = circuit.serialize();
        const app2 = new Application();
        app2.circuits.unserialize(JSON.parse(JSON.stringify({ circuits: [ serialized ], currentUID: circuit.uid })), null, false, []);
        const items = [ ...app2.circuits.byUID(circuit.uid).items ];
        return {
            data: JSON.parse(JSON.stringify(serialized.data)),
            itemsWithGroupProp: items.filter((i) => i['_group'] !== undefined).length,
            wireWidth: items.find((i) => i instanceof Wire).width,
            itemCount: items.length,
        };
    }
```

### `test/test.js` — add to the "Misc tests" section

```js
test("group annotation on save", () => {
    const { data, itemsWithGroupProp, wireWidth, itemCount } = c._groupAnnotationRoundTrip();
    const find = (cls, x, y) => data.find((d) => d['#c'] === cls && d['#a'][0] === x && d['#a'][1] === y);

    assert(find('Group', 100, 100)['_group'] === undefined, 'outer group is not annotated');
    assert(find('Group', 120, 120)['_group'] === 'Outer', 'inner group is annotated with enclosing label');
    assert(find('Gate', 130, 130)['_group'] === 'Inner', 'gate in nested group uses innermost label');
    assert(find('Wire', 130, 230)['_group'] === 'Outer', 'wire inside outer group is annotated');
    assert(find('TextLabel', 120, 440)['_group'] === undefined, 'item outside all groups has no _group key');
    assert(itemCount === 5, 'all items round-tripped');
    assert(itemsWithGroupProp === 0, 'loaded items carry no _group property');
    assert(wireWidth === 60, 'wire round-trips unchanged');
});
```

Coordinate facts (verified by running the scenario; grid alignment happens in `GridItem.align`):
- `Group` and `TextLabel` snap to grid points (`n * SPACING`), so their constructor coordinates appear unchanged in `'#a'`.
- `Gate` and `Wire` snap to midpoints (`n * SPACING - SPACING/2`), so `Gate(…, 140, 140, …)` serializes as `x=130, y=130` and `Wire(…, 140, 240, 60, 'h')` as `x=130, y=230`.
- Boxes: `Outer` = 100..500 × 100..400, `Inner` = 120..220 × 120..220. Gate center ≈ (160, 150) → inside both → `'Inner'`. Wire center = (160, 230) → only `Outer`. TextLabel center = (170, 450) → outside both.

Run: `node test/test.js` (all tests must pass; pre-existing failures must be fixed in a separate commit).

## Manual verification

1. In browser: draw a `Group` box, put gates/wires/labels inside it, place one label outside, nest a second group inside the first, save with `Ctrl+S`.
2. `node util/dump.js --mode=raw res/examples/<file>.stc <label>` → items inside boxes show `"_group": "<label>"`, the outer box itself shows none, the nested box shows the outer label, items outside show none.
3. Reload the file: layout is unchanged, no console errors, no phantom properties (components behave identically; `node util/circuit2txt.js <file>.stc <label> --wires` shows the `[group: "label"]` markers).
4. Re-saving produces byte-identical annotation output (annotation is derived purely from positions), and moving an item out of the box removes the key on next save.
