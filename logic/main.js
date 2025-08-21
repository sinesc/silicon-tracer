"use strict";

// Create grid and toolbar
let mainGrid = new Grid(document.querySelector('#grid'));
let toolbar = new Toolbar(document.querySelector('#toolbar'));

// Add file operations to toolbar
toolbar.createActionButton('New', 'Clear circuit', async () => {
    mainGrid.clear();
    mainGrid.render();
});
toolbar.createActionButton('Open...', 'Load circuit from disk', async () => {
    let [fileHandle] = await window.showOpenFilePicker();
    const file = await fileHandle.getFile();
    const content = await file.text();
    mainGrid.unserialize(JSON.parse(content));
    mainGrid.render();
});
toolbar.createActionButton('Save as...', 'Save circuit to disk', async () => {
    const options = {
        types: [
            {
                description: "Silicon Tracer circuit",
                accept: {
                    "text/plain": [".stc"],
                },
            },
        ],
    };
    const handle = await window.showSaveFilePicker(options);
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(mainGrid.serialize()));
    await writable.close();
});


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

// Show warning when not focussed to avoid confusion. In this state mouse wheel events still register but hotkeys don't.
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


// MISC TESTING STUFF

let global = { };

toolbar.createToggleButton('Simulate', 'Toggle on to keep running the simulation', true, (state) => {
    console.log(state);
});

toolbar.createActionButton('Compile', 'Compile circuit', () => {

    mainGrid.detachSimulation();
    let [ netList, componentMap ] = mainGrid.identifyNets();

    global.sim = new Simulation();

    // declare gates from component map
    for (let [ prefix, component ] of componentMap.entries()) {
        if (component instanceof Gate) {
            global.sim.gateDecl(component.type, component.inputs.map((i) => prefix + i), prefix + component.output);
        }
    }

    // declare nets
    let setPorts = [];
    for (let net of netList.nets) {
        let netId = global.sim.netDecl(net.ports.filter((p) => p[2] instanceof Gate).map((p) => p[1]));
        // check for ports on net we need to hook up to the ui
        for (let [ point, name, component ] of net.ports) {
            if (component instanceof Port) {
                // store netId on port to allow it to fetch the current net state
                component.netId = netId;
                // if the port enforces a state remember it to set after compilation
                if (component.state !== null) {
                    setPorts.push([ netId, component.state]);
                }
            }
        }
    }

    // compile
    global.sim.compile();

    // set port states
    for (let [ netId, state ] of setPorts) {
        global.sim.setNet(netId, state);
    }

    mainGrid.render();
});

setInterval(() => {
    if (global.sim && global.sim.ready) {
        for (let i = 0; i < 1000; ++i) {
            global.sim.simulate();
        }
        mainGrid.render();
    }
}, 100);

let logo = document.querySelector('#header h1');
logo.onmouseenter = () => mainGrid.setMessage('Cheesy 80s logo. It is ticklish.');
logo.onmouseleave = () => mainGrid.clearMessage();
logo.onclick = () => logo.setAttribute('data-c', ((parseInt(logo.getAttribute('data-c') ?? 0) + 1) % 5));