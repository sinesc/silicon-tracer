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
- Button labels and hover messages are inserted via `innerHTML` (`html()` in `src/common.js`, `#createToggleButton`), so a literal `❌` label and `<i>` markup in hover messages work — but that also means the existing condition rows inject the **raw user expression as HTML**, which is a bug (an expression containing `<`, `>` or `&` is swallowed/mis-rendered and any markup in it is executed). Fix: add an `escapeHTML()` helper and escape every user-supplied string that goes into a label/hover message. The expression is pure user text, so escaping it loses nothing (hover messages deliberately keep `<i>`/`<b>` markup for the *fixed* wording around the escaped value).
- Condition mutation convention (from `Action.addBreakCondition` / `Action.editBreakCondition`): change `app.config.breakConditions`, then `app.simulations.markDirty(null)`. No undo tracking, no `haveChanges`.

## Implementation

### 0. `src/common.js` — HTML escaping helper

Add next to `html()` (top-level function, assert-guarded like the rest of `common.js`):

```js
// Escapes text for safe use as innerHTML contents.
function escapeHTML(text) {
    assert.stringable(text);
    return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
```

`common.js` is loaded before all other sources (no import/export in this project), so the function is globally available in `src/ui/*.js`.

Scope of the escaping fix: the break-condition expressions (the code being rewritten here). Other user texts rendered through the same path (circuit/simulation labels in the Circuit / Simulation / Component menus, pin labels) have the same class of bug but are **not** touched here — escaping them consistently means reaching into `GridItem.descriptorInfo()` and friends. Follow-up.

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
    const conditionsCategory = debuggerMenu.createMenuCategory('Conditions', 'Defined break conditions. <i>Click</i> an entry to edit it, <i>❌</i> to delete it.', (conditionsMenu) => {
        conditionsMenu.clear();
        for (let i = 0; i < this.config.breakConditions.length; i++) {
            const expr = this.config.breakConditions[i];
            const safeExpr = escapeHTML(expr); // button labels and hover messages are set via innerHTML
            // The absolutely positioned side button must precede its row entry (its static position is below the preceding in-flow entry).
            const deleteButton = conditionsMenu.createActionButton('&#10060;', `Delete break condition: <b>${safeExpr}</b>`, () => {
                this.config.breakConditions.splice(i, 1);
                this.simulations.markDirty(null);
                debuggerMenu.open(); // rebuild the open menu; drops the category when the list became empty
            });
            deleteButton.node.classList.add('toolbar-condition-delete');
            const editButton = conditionsMenu.createActionButton(safeExpr, 'Click to edit. Clear expression and confirm to delete.', async () => {
                debuggerMenu.close();
                await Action.editBreakCondition(this, i, expr);
            });
            editButton.node.classList.add('toolbar-condition-edit');
        }
    });
    conditionsCategory.subToolbar.node.classList.add('toolbar-condition-rows'); // CSS anchor + row layout for the condition entries
}
```

Notes:
- `debuggerMenu.open()` is the existing refresh-while-open idiom; it rebuilds the whole Debugger menu (including **Conditions**) so the shifted indices and the empty-list case are handled by the rebuild itself.
- `'&#10060;'` renders ❌ (matches the `&#9094;` used for the circuit place button).
- The edit/delete hover messages contain intentional markup (`<i>`, `<b>`) around the escaped expression — escape only the interpolated value, never the whole message.
- The category's own hover message is a fixed string, no escaping needed.
- **DOM order matters**: the ❌ button is created *before* its row entry, exactly like `makeSwitchAndDragButtons()` creates the place button before the select button. An absolutely positioned button with no `top`/`bottom` is placed at its *static* position, i.e. below the preceding in-flow block; creating it after the entry pushed every button down by one row (measured in Chromium: rows at y=272/300 vs buttons at 300/328).

### 2. `src/ui.css` — row layout for condition entries

Extend the existing `/* Circuit select/place */` rules with the category-nested selector chain instead of duplicating the style block, and anchor the delete buttons to the category's inner toolbar (identified by the `toolbar-condition-rows` class added in JS, so no other menu category is affected):

```css
/* Row plus square side-button: circuit select/place, break-condition edit/delete */
.toolbar > .toolbar-menu-button > .toolbar-menu-container > .toolbar > .toolbar-menu-category > .toolbar-menu-container > .toolbar.toolbar-condition-rows {
    position: relative; /* anchor for the absolutely positioned delete buttons */
}
.toolbar > .toolbar-menu-button > .toolbar-menu-container > .toolbar > .toolbar-circuit-select,
.toolbar > .toolbar-menu-button > .toolbar-menu-container > .toolbar > .toolbar-menu-category > .toolbar-menu-container > .toolbar.toolbar-condition-rows > .toolbar-condition-edit {
    margin-right: 30px;
}
.toolbar > .toolbar-menu-button > .toolbar-menu-container > .toolbar > .toolbar-circuit-place,
.toolbar > .toolbar-menu-button > .toolbar-menu-container > .toolbar > .toolbar-menu-category > .toolbar-menu-container > .toolbar.toolbar-condition-rows > .toolbar-condition-delete {
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

Long condition expressions wrap inside the row (menu containers already have `min-width: 150px` and the root menu scrolls at `max-height`); no extra handling needed. Escaping only lengthens the text slightly (`<` → `&lt;`), which does not change the wrapping behaviour.

Why a class instead of a blanket `position: relative` on every `.toolbar-menu-container > .toolbar`: the 74-series library menus put `.toolbar-circuit-place` buttons inside menu categories; those previously anchored to the root menu container (the only positioned ancestor), so making every category toolbar a positioning anchor would silently shift them. `ToolbarItem.subToolbar.node` is the inner `.toolbar` div (the `.toolbar-menu-container` div is its parent), hence the `.toolbar.toolbar-condition-rows` compound selector.

## Edge cases / behaviour checklist

- Zero conditions → no **Conditions** category, no separator below **Add condition...**.
- Delete the last condition with the ❌ button → menu rebuilds, **Conditions** category disappears, root Debugger menu stays open.
- Delete via ❌ while several conditions exist → list is rebuilt with correct indices (no stale closures, because everything is regenerated in `openAction`).
- Edit via dialog (`Action.editBreakCondition`) still closes the menu and can delete by clearing the expression — unchanged path, not replaced by the ❌ button.
- Toggling **Break on condition** / adding a condition still calls `this.simulations.markDirty(null)` (compile flag re-evaluation).
- Stale entry for the removed category in `Toolbar.root.#states` is harmless (state lookup only matches existing items).

## Verification

1. `node test/test.js` — must stay green (no sim/engine change besides the `escapeHTML()` helper, which is covered by a unit test; the menu code itself is not unit-tested because the test harness stubs `Application`).
2. Manual, in the browser (open `index.html`):
   - Debugger menu with no conditions: no separator after **Add condition...**, no **Conditions** entry.
   - Add two conditions → **Conditions ▼** appears below **Add condition...** and lists both.
   - Open **Conditions**: each row has a bordered ❌ square at its right edge, aligned with the row (compare visually with the Circuit menu's `⇤` place buttons).
   - ❌ deletes immediately, menu stays open and refreshes; after deleting the last one the category is gone.
   - Clicking the row text (not ❌) opens the edit dialog; clearing it still deletes.
   - Conditions still break the simulation when **Break on condition** is on (add e.g. `pA === 1`, run with a Probe `pA`, confirm the "Breaking on condition" notice).
   - Escaping: add a condition such as `a<b && c>d` (or one containing `<img src=x onerror=alert(1)>`) and confirm it is displayed **literally** in the row and in the ❌ hover message, with no markup interpretation.
   - No regression in the Circuit menu and in the Component → library menus (`⇤` place buttons still aligned).
3. Commit.

## Status: implemented

All of the above is implemented (`src/common.js` `escapeHTML()`, `src/ui/application.js` Debugger menu, `src/ui.css`) plus a `test("escapeHTML")` unit test in `test/test.js`. Verified with `node test/test.js` (35 passed) and headless-Chromium scripted UI runs (`file://index.html`): empty list → no category/no separator; three conditions incl. `a<b && c>d` and `<img src=x onerror=console.log("INJECTED")>` rendered literally with no script execution and no page errors; ❌ deletes the right entry and refreshes the open menu; edit dialog prefilled and clearing it deletes; condition rows and side buttons measured at identical y positions (272/300); Circuit menu place button still aligned.
