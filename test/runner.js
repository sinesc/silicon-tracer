// Minimal test runner

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = vm.createContext({
    Math,
    //Object,
    String,
    Function,
});

function loadScript(filePath) {
    const fullpath = path.resolve(__dirname, filePath);
    let code = fs.readFileSync(fullpath, 'utf-8');
    code = code.replace(/class\s*([A-Z][a-zA-Z]+)\s*\{/g, 'var $1 = class {');
    vm.runInContext(code, context);
}

loadScript('../src/common.js');
loadScript('../src/sim/backend/javascript.js');
loadScript('../src/sim/backend/wasm_emitter.js');
loadScript('../src/sim/backend/wasm.js');
loadScript('../src/sim/netlist.js');
loadScript('../src/sim/simulation.js');

let passed = 0;
let failed = 0;

// Tests given function, reports error message on exception.
function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (e) {
        console.log(`✗ ${name}: ${e.message}`);
        failed++;
    }
}

// Times given function and reports elapsed duration. Runs init and passes the result to fn. Only fn will be timed.
function time(name, init, fn) {
    try {
        const env = init();
        const start = performance.now();
        fn(env);
        const duration = Math.round(1000 * (performance.now() - start));
        console.log(`Δ ${name}: ${duration}ms`);
        passed++;
    } catch (e) {
        console.log(`✗ ${name}: ${e.message}`);
        failed++;
    }
}

// Generates a test summary.
function summary() {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

// Asserts given assertion is truthy, otherwise throws and error with an optional message.
function assert(assertion, message) {
    if (!assertion) throw new Error(message ?? 'Assertion failed');
}

function readJSON(filePath) {
    const fullpath = path.resolve(__dirname, filePath);
    const raw = fs.readFileSync(fullpath, 'utf-8');
    return JSON.parse(raw);
}

module.exports = { assert, test, time, readJSON, summary, context };
