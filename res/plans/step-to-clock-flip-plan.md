# Plan: Debugger → "Step to clock flip"

## Goal

Add a Debugger menu action **"Step to clock flip"** that advances the simulation, in one action, to the next output flip of any clock. Enabled only when the current simulation contains at least one clock. Useful when clocks flip rarely (high ticks-per-cycle, low frequency), where "Step once" would need thousands of presses.

Behaviour:
- Pauses the simulation (enters single-step mode, like "Step once").
- Steps ticks until a clock's `c` output toggles, then stops and reports how many ticks were stepped.
- Stops early if a break condition (net conflict / break-on-condition) fires — the existing break notice/single-step behaviour is reused.
- Gives up after a hard tick budget (`maxTicks`) so a simulation where every clock is disabled cannot loop forever.

## Verified facts (measured against `test/data/tests.stc` / `DelayedConflict`, targetTPS=1000, 1 Hz clock → `limit = 500`)

- Clock tick logic (see `emitClock` in `src/sim/backend/javascript.js`): each tick `counter -= 1`; if the unsigned decrement underflows (`counter > limit`) the counter is reloaded with `limit - 1` and the output bit is toggled **only if the `enable` bit is high in that tick** (reload value `limit - 1` is the fixed behaviour, see `test("clock flip interval")`; the old reload value `limit` made the steady-state flip period `limit + 1` ticks).
- The tick distance to the next flip attempt is exactly `mem[counterIndex] + 1` (measured: `counter = 499` → first flip at tick 500; flips at ticks 500, 1000, 1500, 2000, 2500 → period 500 = `limit`).
- Clock output port values are readable: `engine.ports` contains the `c<suffix>` port with a non-null `elementIndex2` for every declared clock, and `backend.getBit(port.elementIndex2, port.bitIndex)` reads its current value.
- `engine.mem` is the `Uint32Array` backing memory; clock counters/limits live at `clock.counterIndex` / `clock.limitIndex`.
- The compiled tick function returns `0` (ran all ticks), `1` (break on conflict), `2` (break on condition) and checks break conditions **every tick**, so bulk-stepping N ticks in one `simulate(N)` call breaks at the right tick.
- Edge cases: `limit == 1` → counter reloaded with 0 → flips every tick (maximum rate). `limit == 0` (frequency higher than `targetTPS / 2`) → `mem` stores `0 - 1 = 4294967295` and the underflow test is true every tick → flips every tick; no special case handling is needed.

No new simulation semantics are needed; all logic fits in one engine method.

## Implementation

### 1. `src/sim/simulation.js` — engine method

Add after `simulate()` (public API, assert-guarded). Bulk-steps in jumps sized to the earliest flip attempt, so a 1 Hz clock at 10000 tps costs 1 `simulate()` call, not 5000.

```js
// Steps the simulation until any clock output toggles, at most maxTicks ticks.
// Returns { ticks, flipped, broke }: ticks = ticks stepped (a lower bound when a break fired),
// flipped = a clock output toggled, broke = 1 (conflict) / 2 (condition) / 0 (none).
stepToClockFlip(maxTicks = 1000000) {
    assert.integer(maxTicks);
    if (this.#clocks.length === 0) return { ticks: 0, flipped: false, broke: 0 };
    this.#clockOutputChanged(); // establish the baseline clock output state before stepping (otherwise the first flip is only detected on the second jump)
    const mem = this.#backend.mem;
    let stepped = 0;
    while (stepped < maxTicks) {
        // Jump to the earliest clock counter underflow, where the next flip can happen.
        // Capped so a fast disabled clock cannot force 1-tick stepping for a slow enabled one.
        let jump = Math.min(maxTicks - stepped, 100000);
        for (const clock of this.#clocks) jump = Math.min(jump, mem[clock.counterIndex] + 1);
        jump = Math.max(1, jump);
        const broke = this.simulate(jump);
        if (broke !== 0) return { ticks: stepped, flipped: false, broke };
        stepped += jump;
        if (this.#clockOutputChanged()) return { ticks: stepped, flipped: true, broke: 0 };
    }
    return { ticks: stepped, flipped: false, broke: 0 };
}

// Toggles a snapshot bitmap of all clock output bits and returns true if any output changed since the last call.
// `this.#clockFlipBits` is (re)initialised to null when the simulation memory layout is (re)compiled.
#clockOutputChanged() {
    const bits = this.#clocks.map((c) => {
        const port = this.#ports.byName[c.outputPortName];
        return this.#backend.getBit(port.elementIndex2, port.bitIndex);
    });
    const changed = this.#clockFlipBits !== null && bits.some((b, i) => b !== this.#clockFlipBits[i]);
    this.#clockFlipBits = bits;
    return changed;
}
```

Field + reset:

```js
// Snapshot of clock output bits for `#clockOutputChanged()` (null = no previous tick observed).
#clockFlipBits = null;
```

Reset `this.#clockFlipBits = null;` in `reset()` (the method that calls `#initMemoryData()`), right next to the memory reset, so a fresh memory layout is not compared against stale bits.

Notes for the implementor:
- `#clockFlipBits` must be part of neither `serialize()` nor `#structuralKey()` (it is transient debug state, like `#compiledTicks`).
- Do not make `maxTicks` user-configurable in this change; the default 1,000,000 tick budget plus the 100,000 tick jump cap are the guard rails.

**Why the tick count cannot be precomputed once (and why no per-tick monitoring is needed):**

The loop is *not* tick-by-tick monitoring; it only inspects the clock outputs at jump boundaries, and every jump ends exactly on a candidate flip tick. Consequences:

- In the common case (free-running clock(s) whose `enable` is high) the very first jump is `mem[counterIndex] + 1` for the fastest clock, which lands precisely on the tick where the flip happens → 1 `simulate()` call + one bitmap comparison. No additional ticks are executed.
- The jump is a *predicted flip-attempt* distance, not a *predicted flip* distance: a flip needs the clock's `enable` bit to be high **in that tick**, and `enable` is a normal circuit-driven input recomputed every tick (gated clocks, clock signals generated by other logic, flip-flop outputs). Whether it is high at the attempt tick can only be observed by running the ticks. Hence the check has to happen after running, and the loop has to be able to continue past skipped attempts.
- The jump must be the minimum over **all** clocks, never over only the currently enabled ones. If a clock that is disabled now is enabled later, its flip is real, and jumping over its attempt tick would run past the flip and report too many ticks. Including every clock guarantees no candidate flip tick is skipped, which is also why checking only at jump boundaries cannot miss a flip.
- Cost is therefore O(number of skipped flip attempts) `simulate()` calls, not O(ticks). Only pathological cases (a very fast disabled clock plus a very slow enabled one) cause many iterations; the 100,000 tick jump cap keeps each iteration cheap and the 1,000,000 tick budget terminates the call.

### 2. `src/ui/simulations.js` — thin delegation

`Simulations.Simulation` already wraps `tick()`; add the sibling wrapper directly after it (`src/ui/simulations.js` is skipped by the test harness — keep all real logic in the engine):

```js
// Steps to the next clock output flip, at most maxTicks ticks. Returns { ticks, flipped, broke }.
stepToClockFlip(maxTicks = 1000000) {
    assert.integer(maxTicks);
    return this.#engine.stepToClockFlip(maxTicks);
}
```

### 3. `src/ui/application.js` — menu entry

In the Debugger menu, right after the `Step once` button block (`const stepButton = …; stepButton.node.classList.toggle(…)`), add:

```js
// Advance to the next clock output flip. Only meaningful when the simulation has clocks.
const hasClock = (this.simulations.current?.engine.clocks.length ?? 0) > 0;
const stepFlipButton = debuggerMenu.createActionButton('Step to clock flip', 'Advance simulation to the next output flip of any clock. Hotkey: <i>Ctrl+.</i>.', () => {
    this.#stepToClockFlip();
});
stepFlipButton.node.classList.toggle('toolbar-menu-button-disabled', !hasClock);
```

(`hasClock` is false while no simulation is selected; the hotkey path in `#stepToClockFlip` creates one lazily, matching `#singleStep`.)

### 4. `src/ui/application.js` — step handler

Add next to `#singleStep`, reusing `#singleStep(0, broke)` for the break case so single-step mode + reason notice behave exactly like an ordinary break:

```js
// Enables single-step mode (if not already) and advances the simulation to the next output flip of any clock.
#stepToClockFlip() {
    if (!this.simulations.current) {
        this.simulations.select(this.circuits.current, true);
    }
    const sim = this.simulations.current;
    if (!sim) return;
    const { ticks, flipped, broke } = sim.stepToClockFlip();
    if (broke !== 0) {
        // Break mid-step: entering single-step mode and reporting the break reason is #singleStep's job.
        this.#singleStep(0, broke);
        return;
    }
    const alreadySingleStep = this.config.singleStep;
    this.config.singleStep = true;
    this.showNotice(flipped
        ? `Stepped ${Number.formatSI(ticks)} ticks to clock flip.`
        : `No clock flip within ${Number.formatSI(ticks)} ticks.${alreadySingleStep ? '' : ' Simulation single-step enabled.'}`);
    if (this.#debuggerMenu.state()) {
        this.#debuggerMenu.open(); // update enabled/disabled state of the open menu
    }
}
```

Set `this.config.singleStep` **after** stepping and only in the non-break path: `#singleStep` manages the flag and the notices itself, so the break case delegates entirely to it. `showNotice` replaces the text of the single `#notice` element, so the single-step-enabled hint has to be appended to the same message rather than shown as a second notice.

`Application.#singleStep` was adjusted accordingly (break notices must not depend on the single-step mode transition):

```js
// Enables single-step mode (if not already) and advances the simulation by the given number of ticks.
// `reason` is the break code (1 conflict / 2 condition) of a preceding step, the break code of this step is used when it is 0.
// Break notices are also shown while already single stepping, since a break ends the step early.
#singleStep(ticks = 1, reason = 0) {
    /* ... same simulation lookup and flag write as before ... */
    const broke = sim.tick(ticks);
    const breakCode = broke !== 0 ? broke : reason;
    const notice = breakCode === 1 ? 'Breaking on conflict' : (breakCode === 2 ? 'Breaking on condition' : (alreadySingleStep ? null : 'Simulation single-step enabled'));
    if (notice !== null) {
        this.showNotice(notice);
        if (this.#debuggerMenu.state()) this.#debuggerMenu.open();
    }
}
```

Without this, stepping while a break condition/conflict already matches is silent: `sim.tick()` returns the break code (which was previously discarded) and the old code only showed notices on the run-mode → single-step transition, so users in single-step mode never saw "Breaking on condition" / "Breaking on conflict".

### 5. `src/ui/application.js` — hotkey

In `#initHotkeys()`, next to the existing `'t'` hotkey. `Ctrl+T` is browser-reserved (new tab; `preventDefault` cannot suppress it in Chrome), so pick an unreserved combination:

```js
// 'ctrl+t' is browser-reserved (new tab), so the step-to-flip hotkey uses an unreserved combination.
this.registerHotkey([ 'ctrl+.', 'ctrl+,' ], 'down', null, () => {
    this.#stepToClockFlip();
});
```

## Testing

Add engine-level tests to `test/test.js` (the engine lives in `src/sim/simulation.js`, which the harness loads; `src/ui/simulations.js` is not loaded there, so call `stepToClockFlip` on the object returned by `compileCircuit`). Use fixture `data/tests.stc` label `DelayedConflict` (1 Hz clock) with `targetTPS: 1000` → `limit = 500`. That fixture drives the clock's `enable` input from a constant named `enable`, so gate the clock with `sim.setConstValue(sim.getConstId('enable'), 0 | 1)` — writing the enable port element in `sim.mem` does not stick, it is re-driven every tick.

Assertions (values verified by measurement):
- `sim.clocks.length === 1` for `DelayedConflict`.
- First call: `{ ticks: 500, flipped: true, broke: 0 }` (needs the baseline snapshot call, see step 1).
- Following calls: `{ ticks: 500, flipped: true, broke: 0 }` each, alternating output bit.
- With the clock gated off: `stepToClockFlip(1000)` returns `{ ticks: 1000, flipped: false, broke: 0 }` (tick budget terminates the call, no infinite loop); re-enabling flips again after 500 ticks.
- Break cases: compile `DelayedConflict` with `breakOnConflict: true` (conflict at count 9, reached after 9 counter steps = 9000 ticks, i.e. during the 18th 500-tick step) and with `breakConditions: [ 'pConflict' ]` (probe truthy at count 8) — in both cases some call returns `broke === 1` / `broke === 2` with `flipped === false`.
- Clock-less simulation (`data/tests.stc` label `ProbesInSubcircuit`, `clocks.length === 0`): `stepToClockFlip(100)` returns `{ ticks: 0, flipped: false, broke: 0 }`.

Run `node test/test.js` and make sure the suite is green before committing. UI files are stubbed out by the harness, so also `node --check src/ui/application.js src/ui/simulations.js`.

## Commit

One commit: `Added support for stepping to the next clock flip in the debugger` (plus the test in the same commit). The clock flip timing fix is a separate prerequisite commit: `Fixed clock flip interval off-by-one (counter reload after a flip)`, touching `src/sim/backend/javascript.js`, `test/test.js` (new `clock flip interval` test and adjusted `break on conflict (clock-driven)` expectations).
