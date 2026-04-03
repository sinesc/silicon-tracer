# Silicon Tracer — Digital Logic Circuit Simulator

Vanilla JS/HTML/CSS, no framework, no build step. Open `index.html` directly in browser.

## Entry
`index.html` → `src/main.js` → `src/ui/application.js`

## Source Layout
- `src/common.js` — shared utilities
- `src/ui/` — UI components: `toolbar.js`, `grid.js`, `dialog.js`, `circuits.js`, `simulations.js`, `undostack.js`
- `src/grid/` — circuit components: `wire.js`, `gate.js`, `memory.js`, `port.js`, `splitter.js`, `clock.js`, `tunnel.js`, `customcomponent.js`, `probe.js`, `toggle.js`, and more
- `src/sim/netlist.js` — builds nets/ports from circuit graph
- `src/sim/simulation.js` — simulation orchestration
- `src/sim/backend/javascript.js` — JS simulation compiler
- `src/sim/backend/wasm.js` / `wasm_emitter.js` — WASM backend (ignore, incomplete/outdated)
- `src/external/logisim.js` — LogiSim file importer

## Circuit Files (.stc format)
- `res/examples/` — example circuits (basics, misc, 8bit)
- `res/libs/74SeriesLogic.stc` — 74-series component library

## Testing & Dev Tools
- `node test/test.js` — run unit tests (test data in `test/data/`)
- `node test/dump.js --help` — inspect circuit nets and compiled simulation code
