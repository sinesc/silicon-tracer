# Plan: Info box "Parts" overlay

## Goal

Add an info box overlay section listing the physical hardware parts used by the circuit currently shown on the grid, grouped and counted, sorted by part name:

```
Parts (12)
2x 74x74
4x AND (3)
6x NOR (2)
```

Counting rules:

- Gates, builtins, memories, 7-segment displays and pull resistors count as parts, using their own display name.
- A custom component counts as **one** part named after the represented circuit's `exportName` (e.g. a custom circuit exported as `74x74` → `2x 74x74`).
- A custom component whose circuit has **no** export name is not a part itself; its sub-circuit is counted recursively with the same rules (so a `4-bit adder` made of two `74x74` chips contributes `2x 74x74` to the parent circuit).
- Everything that is not a real-world part is excluded.

## Part classification (final decisions)

Counted:

| Item class | Part name | Example |
|---|---|---|
| `Gate` | `TYPE (numInputs)` | `AND (3)`, `NOR (2)`, `NOT (1)` |
| `Builtin` | `item.topMarkings` (from `Builtin.META_INFO[type].label`) | `D flip-flop`, `Multiplexer` |
| `Memory` | `item.topMarkings` | `ROM 8x8`, `RAM 16x8` |
| `SegmentDisplay` | `SegmentDisplay.TYPE_LABEL_LONG` | `7-Segment Display` |
| `PullResistor` | `Pull-<direction> resistor` | `Pull-up resistor` |
| `CustomComponent` | `app.circuits.byUID(item.uid).exportName` (non-empty) | `74x74` |

Excluded (not physical parts): `Wire`, `Group`, `TextLabel`, `Port` (the circuit's own interface pins), `Splitter`, `Tunnel`, `Probe`, `Power` (all modes: power/ground/**not connected**), `Constant` (drives a fixed value like a hard-wired tie), `Button`, `Switch`, `Clock` (simulation-only input devices), and non-exported `CustomComponent` (handled by recursion instead).

Sorting: by part name, natural/numeric ordering, matching `Circuits.list()`: `a[0].localeCompare(b[0], 'en', { numeric: true })`.

## Verified facts

- Info box sections are `Overlay` subclasses registered in `src/grid/grid.js` (`registerOverlay(interval, overlay)`). Interval `1000` = re-check `dirty()` every second, `-1` = only on circuit switch (`setCircuit()` resets `lastRenderTime`, see `src/grid/grid.js:146-149`). Collapse state is persisted per overlay class name in `app.config.overlays`, clicking `.info-section` toggles collapse — no extra work needed.
- Existing sections, in DOM order: Circuit (1000), Dependents (-1), Simulation (1000), Monitor (100), Graph (1000). Registration order defines display order.
- Cached-HTML pattern of all sections: `dirty()` computes the HTML, compares against `#lastHtml`, caches it; `render()` consumes the cache and writes `node.innerHTML`.
- `Circuit.items` is a one-shot generator (`values(this.#data)`), iterate once.
- `Circuit.exportName` (default `''`) is set by the circuit config dialog (`src/ui/circuit.js`), `Circuits.byUID(uid)` returns the `Circuit` or `undefined` (missing sub-circuits must be skipped).
- `Gate.type` is the lowercase `Simulation.GATE_MAP` key (`'and'`, `'nor'`, ...), `Gate.inputs` is the input port name array; `String.prototype.toUpperFirst` exists in `src/common.js` but there is **no** `toUpper`, so use `item.type.toUpperCase()`.
- `PullResistor` keeps `#direction` private with no getter → add `get direction()`.
- `Circuit` constructor accepts no grid; `circuit.addItem()` works on unlinked circuits (see `_groupAnnotationRoundTrip` in `test/lib/runner.js`), so tests can build fixtures programmatically and register them with `app.circuits.add(circuit)`.
- Test harness loads all `index.html` scripts (except `SKIP_SCRIPTS`) into one VM context, so top-level functions declared in a new overlay file are callable from test helpers.
- The global names `countParts` / `partName` / `PartsOverlay` are unused in `src/`, `test/`, `util/` (verified with grep), so the top-level functions do not shadow anything (classic scripts share one global scope).

## Implementation

### 1. `src/overlay/partsoverlay.js` (new file)

Counting lives in plain top-level functions (not private class methods) so it is unit-testable from the test VM.

```js
"use strict";

// Returns the part name for a grid item, or null if the item is not a physical part.
// Non-exported custom components also return null here; countParts() recurses into them.
function partName(app, item) {
    assert.class(Application, app);
    assert.class(GridItem, item);
    if (item instanceof Gate) return `${item.type.toUpperCase()} (${item.inputs.length})`;
    if (item instanceof Builtin || item instanceof Memory) return item.topMarkings;
    if (item instanceof SegmentDisplay) return SegmentDisplay.TYPE_LABEL_LONG;
    if (item instanceof PullResistor) return `Pull-${item.direction} resistor`;
    if (item instanceof CustomComponent) return app.circuits.byUID(item.uid)?.exportName || null;
    return null;
}

// Counts physical parts of a circuit into counts (Map<part name, count>). Custom components
// without export name are counted by recursing into their sub-circuit.
// `path` holds the circuit UIDs of the current recursion branch and breaks reference cycles
// (a circuit that contains itself contributes nothing on the recursive path).
function countParts(app, circuit, counts = new Map(), path = new Set([ circuit.uid ])) {
    assert.class(Application, app);
    assert.class(Circuit, circuit);
    for (const item of circuit.items) {
        const name = partName(app, item);
        if (name !== null) {
            counts.set(name, (counts.get(name) ?? 0) + 1);
        } else if (item instanceof CustomComponent && !path.has(item.uid)) {
            const sub = app.circuits.byUID(item.uid);
            if (sub) countParts(app, sub, counts, new Set([ ...path, sub.uid ]));
        }
    }
    return counts;
}

// Overlay section listing the part counts of the circuit on the grid.
class PartsOverlay extends Overlay {
    #lastHtml = undefined;
    #cachedHtml = null;

    static #escape(text) {
        assert.string(text);
        return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    }

    #buildHtml() {
        const circuit = this.app.grid.circuit;
        if (!circuit) return '';
        const parts = [ ...countParts(this.app, circuit).entries() ]
            .sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
        if (parts.length === 0) return '';
        const total = parts.reduce((sum, [ , count ]) => sum + count, 0);
        const rows = parts.map(([ name, count ]) =>
            `<div class="info-details">${count}x ${PartsOverlay.#escape(name)}</div>`).join('');
        return `<div class="info-section">Parts (${total})</div><div class="parts-list">${rows}</div>`;
    }

    dirty() {
        this.#cachedHtml = this.#buildHtml();
        return this.#cachedHtml !== this.#lastHtml;
    }

    render(node) {
        const html = this.#cachedHtml ?? this.#buildHtml();
        this.#cachedHtml = null;
        this.#lastHtml = html;
        const prev = node.querySelector('.parts-list');
        const scrollTop = prev ? prev.scrollTop : 0;
        node.innerHTML = html;
        const next = node.querySelector('.parts-list');
        if (next) next.scrollTop = scrollTop;
    }
}
```

### 2. `index.html` — load the new file

Add after the other overlay scripts (order among overlay files is irrelevant, they only define classes):

```html
<script src="src/overlay/partsoverlay.js"></script>
```

### 3. `src/grid/grid.js` — register the section

In the constructor's overlay registration block, add right after the CircuitOverlay line so "Parts" appears below "Circuit" (sections render in registration order, so "Dependents" moves below "Parts"). 1000 ms keeps the list fresh after edits (gate placement/deletion, circuit edits) while being cheap (one item walk per second, HTML comparison gates the DOM write):

```js
this.circuitOverlay = this.registerOverlay(1000, new CircuitOverlay(app));
this.partsOverlay = this.registerOverlay(1000, new PartsOverlay(app));
```

### 4. `src/griditem/pullresistor.js` — expose the pull direction

Add next to the existing accessors (used by the part name):

```js
get direction() { return this.#direction; }
```

### 5. `src/ui.css` — list container

Add next to the existing `/* dependents overlay list */` block. `pointer-events: auto` is required because `.grid-info` disables pointer events (needed for scrolling):

```css
/* parts overlay list */
.grid-info .parts-list {
    max-height: 240px;
    overflow-y: auto;
    scrollbar-width: thin;
    pointer-events: auto;
}
```

### 6. Tests

`test/lib/runner.js` — add a VM helper (inside the existing `vm.runInContext(...)` helper block, next to `_groupAnnotationRoundTrip`) that builds a fixture circuit and returns the raw count map:

```js
// Builds a circuit with counted parts, excluded items, an exported custom component and a
// non-exported custom component with nested parts and a self-reference cycle. Returns plain data.
function _countPartsFixture() {
    const app = new Application();
    const exported = new Circuit(app, 'Chip');
    exported.exportName = '74x74';
    app.circuits.add(exported);

    const inner = new Circuit(app, 'Inner');       // non-exported, contains one gate
    app.circuits.add(inner);
    inner.addItem(new Gate(app, 100, 100, 0, 'and', 3));

    const cyclic = new Circuit(app, 'Cyclic');     // non-exported, contains itself
    app.circuits.add(cyclic);
    cyclic.addItem(new CustomComponent(app, 100, 100, 0, cyclic.uid));
    cyclic.addItem(new Builtin(app, 200, 100, 0, 'srlatch'));

    const circuit = new Circuit(app, 'Main');
    app.circuits.add(circuit);
    circuit.addItem(new Gate(app, 100, 100, 0, 'and', 3));
    circuit.addItem(new Gate(app, 200, 100, 0, 'and', 3));
    circuit.addItem(new Gate(app, 300, 100, 0, 'nor', 2));
    circuit.addItem(new Builtin(app, 400, 100, 0, 'dflipflop'));
    circuit.addItem(new SegmentDisplay(app, 500, 100, 0));
    circuit.addItem(new PullResistor(app, 600, 100, 0, 'up'));
    circuit.addItem(new Memory(app, 700, 100, 0, 'rom', 8, 8));
    circuit.addItem(new CustomComponent(app, 800, 100, 0, exported.uid));
    circuit.addItem(new CustomComponent(app, 900, 100, 0, inner.uid));
    circuit.addItem(new CustomComponent(app, 1000, 100, 0, cyclic.uid));
    circuit.addItem(new CustomComponent(app, 1100, 100, 0, 'u-missing-circuit'));
    // excluded items
    circuit.addItem(new Wire(app, 100, 200, 60, 'h'));
    circuit.addItem(new TextLabel(app, 100, 300, 0, 100, 'note'));
    circuit.addItem(new Splitter(app, 100, 400, 0, 2));
    circuit.addItem(new Tunnel(app, 100, 500, 0));
    circuit.addItem(new Probe(app, 100, 600, 0, 'probe'));
    circuit.addItem(new Power(app, 100, 700, 0, 'ground'));
    circuit.addItem(new Port(app, 100, 800, 0));
    circuit.addItem(new Clock(app, 100, 900, 0));
    circuit.addItem(new Button(app, 100, 1000, 0));
    circuit.addItem(new Switch(app, 100, 1100, 0));
    circuit.addItem(new Constant(app, 100, 1200, 0));
    circuit.addItem(new Group(app, 400, 200, 100, 100, 'Box'));
    return [ ...countParts(app, circuit).entries() ];
}
```

Constructor signatures used above are the real ones (verified in `src/griditem/`): `Gate(app, x, y, rotation, type, numInputs)`, `Builtin(app, x, y, rotation, type)`, `Memory(app, x, y, rotation, memType, addressWidth, dataWidth)`, `SegmentDisplay(app, x, y, rotation, color)`, `PullResistor(app, x, y, rotation, direction)`, `CustomComponent(app, x, y, rotation, uid)`, `Splitter(app, x, y, rotation, numSplits)`, `Tunnel(app, x, y, rotation)` (network name is the public `name` field, not a constructor argument), `Probe(app, x, y, rotation, name)`, `Power(app, x, y, rotation, mode)`, `Port/Clock(app, x, y, rotation)`, `Button/Switch(app, x, y, rotation, mode)`, `Constant(app, x, y, rotation, value)`, `Group(app, x, y, width, height, label)`, `Wire(app, x, y, length, orientation)`, `TextLabel(app, x, y, rotation, width, text)`.

`test/test.js` — new test in the "Misc tests" section:

Fixture layout: `Main` has two 3-input AND gates, `Inner` (non-exported, referenced once) has a third 3-input AND gate, `Cyclic` (self-referencing, non-exported) has one SR latch builtin. Expect `AND (3) === 3` (recursion counted) and `SR latch === 1` (cycle stops, contents counted once).

```js
test("parts overlay counting", () => {
    const parts = new Map(c._countPartsFixture());
    assert(parts.get('AND (3)') === 3, `2x own gate + 1x from non-exported sub-circuit, got ${parts.get('AND (3)')}`);
    assert(parts.get('NOR (2)') === 1, `1x 2-input NOR, got ${parts.get('NOR (2)')}`);
    assert(parts.get('D flip-flop') === 1, `builtin counted by label, got ${parts.get('D flip-flop')}`);
    assert(parts.get('7-Segment Display') === 1, `segment display counted, got ${parts.get('7-Segment Display')}`);
    assert(parts.get('Pull-up resistor') === 1, `pull resistor counted, got ${parts.get('Pull-up resistor')}`);
    assert(parts.get('ROM 8x8') === 1, `memory counted, got ${parts.get('ROM 8x8')}`);
    assert(parts.get('74x74') === 1, `exported custom component counts as its export name, got ${parts.get('74x74')}`);
    assert(parts.get('SR latch') === 1, `self-referencing sub-circuit counts its own parts once, got ${parts.get('SR latch')}`);
    assert(!parts.has('Inner') && !parts.has('Cyclic') && !parts.has('Chip'), 'non-exported custom components are recursed into, not listed');
    assert([ 'Wire', 'TextLabel', 'Group', 'Splitter', 'Tunnel', 'Probe', 'Power', 'Port', 'Clock', 'Button', 'Switch', 'Constant' ]
        .every((name) => !parts.has(name)), 'non-part items are excluded');
    assert(parts.size === 8, `exactly the expected part groups, got ${[ ...parts.keys() ].join(', ')}`);
});
```

Run: `node test/test.js` (all tests must pass; fix pre-existing failures in a separate commit).

### 7. Manual verification

- Open the app, load e.g. `res/examples/` circuits: the section shows `Parts (<total>)` and the sorted list; collapse via the header arrow; state persists across sessions.
- Note: `res/libs/74SeriesLogic.stc` has `exportName: ""` on every circuit, so it counts as plain gates. To exercise the export-name path, open a circuit (e.g. a merged copy: `node util/merge.js /tmp/merged.stc <file.stc> res/libs/74SeriesLogic.stc`), set its **Optional export name** in the circuit config dialog to e.g. `74x74`, then check that the parent circuit's list shows `Nx 74x74` instead of recursing.
- Edit a circuit (add/remove gates): the list updates within ~1 s.
- Load a circuit with a missing sub-circuit (`#u` not present): no crash, item is skipped.

## Out of scope

- Counting gate-equivalents of builtins (`Builtin.META_INFO[type].gateCount`) and sub-circuit gate counts shown by the Circuit section.
- Exporting/printing the parts list, per-instance part lists in libraries, BOM price/pin data.
