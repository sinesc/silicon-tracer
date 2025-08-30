"use strict";

let app = new Application(document.querySelector('#content'), document.querySelector('#toolbar'));
app.initMenu();
app.startFocusMonitor();
app.startLogoMonitor(document.querySelector('#header h1'));


// Add standard components to toolbar
let toolbar = app.toolbar; // temporary
let mainGrid = app.grid;
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

toolbar.createComponentButton('Clock', '<b>Clock</b>. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => {
    return new Clock(grid, x, y);
});

// Continuous simulation toggle
{
    let [ , autoCompile ] = toolbar.createToggleButton('Simulate', 'Toggle enable or disable continuous simulation', true, (enabled) => {
        mainGrid.detachSimulation();
        if (!enabled) {
            app.sim = null;
            mainGrid.render();
        }
    });

    setInterval(() => {
        if (autoCompile()) {
            if (!app.sim) {
                [ app.sim, app.tickListener ] = mainGrid.compileSimulation(mainGrid);
            }
            for (let [ portName, component ] of app.tickListener) {
                component.applyState(portName, app.sim);
            }
            for (let i = 0; i < 10; ++i) {  // TODO: bleh temp code, look into webworkers
                app.sim.simulate();
            }
            mainGrid.render();
        }
    }, 18);

    toolbar.createActionButton('Dump ASM', 'Outputs simulation code to console', () => {
        if (app.sim) {
            let portInfo = [];
            for (let { offset, meta } of app.sim.nets) {
                for (let port of meta) {
                    portInfo.push('// port ' + port + ' mem[' + offset + ']');
                }
            }
            console.log(app.sim.code() + portInfo.join("\n"));
        } else {
            console.log('No simulation running');
        }
    });
}