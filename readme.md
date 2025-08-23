# Silicon Tracer

This is a logic circuit simulator that is intended to be useful for designing circuits with discrete logic components (e.g. 74 series chips) for
hobby projects. It compiles circuits to branchless code and should eventually be able to simulate at MHz frequencies.
It is planned to have an EDA software export and the ability to automatically convert groups of gates to the
appropriate chip-equivalent during export. Ideally it should also translate gate logic to whichever representation results in the fewest logic chips,
e.g. `(a and b) or (c and d)`, which is one 74x08 and one 74x32, to `(a nand b) nand (c nand d)` which is just one 74x00.

It is usable offline (open index.html in a browser) or [online](https://sinesc.github.io/silicon-tracer/).

## Project status

Very early days. Successfully simulates but UI not yet practically useful and simulation tied to 10x frame rate. Cheesy neon colors non-optional.

![Early UI showing an edge triggered d-flipflop](https://sinesc.github.io/silicon-tracer/neon.png)

The pictured flipflop in code. Each gate IO port is represented by 1 byte with the bits encoding the state history (0/1/floating) of the port.
Bits are shifted in on one side and read from the other to simulate gate delay.

```js
// alloc mem[27]
mem[0] >>= 1; // tick c0:a
mem[1] >>= 1; // tick c0:b
mem[2] >>= 1; // tick c0:q
mem[3] >>= 1; // tick c1:a
mem[4] >>= 1; // tick c1:b
mem[5] >>= 1; // tick c1:q
mem[6] >>= 1; // tick c2:a
mem[7] >>= 1; // tick c2:b
mem[8] >>= 1; // tick c2:q
mem[9] >>= 1; // tick c3:a
mem[10] >>= 1; // tick c3:b
mem[11] >>= 1; // tick c3:q
mem[12] >>= 1; // tick c4:a
mem[13] >>= 1; // tick c4:b
mem[14] >>= 1; // tick c4:q
mem[15] >>= 1; // tick c7:a
mem[16] >>= 1; // tick c7:b
mem[17] >>= 1; // tick c7:c
mem[18] >>= 1; // tick c7:q
mem[4] = (mem[4] & 0b11011101) | (mem[19] << 1); // set port c1:b from net 0
mem[0] = (mem[0] & 0b11011101) | (mem[20] << 1); // set port c0:a from net 1
mem[10] = (mem[10] & 0b11011101) | (mem[20] << 1); // set port c3:b from net 1
mem[17] = (mem[17] & 0b11011101) | (mem[20] << 1); // set port c7:c from net 1
mem[9] = (mem[9] & 0b11011101) | (mem[21] << 1); // set port c3:a from net 2
mem[13] = (mem[13] & 0b11011101) | (mem[22] << 1); // set port c4:b from net 3
mem[16] = (mem[16] & 0b11011101) | (mem[23] << 1); // set port c7:b from net 4
mem[3] = (mem[3] & 0b11011101) | (mem[23] << 1); // set port c1:a from net 4
mem[1] = (mem[1] & 0b11011101) | (mem[24] << 1); // set port c0:b from net 5
mem[15] = (mem[15] & 0b11011101) | (mem[24] << 1); // set port c7:a from net 5
mem[6] = (mem[6] & 0b11011101) | (mem[25] << 1); // set port c2:a from net 6
mem[7] = (mem[7] & 0b11011101) | (mem[26] << 1); // set port c2:b from net 7
mem[12] = (mem[12] & 0b11011101) | (mem[26] << 1); // set port c4:a from net 7
result = 0b00010000 | (!(1 & (mem[0] & mem[1]))); mem[2] = (mem[2] & 0b11011101) | (result << 1); // compute !(1 & (c0:a & c0:b))
result = 0b00010000 | (!(1 & (mem[3] & mem[4]))); mem[5] = (mem[5] & 0b11011101) | (result << 1); // compute !(1 & (c1:a & c1:b))
result = 0b00010000 | (!(1 & (mem[6] & mem[7]))); mem[8] = (mem[8] & 0b11011101) | (result << 1); // compute !(1 & (c2:a & c2:b))
result = 0b00010000 | (!(1 & (mem[9] & mem[10]))); mem[11] = (mem[11] & 0b11011101) | (result << 1); // compute !(1 & (c3:a & c3:b))
result = 0b00010000 | (!(1 & (mem[12] & mem[13]))); mem[14] = (mem[14] & 0b11011101) | (result << 1); // compute !(1 & (c4:a & c4:b))
result = 0b00010000 | (!(1 & (mem[15] & mem[16] & mem[17]))); mem[18] = (mem[18] & 0b11011101) | (result << 1); // compute !(1 & (c7:a & c7:b & c7:c))
signal = (mem[2] & (1 << 5)) >> 5; mask = ~(signal | (signal << 4)); mem[19] = (mem[19] & mask) | (mem[2] & ~mask); // set net 0 from port c0:q
signal = (mem[5] & (1 << 5)) >> 5; mask = ~(signal | (signal << 4)); mem[20] = (mem[20] & mask) | (mem[5] & ~mask); // set net 1 from port c1:q
signal = (mem[14] & (1 << 5)) >> 5; mask = ~(signal | (signal << 4)); mem[21] = (mem[21] & mask) | (mem[14] & ~mask); // set net 2 from port c4:q
signal = (mem[11] & (1 << 5)) >> 5; mask = ~(signal | (signal << 4)); mem[22] = (mem[22] & mask) | (mem[11] & ~mask); // set net 3 from port c3:q
signal = (mem[8] & (1 << 5)) >> 5; mask = ~(signal | (signal << 4)); mem[24] = (mem[24] & mask) | (mem[8] & ~mask); // set net 5 from port c2:q
signal = (mem[18] & (1 << 5)) >> 5; mask = ~(signal | (signal << 4)); mem[26] = (mem[26] & mask) | (mem[18] & ~mask); // set net 7 from port c7:q
// port c6: mem[21]
// port c5: mem[22]
// port c9: mem[23]
// port c8: mem[25]
```