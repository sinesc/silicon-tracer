"use strict";

// Debug/development script that prints a circuit as a compact, readable text listing.

const fs = require('fs');
const path = require('path');

const USAGE = `Usage: node util/circuit2txt.js <circuit-stc-file> <circuit-label> [--wires] [--sort=<pos|type>]
  Prints one line per grid item. Wires are omitted unless --wires is given.
  Items inside a Group box are annotated with [group: "label"] (save-time annotation, ignored when loading).`;

const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log(USAGE);
    process.exit(0);
}
const positional = args.filter(a => !a.startsWith('--'));
if (positional.length < 2) {
    console.error(USAGE);
    process.exit(1);
}
const showWires = args.includes('--wires');
const sortMode = args.find(a => a.startsWith('--sort='))?.replace('--sort=', '') ?? 'pos';

const circuitFile = path.resolve(process.cwd(), positional[0]);
const circuitLabel = positional[1];
const text = fs.readFileSync(circuitFile, 'utf-8');
const content = JSON.parse(text.replace(/^loadFiles\.push\(\s*(.+)\)\s*$/s, '$1'));
const circuit = Object.values(content.circuits).find(c => c.label === circuitLabel);
if (!circuit) {
    console.error(`Circuit "${circuitLabel}" not found`);
    process.exit(1);
}

const items = [];
for (const item of circuit.data) {
    const type = item['#c'];
    if (type === 'Wire' && !showWires) continue;
    const args = item['#a'] ?? [];
    const extra = Object.entries(item).filter(([ k ]) => k[0] !== '#' && k[0] !== '_').map(([ k, v ]) => `${k}=${JSON.stringify(v)}`); // ignore serialization internals and informational-only keys (shown separately)
    items.push({ type, x: args[0], y: args[1], args: args.slice(2), extra, group: item['_group'] ?? null });
}
if (sortMode === 'type') {
    items.sort((a, b) => a.type.localeCompare(b.type) || a.y - b.y || a.x - b.x);
} else {
    items.sort((a, b) => a.y - b.y || a.x - b.x);
}
console.log(`# ${circuit.label}: ${circuit.description ?? ''}`);
for (const item of items) {
    const parts = [
        `${item.type.padEnd(15)} ${String(item.x).padStart(4)},${String(item.y).padStart(4)}`,
        item.args.map(a => JSON.stringify(a)).join(' '),
        item.extra.join(' '),
        item.group === null ? '' : `[group: ${JSON.stringify(item.group)}]`,
    ].filter((part) => part !== '');
    console.log(parts.join(' '));
}
