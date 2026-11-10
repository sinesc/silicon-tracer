"use strict";

// Development script that compiles a circuit from a .stc file into a simulation and runs a
// user supplied scenario script against it. Lets us drive circuits headlessly (set input
// ports/buttons, step ticks, read output ports/probes/memory contents).
//
// Subcircuits must be present in the given file; use util/merge.js to merge a circuit file with
// a component library first.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { context } = require('../test/lib/runner.js');

const USAGE = `Usage: node util/simrun.js <circuit-stc-file> <circuit-label> --script=<script.js> [--tps=N] [--dump=<file.json>]
  Runs <script.js> against the compiled simulation of the named circuit.
  The script runs with these bindings available:
    api.set(name|id, 0|1|null)  Set an input const (port, button, constant) by name or id.
                              Unnamed buttons/constants get synthetic names like 'button@670,150'
    api.step(n)                 Run n simulation ticks
    api.reset()                 Reset simulation memory
    api.get(name)               Read the net value driven at a (root circuit) port by name
    api.probe(name)             Read a probe value by name (multi-bit probes: LSB = probe name suffix 0)
    api.consts / api.ports / api.probes / api.memories / api.clocks
                              Lists of available items (api.show() prints them)
    api.net(id)                 List the ports attached to net id (readable labels)
    api.netOfProbe(name)        Net id of a probe's (LSB) net
    api.netOf(name)             Net id of a (root circuit) port by name
    api.netByGidIo(gid, io)     Net id of the net carrying component gid's io port
    api.gidOf('nor @1050,310')  Gid of a component by (partial) 'name @x,y' label text
    api.write(name, value)      Drive a root input port, multi-bit ports take an integer (LSB first)
    api.read(name)              Read a (multi-bit) root port as integer (LSB first), null if not driven
    api.mem(id)                 Read a memory's data as Uint8Array
    api.setMem(id, values)      Write a memory's data from an array/hex string
    api.setClock(id, {frequency, tps})  Change clock parameters
    api.ticks                   Number of ticks simulated so far
  --dump=<file.json>  Write api.dump data (set by the script via api.dump = ...) to a JSON file.`;

vm.runInContext(`
    function _simSetup(jsonText, circuitLabel, configOverrides) {
        const content = JSON.parse(jsonText.replace(/^loadFiles\\.push\\(\\s*(.+)\\)\\s*$/s, '$1'));
        const app = new Application();
        app.config.debugCompileComments = true;
        const errors = [];
        app.circuits.unserialize(content, null, false, errors);
        if (errors.length > 0) throw new Error('Unserialize errors: ' + JSON.stringify(errors));
        const circuit = circuitLabel
            ? app.circuits.byLabel(circuitLabel)
            : app.circuits.byUID(content.currentUID);
        if (!circuit) throw new Error('Circuit not found: ' + circuitLabel);
        const netList = NetList.identify(circuit, app.circuits.all);
        const config = Object.assign({
            backend: 'js',
            checkNetConflicts: true,
            breakOnConflict: false,
            breakConditions: [],
            targetTPS: 10000,
            debug: false,
        }, configOverrides || {});
        const [ sim ] = netList.compileSimulation(null, config);

        const consts = [];
        const ports = [];
        const probes = [];
        const memories = [];
        const clocks = [];
        const gids = {};   // instanceId => gid => readable label; items of a circuit are shared by all instances of it
        for (const [ instanceId, inst ] of netList.instances.entries()) {
            const loc = (c) => c.x + ',' + c.y;
            for (const item of inst.circuit.items.filter(i => i instanceof SimulationComponent)) {
                const ids = inst.simIds[item.gid];
                const id = Array.isArray(ids) ? ids[0] : ids;
                const kind = item.constructor.name;
                const tag = kind === 'Port' ? 'port' : kind === 'Button' ? 'button' : kind === 'Constant' ? 'constant' : null;
                if (tag !== null && item instanceof Port && item.disregard(instanceId)) continue;
                if (tag === 'port') ports.push({ name: item.name, netId: null, constId: id, gid: item.gid, ids, instanceId });
                if (tag !== null) consts.push({ id, ids, gid: item.gid, kind: tag, name: item.name || (tag + '@' + loc(item)), instanceId });
                if (item instanceof Probe) probes.push({ name: item.name || ('probe@' + loc(item)), gid: item.gid, instanceId });
                if (item instanceof Memory) memories.push({ id, kind: 'memory', instanceId, pos: loc(item) });
                if (item instanceof Clock) clocks.push({ id, instanceId, pos: loc(item) });
            }
            gids[instanceId] = {};
            for (const item of inst.circuit.items.filter(i => !(i instanceof Wire))) {
                gids[instanceId][item.gid] = ( item.name || item.type || item.constructor.name ) + ' @' + loc(item);
            }
        }
        // resolve port net ids
        for (const net of netList.nets) {
            for (const p of net.ports) {
                if (p.instanceId !== 0) continue;
                const comp = netList.instances[0].circuit.itemByGID(p.gid);
                if (comp instanceof Port && comp.name !== '') {
                    const portEntry = ports.find(e => e.name === comp.name && e.instanceId === 0);
                    if (portEntry) portEntry.netId = net.netId;
                }
            }
        }
        return { sim, info: { consts, ports, probes, memories, clocks, gids, labels: netList.instances.map((i) => i.circuit.label) }, netList };
    }
`, context);

// builds the api object around a compiled simulation (also usable programmatically via module.exports)
function buildApi(sim, info, netList) {
const state = { ticks: 0 };

function constIdOf(nameOrId) {
    if (typeof nameOrId === 'number') return nameOrId;
    const entry = info.consts.find(c => c.name === nameOrId && c.instanceId === 0);
    if (!entry) throw new Error(`No input const named "${nameOrId}"`);
    return entry.id;
}
function portNetId(name) {
    const entry = info.ports.find(p => p.name === name && p.instanceId === 0);
    if (!entry) throw new Error(`No port named "${name}"`);
    if (entry.netId === null) throw new Error(`Port "${name}" is not connected to a driven net`);
    return entry.netId;
}

const api = {
    consts: info.consts,
    ports: info.ports,
    probes: info.probes,
    memories: info.memories,
    clocks: info.clocks,
    gids: info.gids,
    dump: null,
    get ticks() {
        return state.ticks;
    },
    set(nameOrId, value) {
        sim.setConstValue(constIdOf(nameOrId), value);
    },
    get(name) {
        return sim.getNetValue(portNetId(name));
    },
    probe(name) {
        return sim.getProbeValue(name);
    },
    net(id) {
        // lists the ports attached to a net as readable labels
        return ( sim.nets[id]?.ports ?? [] ).map((n) => api.describePort(n));
    },
    describePort(name) {
        // port names have the form <io name>@<gid>@<instanceId>_<channel>
        const [ , gid, tail ] = name.split('@');
        const [ instanceId, channel ] = ( tail ?? '' ).split('_');
        const io = sim.ports.find((p) => p.name === name)?.ioType ?? '?';
        const inst = info.gids[instanceId]?.[gid] ?? gid;
        const circuitLabel = instanceId === '0' ? 'root' : ( info.labels[instanceId] ?? '?' );
        return ( io === 'o' ? '-> ' : '<- ' ) + inst + ' io=' + name.split('@')[0] + ' ch' + channel + ' in ' + circuitLabel + '[inst' + instanceId + ']';
    },
    netOfProbe(name) {
        return sim.getProbeNetIds(name)?.[0] ?? null;
    },
    netByGidIo(gid, io, instanceId = 0) {
        // finds the net id of the net carrying the given component port (gid + io name), e.g. ('g904', '#carry')
        for (let i = 0; i < sim.nets.length; i++) {
            if (sim.nets[i].ports.some((p) => { const s = p.split('@'); return s[1] === gid && s[0] === io && s[2].split('_')[0] === String(instanceId); })) return i;
        }
        return null;
    },
    gidOf(labelPart, instanceId = 0) {
        // finds the gid of a component by (partial) label text, e.g. gidOf('nor @1050,310')
        const gids = info.gids[instanceId] ?? {};
        return Object.keys(gids).find((g) => gids[g].includes(labelPart)) ?? null;
    },
    netOf(name) {
        return portNetId(name);
    },
    netIdsOfGid(gid, instanceId = 0) {
        // collects the net ids of all bit channels of a (multi-bit) component gid: [{netId, ch}, ...]
        const r = [];
        for (let i = 0; i < sim.nets.length; i++) {
            for (const p of sim.nets[i].ports) {
                const s = p.split('@');
                if (s[1] === gid && s[2].startsWith(instanceId + '_')) {
                    r.push({ netId: i, ch: parseInt(s[2].split('_')[1], 10) });
                }
            }
        }
        return r;
    },
    netIdsOfProbe(name) {
        // Probe pins are not part of the compiled sim's nets; find them in the netlist instead
        // (net ids there match sim net ids, same assumption as portNetId). Returns [{netId, ch}, ...].
        const probe = info.probes.find((p) => p.name === name && p.instanceId === 0);
        if (!probe) throw new Error(`No probe named "${name}"`);
        const r = [];
        for (const net of netList.nets) {
            for (const p of net.ports) {
                if (p.gid === probe.gid && p.instanceId === 0) r.push({ netId: net.netId, ch: p.channel ?? 0 });
            }
        }
        return r;
    },
    read(name) {
        // reads a (possibly multi-bit) root port as an integer, LSB (ch 0) first; null if not driven
        const entry = info.ports.find(p => p.name === name && p.instanceId === 0);
        if (!entry) throw new Error(`No port named "${name}"`);
        const bits = api.netIdsOfGid(entry.gid).map(b => ({ ch: b.ch, v: sim.getNetValue(b.netId) }));
        if (bits.length === 0) return null;
        let v = 0;
        for (const b of bits) {
            if (b.v === null) return null;
            v |= b.v << b.ch;
        }
        return v;
    },
    write(name, value) {
        // drives a (possibly multi-bit) root input const/port, LSB (ch 0) first
        const entry = info.consts.find(c => c.name === name && c.instanceId === 0);
        if (!entry) throw new Error(`No input const named "${name}"`);
        const ids = Array.isArray(entry.ids) ? entry.ids : [entry.id];
        ids.forEach((id, ch) => sim.setConstValue(id, value === null ? null : (value >> ch) & 1));
    },
    step(n = 1) {
        const r = sim.simulate(n);
        state.ticks += n;
        if (r) throw new Error(`Conflict break fired after ${state.ticks} ticks`);
        return r;
    },
    reset() {
        sim.reset();
    },
    mem(id) {
        return sim.getMemoryData(id);
    },
    setMem(id, values) {
        sim.setMemoryData(id, typeof values === 'string' ? context.makeU8(values) : context.makeU8(values));
    },
    setClock(id, params) {
        sim.setClockFrequency(id, params.frequency ?? null, params.tps ?? null);
    },
    show() {
        console.log('consts:', info.consts.map(c => `${c.id} ${c.kind} "${c.name}"`).join('\n'));
        console.log('ports:', info.ports.map(p => `${p.name} net=${p.netId}`).join('\n'));
        console.log('probes:', info.probes.map(p => p.name).join('\n'));
        console.log('memories:', info.memories.map(m => `${m.id} @${m.pos} inst ${m.instanceId}`).join('\n'));
        console.log('clocks:', info.clocks.map(c => `${c.id} @${c.pos} inst ${c.instanceId}`).join('\n'));
    },
};

return api;
}

// compiles the named circuit (subcircuits must be in the same file) from .stc text and
// returns { sim, info, api }. config overrides go to the simulation (see USAGE defaults).
function createSimulation(stcText, circuitLabel, config = {}) {
    // compileSimulation() inside _simSetup already compiles the tick function (a second
    // sim.compile() call re-generates the memory layout and breaks the compiled tick code).
    const { sim, info, netList } = context._simSetup(stcText, circuitLabel, config);
    return { sim, info, api: buildApi(sim, info, netList) };
}

module.exports = { createSimulation, buildApi };

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        console.log(USAGE);
        process.exit(0);
    }
    const positional = args.filter(a => !a.startsWith('--'));
    const scriptArg = args.find(a => a.startsWith('--script='));
    const tpsArg = args.find(a => a.startsWith('--tps='));
    const dumpArg = args.find(a => a.startsWith('--dump='));
    if (positional.length < 2 || !scriptArg) {
        console.error(USAGE);
        process.exit(1);
    }
    const circuitFile = path.resolve(process.cwd(), positional[0]);
    const circuitLabel = positional[1];
    const text = fs.readFileSync(circuitFile, 'utf-8');
    const config = {};
    if (tpsArg) config.targetTPS = parseInt(tpsArg.replace('--tps=', ''), 10);

    const { sim, api } = createSimulation(text, circuitLabel, config);

    const scriptPath = path.resolve(process.cwd(), scriptArg.replace('--script=', ''));
    const code = fs.readFileSync(scriptPath, 'utf-8');
    new Function('api', 'sim', code)(api, sim);

    if (dumpArg) {
        fs.writeFileSync(path.resolve(process.cwd(), dumpArg.replace('--dump=', '')), JSON.stringify(api.dump ?? null, null, 2) + '\n');
    }
}
