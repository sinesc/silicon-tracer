"use strict";

// Debug/development script for inspecting compiled circuits.

const fs = require('fs');
const path = require('path');
const { context } = require('../test/lib/runner.js');

const USAGE = `Usage: node util/dump.js --mode=<list|nets|code|raw> <circuit-stc-file> [<circuit-label>]
  --mode=list   Lists the circuit labels contained in the file, with JSON line counts.
  --mode=nets   Prints the JSON-encoded Simulation.serialize() output (net/port/functor declarations).
  --mode=code   Prints the generated JS simulation tick function source code.
  --mode=raw    Prints the raw JSON of the specified circuit as stored in the file.`;

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
if (mode !== 'list' && mode !== 'nets' && mode !== 'code' && mode !== 'raw') {
    console.error('--mode must be "list", "nets", "code", or "raw"');
    process.exit(1);
}
const positional = args.filter(a => !a.startsWith('--'));
if (positional.length < 1) {
    console.error(USAGE);
    process.exit(1);
}

const circuitFile = path.resolve(process.cwd(), positional[0]);
const text = fs.readFileSync(circuitFile, 'utf-8');

const content = JSON.parse(text.replace(/^loadFiles\.push\(\s*(.+)\)\s*$/s, '$1'));

if (mode === 'list') {
    const circuits = Object.values(content.circuits);
    const lineCountOf = c => JSON.stringify(c, null, 2).split('\n').length;
    const maxLines = Math.max(...circuits.map(lineCountOf));
    const colWidth = String(maxLines).length;
    for (const circuit of circuits) {
        const lines = String(lineCountOf(circuit)).padStart(colWidth);
        process.stdout.write(`${lines}  ${circuit.label}\n`);
    }
} else if (mode === 'raw') {
    const circuitLabel = positional[1] ?? null;
    const circuit = Object.values(content.circuits).find(c => c.label === circuitLabel);
    if (!circuit) {
        console.error(`Circuit "${circuitLabel}" not found`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify(circuit, null, 2) + '\n');
} else {
    const circuitLabel = positional[1] ?? null;
    const [ sim ] = context._compileCircuit(text, circuitLabel, 'js', mode === 'code' ? { debug: true } : null, true);
    if (mode === 'nets') {
        process.stdout.write(JSON.stringify(sim.serialize(), null, 2) + '\n');
    } else {
        process.stdout.write(sim.getCode());
    }
}
