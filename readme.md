# Silicon Tracer

This is a logic circuit simulator intended to eventually be useful for designing circuits with discrete logic components (e.g. 74 series chips) for hobby projects. It is planned to have an EDA software export with the ability to automatically group individual gates to appropriate and ideally minimal 74x-chip-equivalents during export. To achieve good performance it compiles circuits to fully branchless code using only bit-operations.

It is usable offline (open index.html in a browser) or [online](https://sinesc.github.io/silicon-tracer/).

## Project status

Early days. UI is starting to become usable but still lacks important capabilities like bundling wires, undo/redo, ask for confirmation before performing irreversible actions, import from e.g. logisim or export to eda software. Simulation performance was already decent but has improved and now successfully simulates about 900M to 1B gate-timesteps/second on a single core of an AMD Ryzen 7 7800X3D.

## Screenshot

![Early UI showing a full adder](https://sinesc.github.io/silicon-tracer/doc/neon.png)

This example shows a full adder implemented with 5 basic logic gates.

## Simulation internals

The engine generates branchless asm.js-like javascript code that performs logic operations on a typed array. The array contains the state of the ciruit's nets as well as gate inputs and outputs. State is represented by two bits of a byte, one to indicate whether there is a signal at all (tri-state components) and one bit for the actual signal value. Each simulation tick the bits are shifted down and only propagate through the gate once they are in their respective least significant position. This simulates gate delay. Additionally, nets set another bit whenever the signal bit is set while already being set. This indicates a bus conflict.

The code below was generated for the 2 NAND gate **RS flip-flop** in the `basics.stc` example file.

```js
// alloc mem[10]
let signal;
mem[2] = ((mem[2] >> 1) & 221) | ((32) | ((((~(mem[6] & mem[8]))) << 1) & 2));
mem[5] = ((mem[5] >> 1) & 221) | ((32) | ((((~(mem[7] & mem[9]))) << 1) & 2));
signal = mem[5] & 16; mem[6] = (mem[5] & (signal | (signal >> 4)));
signal = mem[2] & 16; mem[9] = (mem[2] & (signal | (signal >> 4)));
// port #reset @ mem[7]
// port #set @ mem[8]
// port q @ mem[9]
```

