# Silicon Tracer

This is a logic circuit simulator intended to eventually be useful for designing circuits with discrete logic components (e.g. 74 series chips) for hobby projects. It compiles circuits to fully branchless code operating on a typed array. The simulation includes gate delays and can already run simple circuits at Mhz frequencies.
It is planned to have an EDA software export with the ability to automatically group individual gates to appropriate and ideally minimal 74x-chip-equivalents during export.

It is usable offline (open index.html in a browser) or [online](https://sinesc.github.io/silicon-tracer/).

## Project status

Very early days. Successfully simulates but UI not yet practically useful and simulation limited to single cpu core and capped to 25M ticks/s. Cheesy neon colors non-optional.

## Screenshot

![Early UI showing a 4 bit adder](https://sinesc.github.io/silicon-tracer/doc/neon.png)

This example shows a 4 bit adder. It simulates at around 19M ticks/second on an AMD Ryzen 7 7800X3D.

## Simulation internals

The engine generates branchless javascript code that performs logic operations on a typed array. The array contains the state of the ciruit's nets as well as gate inputs and outputs. State is represented by two bits of a byte, one to indicate whether there is a signal at all (tri-state components) and one bit for the actual signal value. Each simulation tick the bits are shifted down and only propagate through the gate once they are in their respective least significant position. This simulates gate delay.

The code below was generated for the 2 NAND gate **RS flip-flop** in the `basics.stc` example file.

```js
// alloc mem[10]
let mask, signal, result;
mem[2] >>= 1; // tick q:2d43a1:0
mem[5] >>= 1; // tick q:5d4c93:0
mem[0] = ((mem[0] >> 1) & 0b11011101) | (mem[6] << 1); // tick and set a:2d43a1:0 from net 0
mem[3] = ((mem[3] >> 1) & 0b11011101) | (mem[7] << 1); // tick and set a:5d4c93:0 from net 1
mem[1] = ((mem[1] >> 1) & 0b11011101) | (mem[8] << 1); // tick and set b:2d43a1:0 from net 2
mem[4] = ((mem[4] >> 1) & 0b11011101) | (mem[9] << 1); // tick and set b:5d4c93:0 from net 3
result = (0b00010000) | (!(1 & (mem[0] & mem[1]))); mem[2] = (mem[2] & 0b11011101) | (result << 1); // compute !(1 & (a:2d43a1:0 & b:2d43a1:0))
result = (0b00010000) | (!(1 & (mem[3] & mem[4]))); mem[5] = (mem[5] & 0b11011101) | (result << 1); // compute !(1 & (a:5d4c93:0 & b:5d4c93:0))
signal = (mem[5] & 0b00100000) >> 5; mask = signal | (signal << 4); mem[6] = (mem[5] & mask); // reset net 0 from q:5d4c93:0
signal = (mem[2] & 0b00100000) >> 5; mask = signal | (signal << 4); mem[9] = (mem[2] & mask); // reset net 3 from q:2d43a1:0
// port #reset @ mem[7]
// port #set @ mem[8]
// port q @ mem[9]
```

