# Silicon Tracer - Digital Logic Circuit Simulator

Vanilla JS/HTML/CSS, no framework, no build step. Open `index.html` directly in browser.

## Entry
`index.html` → `src/main.js` → `src/ui/application.js`

## Source Layout
- `src/common.js` - shared utilities: `File`, `Point`, `assert*()` (parameter validation), `keys()` & `values()` & `pairs()` iteration helpers, ...
- `src/ui/` - UI components: `toolbar.js` (toolbar/menu), `dialog.js` (reusable dialog), `circuit.js` & `circuits.js` (`Circuit` and `Circuits` management), `simulations.js` (`Simulation`, `Simulations`), ...
- `src/grid/` - grid engine: `grid.js` (component placement), `selection.js`, `wirebuilder.js`, `trimbox.js`
- `src/griditem/` - circuit components: `wire.js`, `gate.js`, `builtin.js` (flip-flops, latches, ...), `memory.js` (ROM, RAM), `customcomponent.js` (custom circuits as components), ...
- `src/overlay/` - informational canvas overlays: `overlay.js` (base class), `circuitoverlay.js` (circuit details), `simulationoverlay.js` (simulation details), ...
- `src/sim/netlist.js` - builds nets/ports graph from circuit wires and components
- `src/sim/simulation.js` - simulation engine, compiles nets/port logic
- `src/sim/backend/javascript.js` - JS compilation backend
- `src/sim/backend/wasm.js` / `wasm_emitter.js` - WASM backend (ignore this, incomplete/outdated)
- `src/external/logisim.js` - LogiSim file importer, `external` folder is dedicated to imports/exports

## Circuit Files (.stc format)
- `res/examples/` - example circuits (basics, misc, 8bit)
- `res/libs/74SeriesLogic.stc` - 74-series component library

## Testing & Dev Tools
- `node test/test.js` - run unit tests (test data in `test/data/`)
- `node util/dump.js --help` - inspect circuit nets and compiled simulation code, try this when asked to debug circuit issues
- `node util/nets.js <file.stc> <label> [--expand]` - print nets with connected component ports (readable netlist of a circuit)
- `node util/circuit2txt.js <file.stc> <label> [--wires]` - print circuit items as a compact positional listing
- `node util/merge.js <out.stc> <a.stc> <b.stc> ...` - merge .stc files (dedup by uid), e.g. combine a circuit with `res/libs/74SeriesLogic.stc` so all subcircuits resolve
- `node util/simrun.js <file.stc> <label> --script=<script.js>` - compile a circuit and run a headless simulation scenario against it (drive ports/buttons, step ticks, read ports/probes/memories); see `--help`
- `makedist.sh` - generate bundled html file

## Guidelines
- Use `assert*()` in public functions
- Prefer brief one line comments, only document non-self-explanatory arguments e.g. string 'enums'
