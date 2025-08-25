"use strict";

// Create grid and toolbar
let mainGrid = new Grid(document.querySelector('#content'));
let toolbar = new Toolbar(mainGrid, document.querySelector('#toolbar'));
let circuits = new Circuits(mainGrid);

// Add file operations to toolbar
let [ , fileMenuState, fileMenu ] = toolbar.createMenuButton('File', 'File operations menu. <i>LMB</i> Open menu.');
let fileHandle;

fileMenu.createActionButton('New', 'Close all open circuits', async () => {
    fileHandle = null;
    fileMenuState(false);
    circuits.clear();
    updateCircuitMenu();
    saveButton.innerHTML = 'Save';
    saveButton.classList.add('save-disabled');
});
fileMenu.createActionButton('Open...', 'Load circuit from a file.', async () => {
    fileMenuState(false);
    [ fileHandle ] = await File.openFile();
    const file = await fileHandle.getFile();
    const content = JSON.parse(await file.text());
    circuits.unserialize(content, true, file.name);
    updateCircuitMenu();
    saveButton.innerHTML = 'Save ' + file.name;
    saveButton.classList.remove('save-disabled');
});
let [ saveButton ] = fileMenu.createActionButton('Save', 'Save circuit to file.', async () => {
    fileMenuState(false);
    let writable;
    if (!fileHandle || !File.verifyPermission(fileHandle)) {
        const handle = await File.saveAs();
        writable = await handle.createWritable();
    } else {
        writable = await fileHandle.createWritable();
    }
    await writable.write(JSON.stringify(circuits.serialize()));
    await writable.close();
});
fileMenu.createActionButton('Save as...', 'Save circuit to a new file.', async () => {
    fileMenuState(false);
    const handle = await File.saveAs();
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(circuits.serialize()));
    await writable.close();
});

saveButton.classList.add('save-disabled');

// Circuit selection menu

let [ , circuitMenuState, circuitMenu ] = toolbar.createMenuButton('Circuit', 'Circuit management menu. <i>LMB</i> Open menu.');

function updateCircuitMenu() {
    circuitMenu.clear();
    circuitMenu.createActionButton('Create...', 'Create a new circuit.', () => {
        circuitMenuState(false);
        circuits.create();
        updateCircuitMenu();
    });
    circuitMenu.createSeparator();
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

for (let [ builtinType, ] of Object.entries(Simulation.BUILTIN_MAP)) {
    let builtinLabel = builtinType.toUpperFirst();
    toolbar.createComponentButton(builtinLabel, '<b>' + builtinLabel + '</b> builtin. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => {
        return new Builtin(grid, x, y, builtinType);
    });
}

// Continuous simulation toggle
{
    let [ , autoCompile ] = toolbar.createToggleButton('Simulate', 'Toggle enable or disable continuous simulation', true, (enabled) => {
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