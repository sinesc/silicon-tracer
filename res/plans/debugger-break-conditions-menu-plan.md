# Plan: Debugger menu — break conditions as a "Conditions" category

## Goal

Restructure the break-condition part of the **Debugger** menu:

- No separator below **Add condition...** any more.
- A new sub-menu category **Conditions** appears directly below **Add condition...**, but only while at least one break condition exists.
- All defined conditions are listed inside that category (click = edit, as today).
- Each condition row gets a small square **❌** delete button on its right edge, styled like the circuit place/drag buttons (`&#9094;`) in the **Circuit** menu.

Target structure:

```
Debugger ▼
  Show net conflicts
  Break on conflict
  Break on condition
  ────────────
  Single step
  Step once
  Step to clock flip
  ────────────
  Add condition...
  Conditions ▼            <- only when config.breakConditions.length > 0
      <expr 1>        ❌
      <expr 2>        ❌
```

## Current state

`src/ui/application.js`, inside `#initToolbar()` (`this.#debuggerMenu = this.toolbar.createMenuButton('Debugger', ...)`):

```js
// Break-on-condition expressions.
debuggerMenu.createSeparator();
debuggerMenu.createActionButton('Add condition...', '...', async () => {
    debuggerMenu.close();
    await Action.addBreakCondition(this);
});
if (this.config.breakConditions.length > 0) {
    debuggerMenu.createSeparator();          // <- remove
}
for (let i = 0; i < this.config.breakConditions.length; i++) {   // <- move into category
    const expr = this.config.breakConditions[i];
    debuggerMenu.createActionButton(expr, 'Click to edit. Clear expression to delete.', async () => {
        debuggerMenu.close();
        await Action.editBreakCondition(this, i, expr);
    });
}
```

Facts verified in `src/ui/toolbar.js` / `src/ui/componenttoolbar.js` / `src/ui.css`:

- `createMenuCategory(label, hoverMessage, openAction)` exists on `Toolbar` **and** is delegated by `ToolbarItem` (so `conditionsMenu.clear()` / `.createActionButton()` work on the returned item). It creates a `toolbar-menu-category` toggle button with a `▼`/`▲` arrow and a nested `.toolbar` container; unlike `createMenuButton` it is *not* closed by the document click handler and is opened by click (hover only opens it when another menu of the same level is already open).
- Menu contents are rebuilt on every open; sub-menu open/closed state is restored by textual path (`Toolbar.root.#states`), so reopening the Debugger menu after a rebuild keeps **Conditions** open.
- `ToolbarItem.open()`/`close()` = `state(true/false)`; calling `open()` on an already-open menu re-runs its `openAction`, i.e. it is the existing "refresh an open menu" idiom used by the Debugger toggles and by `#singleStep()`/`#stepToClockFlip()`.
- The circuit select/place row layout is pure CSS: `.toolbar-circuit-select { margin-right: 30px; }` and `.toolbar-circuit-place { … 30px wide, position:absolute; right:0 }` — the absolute button is anchored to the menu's inner `.toolbar`, which is `position: relative` only for the **root** menu container (`.toolbar-menu-container.toolbar-menu-root > .toolbar`). A category's inner `.toolbar` is *not* positioned, so it needs `position: relative` before an absolutely positioned child can align to the row.
- Button labels and hover messages are inserted via `innerHTML` (`html()` in `src/common.js`, `#createToggleButton`), so a literal `❌` label and `<i>` markup in hover messages work (same as the existing condition rows, which already inject the raw expression as HTML).
- Condition mutation convention (from `Action.addBreakCondition` / `Action.editBreakCondition`): change `app.config.breakConditions`, then `app.simulations.markDirty(null)`. No undo tracking, no `haveChanges`.

## Implementation

### 1. `src/ui/application.js` — Debugger menu

Replace the separator + flat condition loop shown above (the block introduced by the `// Break-on-condition expressions.` comment, keeping the `Add condition...` button and the separator *above* it):

```js
// Break-on-condition expressions.
debuggerMenu.createSeparator();
debuggerMenu.createActionButton('Add condition...', 'Break simulation on a custom probe expression.', async () => {
    debuggerMenu.close();
    await Action.addBreakCondition(this);
});
// Condition list category; only shown while at least one condition is defined.
if (this.config.breakConditions.length > 0) {
    debuggerMenu.createMenuCategory('Conditions', 'Defined break conditions. <i>Click</i> an entry to edit it, <i>❌</i> to delete it.', (conditionsMenu) => {
        conditionsMenu.clear();
        for (let i = 0; i < this.config.breakConditions.length; i++) {
            const expr = this.config.breakConditions[i];
            const editButton = conditionsMenu.createActionButton(expr, 'Click to edit. Clear expression and confirm to delete.', async () => {
                debuggerMenu.close();
                await Action.editBreakCondition(this, i, expr);
            });
            editButton.node.classList.add('toolbar-condition-edit');
            const deleteButton = conditionsMenu.createActionButton('&#10060;', `Delete break condition: <b>${expr}</b>`, () => {
                this.config.breakConditions.splice(i, 1);
                this.simulations.markDirty(null);
                debuggerMenu.open(); // rebuild the open menu; drops the category when the list became empty
            });
            deleteButton.node.classList.add('toolbar-condition-delete');
        }
    });
}
```

Notes:
- `debuggerMenu.open()` is the existing refresh-while-open idiom; it rebuilds the whole Debugger menu (including **Conditions**) so the shifted indices and the empty-list case are handled by the rebuild itself.
- `'&#10060;'` renders ❌ (matches the `&#9094;` used for the circuit place button).
- Keep the hover message of the edit action free of the "clear to delete" wording change if preferred — the wording above matches the actual dialog text in `Action.editBreakCondition`.

### 2. `src/ui.css` — row layout for condition entries

Extend the existing `/* Circuit select/place */` rules with the category-nested selector chain instead of duplicating the style block, and make the category's inner toolbar a positioning anchor:

```css
/* Row plus square side-button: circuit select/place, break-condition edit/delete */
.toolbar > .toolbar-menu-button > .toolbar-menu-container > .toolbar > .toolbar-menu-category > .toolbar-menu-container > .toolbar {
    position: relative; /* anchor for the absolutely positioned side button */
}
.toolbar > .toolbar-menu-button > .toolbar-menu-container > .toolbar > .toolbar-circuit-select,
.toolbar > .toolbar-menu-button > .toolbar-menu-container > .toolbar > .toolbar-menu-category > .toolbar-menu-container > .toolbar > .toolbar-condition-edit {
    margin-right: 30px;
}
.toolbar > .toolbar-menu-button > .toolbar-menu-container > .toolbar > .toolbar-circuit-place,
.toolbar > .toolbar-menu-button > .toolbar-menu-container > .toolbar > .toolbar-menu-category > .toolbar-menu-container > .toolbar > .toolbar-condition-delete {
    border: 2px solid var(--button-border-color);
    border-radius: 3px;
    font-size: var(--font-size-large);
    line-height: 1.2;
    margin: 0;
    min-width: 30px;
    width: 30px;
    position: absolute;
    right: 0;
}
```

Long condition expressions wrap inside the row (menu containers already have `min-width: 150px` and the root menu scrolls at `max-height`); no extra handling needed.

## Edge cases / behaviour checklist

- Zero conditions → no **Conditions** category, no separator below **Add condition...**.
- Delete the last condition with the ❌ button → menu rebuilds, **Conditions** category disappears, root Debugger menu stays open.
- Delete via ❌ while several conditions exist → list is rebuilt with correct indices (no stale closures, because everything is regenerated in `openAction`).
- Edit via dialog (`Action.editBreakCondition`) still closes the menu and can delete by clearing the expression — unchanged path, not replaced by the ❌ button.
- Toggling **Break on condition** / adding a condition still calls `this.simulations.markDirty(null)` (compile flag re-evaluation).
- Stale entry for the removed category in `Toolbar.root.#states` is harmless (state lookup only matches existing items).

## Verification

1. `node test/test.js` — must stay green (no sim/engine change, menu code is not unit-tested; the test harness stubs `Application`).
2. Manual, in the browser (open `index.html`):
   - Debugger menu with no conditions: no separator after **Add condition...**, no **Conditions** entry.
   - Add two conditions → **Conditions ▼** appears below **Add condition...** and lists both.
   - Open **Conditions**: each row has a bordered ❌ square at its right edge, aligned with the row (compare visually with the Circuit menu's `⇤` place buttons).
   - ❌ deletes immediately, menu stays open and refreshes; after deleting the last one the category is gone.
   - Clicking the row text (not ❌) opens the edit dialog; clearing it still deletes.
   - Conditions still break the simulation when **Break on condition** is on (add e.g. `pA === 1`, run with a Probe `pA`, confirm the "Breaking on condition" notice).
3. Commit.
