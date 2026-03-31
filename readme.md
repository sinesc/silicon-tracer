# Silicon Tracer

This is a logic circuit simulator for designing circuits with discrete logic components (e.g. 74 series chips) for retro/hobby projects. It comes with a LogiSim import and is planned to have an EDA software export with the ability to automatically group individual gates to appropriate and ideally minimal 74x-chip-equivalents during export. To achieve good performance it compiles circuits to fully branchless code using only bit-operations.

It is fully usable **offline** (download the repository and open index.html in a browser) or [online](https://sinesc.github.io/silicon-tracer/). Regardless of which option is used circuits are always local, no cloud storage.

## Project status: Getting there.

### Currently implemented
- **Debugger**: Highlight conflict, break on conflict, break on custom expression, single step.
- **Component libraries**: Support for both user created and pre-packages libraries (currently includes one open source library for 74x discrete logic chips).
- **Network colors**: Networks can be assigned one of 10 colors to apply to all wires/ports in the net.
- **LogiSim import**: See details below.
- **Subcomponents**: Use circuits as components within circuits.
- **Transparent ports/tunnels/wires/splitters**: These translate to nothing but nets in the simulation engine. E.g. no directionality on ports.
- Basic **single channel gates** with configurable number of inputs.
- **Misc standard components** like full adders, muxes, latches, ...
- **Tri-state** components, e.g. buffer, inverter, ...
- **Text elements**: Support different font sizes, rotation and color.
- Load/save via **local file picker**. Requires Chrome/Edge/Opera, not yet supported in Firefox.
- Context specific **hotkey controlled UI** with currently available hotkeys always shown in the bottom right corner of the screen. For ease of use Hotkeys are clustered around WASD.
- Component selection, drag&drop, rotation (including selections), deletion, editing.
- Wire trimming (ALT + mouse drag to select wire segments to trim).
- Basic simulation statistics like gate and network counts, longest signal path.

### Todo
- Standard gate/component symbols, currently everything is boxes
- RAM/ROM component
- More 74x components
- Configurable toolbar
- EDA export, gate refactoring
- Simulation subcomponent overview (e.g. tree view)
- Undo/redo system
- Navigation history (i.e. forward/back)

### Known issues
- Gates feeding back into themselves (e.g. in and RS flip-flop) can trigger oscillations.

## Screenshot

![Nonsense circuit](https://sinesc.github.io/silicon-tracer/res/doc/neon.png)

Nonsense circuit showing a few custom components, splitters, tunnels and gates.

## Logisim import

Currently the import supports custom components as well as most items from the "Wiring", "Gates" and "TTL" categories and generates wrappers/adapters/wires to account for differing component sizes. Due to LogiSim's high number of component appearance options that affect pin positions not all component sizes will be properly placed at this point. Notably, the super large and ridiculously large gate sizes may currently require some manual fixes.

## Performance

"Should be decent". The current implementation simulates about 8 billion gate-timesteps/second on a single core of an AMD Ryzen 7 7800X3D. This should be sufficient to simulate simple circuits at low MHz frequencies. A planned WASM backend might improve performance further.
