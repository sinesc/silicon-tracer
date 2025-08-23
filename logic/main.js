"use strict";

// Create grid and toolbar
let mainGrid = new Grid(document.querySelector('#content'));
let toolbar = new Toolbar(mainGrid, document.querySelector('#toolbar'));

// Add file operations to toolbar
let [ fileMenu, fileMenuState ] = toolbar.createMenuButton('File', 'File menu. <i>LMB</i> Open menu.');

fileMenu.createActionButton('New', 'Clear circuit', async () => {
    fileMenuState(false);
    mainGrid.clear();
    mainGrid.render();
});
fileMenu.createActionButton('Open...', 'Load circuit from disk', async () => {
    fileMenuState(false);
    let [fileHandle] = await window.showOpenFilePicker();
    const file = await fileHandle.getFile();
    const content = await file.text();
    mainGrid.unserialize(JSON.parse(content));
    mainGrid.render();
});
fileMenu.createActionButton('Save as...', 'Save circuit to disk', async () => {
    fileMenuState(false);
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

// Simulation handling // TODO: where to put this better?
function compileSimulation(grid) {

    let [ netList, componentMap ] = grid.identifyNets();
    let sim = new Simulation();

    // declare gates from component map
    for (let [ prefix, component ] of componentMap.entries()) {
        if (component instanceof Gate) {
            sim.gateDecl(component.type, component.inputs.map((i) => prefix + i), prefix + component.output);
        }
    }

    // declare nets
    let setPorts = [];
    for (let net of netList.nets) {
        // create new net from connected gate i/o-ports
        let netPortList = net.ports.filter((p) => p[2] instanceof Port); // port-component, NOT a port on a component
        let netId = sim.netDecl(net.ports.filter((p) => p[2] instanceof Gate).map((p) => p[1]), netPortList.map((p) => p[1]));
        // link port-components on the net to the ui
        for (let [ , , component ] of netPortList) {
            // store netId on port-component to allow it to fetch the current net state
            component.netId = netId;
            // if the port enforces a state remember it to set after compilation
            if (component.state !== null) {
                setPorts.push([ netId, component.state]);
            }
        }
        // link ports on components
        for (let [ , name, component ] of net.ports) {
            let portName = name.split(':')[1]; // TODO: getting ports by name is slow, should also store some kind of id in net.ports
            let port = component.portByName(portName);
            port.netId = netId;
        }
        // link wires
        for (let [ , , component ] of net.wires) {
            component.netId = netId;
        }
    }

    // compile
    sim.compile();

    // set port states
    for (let [ netId, state ] of setPorts) {
        sim.setNet(netId, state);
    }

    return sim;
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
                mainGrid.sim = compileSimulation(mainGrid);
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