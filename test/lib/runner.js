// Minimal test runner

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const util = require('util');

const context = vm.createContext({
    Math,
    Function,
    // Do NOT inject String — VM-realm primitive strings use the VM's internal
    // String.prototype, so common.js must patch that realm's prototype, not the
    // external one. Math and Function are plain objects with no such issue.
    TextEncoder: util.TextEncoder,
    // Provide Web Crypto API so component constructors can call crypto.randomUUID()
    crypto: { randomUUID: require('crypto').randomUUID },
    // Stub browser globals that are referenced by class definitions or constructors
    // but are never actually reached during headless circuit loading (no link() calls).
    Node: class Node {},
    document: {
        addEventListener: () => {},
        createElement: (tag) => {
            if (tag === 'canvas') {
                return { getContext: () => ({ measureText: () => ({ width: 0 }) }) };
            }
            return {};
        },
    },
});

function loadScript(filePath) {
    const fullpath = path.resolve(__dirname, '../../' + filePath);
    let code = fs.readFileSync(fullpath, 'utf-8');
    // Rewrite top-level class declarations (with optional `extends`) to var assignments
    // so they become properties of the VM context rather than block-scoped bindings.
    // Use named class expressions so the inner class-name binding is visible
    // during static field initialisation (e.g. `Gate.#UNARY` in Gate's own statics).
    code = code.replace(
        /class\s*([A-Z][a-zA-Z]+)(\s+extends\s+[A-Za-z.]+)?\s*\{/g,
        'var $1 = class $1$2 {'
    );
    vm.runInContext(code, context);
}

// Parse script load order from index.html, skipping files that require a real
// browser environment (UI-only) or that the harness replaces with stubs.
const SKIP_SCRIPTS = new Set([
    'src/ui/componenttoolbar.js',
    'src/ui/toolbar.js',
    'src/ui/dialog.js',
    'src/ui/simulations.js',
    // application.js is NOT skipped — its entry in the loop is the insertion
    // point for the Application stub (the stub replaces it instead of loading it).
    'src/grid/wirebuilder.js', // only used during interactive wire dragging
    'src/external/logisim.js', // import-only feature, not needed for simulation
    'src/main.js',
]);

const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf-8');
const scriptPaths = [...indexHtml.matchAll(/<script\s+src="([^"]+\.js)"/g)]
    .map(m => m[1])
    .filter(p => !SKIP_SCRIPTS.has(p));

// The Application stub must be injected after circuits.js is loaded (because the
// stub constructor calls `new Circuits(this)`) but before any grid component files
// (because every component constructor calls `assert.class(Application, app)`).
// We find that insertion point by position relative to application.js, which is
// the file the stub replaces.
const APPLICATION_STUB = `
    var Application = class Application {
        config = {
            debugCompileComments: false,
            checkNetConflicts: true,
            breakOnConflict: false,
            breakOnCondition: true,
            breakConditions: [],
            targetTPS: 10000,
            debug: false,
            placementDefaults: { clock: { rotation: 0, frequency: 1, ticks: null } },
        };
        grid = { trackAction() {}, setCircuit() {}, setCircuitLabel() {}, setSimulationLabel() {} };
        toolbar = { loadPins() {} };
        simulations = { current: null };
        circuits = null;
        toolbarPins = [];
        refreshUndoButtons() {}
        loadPins() {}
        constructor() {
            this.circuits = new Circuits(this);
            // reset() initialises #circuits and creates a placeholder circuit;
            // it also calls grid.setCircuit() which is safely stubbed above.
            this.circuits.reset();
        }
    };
`;

for (const scriptPath of scriptPaths) {
    if (scriptPath === 'src/ui/application.js') {
        vm.runInContext(APPLICATION_STUB, context);
    } else {
        loadScript(scriptPath);
    }
}

// Helpers that must run inside the VM so all objects stay in the same realm
// (cross-realm plain objects fail assert.object's constructor === Object check).
vm.runInContext(`
    function createSimulationWithBackend(backendStr) {
        return new Simulation({ backend: backendStr });
    }

    // Loads a circuit (compacting runs as part of unserialize), then returns
    // wire count and per-wire net IDs so tests can check compaction results.
    function _loadCircuitWires(jsonText, circuitLabel) {
        const content = JSON.parse(jsonText.replace(/^loadFiles\\.push\\(\\s*(.+)\\)\\s*$/s, '$1'));
        const app = new Application();
        app.circuits.unserialize(content, null, false, []);
        const circuit = circuitLabel
            ? (app.circuits.byLabel(circuitLabel) ?? Object.values(app.circuits.all).find(c => c.label === circuitLabel) ?? null)
            : app.circuits.byUID(content.currentUID);
        if (!circuit) throw new Error('Circuit not found: ' + circuitLabel);
        const wires = circuit.items.filter(w => w instanceof Wire).toArray();
        const netList = NetList.identify(circuit);
        return {
            wireCount: wires.length,
            wireNetIds: wires.map(w => netList.findWire(w)),
        };
    }

    function _compileCircuit(jsonText, circuitLabel, backend, configOverrides, shortGids) {
        // Strip optional JSON-P wrapper (same logic as Circuits.#decodeJSON)
        const content = JSON.parse(jsonText.replace(/^loadFiles\\.push\\(\\s*(.+)\\)\\s*$/s, '$1'));
        const app = new Application();
        if (shortGids) app.config.debugCompileComments = true;
        app.circuits.unserialize(content, null, false, []);
        const circuit = circuitLabel
            ? (app.circuits.byLabel(circuitLabel) ?? Object.values(app.circuits.all).find(c => c.label === circuitLabel) ?? null)
            : app.circuits.byUID(content.currentUID);
        if (!circuit) throw new Error('Circuit not found: ' + circuitLabel);
        const netList = NetList.identify(circuit, app.circuits.all);
        return netList.compileSimulation(null, Object.assign({
            backend: backend || 'js',
            checkNetConflicts: true,
            breakOnConflict: false,
            breakConditions: [],
            targetTPS: 10000,
            debug: false,
            debugSerializeSimulation: false,
        }, configOverrides || {}));
    }

    if (!Uint8Array.fromHex) {
        Uint8Array.fromHex = function fromHex(digits) {
            const result = new Uint8Array(digits.length / 2);
            for (let i = 0; i < result.length; i++) {
                result[i] = parseInt(digits.slice(i * 2, i * 2 + 2), 16);
            }
            return result;
        };
    }

    function declareMemory(sim, memType, addressWidth, dataWidth, initialData, suffix, writeBeforeRead = true) {
        return sim.declareMemory(memType, addressWidth, dataWidth, Uint8Array.fromHex(initialData), suffix, writeBeforeRead);
    }

    // Creates a VM-realm Uint8Array from a hex string or plain Array of byte values.
    function makeU8(values) {
        if (typeof values === 'string') return Uint8Array.fromHex(values);
        return new Uint8Array(values);
    }

    // Builds a circuit with nested Group boxes and items inside/outside, serializes it and
    // round-trips the serialized form back through Circuits.unserialize. Returns plain (realm-independent) data.
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

    // Builds a circuit with counted parts, excluded items, an exported custom component and
    // non-exported custom components (one with a nested gate, one referencing itself). Returns
    // the raw count entries from countParts().
    function _countPartsFixture() {
        const app = new Application();

        const exported = new Circuit(app, 'Chip');   // exported custom component
        exported.exportName = '74x74';
        app.circuits.add(exported);

        const inner = new Circuit(app, 'Inner');     // non-exported, contains one gate
        app.circuits.add(inner);
        inner.addItem(new Gate(app, 100, 100, 0, 'and', 3));

        const cyclic = new Circuit(app, 'Cyclic');   // non-exported, contains itself
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
`, context);

let passed = 0;
let failed = 0;
let debugMode = false;

function setDebugMode(enabled) {
    debugMode = enabled;
}

// Tests given function, reports error message on exception.
function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}: ok`);
        passed++;
    } catch (e) {
        if (debugMode) {
            console.log(`✗ ${name}: ${e.stack}`);
        } else {
            console.log(`✗ ${name}: ${e.message}`);
        }
        failed++;
    }
}

// Times given function and reports elapsed duration. Runs init and passes the result to fn. Only fn will be timed.
// Optionally accepts a timining to compare to.
function time(name, init, fn, compare = null) {
    try {
        const env = init();
        const start = performance.now();
        fn(env);
        const duration = Math.round(performance.now() - start);
        let wording = '';
        if (compare !== null) {
            const factor = Math.round(100 * (duration > compare ? ((duration / compare) - 1) : ((compare / duration) - 1)));
            wording = duration > compare ? ` (${factor}% slower)` : ` (${factor}% faster)`;
        }
        console.log(`Δ ${name}: ${duration}ms${wording}`);
        passed++;
        return duration;
    } catch (e) {
        if (debugMode) {
            console.log(`✗ ${name}: ${e.stack}`);
        } else {
            console.log(`✗ ${name}: ${e.message}`);
        }
        failed++;
        return null;
    }
}

// Generates a test summary.
function summary() {
    console.log(`${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.log('Use --debug to see failure stack traces');
    }
    process.exit(failed > 0 ? 1 : 0);
}

// Asserts given assertion is truthy, otherwise throws and error with an optional message.
function assert(assertion, message) {
    if (!assertion) throw new Error(message ?? 'Assertion failed');
}

function readJSON(filePath) {
    const fullpath = path.resolve(__dirname, '../' + filePath);
    const raw = fs.readFileSync(fullpath, 'utf-8');
    return JSON.parse(raw);
}

// Loads a .stc circuit file, identifies its nets, compiles and returns the simulation.
// circuitLabel selects a named circuit from the file; defaults to the file's currentUID circuit.
function compileCircuit(filePath, circuitLabel = null, backend = 'js', configOverrides = null) {
    const fullpath = path.resolve(__dirname, '../' + filePath);
    const text = fs.readFileSync(fullpath, 'utf-8');
    const [ sim ] = context._compileCircuit(text, circuitLabel, backend, configOverrides, true);
    return sim;
}

// Loads a .stc circuit file and returns wire compaction info: { wireCount, wireNetIds }.
// wireNetIds is an array of net indices (one per wire); wires sharing a net index are connected.
function loadCircuitWires(filePath, circuitLabel = null) {
    const fullpath = path.resolve(__dirname, '../' + filePath);
    const text = fs.readFileSync(fullpath, 'utf-8');
    return context._loadCircuitWires(text, circuitLabel);
}

module.exports = { assert, test, time, readJSON, summary, context, setDebugMode, createSimulationWithBackend: context.createSimulationWithBackend, declareMemory: context.declareMemory, makeU8: context.makeU8, compileCircuit, loadCircuitWires };
