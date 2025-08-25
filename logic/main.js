"use strict";

// Create grid and toolbar
let mainGrid = new Grid(document.querySelector('#content'));
let toolbar = new Toolbar(mainGrid, document.querySelector('#toolbar'));
let circuits = new Circuits(mainGrid);

// Add file operations to toolbar
let [ fileMenu, fileMenuState ] = toolbar.createMenuButton('File', 'File operations menu. <i>LMB</i> Open menu.');

fileMenu.createActionButton('New', 'Close all open circuits', async () => {
    fileMenuState(false);
    circuits.clear();
    updateCircuitMenu();
});
fileMenu.createActionButton('Open...', 'Load circuit from disk', async () => {
    fileMenuState(false);
    let [ fileHandle ] = await window.showOpenFilePicker();
    const file = await fileHandle.getFile();
    const content = JSON.parse(await file.text());
    circuits.unserialize(content, true, file.name);
    updateCircuitMenu();
});
fileMenu.createActionButton('Save as...', 'Save circuit to disk', async () => {
    fileMenuState(false);
    const options = {
        types: [
            {
                description: "Silicon Tracer circuit",
                accept: {
                    "text/plain": [ ".stc" ],
                },
            },
        ],
    };
    const handle = await window.showSaveFilePicker(options);
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(circuits.serialize()));
    await writable.close();
});

// Circuit selection menu

let [ circuitMenu, circuitMenuState ] = toolbar.createMenuButton('Circuit', 'Circuit management menu. <i>LMB</i> Open menu.');

function updateCircuitMenu() {
    circuitMenu.clear();
    circuitMenu.createActionButton('Create...', 'Create a new circuit.', () => {
        circuitMenuState(false);
        circuits.create();
        updateCircuitMenu();
    });
    for (let [ index, label ] of circuits.list().entries()) {
        circuitMenu.createActionButton(label, 'Switch grid to circuit "' + label + '"', () => {
            circuitMenuState(false);
            circuits.select(index);
        });
    }
}

updateCircuitMenu();

// Add standard components to toolbar
toolbar.createComponentButton('Port ·', 'Component IO pin. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => new Port(grid, x, y, 'right'));
toolbar.createComponentButton('· Port', 'Component IO pin. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => new Port(grid, x, y, 'left'));

for (let [ gateType, { joinOp } ] of Object.entries(Simulation.GATE_MAP)) {
    let gateLabel = gateType.toUpperFirst();
    toolbar.createComponentButton(gateLabel, '<b>' + gateLabel + '</b> gate. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => {
        let numInputs = 2; // TODO: configurable somewhere
        return new Gate(grid, x, y, gateType, joinOp !== null ? numInputs : 1);
    });
}

// Continuous simulation toggle
{
    let autoCompile = toolbar.createToggleButton('Simulate', 'Toggle enable or disable continuous simulation', true, (enabled) => {
        mainGrid.detachSimulation();
        if (!enabled) {
            mainGrid.sim = null;
            mainGrid.render();
        }
    });

    setInterval(() => {
        if (autoCompile()) {
            if (!mainGrid.sim) {
                mainGrid.sim = mainGrid.compileSimulation(mainGrid);
            }
            for (let i = 0; i < 10; ++i) {  // TODO: bleh temp code, look into webworkers
                mainGrid.sim.simulate();
            }
            mainGrid.render();
        }
    }, 18);

    toolbar.createActionButton('Dump ASM', 'Outputs simulation code to console', () => {
        if (mainGrid.sim) {
            let portInfo = [];
            for (let { offset, meta } of mainGrid.sim.nets) {
                for (let port of meta) {
                    portInfo.push('// port ' + port + ' mem[' + offset + ']');
                }
            }
            console.log(mainGrid.sim.code() + portInfo.join("\n"));
        } else {
            console.log('No simulation running');
        }
    });
}

// Show warning when not focussed to avoid confusion. In this state mouse wheel events still register but hotkeys don't.
{
    let hadFocus = null;
    let focusTimer = null;
    setInterval(() => {
        let hasFocus = document.hasFocus();
        if (hasFocus !== hadFocus) {
            // remove display: none first
            document.body.classList.add('focus-changing');
            // then change focus class
            setTimeout(hasFocus ? () => document.body.classList.remove('no-focus') : () => document.body.classList.add('no-focus'), 1);
            hadFocus = hasFocus;
            // later add general display none again, but overriden by focus state
            clearTimeout(focusTimer);
            focusTimer = setTimeout(() => document.body.classList.remove('focus-changing'), 750);
        }
    }, 100);
}

// A blast from when we still owned our stuff.
{
    let logo = document.querySelector('#header h1');
    logo.onmouseenter = () => mainGrid.setMessage('Cheesy 80s logo. It is ticklish.');
    logo.onmouseleave = () => mainGrid.clearMessage();
    logo.onclick = () => logo.setAttribute('data-c', ((parseInt(logo.getAttribute('data-c') ?? 0) + 1) % 6));
}