// Ad-hoc smoke test: a stale sub-circuit instance id must not break the simulation/overlay.
// Navigating into a subcomponent (Simulation.reattach) stores the instance id in the Simulation and in
// CircuitOverlay; re-rooting the simulation at another circuit or recompiling a shrunken instance tree
// makes that id out of range, and throwing from CircuitOverlay.dirty() aborts Grid.render() (all
// circuits then render empty).
// Run with: node test/smoke_stale_instance_id.js
const { context } = require('./lib/runner');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

// The runner skips src/ui/simulations.js (it needs a real Application); load it manually with the
// same class->var rewrite so Simulations.Simulation is available in the VM realm.
function loadScript(filePath) {
    const fullpath = path.resolve(__dirname, '../' + filePath);
    const code = fs.readFileSync(fullpath, 'utf-8').replace(
        /class\s*([A-Z][A-Za-z]+)(\s+extends\s+[A-Za-z.]+)?\s*\{/g, 'var $1 = class $1$2 {');
    vm.runInContext(code, context);
}
loadScript('src/ui/simulations.js');
context.console = console;

const raw = fs.readFileSync(path.resolve(__dirname, '../res/examples/8bit.stc'), 'utf-8');

vm.runInContext(`
    const app = new Application();
    app.grid = {
        circuit: null, readonly: false,
        circuitOverlay: new CircuitOverlay(app),
        simulationOverlay: { setLabel() {} },
        monitorOverlay: { switchContext() {}, clearSaved() {}, refresh() {} },
        pinsOverlay: { refresh() {} },
        markSimulationRecompiled() {},
        setCircuit(c) { app.grid.circuit = c; app.grid.circuitOverlay.setLabel(c.label); app.grid.circuitOverlay.setInstanceId(null); },
        trackAction() {},
    };
    app.history = { record() {} };
    app.config.lockSimulation = false;
    app.config.singleStep = false;
    app.config.simulationBackend = 'js';
    app.simulations = new Simulations(app);

    const content = JSON.parse(${JSON.stringify(raw)}.replace(/^loadFiles\\.push\\(\\s*(.+)\\)\\s*$/s, '$1'));
    app.circuits.unserialize(content, null, false, []);
    const root = app.circuits.byLabel('#Tester');
    const sub  = app.circuits.byLabel('8-Bit RAM 256b');

    // Navigate into the '8-Bit RAM 256b' instance of the '#Tester' simulation (6 instances).
    const rootSim = app.simulations.select(root, true, true);
    const instanceId = rootSim.instances.findIndex((i) => i.circuit === sub);
    assert(instanceId > 0, 'expected a nested instance');
    rootSim.reattach(instanceId);
    app.grid.circuitOverlay.dirty(); // stats of the sub-instance, fine

    // Scenario A: 'Start simulation' while inside the sub-circuit re-roots the simulation at the grid
    // circuit (Action.startSimulation -> simulations.select(grid.circuit, true)). The overlay must not
    // keep the old, now out-of-range instance id.
    const subSim = app.simulations.select(sub, true, true);
    assert(subSim.instances.length <= instanceId, 'sub-rooted sim must have fewer instances');
    app.grid.circuitOverlay.dirty();
    app.simulations.current.updateMarks();

    // Scenario B: the instance tree shrinks while a sub-instance is shown (root circuit edited), so the
    // Simulation's own instance id becomes out of range for the recompiled netlist.
    app.simulations.select(root, true, true);
    rootSim.reattach(instanceId);
    for (const item of [...root.items].filter((i) => i instanceof CustomComponent)) {
        root.removeItem(item);
    }
    app.simulations.markDirty(root);
    rootSim.checkDirty(true);
    rootSim.updateMarks();
    app.grid.circuitOverlay.dirty();

    console.log('smoke_stale_instance_id: ok');
`, context);
