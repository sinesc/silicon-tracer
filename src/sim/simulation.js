"use strict";

/*
 * Digital logic circuit simulator
 *
 * PORT: Ports are inputs or outputs of components (e.g. gates, constants, built-ins). They are the connection points between components and nets. All ports have unique names (a concatenation of a given name and the component suffix).
 * NET: Nets connect component ports. Ports can either output to a net or read input from it. The state of a net can be "0", "1" or "not set" (when there are no active output to the net).
 * GATE: Gates are circuit components that perform a simple logic operation. Each simulation tick a gate first reads from its inputs, computes the result and writes it to the output. Only then do the inputs read from the nets they are
 * attached to. This is done to simulate gate delay. Gate functions are defined in GATE_MAP. Gate output ports are binary with the only possible states being "0" and "1".
 * BUILTIN: Builtins are basic digital components that - like gates - have ports that connect to nets. Their functions are defined in BUILTIN_MAP. Builtin output ports support Tri-state logic, their outputs can be "0", "1" or "high impedance" ("not set").
 * Like gates they read from their inputs before the inputs read from the nets they are attached to in order to simulate delay.
 *
 * APPROACH: We store the states of all nets and ports in one single Uint32Array where each bit of each element stores the state of a port or a net. On the #ports/#nets definitions we store the memory element index in `elementIndex2` and the bit-index in
 * bitIndex`. For tri-state logic we use an additional array element `elementIndex3` to store whether the port/net is high-impedance(0) or driven(1) (at the same bit-index). In the BUILTIN_MAP the logic expression for this state is defined in the 'signals' field.
 * When a port needs to detect edges we add another element `elementIndexP` that contains the previous state so that edges can be detected.
 * To optimize simulation performance, all gates/builtins of the same type (e.g. 'and', 'or') are grouped so that a single evaluation of a gate/builtin expression on a Uint32Array element can compute up to 64 components at once.
 * However, since we need to copy the current net states to the component inputs each tick, we also group nets by their attached component inputs so that we can ideally also copy up to 64-nets to the attached inputs at once.  Of course this will not always
 * be possible (e.g. a net can be attached to multiple gate inputs) so we generate an optimized layout that tries align as many net bits with their connected input ports as possible.
 */

// Handles compiling and running the actual simulation.
class Simulation {

    // Supported gates.
    static GATE_MAP = {
        buffer  : { negate: false, joinOp: null },
        not     : { negate: true,  joinOp: null },
        and     : { negate: false, joinOp: '&' },
        nand    : { negate: true,  joinOp: '&' },
        or      : { negate: false, joinOp: '|' },
        nor     : { negate: true,  joinOp: '|' },
        xor     : { negate: false, joinOp: '^' },
        xnor    : { negate: true,  joinOp: '^' },
    };

    static GATE_INPUTS = Array.from(construct(null, 16, (i) => String.fromCharCode(97 + i)));
    static GATE_OUTPUT = 'q';

    // Basic builtin components.
    static BUILTIN_MAP = {
        dlatch      : { outputs: { q: '(load & data) | (~load & q)' }, inputs: [ 'load', 'data' ] },
        adlatch     : { outputs: { q: '~reset & (set | ((load & data) | (~load & q)))' }, inputs: [ 'load', 'data', 'reset', 'set' ]  },
        dflipflop   : { outputs: { q: '(+clock & data) | (~+clock & q)' }, inputs: [ 'clock', 'data' ] },
        adflipflop  : { outputs: { q: '~reset & (set | ((+clock & data) | (~+clock & q)))' }, inputs: [ 'clock', 'data', 'reset', 'set' ] },
        jkflipflop  : { outputs: { q: '(+clock & ((j & ~q) | (~k & q))) | (~+clock & q)' }, inputs: [ 'clock', 'k', 'j' ] },
        ajkflipflop : { outputs: { q: '~reset & (set | ((+clock & ((j & ~q) | (~k & q))) | (~+clock & q)))' }, inputs: [ 'clock', 'k', 'j', 'reset', 'set' ] },
        tflipflop   : { outputs: { q: '(+clock & ((t & ~q) | (~t & q))) | (~+clock & q)' }, inputs: [ 'clock', 't' ] },
        atflipflop  : { outputs: { q: '~reset & (set | ((+clock & ((t & ~q) | (~t & q))) | (~+clock & q)))' }, inputs: [ 'clock', 't', 'reset', 'set' ] },
        srflipflop  : { outputs: { q: '(+clock & (s | (~r & q))) | (~+clock & q)' }, inputs: [ 'clock', 'r', 's' ] },
        asrflipflop : { outputs: { q: '~reset & (set | ((+clock & (s | (~r & q))) | (~+clock & q)))' }, inputs: [ 'clock', 'r', 's', 'reset', 'set' ] },
        switch      : { outputs: { output: 'input' }, signals: { output: 'close' }, inputs: [ 'close', 'input' ] }, // FIXME: signals should be: { output: 'close & ?input' } but ?input not yet supported (reconsider even using this because switch behaviour is inconvenient [requiring an input])
        buffer3     : { outputs: { q: 'data' }, signals: { q: 'enable' }, inputs: [ 'enable', 'data' ] },
        not3        : { outputs: { q: '~data' }, signals: { q: 'enable' }, inputs: [ 'enable', 'data' ] },
        adder       : { outputs: { cOut: '((a ^ b) & cIn) | (a & b)', q: '(a ^ b) ^ cIn' }, inputs: [ 'a', 'b', 'cIn' ]  },
        mux         : { outputs: { q: '(~select & a) | (select & b)' }, inputs: [ 'select', 'a', 'b' ] },
        mux3        : { outputs: { q: '(~select & a) | (select & b)' }, signals: { q: 'enable' }, inputs: [ 'select', 'enable', 'a', 'b' ] },
        demux       : { outputs: { qa: '(~select & data)', qb: '(select & data)' }, inputs: [ 'select', 'data' ] },
        demux3      : { outputs: { qa: '(~select & data)', qb: '(select & data)' }, signals: { qa: 'enable & ~select', qb: 'enable & select' }, inputs: [ 'select', 'enable', 'data' ] },
    };

    #debug;
    #functors = {};
    #consts = [];
    #nets = { all: [], byPort: {} };
    #ports = { all: [], batchTypes: {}, byBatchComponent: {}, byName: {} };
    #clocks = [];
    #layout = { netToInputBitmap: null, outputToNetBitmap: null, operations: null, pullMasks: null };
    #mem;
    #compiledTicks;
    #compiledStep = { generator: null, iterator: null };
    #backend;

    // Construct a new instance. Enable debug to generate commented code.
    constructor(debug = false) {
        assert.bool(debug);
        this.#debug = debug;
        this.#backend = new BackendJavascript(debug);
    }

    // Declares a net (which inputs/outputs are connected) and returns the net id. Attached IO-names must include their suffixes.
    declareNet(attachedIONames) {
        assert.array(attachedIONames, false, (i) => assert.string(i));
        assert(attachedIONames.length > 0);
        const net = { id: this.#nets.all.length, elementIndex2: null, elementIndex3: null, bitIndex: null, copiesTo: null, ports: attachedIONames };
        this.#nets.all.push(net);
        for (const ioName of attachedIONames) {
            assert(this.#nets.byPort[ioName] === undefined, () => `Port ${ioName} already contained in net ${JSON.stringify({ id: this.#nets.byPort[ioName].id, ports: this.#nets.byPort[ioName].ports })}`);
            this.#nets.byPort[ioName] = net;
        }
        return net.id;
    }

    // Declares a gate with the given inputs/output. For convenience, suffix is appended to all IO-names and must be unique.
    declareGate(type, numInputs, suffix) {
        assert.string(type);
        assert.string(suffix);
        assert.integer(numInputs, false, 1, 16);
        const rules = Simulation.GATE_MAP[type];
        const batchType = `${type}[${numInputs}]`;
        for (const input of Simulation.GATE_INPUTS.slice(0, numInputs)) {
            this.#declarePort(input, suffix, 'i', false, false, batchType);
        }
        this.#declarePort(Simulation.GATE_OUTPUT, suffix, 'o', false, false, batchType);
        if (!this.#functors[batchType]) {
            const inner = Simulation.GATE_INPUTS.slice(0, numInputs).join(' ' + rules.joinOp + ' ');
            const outputs = {
                q: rules.negate ? '(~(' + inner + '))' : inner,
            };
            this.#functors[batchType] = { outputs, signals: null };
        }
    }

    // Declares a basic builtin gate-like function. Suffix is appended to the builtin's pre-defined IO-names.
    declareBuiltin(type, suffix) {
        assert.string(type);
        assert.string(suffix);
        const rules = Simulation.BUILTIN_MAP[type];
        for (const input of rules.inputs) {
            const detectEdges = values(rules.outputs).map((eq) => eq.includes(`+${input}`) || eq.includes(`-${input}`)).some((t) => t);
            this.#declarePort(input, suffix, 'i', false, detectEdges, type);
        }
        for (const output of keys(rules.outputs)) {
            const isTristate = !!rules.signals?.[output];
            this.#declarePort(output, suffix, 'o', isTristate, false, type);
        }
        if (!this.#functors[type]) {
            const outputs = { };
            const signals = { };
            for (const [ name, eq ] of pairs(rules.outputs)) {
                outputs[name] = eq;
                signals[name] = rules.signals?.[name] ?? '';
            }
            this.#functors[type] = { outputs, signals };
        }
    }

    // Declares a clock with the given frequency at the given simulation ticks per second. Suffix is appended to the clock's `enable` input and `c` output.
    declareClock(frequency, tps, suffix) {
        assert.number(frequency);
        assert.integer(tps);
        assert.string(suffix);
        const clock = { id: this.#clocks.length, frequency, tps, enablePortName: 'enable' + suffix, outputPortName: 'c' + suffix, counterIndex: null, limitIndex: null };
        this.#clocks.push(clock);
        this.#declarePort('enable', suffix, 'i', false, false, 'clock');
        this.#declarePort('c', suffix, 'o', false, false, 'clock');
        return clock.id;
    }

    // Sets/changes the frequency of a defined clock.
    setClockFrequency(id, frequency = null, tps = null) {
        assert.integer(id);
        assert.number(frequency, true);
        assert.integer(tps, true);
        const clock = this.#clocks[id];
        if (frequency !== null) clock.frequency = frequency;
        if (tps !== null) clock.tps = tps;
        if (this.#mem && clock.limitIndex !== null) {
            const ticks = Math.floor(clock.tps / clock.frequency / 2);
            this.#mem[clock.limitIndex] = ticks;
        }
    }

    // Updates all clocks in the circuit for the given TPS.
    updateClocks(tps) {
        assert.integer(tps);
        for (let index = 0; index < this.#clocks.length; ++index) {
            this.setClockFrequency(index, null, tps);
        }
    }

    // Declares a constant and returns the constant id. Constants can be updated using setConst without recompiling the simulation. Suf, check: (v, f) => v.trim().length > 0fix is appended to the constant's output name.
    declareConst(initialValue, suffix) {
        assert.integer(initialValue, true);
        assert.string(suffix);
        const constant = { id: this.#consts.length, initialValue, output: 'q' + suffix }
        this.#consts.push(constant);
        this.#declarePort('q', suffix, 'o', true, false, 'const');
        return constant.id;
    }

    // Declares a push/pull resistor. Suffix is appended to the resistory's `q` output.
    declarePullResistor(type, suffix) {
        assert.enum([ 'up', 'down' ], type);
        assert.string(suffix);
        const portId = this.#declarePort('q', suffix, 'o', false, false, 'pull');
        const port = this.#ports.all[portId];
        port.isPull = true; // TODO: instead use ioType u/d to represent pull up/down
        port.pullType = type;
    }

    // Compiles the circuit and initializes memory, making it ready for simulate().
    compile(rawMem = null) {
        assert.class(Uint32Array, rawMem, true);
        const requiredMemory = this.#generateMemoryLayout();
        this.#generateOperations();
        if (rawMem && rawMem.length !== requiredMemory) {
            throw new Error('Incompatible memory size');
        }
        this.#mem = rawMem ?? this.#backend.allocateMemory(requiredMemory);
        this.#compileTicks();
        if (!rawMem) {
            const elementsPerEntry = this.#backend.constructor.BITS_PER_ELEMENT / 32;
            for (const [ index, constant ] of pairs(this.#consts)) {
                this.setConstValue(index, constant.initialValue);
            }
            for (const clock of this.#clocks) {
                const ticks = Math.floor(clock.tps / clock.frequency / 2);
                this.#mem[clock.limitIndex * elementsPerEntry] = ticks;
                this.#mem[clock.counterIndex * elementsPerEntry] = ticks;
            }
        }
    }

    // Runs the simulation for the given number of ticks.
    simulate(ticks = 1) {
        this.#compiledTicks(ticks);
    }

    // Steps through the compiled simulation line by line, optionally invoking the JS debugger each step.
    simulateStep(triggerDebugger) {
        if (!this.#compiledStep.iterator) {
            this.#compileStep();
        }
        const result = this.#compiledStep.iterator.next(triggerDebugger);
        if (result.done) {
            this.#compileStep();
            this.#compiledStep.iterator.next(); // skip first
        }
    }

    // Sets the value of a defined constant by its id.
    setConstValue(id, value) {
        assert.integer(id);
        assert.integer(value, true);
        const constant = this.#consts[id] ?? error('Unknown constant');
        const port = this.#ports.byName[constant.output];

        const elementsPerEntry = this.#backend.constructor.BITS_PER_ELEMENT / 32;
        const dwordOffset = Math.floor(port.bitIndex / 32);
        const bitInDword = port.bitIndex % 32;
        const bit = 1 << bitInDword;

        if (port.elementIndex2 !== null) {
            const memIndex = port.elementIndex2 * elementsPerEntry + dwordOffset;
            if (value) {
                this.#mem[memIndex] |= bit;
            } else {
                this.#mem[memIndex] &= ~bit;
            }
        }
        if (port.elementIndex3 !== null) {
            const memIndex = port.elementIndex3 * elementsPerEntry + dwordOffset;
            if (value !== null) {
                this.#mem[memIndex] |= bit;
            } else {
                this.#mem[memIndex] &= ~bit;
            }
        }
    }

    // Gets the value of a defined constant by its id.
    getConstValue(id) {
        assert.integer(id);
        const constant = this.#consts[id] ?? error('Unknown constant');
        const port = this.#ports.byName[constant.output];
        if (port.elementIndex2 !== null) {
            const elementsPerEntry = this.#backend.constructor.BITS_PER_ELEMENT / 32;
            const dwordOffset = Math.floor(port.bitIndex / 32);
            const bitInDword = port.bitIndex % 32;
            const bit = 1 << bitInDword;
            const memIndex = port.elementIndex2 * elementsPerEntry + dwordOffset;
            return (this.#mem[memIndex] & bit) !== 0 ? 1 : 0;
        }
        return null;
    }

    // Gets the value of a net in the simulation by its id. null indicates there is no signal, -1 a signal conflict, 0/1 normal state.
    getNetValue(id) {
        assert.integer(id);
        const net = this.#nets.all[id] ?? error('Unknown net');
        if (net.elementIndex2 !== null) {
            const elementsPerEntry = this.#backend.constructor.BITS_PER_ELEMENT / 32;
            const dwordOffset = Math.floor(net.bitIndex / 32);
            const bitInDword = net.bitIndex % 32;
            const bit = 1 << bitInDword;

            const memIndex3 = net.elementIndex3 * elementsPerEntry + dwordOffset;
            const isDriven = (this.#mem[memIndex3] & bit) !== 0;
            if (isDriven) {
                const memIndex2 = net.elementIndex2 * elementsPerEntry + dwordOffset;
                return (this.#mem[memIndex2] & bit) !== 0 ? 1 : 0;
            }
        }
        return null;
    }

    // Returns a list of defined nets.
    get nets() {
        return this.#nets.all;
    }

    // Returns a list of defined ports.
    get ports() {
        return this.#ports.all;
    }

    // Returns simulation memory.
    get mem() {
        return this.#mem;
    }

    // Returns simulation layout.
    get layout() {
        return this.#layout;
    }

    // Used by declareGate/declareNet/declareConst/... to declare the ports of those components). Return the port id.
    #declarePort(batchName, batchComponent, ioType, isTriState, detectEdges, batchType) {
        const name = batchName + batchComponent;
        const port = { id: this.#ports.all.length, name, bitIndex: null, elementIndex2: null, elementIndex3: null, elementIndexP: null, ioType, isTriState, detectEdges, batchType, batchName, batchComponent };
        assert(this.#ports.byName[name] === undefined, `Port ${name} already defined`);
        this.#ports.all.push(port);
        // deduplicated list of component types
        this.#ports.batchTypes[batchType] ??= {};
        this.#ports.batchTypes[batchType][batchComponent] = true; // TODO: refactor to set
        // by batch component
        this.#ports.byBatchComponent[batchComponent] ??= {};
        this.#ports.byBatchComponent[batchComponent][batchName] = port;
        // by name
        this.#ports.byName[name] = port;
        return port.id;
    }

    // Assigns ports to elements/bits. All ports of the same component get assigned to the same bit index of separate elements.
    #assignPortLocations() {
        let globalElementIndex = 0;
        // go through batch types (e.g. "and[2]")
        for (const batchComponents of values(this.#ports.batchTypes)) {
            let elementIndex = {};
            let bitIndex = 0;
            // go through all ports attached to that type, e.g. port "a", "b" and "q" of all "and[2]" gates.
            for (const component of keys(batchComponents)) {
                // set all ports of the same component to the same bitIndex
                const ports = this.#ports.byBatchComponent[component];
                for (const port of values(ports)) {
                    elementIndex['2:' + port.batchName] ??= globalElementIndex++;
                    port.elementIndex2 = elementIndex['2:' + port.batchName];
                    if (port.isTriState) {
                        elementIndex['3:' + port.batchName] ??= globalElementIndex++;
                        port.elementIndex3 = elementIndex['3:' + port.batchName];
                    }
                    if (port.detectEdges) {
                        elementIndex['p:' + port.batchName] ??= globalElementIndex++;
                        port.elementIndexP = elementIndex['p:' + port.batchName];
                    }
                    port.bitIndex = bitIndex;
                }
                ++bitIndex;
                // reset bit/element index once max. bits per element is reached
                if (bitIndex === this.#backend.constructor.BITS_PER_ELEMENT) {
                    bitIndex = 0;
                    elementIndex = {};
                }
            }
        }
        return globalElementIndex;
    }

    // Assigns clocks to elements.
    #assignClockLocations(globalElementIndex) {
        for (const clock of this.#clocks) {
            clock.counterIndex = globalElementIndex++;
            clock.limitIndex = globalElementIndex++;
        }
        return globalElementIndex;
    }

    // Assigns nets to elements/bits.
    #assignNetLocations(globalElementIndex) {
        const ports = this.#ports.all.toSorted((a, b) => compare(a.elementIndex2, b.elementIndex2) || compare(a.bitIndex, b.bitIndex));
        let elementIndex = { n2: -1, n3: -1 };
        let assigned;
        for (const ioType of ['i', 'o']) {
            do {
                assigned = false;
                let lastAssignedBitIndex = this.#backend.constructor.BITS_PER_ELEMENT;
                for (const port of values(ports)) {
                    assert.integer(port.bitIndex);
                    if (port.ioType !== ioType) continue;
                    // get net this port is attached to
                    const candidateNet = this.#nets.byPort[port.name];
                    if (!candidateNet) continue;
                    if (candidateNet.bitIndex !== null) continue;
                    // create new mem array element each time bit index resets
                    if (port.bitIndex <= lastAssignedBitIndex) {
                        elementIndex.n2 = globalElementIndex++;
                        elementIndex.n3 = globalElementIndex++;
                        lastAssignedBitIndex = this.#backend.constructor.BITS_PER_ELEMENT;
                    }
                    // ensure each bit index within the current mem array element is only assigned once
                    if (port.bitIndex !== lastAssignedBitIndex) {
                        candidateNet.bitIndex = port.bitIndex;
                        candidateNet.elementIndex2 = elementIndex.n2;
                        candidateNet.elementIndex3 = elementIndex.n3;
                        if (port.ioType === 'i') {
                            candidateNet.copiesTo = port.name;
                        }
                        lastAssignedBitIndex = port.bitIndex;
                        assigned = true;
                    }
                }
            } while (assigned);
        }
        return globalElementIndex;
    }

    // Optimizes bitmaps to join possible bit operations.
    #optimizeBitmaps(bitmaps) {

        bitmaps.sort((a, b) => compare(a.destElementIndex2, b.destElementIndex2) || compare(a.srcElementIndex2, b.srcElementIndex2) || compare(a.srcBit, b.srcBit) || compare(a.destBit, b.destBit));
        const result = [];
        let i = 0;

        while (i < bitmaps.length) {
            const current = bitmaps[i];
            const { srcElementIndex2, destElementIndex2 } = current;

            // Collect all entries with the same srcElementIndex2
            const groupStart = i;
            while (i < bitmaps.length && bitmaps[i].srcElementIndex2 === srcElementIndex2 && bitmaps[i].destElementIndex2 === destElementIndex2) {
                i++;
            }
            let group = bitmaps.slice(groupStart, i);

            // First pass: identify duplicate patterns (same srcBit)
            const [duplicates, remaining1] = this.#groupDuplicates(group);
            result.push(...duplicates);

            // Second pass: for remaining entries, identify offset patterns
            const [offsets, remaining2] = this.#groupOffsets(remaining1);
            result.push(...offsets);

            // Add any unoptimized entries to result
            for (const bitmap of remaining2) {
                bitmap.mode = 'single';
            }
            result.push(...remaining2);
        }

        return result;
    }

    // Optimize bitmaps: Group bits that get duplicated into multiple destination bits.
    #groupDuplicates(group) {
        const duplicates = [];
        const skippedIndices = new Set();

        for (let i = 0; i < group.length; i++) {
            if (skippedIndices.has(i)) continue;

            const entry = group[i];
            const srcBit = entry.srcBit;

            // Find all entries with the same srcBit
            const destBits = [];
            const matchedIndices = [];
            for (let j = i; j < group.length; j++) {
                if (!skippedIndices.has(j) && group[j].srcBit === srcBit) {
                    destBits.push(group[j].destBit);
                    matchedIndices.push(j);
                }
            }

            if (destBits.length > 1) {
                duplicates.push({
                    mode: 'duplicate',
                    srcBit: srcBit,
                    destBit: destBits.sort((a, b) => a - b),
                    srcElementIndex2: entry.srcElementIndex2,
                    srcElementIndex3: entry.srcElementIndex3,
                    destElementIndex2: entry.destElementIndex2,
                    destElementIndex3: entry.destElementIndex3
                });
                matchedIndices.forEach(idx => skippedIndices.add(idx));
            }
        }

        // Return remaining entries (those not skipped)
        const remaining = group.filter((_, i) => !skippedIndices.has(i));
        return [duplicates, remaining];
    }

    // Optimize bitmaps: Group bits that get shifted by the same offset into the destination.
    #groupOffsets(group) {
        const offsets = [];
        const skippedIndices = new Set();

        for (let i = 0; i < group.length; i++) {
            if (skippedIndices.has(i)) continue;

            const entry = group[i];
            const offset = entry.destBit - entry.srcBit;

            // Find all entries with the same offset
            const srcBits = [entry.srcBit];
            const matchedIndices = [i];

            for (let j = i + 1; j < group.length; j++) {
                if (!skippedIndices.has(j)) {
                    const other = group[j];
                    if (other.destBit - other.srcBit === offset) {
                        srcBits.push(other.srcBit);
                        matchedIndices.push(j);
                    }
                }
            }

            if (srcBits.length > 1) {
                srcBits.sort((a, b) => a - b);
                offsets.push({
                    mode: 'offset',
                    srcBit: srcBits,
                    destBit: offset,
                    srcElementIndex2: entry.srcElementIndex2,
                    srcElementIndex3: entry.srcElementIndex3,
                    destElementIndex2: entry.destElementIndex2,
                    destElementIndex3: entry.destElementIndex3
                });
                matchedIndices.forEach(idx => skippedIndices.add(idx));
            }
        }

        // Return remaining entries (those not skipped)
        const remaining = group.filter((_, i) => !skippedIndices.has(i));
        return [offsets, remaining];
    }

    // Generate masks for pull resistors.
    #generatePullResistorMasks() {
        const masks = {};
        for (const port of this.#ports.all) {
            if (!port.isPull) continue;
            const net = this.#nets.byPort[port.name];
            if (!net || net.elementIndex2 === null) continue;

            masks[net.elementIndex2] ??= { up: 0n, down: 0n, index3: net.elementIndex3 };
            const bit = 1n << BigInt(port.bitIndex);
            if (port.pullType === 'up') {
                masks[net.elementIndex2].up |= bit;
            } else {
                masks[net.elementIndex2].down |= bit;
            }
        }
        return masks;
    }

    // Generate bit mappings to set inputs from nets.
    #generateNetToInputBitmap() {
        // create direct copy bit maps
        const nets = this.#nets.all.toSorted((a, b) => (a.elementIndex2 - b.elementIndex2) || (a.bitIndex - b.bitIndex));
        const bitmaps = [];
        let bitmap;
        let prevBitIndex = this.#backend.constructor.BITS_PER_ELEMENT;
        for (const net of nets) {
            if (!net.copiesTo) continue;
            const destPort = this.#ports.byName[net.copiesTo];
            if (net.bitIndex < prevBitIndex || bitmap.destElementIndex2 !== destPort.elementIndex2) {
                if (bitmap) {
                    bitmaps.push(bitmap);
                }
                bitmap = { mode: 'direct', startBit: net.bitIndex, endBit: net.bitIndex, srcElementIndex2: net.elementIndex2, destElementIndex2: destPort.elementIndex2 };
            }
            bitmap.endBit = net.bitIndex;
            prevBitIndex = net.bitIndex;
        }
        if (bitmap) {
            bitmaps.push(bitmap);
        }
        // create bit maps for remaining ports that can't be directly copied
        const ports = this.#ports.all.filter((p) => p.ioType === 'i');
        const rawBitmaps = [];
        for (const port of ports) {
            const net = this.#nets.byPort[port.name];
            if (port.name === net.copiesTo) continue;
            bitmap = { mode: null, srcBit: net.bitIndex, destBit: port.bitIndex, srcElementIndex2: net.elementIndex2, destElementIndex2: port.elementIndex2 };
            rawBitmaps.push(bitmap);
        }
        // optimize and re-order for code generation
        bitmaps.push(...this.#optimizeBitmaps(rawBitmaps));
        const modeOrder = ['direct', 'duplicate', 'offset'];
        bitmaps.sort((a, b) => compare(a.destElementIndex2, b.destElementIndex2) || compare(a.destElementIndex3, b.destElementIndex3) || comparePriority(a.mode, b.mode, modeOrder) || compare(a.srcElementIndex2, b.srcElementIndex2) || compare(a.srcBit, b.srcBit) || compare(a.destBit, b.destBit));
        return bitmaps;
    }

    // Generate bit mappings to set nets from outputs.
    #generateOutputToNetBitmap() {
        // none of the output bits will align with net bits (since we priorized aligning input bits
        // with net bits due to there generally being more inputs than outputs), so skip direct copy step here
        // create bit maps for remaining ports that can't be directly copied
        const ports = this.#ports.all.filter((p) => p.ioType === 'o' && !p.isPull);
        const rawBitmaps = [];
        let bitmap;
        for (const port of ports) {
            const net = this.#nets.byPort[port.name];
            if (!net) continue;
            bitmap = { mode: null, srcBit: port.bitIndex, destBit: net.bitIndex, srcElementIndex2: port.elementIndex2, srcElementIndex3: port.elementIndex3, destElementIndex2: net.elementIndex2, destElementIndex3: net.elementIndex3 };
            rawBitmaps.push(bitmap);
        }
        // optimize and re-order for code generation
        const bitmaps = this.#optimizeBitmaps(rawBitmaps);
        const modeOrder = ['duplicate', 'offset', 'single'];
        bitmaps.sort((a, b) => compare(a.destElementIndex2, b.destElementIndex2) || comparePriority(a.mode, b.mode, modeOrder) || compare(a.srcElementIndex2, b.srcElementIndex2) || compare(a.srcBit, b.srcBit) || compare(a.destBit, b.destBit));
        return bitmaps;
    }

    // Generate list of memory operations to perform to simulate the circuit.
    #generateOperations() {
        const operations = {};
        for (const [batchType, batchComponents] of pairs(this.#ports.batchTypes)) {
            if (!this.#functors[batchType]) continue; // skip e.g. consts batch type entirely
            for (const component of keys(batchComponents)) {
                const ports = this.#ports.byBatchComponent[component];

                // generate code to compute output values from inputs
                for (const port of values(ports).filter((p) => p.ioType === 'o')) {
                    if (!this.#functors[port.batchType]) continue; // skip e.g. consts ports
                    const functor = this.#functors[port.batchType];

                    // value
                    const operationId2 = `${port.batchType}:${port.batchName}:${port.elementIndex2}`;
                    if (!operations[operationId2]) {
                        const dest = { type: 'signal', index: port.elementIndex2 };
                        operations[operationId2] = this.#backend.compileLogic(dest, functor.outputs[port.batchName], ports, `compute ${port.batchName} for ${port.batchType}`);
                    }

                    // signal
                    if (port.isTriState) {
                        const operationId3 = `${port.batchType}:${port.batchName}:${port.elementIndex3}`;
                        if (!operations[operationId3]) {
                            const expressionStr = functor.signals?.[port.batchName];
                            if (expressionStr) {
                                 const dest = { type: 'signal', index: port.elementIndex3 };
                                operations[operationId3] = this.#backend.compileLogic(dest, expressionStr, ports, `compute signal ${port.batchName} for ${port.batchType}`);
                            } else {
                                // always driven if signal expression is empty string but isTriState is true
                                const dest = { type: 'signal', index: port.elementIndex3, constant: true };
                                operations[operationId3] = this.#backend.compileLogic(dest, '~0', ports, `compute signal ${port.batchName} for ${port.batchType}`);
                            }
                        }
                    }
                }
                // generate code to copy previous port states where required (when edge detection is needed)
                for (const port of values(ports).filter((p) => p.ioType === 'i' && p.elementIndexP !== null)) {
                    const operationId = `${port.batchType}:${port.batchName}:${port.elementIndexP}`;
                    if (!operations[operationId]) {
                        const dest = { type: 'backup', index: port.elementIndexP, srcIndex: port.elementIndex2 };
                        operations[operationId] = this.#backend.compileLogic(dest, '', ports, 'backup previous state for edge detection');
                    }
                }
            }
        }
        this.#layout.operations = operations;
    }

    // Computes memory layout for all ports and nets and operations to perform per tick.
    #generateMemoryLayout() {
        let globalElementIndex = this.#assignPortLocations();
        globalElementIndex = this.#assignClockLocations(globalElementIndex);
        globalElementIndex = this.#assignNetLocations(globalElementIndex);
        // DEBUGGING: remove this
        let known = new Set();
        for (const p of this.#ports.all) {
            const name = `${p.elementIndex2}-${p.bitIndex}`;
            assert(!known.has(name), `Duplicate port ${name} in memory layout`);
            known.add(name);
        }
        for (const p of this.#nets.all) {
            const name = `${p.elementIndex2}-${p.bitIndex}`;
            assert(!known.has(name), `Duplicate net ${name} in memory layout`);
            known.add(name);
        }
        // ----
        this.#layout.netToInputBitmap = this.#generateNetToInputBitmap();
        this.#layout.outputToNetBitmap = this.#generateOutputToNetBitmap();
        this.#layout.pullMasks = this.#generatePullResistorMasks();
        return globalElementIndex;
    }

    // Group bitmaps by destination element index
    #groupBitmapsByDest(bitmaps, key = 'destElementIndex2') {
        const grouped = {};
        for (const bitmap of bitmaps) {
            const groupKey = bitmap[key];
            grouped[groupKey] ??= [];
            grouped[groupKey].push(bitmap);
        }
        return grouped;
    }

    // Compiles code for a single simulation tick.
    #compileTick() {

        // step 1: generate code to compute output values from inputs
        for (const operation of values(this.#layout.operations)) {
            this.#backend.emitLogic(operation);
        }

        // step 1.5: update clocks
        for (const clock of this.#clocks) {
            const enablePort = this.#ports.byName[clock.enablePortName];
            const outputPort = this.#ports.byName[clock.outputPortName];
            this.#backend.emitClock(clock, enablePort, outputPort);
        }

        // step2: set inputs from nets
        const inputGrouped = this.#groupBitmapsByDest(this.#layout.netToInputBitmap);
        for (const [destElementIndex, group] of pairs(inputGrouped)) {
            this.#backend.emitAssignment(destElementIndex, group, 'net to input');
        }

        // step3: set nets from outputs
        const outputBitmaps = this.#layout.outputToNetBitmap;
        // value
        const valueGrouped = this.#groupBitmapsByDest(outputBitmaps, 'destElementIndex2');
        for (const [destElementIndex, group] of pairs(valueGrouped)) {
            this.#backend.emitOutputToNet(destElementIndex, group, 'value', 'output to net value');
        }
        // signal
        const signalGrouped = this.#groupBitmapsByDest(outputBitmaps, 'destElementIndex3');
        for (const [destElementIndex, group] of pairs(signalGrouped)) {
            if (destElementIndex === 'null') continue;
            this.#backend.emitOutputToNet(destElementIndex, group, 'signal', 'output to net signal');
        }

        // step 4: apply pull resistors
        this.#backend.emitPullResistors(this.#layout.pullMasks);
    }

    // Compiles and sets the internal simulation tick function.
    #compileTicks() {
        this.#compileTick();
        this.#compiledTicks = this.#backend.compile(this.#mem);
    }

    // Compiles and sets the internal simulation tick function.
    #compileStep() {
        this.#compileTick();
        const iterator = this.#backend.compileStep(this.#mem);
        this.#compiledStep = { generator: null, iterator };
    }
}