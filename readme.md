# Silicon Tracer

This is a logic circuit simulator intended to eventually be useful for designing circuits with discrete logic components (e.g. 74 series chips) for hobby projects. It is planned to have an EDA software export with the ability to automatically group individual gates to appropriate and ideally minimal 74x-chip-equivalents during export. To achieve good performance it compiles circuits to fully branchless code using only bit-operations.

It is usable offline (open index.html in a browser) or [online](https://sinesc.github.io/silicon-tracer/).

## Project status: Getting there.

### Currently implemented
- Basic **LogiSim import** (see details below).
- **Subcomponents**. Use circuits as components within circuits.
- **Transparent wires and ports** (i.e. wires and ports have no properties like directionality or channel counts - they just form a net)
- **Automatic transparent splitter component**, splits/joins an arbitrary number of wires with arbitrary numbers of channels each, see screenshot below.
- **Tunnels** connect components of a net without the need to route wires.
- **Network colors**. Networks can be assigned one of 10 colors.
- **Conflict detection**. Conflicted networks can be highlighted.
- Basic **single channel gates** with configurable number of inputs.
- **Tri-state** components, e.g. buffer, inverter.
- **Misc standard components** like full adders, muxes, latches, ...
- **Text elements**
- Load/save via local file picker. Requires Chrome/Edge/Opera, not yet supported in Firefox.
- Context specific hotkey controlled UI with currently available hotkeys always shown in the bottom right corner of the screen. For ease of use Hotkeys are clustered around WASD.
- Component selection, drag&drop, rotation (including selections), deletion, editing.
- Basic simulation statistics like gate and network counts, longest signal path.

### Todo
- Debugger (break on conflict, break on net condition, single step)
- Component libraries (e.g. 74x discrete logic chips)
- Configurable toolbar
- EDA export
- Simulation subcomponent overview (e.g. tree view)
- Undo/redo system
- Navigation history (i.e. forward/back)

### Known issues
- Gates feeding back into themselves (e.g. in and RS flip-flop) can trigger oscillations.

## Screenshot

![Nonsense circuit](https://sinesc.github.io/silicon-tracer/doc/neon.png)

Nonsense circuit showing a few custom components, splitters, tunnels and gates.

## Logisim import

Currently the import supports custom components as well as most items from the "Wiring" and "Gates" categories and generates wrappers/adapters/wires to account for differing component sizes. Due to LogiSim's high number of component appearance options that affect pin positions not all component sizes will be properly placed at this point. Notably, the super large and ridiculously large gate sizes may currently require some manual fixes.

## Performance

"Should be decent". Currently simulates about 900M to 1B gate-timesteps/second on a single core of an AMD Ryzen 7 7800X3D.
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

