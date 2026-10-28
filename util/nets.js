"use strict";

// Debug/development script that prints the nets (wires) of a circuit with their connected component ports.
// Useful for reading a circuit as a netlist without opening it in the browser.

const fs = require('fs');
const path = require('path');
const { context } = require('../test/lib/runner.js');

const USAGE = `Usage: node util/nets.js <circuit-stc-file> <circuit-label> [--expand] [--net=<id>]
  Prints one block per net, listing all connected component ports.
  --expand  Also descends into subcircuits (nets of all instances in the hierarchy).
  --net=<id> Print only the net with the given index.`;

vmDefine();

function vmDefine() {
    const vm = require('vm');
    vm.runInContext(`
        function _netsReport(jsonText, circuitLabel, expand) {
            const content = JSON.parse(jsonText.replace(/^loadFiles\\.push\\(\\s*(.+)\\)\\s*$/s, '$1'));
            const app = new Application();
            app.config.debugCompileComments = true;
            app.circuits.unserialize(content, null, false, []);
            const circuits = app.circuits.all;
            const circuit = circuitLabel
                ? (app.circuits.byLabel(circuitLabel) ?? Object.values(app.circuits.all).find(c => c.label === circuitLabel) ?? null)
                : app.circuits.byUID(content.currentUID);
            if (!circuit) throw new Error('Circuit not found: ' + circuitLabel);
            const netList = NetList.identify(circuit, expand ? app.circuits.all : null);

            const describe = (port) => {
                const inst = netList.instances[port.instanceId];
                const comp = inst.circuit.itemByGID(port.gid);
                let label = '';
                if (comp) {
                    const name = comp.name ?? '';
                    const type = comp.type ?? '';
                    label = (name !== '' ? name : type) || '?';
                }
                const instTag = port.instanceId === 0 ? '' : ' in ' + inst.circuit.label + ' [inst ' + port.instanceId + ']';
                const ch = port.channel > 0 ? '#' + port.channel : '';
                const pos = comp.x + ',' + comp.y;
                const id = String(comp.name || comp.type || '?');
                return (port.ioType === 'out' ? '-> ' : '<- ') + comp.constructor.name.padEnd(16) + ' ' + id.padEnd(18) + ' ' + port.name + ch + instTag + '  gid=' + port.gid + ' @' + pos;
            };

            const lines = [];
            lines.push('# ' + circuit.label + ': ' + (circuit.description ?? ''));
            for (const [ index, net ] of netList.nets.entries()) {
                lines.push('net ' + index + ' (id ' + net.netId + ', ' + net.ports.length + ' ports, ' + net.wires.length + ' wires)');
                const portNames = net.ports.map(describe);
                portNames.sort();
                for (const p of portNames) lines.push('  ' + p);
            }
            const declaredProbes = [];
            for (const inst of netList.instances) {
                for (const item of inst.circuit.items.filter(i => i instanceof Probe)) {
                    declaredProbes.push('  probe ' + (item.name ?? '(unnamed)') + ' gid ' + item.gid + ' [inst ' + inst.id + ']');
                }
            }
            if (declaredProbes.length > 0) {
                lines.push('probes:');
                lines.push(...declaredProbes);
            }
            lines.push('unconnected ports: ' + netList.unconnected.ports.map(p => describe(p)).join('; '));
            return lines.join('\\n');
        }
    `, context);
}

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
const expand = args.includes('--expand');
const netFilter = args.find(a => a.startsWith('--net='));

const circuitFile = path.resolve(process.cwd(), positional[0]);
const circuitLabel = positional[1];
const text = fs.readFileSync(circuitFile, 'utf-8');
let report = context._netsReport(text, circuitLabel, expand);
if (netFilter) {
    const id = netFilter.replace('--net=', '');
    const blocks = report.split(/\n(?=net \d+ )/);
    report = [ blocks[0], ...blocks.filter(b => b.startsWith(`net ${id} `)) ].join('\n');
}
process.stdout.write(report + '\n');
