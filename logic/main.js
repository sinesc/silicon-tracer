// Create grid and toolbar
let mainGrid = new Grid(document.querySelector('#grid'));
let toolbar = new Toolbar(document.querySelector('#toolbar'));

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

toolbar.createActionButton('Simulate', 'Simulate circuit', () => {// Temporary simulation trigger
    let [ netList, componentMap ] = mainGrid.identifyNets();

    let sim = new Simulation();

    // declare gates from component map
    for (let [ prefix, component ] of componentMap.entries()) {
        if (component instanceof Gate) {
            sim.gateDecl(component.type, component.inputs.map((i) => prefix + i), prefix + component.output);
        }
    }

    // declare nets
    for (let net of netList.nets) {
        sim.netDecl(net.ports.map((p) => p[1]));
    }

    console.log(sim);
});

/*
// test flipflop

*/
