# Silicon Tracer - Digital Logic Circuit Simulator

Vanilla JS/HTML/CSS, no framework, no build step. Open `index.html` directly in browser.

## Entry
`index.html` → `src/main.js` → `src/ui/application.js`

## Source Layout
- `src/common.js` - shared utilities (`File`, `Point`, `assert*()` parameter validation, `keys()`, `values()`, `pairs()` iteration helpers, ...
- `src/ui/` - UI components: `toolbar.js` (toolbar/menu), `grid.js` (component placement), `dialog.js`, `circuits.js` (`Circuit` and `Circuits` management), `simulations.js` (`Simulation`, `Simulations`), `undostack.js`
- `src/grid/` - circuit components: `wire.js`, `gate.js`, `builtin.js` (flip-flops, latches, ...), `memory.js` (ROM, RAM), `port.js`, `customcomponent.js` (custom circuits as components), `probe.js`, ...
- `src/sim/netlist.js` - builds nets/ports graph from circuit wires and components
- `src/sim/simulation.js` - simulation engine, compiles nets/port logic
- `src/sim/backend/javascript.js` - JS compilation backend
- `src/sim/backend/wasm.js` / `wasm_emitter.js` - WASM backend (ignore, incomplete/outdated)
- `src/external/logisim.js` - LogiSim file importer

## Circuit Files (.stc format)
- `res/examples/` - example circuits (basics, misc, 8bit)
- `res/libs/74SeriesLogic.stc` - 74-series component library

## Testing & Dev Tools
- `node test/test.js` - run unit tests (test data in `test/data/`)
- `node test/dump.js --help` - inspect circuit nets and compiled simulation code

## Guidelines
- use `assert*()` in public functions
- brief one line comments, only document non-self-explanatory arguments e.g. string 'enums'
