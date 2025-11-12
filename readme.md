# Silicon Tracer

This is a logic circuit simulator intended to eventually be useful for designing circuits with discrete logic components (e.g. 74 series chips)
for hobby projects. It compiles circuits to fully branchless code operating on a typed array. The simulation includes gate delays and should
hopefully be able to run at up to MHz frequencies.
It is planned to have an EDA software export with the ability to automatically group individual gates to appropriate and ideally minimal
74x-chip-equivalents during export.

It is usable offline (open index.html in a browser) or [online](https://sinesc.github.io/silicon-tracer/).

## Project status

Very early days. Successfully simulates but UI not yet practically useful and simulation speed tied to frame rate. Cheesy neon colors non-optional.

## Screenshot

![Early UI showing an edge triggered d-flipflop](https://sinesc.github.io/silicon-tracer/doc/neon.png)

 This example shows a 4 bit RAM circuit.

## Simulation internals

The engine generates branchless javascript code that performs logic operations on a typed array. The array contains the state of the ciruit's nets as well as gate inputs and outputs. State is represented by two bits of a byte, one to indicate whether there is a signal at all (tri-state components) and one bit for the actual signal value. Each simulation tick the bits are shifted down and only propagate through the gate once they are in their respective least significant position. This simulates gate delay.

The code below was generated for an AND-gate connected to two inputs and one output. It is not yet optimized and the lines commented with 'tick' and 'reset' will eventually be optimized into the respective first input/output operation for the connected net.

```js
// alloc mem[6]
// temporary result, signal, mask
mem[0] >>= 1; // tick a:c2202f:0
mem[1] >>= 1; // tick b:c2202f:0
mem[2] >>= 1; // tick q:c2202f:0
mem[0] = (mem[0] & 0b11011101) | (mem[4] << 1); // set port a:c2202f:0 from net 1
mem[1] = (mem[1] & 0b11011101) | (mem[5] << 1); // set port b:c2202f:0 from net 2
result = (0b00010000) | (mem[0] & mem[1]); mem[2] = (mem[2] & 0b11011101) | (result << 1); // compute a:c2202f:0 & b:c2202f:0
mem[3] = 0; // reset net 0
signal = (mem[2] & 0b00100000) >> 5; mask = ~(signal | (signal << 4)); mem[3] = (mem[3] & mask) | (mem[2] & ~mask); // set net 0 from port q:c2202f:0
// port Q @ mem[3]
// port A @ mem[4]
// port B @ mem[5]
```

