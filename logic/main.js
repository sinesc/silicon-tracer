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

toolbar.createActionButton('Simulate', 'Simulate circuit', () => console.log(' IW AS pressed')); // Temporary simulation trigger

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


/*
// test flipflop

let c = new Simulation();

c.gateDecl('nor', [ 'a1', 'b1' ], 'q1');
c.gateDecl('nor', [ 'a2', 'b2' ], 'q2');

let set = c.netDecl([ 'a1' ]);
let reset = c.netDecl([ 'a2' ]);
let out1 = c.netDecl([ 'q1', 'b2' ]);
let out2 = c.netDecl([ 'q2', 'b1' ]);

c.compile();

// ui stuff

document.querySelector('#atrue').addEventListener('click', () => c.setNet(set, 1));
document.querySelector('#afalse').addEventListener('click', () => c.setNet(set, 0));
document.querySelector('#btrue').addEventListener('click', () => c.setNet(reset, 1));
document.querySelector('#bfalse').addEventListener('click', () => c.setNet(reset, 0));

setInterval(function() {
    for (let i = 0; i < 100; ++i) {
        c.simulate();
    }
    document.querySelector('#data').innerHTML = 'set: ' + c.getNet(set) + '<br>reset: ' + c.getNet(reset) + '<br>out1: ' + c.getNet(out1) + '<br>out2: ' + c.getNet(out2);
}, 50);
*/
