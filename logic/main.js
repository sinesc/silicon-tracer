// Create grid and toolbar
let mainGrid = new Grid(document.querySelector('#grid'));
let toolbar = new Toolbar(document.querySelector('#toolbar'));

toolbar.createButton('Pin ·', 'Component IO pin. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => Prefabs.createPinRight(grid, x, y, 'Pin'));
toolbar.createButton('· Pin', 'Component IO pin. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => Prefabs.createPinLeft(grid, x, y, 'Pin'));

for (let [ gateType, { joinOp } ] of Object.entries(Simulation.GATE_MAP)) {
    let gateLabel = gateType.charAt(0).toUpperCase() + gateType.slice(1);
    toolbar.createButton(gateLabel, '<b>' + gateLabel + '</b> gate. <i>LMB</i>: Drag to move onto grid.', (grid, x, y) => {
        let numInputs = 2; // TODO: configurable somewhere
        return Prefabs.createGate(grid, x, y, gateType, joinOp !== null ? numInputs : 1);
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

function pointOnLine(p, wire) {
    let [ w1, w2 ] = wire;
    if (w1.x === w2.x && w1.x === p.x) {
        if (w1.y > w2.y) {
            [ w2, w1 ] = [ w1, w2 ];
        }
        return w1.y <= p.y && w2.y >= p.y;
    } else if (w1.y === w2.y && w1.y === p.y) {
        if (w1.x > w2.x) {
            [ w2, w1 ] = [ w1, w2 ];
        }
        return w1.x <= p.x && w2.x >= p.x;
    } else {
        return false;
    }
}

function endsIntersect(a, b) {
    return pointOnLine(a[0], b) || pointOnLine(a[1], b) || pointOnLine(b[0], a) || pointOnLine(b[1], a);
}

function identifyNets() {
    // get all individual wires
    let connections = mainGrid.getItems((i) => i instanceof Connection);
    let wires = [];
    for (let connection of connections) {
        let points = connection.getPoints();
        wires.push([ points[0], points[1], connection ]);
        if (points.length === 3) {
            wires.push([ points[1], points[2], connection ]);
        }
    }
    //console.log(wires.map((w) => JSON.stringify(w.slice(0, 2))));

    // create nets
    let nets = [];
    while (wires.length > 0) {
        let prevFoundWires = [ wires.pop() ];
        let newNet = [];
        let foundWires;
        // each iteration, check only the wires found in the previous iteration for more intersections
        do {
            foundWires = [];
            for (let p = 0; p < prevFoundWires.length; ++p) {
                for (let w = wires.length - 1; w >= 0; --w) {
                    if (endsIntersect(prevFoundWires[p], wires[w])) {
                        foundWires.push(wires[w]);
                        wires.swapRemove(w);
                    }
                }
            }
            newNet.push(...prevFoundWires);
            prevFoundWires = foundWires;
        } while (foundWires.length > 0);
        nets.push(newNet);
    }

    // colorize nets
    let color = 1;
    for (let net of nets) {
        for (let wire of net) {
            wire[2].color = color;
            wire[2].render();
        }
        ++color;
    }
}


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

/*
let circuit1 = new Circuit('Gate', { left: [ "a", "b" ], right: [ "q" ], top: [ "xuper", "y" ], bottom: [ "g" ] });
circuit1.createComponent(mainGrid, 250, 50);

let circuit2 = new Circuit('Bait', { left: [ "a bit long" ], right: [ "quite long", "really very long", "short" ], top: [ "x" ], bottom: [ "great", "h", "i", "j" ] });
circuit2.createComponent(mainGrid, 500, 100);

let circuit3 = new Circuit('Bleeep', { left: [ "a", "b", "c", "d", "e" ], right: [ "q", "r", "s" ] });
circuit3.createComponent(mainGrid, 330, 200);

let circuit4 = new Circuit('Blubb', { top: [ "a", "be long", "c", "duh", "e" ], bottom: [ "q", "r", "s" ] });
circuit4.createComponent(mainGrid, 500, 450);

let circuit5 = new Circuit('Gate', { left: [ "a", null, "b" ], right: [ null, "q", null ] });
circuit5.createComponent(mainGrid, 800, 500);
*/

