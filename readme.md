# Silicon Tracer

This is a logic circuit simulator intended to eventually be useful for designing circuits with discrete logic components (e.g. 74 series chips) for hobby projects. It is planned to have an EDA software export with the ability to automatically group individual gates to appropriate and ideally minimal 74x-chip-equivalents during export. To achieve good performance it compiles circuits to fully branchless code using only bit-operations.

It is fully usable offline (download the repository and open index.html in a browser) or [online](https://sinesc.github.io/silicon-tracer/).

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
- Load/save via **local file picker**. Requires Chrome/Edge/Opera, not yet supported in Firefox.
- **Component libraries** (e.g. 74x discrete logic chips)
- Context specific **hotkey controlled UI** with currently available hotkeys always shown in the bottom right corner of the screen. For ease of use Hotkeys are clustered around WASD.
- Component selection, drag&drop, rotation (including selections), deletion, editing.
- Basic simulation statistics like gate and network counts, longest signal path.

### Todo
- RAM/ROM component
- Debugger (break on conflict, break on net condition, single step)
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

"Should be decent". The current implementation simulates about 900M to 1B gate-timesteps/second on a single core of an AMD Ryzen 7 7800X3D. However, it is currently being rewritten to simulate up to 64 gates in parallel and compute
an optimized memory layout that minimizes bit operations and memory writes. This should hopefully push the performance well beyond 1B gate-timesteps/second.
