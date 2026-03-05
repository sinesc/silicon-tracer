// Minimal test runner

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const util = require('util');

const context = vm.createContext({
    Math,
    //Object,
    String,
    Function,
    TextEncoder: util.TextEncoder,
});

function loadScript(filePath) {
    const fullpath = path.resolve(__dirname, '../../' + filePath);
    let code = fs.readFileSync(fullpath, 'utf-8');
    code = code.replace(/class\s*([A-Z][a-zA-Z]+)\s*\{/g, 'var $1 = class {');
    vm.runInContext(code, context);
}

loadScript('src/common.js');
loadScript('src/sim/backend/javascript.js');
loadScript('src/sim/backend/wasm_emitter.js');
loadScript('src/sim/backend/wasm.js');
loadScript('src/sim/netlist.js');
loadScript('src/sim/simulation.js');

let passed = 0;
let failed = 0;

// Tests given function, reports error message on exception.
function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}: ok`);
        passed++;
    } catch (e) {
        console.log(`✗ ${name}: ${e.message}`);
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
        console.log(`✗ ${name}: ${e.message}`);
        failed++;
        return null;
    }
}

// Generates a test summary.
function summary() {
    console.log(`${passed} passed, ${failed} failed`);
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

module.exports = { assert, test, time, readJSON, summary, context };
