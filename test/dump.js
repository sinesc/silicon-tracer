"use strict";

// Debug/development script for inspecting compiled circuits.

const fs = require('fs');
const path = require('path');
const { context } = require('./lib/runner.js');

const USAGE = `Usage: node test/dump.js --mode=<list|nets|code> <circuit-stc-file> [<circuit-label>]
  --mode=list   Lists the circuit labels contained in the file.
  --mode=nets   Prints the JSON-encoded Simulation.serialize() output (net/port/functor declarations).
  --mode=code   Prints the generated JS simulation tick function source code.`;

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
}
const modeArg = args.find(a => a.startsWith('--mode='));
if (!modeArg) {
    console.error(USAGE);
    process.exit(1);
}
const mode = modeArg.replace('--mode=', '');
if (mode !== 'list' && mode !== 'nets' && mode !== 'code') {
    console.error('--mode must be "list", "nets", or "code"');
    process.exit(1);
}
const positional = args.filter(a => !a.startsWith('--'));
if (positional.length < 1) {
    console.error(USAGE);
    process.exit(1);
}

const circuitFile = path.resolve(process.cwd(), positional[0]);
const text = fs.readFileSync(circuitFile, 'utf-8');

if (mode === 'list') {
    const content = JSON.parse(text.replace(/^loadFiles\.push\(\s*(.+)\)\s*$/s, '$1'));
    for (const circuit of Object.values(content.circuits)) {
        process.stdout.write(circuit.label + '\n');
    }
} else {
    const circuitLabel = positional[1] ?? null;
    const [ sim ] = context._compileCircuit(text, circuitLabel, 'js', mode === 'code' ? { debug: true } : null);
    if (mode === 'nets') {
        process.stdout.write(JSON.stringify(sim.serialize(), null, 2) + '\n');
    } else {
        process.stdout.write(sim.getCode());
    }
}
