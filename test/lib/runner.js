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
    document: { addEventListener: () => {} },
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
    'src/ui/toolbar.js',
    'src/ui/dialog.js',
    'src/ui/simulations.js',
    'src/ui/application.js', // replaced by the stub below
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
            targetTPS: 10000,
            debug: false,
        };
        grid = { setCircuit() {}, setCircuitLabel() {}, setSimulationLabel() {} };
        simulations = { current: null };
        circuits = null;
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

    function _compileCircuit(jsonText, backend) {
        // Strip optional JSON-P wrapper (same logic as Circuits.#decodeJSON)
        const content = JSON.parse(jsonText.replace(/^loadFiles\\.push\\(\\s*(.+)\\)\\s*$/s, '$1'));
        const app = new Application();
        app.circuits.unserialize(content, null, false, []);
        const circuit = app.circuits.byUID(content.currentUID);
        const netList = NetList.identify(circuit, app.circuits.all);
        return netList.compileSimulation(null, {
            backend: backend || 'js',
            checkNetConflicts: true,
            targetTPS: 10000,
            debug: false,
            debugSerializeSimulation: false,
        });
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
function compileCircuit(filePath, backend = 'js') {
    const fullpath = path.resolve(__dirname, '../' + filePath);
    const text = fs.readFileSync(fullpath, 'utf-8');
    return context._compileCircuit(text, backend);
}

module.exports = { assert, test, time, readJSON, summary, context, setDebugMode, createSimulationWithBackend: context.createSimulationWithBackend, compileCircuit };
