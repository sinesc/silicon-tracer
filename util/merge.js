"use strict";

// Development script that merges the circuits of several .stc files into a single .stc file.
// Circuits are deduplicated by uid (first occurrence wins). Useful to combine a circuit file with
// a component library (e.g. computer1/CPU.stc + res/libs/74SeriesLogic.stc) so all subcircuits resolve.

const fs = require('fs');
const path = require('path');

const USAGE = `Usage: node util/merge.js <output.stc> <input.stc> [input.stc ...]
  Merges all circuits of the input files into one output file (deduplicated by uid).
  The currentUID of the first input file is kept.`;

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
}
if (args.length < 2) {
    console.error(USAGE);
    process.exit(1);
}

const decode = (file) => {
    const text = fs.readFileSync(file, 'utf-8');
    return JSON.parse(text.replace(/^loadFiles\.push\(\s*(.+)\)\s*$/s, '$1'));
};

const [ outPath, ...inputPaths ] = args;
const merged = { version: 4, label: null, currentUID: null, circuits: [] };
const seen = new Set();
let first = true;
for (const inputPath of inputPaths) {
    const content = decode(path.resolve(process.cwd(), inputPath));
    if (first) {
        merged.label = content.label;
        merged.currentUID = content.currentUID;
        first = false;
    }
    for (const circuit of content.circuits) {
        if (seen.has(circuit.uid)) continue;
        seen.add(circuit.uid);
        merged.circuits.push(circuit);
    }
}
process.stdout.write(`Merged ${merged.circuits.length} circuits into ${outPath}\n`);
fs.writeFileSync(outPath, 'loadFiles.push(\n' + JSON.stringify(merged, null, '\t') + '\n)\n');
