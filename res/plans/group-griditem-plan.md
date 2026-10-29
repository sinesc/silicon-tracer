# Plan: `Group` GridItem

> Status: Phase 1 and Phase 2 implemented. Phase 2 also added `border-radius: 3px` on the box fill (matching components).

Purely visual grid item that renders a fieldset-style labeled box (label floating over the top-left border). No effect on simulation. Modeled after `TextLabel` (`src/griditem/textlabel.js`), which is the reference for lifecycle, dialog, drag, and rendering patterns.

Phase 1: the Group item itself. Phase 2 (follow-up): corner drag handle for resizing.

## Design decisions (fixed)

- Width/height are stored in grid units (1 px at zoom 1), snapped to grid multiples. Defaults: 240 × 120.
- No rotation (a rectangle looks the same rotated; skip all rotation code paths).
- Text color: same values as TextLabel (`'-'` = default white, `'c0'..'c9'`).
- Background color: same as TextLabel plus black. Stored internally as integer `null` (default/white) | `0..9` | `10` (`Group.COLOR_BG_BLACK`); the dialog uses the codes `'-' | 'c0'..'c9' | 'k'`.
- Fill renders at 25% opacity; border in same color at 50% opacity. Black background uses a dark grey border (`#666` at 50%) so the box stays visible.
- Groups render below all other grid items: `z-index: 10` (components are 11, text 12, wires 13+).
- Box interior is click-through (`pointer-events: none`); only the label (and the resize handle) receive mouse events, so components inside a group remain selectable. Drag/select is done via the label.

## New file: `src/griditem/group.js`

`class Group extends GridItem`, `GridItem.CLASSES['Group'] = Group;` at bottom.

Constructor:

```js
constructor(app, x, y, width = 240, height = 120, label = 'Group', fontSize = 'small', color = '-', bgColor = '-')
```

- `assert.integer(width); assert.integer(height); assert.string(label); ...`
- `this.width = width; this.height = height;` (grid units)
- `align(x, y)` snaps to grid points like TextLabel: `const half = Grid.SPACING / 2; const [ax, ay] = Grid.align(x - half, y - half); return [ax + half, ay + half];`

Serialize:

```js
serialize() {
    return { ...super.serialize(), '#a': [this.x, this.y, this.width, this.height, this.#label, this.#fontSize, this.#color, this.#bgColor] };
}
```

Unserialization works automatically via `GridItem.unserialize` (CLASSES registry).

### DOM (link/unlink)

In `link(grid)`:

```js
this.#element = html(null, 'div', 'group');
this.#fill = html(this.#element, 'div', 'group-fill');   // background + border, non-interactive
this.#labelEl = html(this.#element, 'span', 'group-label');
this.setHoverMessage(this.#labelEl, () => `<b>${this.typeLabel}</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
this.registerMouseAction(this.#labelEl, { type: 'component', grabOffsetX: null, grabOffsetY: null });
this.grid.addVisual(this.#element);
```

`unlink()` mirrors TextLabel (remove label, fill, element via `grid.removeVisual`).

### Accessors

- `get typeLabel()` / `selected` getter+setter: copy from TextLabel.
- `color`, `bgColor`, `label`, `fontSize` setters set the private field and `this.renderFlags |= GridItem.NEEDS_DETAIL_RENDER;`
- `width`/`height` changes set `this.renderFlags |= GridItem.NEEDS_FULL_RENDER;`

`match(string)` → `this.#label.toLowerCase().includes(string)`.

### Hotkeys

`onHotkey`: `'e'` → `onEdit()`, `'Delete'` → `grid.removeItem(this)` (with `animateAction(this.#element, 'component-delete', ...)`, same as TextLabel). No `'r'` rotation.

### Drag (move)

`onDrag`/`onMove` copied from TextLabel (`what.type === 'component'`), trackAction names `'Add group'` / `'Move group'`. Drop preview: `html(null, 'div', 'group-drop-preview')`, positioned like TextLabel's, sized `this.#element.offsetWidth/offsetHeight`.

### Dialog

Field list (use `type: 'int'` with `postCheck` for size, same select options as TextLabel for colors, plus black):

```js
static EDIT_DIALOG = [
    { name: 'label', label: 'Label', type: 'string', check: (v, f) => v.trim().length > 0 },
    { name: 'fontSize', label: 'Font size', type: 'select', options: { "small": "Small", "medium": "Medium", "large": "Large" } },
    { name: 'color', label: 'Text color', type: 'select', options: { "-": "White", "c0": "Mint", "c1": "Green", "c2": "Yellow", "c3": "Orange", "c4": "Red", "c5": "Ruby", "c6": "Magenta", "c7": "Purple", "c8": "Blue", "c9": "Turquoise" } },
    { name: 'bgColor', label: 'Background', type: 'select', options: { "-": "White", "c0": "Mint", "c1": "Green", "c2": "Yellow", "c3": "Orange", "c4": "Red", "c5": "Ruby", "c6": "Magenta", "c7": "Purple", "c8": "Blue", "c9": "Turquoise", "k": "Black" } },
    { name: 'width', label: 'Width', type: 'int', postCheck: (v, f) => isFinite(v) && v >= Grid.SPACING },
    { name: 'height', label: 'Height', type: 'int', postCheck: (v, f) => isFinite(v) && v >= Grid.SPACING },
];
```

`editDialogConfig`, `getPlacementDefaults` (returns `app.config.placementDefaults.group`), `onEdit`, `descriptorInfo`, `fromDescriptor`: copy structure from TextLabel (drop rotation). `fromDescriptor` reads defaults from `app.config.placementDefaults.group` merged with `overrideDefaults`.

### Rendering

```js
renderFull() {
    if (!super.renderFull()) return false;
    const v = this.visual;                       // pixels: grid units * zoom
    this.#element.style.left = v.x + 'px';
    this.#element.style.top = v.y + 'px';
    this.#element.style.width = v.width + 'px';
    this.#element.style.height = v.height + 'px';
    this.renderDetail();
    return true;
}

renderDetail() {
    this.#labelEl.innerText = this.#label;
    for (const size of ['small', 'medium', 'large'])
        this.#labelEl.classList.toggle(`size-${size}`, this.#fontSize === size);
    // text color: same data-net-color mechanism as TextLabel
    if (this.#color === '-') this.#labelEl.removeAttribute('data-net-color');
    else this.#labelEl.setAttribute('data-net-color', this.#color.slice(1));
    // background color
    if (this.#bgColor === 'k') {
        this.#fill.setAttribute('data-bg-color', 'k');
        this.#fill.removeAttribute('data-net-color');
    } else {
        this.#fill.removeAttribute('data-bg-color');
        this.#fill.setAttribute('data-net-color', this.#bgColor === '-' ? '' : this.#bgColor.slice(1));
    }
}

renderPosition() {
    const v = this.visual;
    this.#element.style.left = v.x + 'px';
    this.#element.style.top = v.y + 'px';
}
```

## CSS additions (`src/ui.css`)

Reuse the existing `[data-net-color="n"] { --net-color: ... }` mapping (n = `''` default, `0..9`).

```css
/*
 * Group (visual fieldset box)
 */
.group {
    z-index: 10;                 /* below components (11), text (12), wires (13) */
    position: absolute;
    box-sizing: border-box;
    pointer-events: none;        /* interior click-through */
}
.group > .group-fill {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--net-color) 50%, transparent);
    background-color: color-mix(in srgb, var(--net-color) 25%, transparent);
    pointer-events: none;
}
.group > .group-fill[data-bg-color="k"] {
    --net-color: #000;
    border-color: color-mix(in srgb, #666 50%, transparent);  /* dark grey so the box stays visible */
}
.group > .group-label {
    position: absolute;
    top: 0;
    left: 8px;
    transform: translateY(-50%);           /* float over the top border like a fieldset legend */
    padding: 0 calc(4px * var(--zoom-factor));
    background-color: var(--grid-bg-color); /* masks the border line behind the label */
    pointer-events: all;                   /* drag/select handle */
    cursor: default;
}
.group.size-small  { font-size: calc(var(--zoom-factor) * var(--font-size-small)); }
.group.size-medium { font-size: calc(var(--zoom-factor) * var(--font-size-normal)); }
.group.size-large  { font-size: calc(var(--zoom-factor) * var(--font-size-large)); }
.group.selected > .group-fill {
    outline: 1px dotted white;
    outline-offset: 2px;
}
.group.group-delete-animation { transition: opacity var(--component-delete-duration); opacity: 0; }
.group-drop-preview {
    z-index: 9;
    position: absolute;
    outline: 2px solid var(--component-preview-color);
    outline-offset: -4px;
}
```

Note: apply the `size-*` classes on `#element` (`.group`), not the label, so the label inherits the font size. Adjust `renderDetail` accordingly (toggle classes on `this.#element`).

## Registration wiring

- `index.html`: add `<script src="src/griditem/group.js"></script>` directly after the `textlabel.js` line.
- `src/ui/application.js`:
  - `config.placementDefaults`: add `group: { width: 240, height: 120, fontSize: 'small', color: '-', bgColor: '-' },`
  - Component menu → `'Routing & labeling'` category, after the TextLabel button:
    `routingMenu.createPinnableComponentButton(Group.fromDescriptor(this, { '#c': 'Group' }, {}), { '#c': 'Group' });`
  - `DEFAULT_TOOLBAR_PINS`: add `{ descriptor: { '#c': 'Group' } },` after the TextLabel entry.
- `src/ui/action.js` `rotateSelection`: Group takes no rotation; its rectangle is rotation-invariant, so no change needed (items not in a branch are simply left in place; Group moves with the normal drag/selection move paths).

No simulation/netlist changes: Group has no ports, and netlist construction only inspects `Component`/`Wire` items (TextLabel precedent proves this is safe for a visual-only GridItem).

## Phase 2: resize drag handle

- In `link()`, create `this.#resizeHandle = html(this.#element, 'div', 'group-resize')` and register `this.registerMouseAction(this.#resizeHandle, { type: 'resize' })` (no hover message needed, hover hotkeys keep `{ type: 'hover' }` on the label only).
- CSS:
  ```css
  .group > .group-resize {
      display: none;
      position: absolute;
      right: 0; bottom: 0;
      width: max(8px, calc(12px * var(--zoom-factor)));
      height: max(8px, calc(12px * var(--zoom-factor)));
      cursor: nwse-resize;
      pointer-events: all;
      border-bottom-right-radius: 3px;
      background: linear-gradient(135deg, transparent 55%, var(--component-preview-color) 55%, var(--component-preview-color) 70%, transparent 70%, transparent 85%, var(--component-preview-color) 85%);
  }
  /* .group has pointer-events: none so it never matches :hover itself; use :has() on interactive children */
  .group:has(.group-label:hover) > .group-resize,
  .group:has(.group-resize:hover) > .group-resize,
  .group.resizing > .group-resize,
  .group.selected > .group-resize { display: block; }
  ```
- In `onDrag(x, y, status, what)`, handle `what.type === 'resize'` **before** `super.onDrag()` (the base implementation moves the whole selection, which would drag the box away with the cursor):

  ```js
  if (what.type === 'resize') {
      if (status === 'start') {
          this.#element.classList.add('resizing'); // keep handle visible while cursor leaves the box
      }
      const [ snappedX, snappedY ] = this.align(x, y);   // Group.align snaps to grid points (n*SPACING)
      this.width = Math.max(Grid.SPACING, snappedX - this.x);
      this.height = Math.max(Grid.SPACING, snappedY - this.y);
      if (status === 'stop') {
          this.#element.classList.remove('resizing');
          this.redraw();
          this.grid.trackAction('Resize group');
      }
      return true;
  }
  ```

  (The handle sits at the group's bottom-right, so the new extents follow the cursor position directly; `align()` snaps width/height to SPACING multiples, minimum 1 SPACING. The width/height setters set `NEEDS_FULL_RENDER`.)
- `unlink()` removes the handle element; in `link()` create it before registering: `this.#resizeHandle = html(this.#element, 'div', 'group-resize'); this.registerMouseAction(this.#resizeHandle, { type: 'resize' });`

## Verification

- `node test/test.js` passes (serialization round-trip of a circuit containing a Group via a quick manual check with `util/dump.js`).
- Manual in browser: place group from Component menu, verify fieldset look, dialog edit (e), drag-move via label, Delete key, interior clicks pass through to components/wires, group renders below all items, black background shows grey border, pin persists across save/load.
- Phase 2: handle appears on hover/selection, dragging snaps box size to grid, min size 1 SPACING, `Resize group` undo entry.
