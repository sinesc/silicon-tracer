
// test flipflop

let c = new Compilable();

c.gateDecl('nor', [ 'a1', 'b1' ], 'q1');
c.gateDecl('nor', [ 'a2', 'b2' ], 'q2');

let set = c.netDecl([ 'a1' ]);
let reset = c.netDecl([ 'a2' ]);
let out1 = c.netDecl([ 'q1', 'b2' ]);
let out2 = c.netDecl([ 'q2', 'b1' ]);

c.compile();

let mem = new Uint8Array(20);

// ui stuff

document.querySelector('#atrue').addEventListener('click', () => c.setNet(mem, set, 1));
document.querySelector('#afalse').addEventListener('click', () => c.setNet(mem, set, 0));
document.querySelector('#btrue').addEventListener('click', () => c.setNet(mem, reset, 1));
document.querySelector('#bfalse').addEventListener('click', () => c.setNet(mem, reset, 0));

setInterval(function() {
    c.simulate(mem);
    c.simulate(mem);
    c.simulate(mem);
    document.querySelector('#data').innerHTML = 'set: ' + c.getNet(mem, set) + '<br>reset: ' + c.getNet(mem, reset) + '<br>out1: ' + c.getNet(mem, out1) + '<br>out2: ' + c.getNet(mem, out2);
}, 50);







let circuit1 = new Circuit('Gate', { left: [ "a", "b" ], right: [ "q" ], top: [ "xuper", "y" ], bottom: [ "g" ] });
let circuit2 = new Circuit('Bait', { left: [ "a bit long" ], right: [ "quite long", "really very long", "short" ], top: [ "x" ], bottom: [ "great", "h", "i", "j" ] });
let circuit3 = new Circuit('Bleeep', { left: [ "a", "b", "c", "d", "e" ], right: [ "q", "r", "s" ] });
let circuit4 = new Circuit('Blubb', { top: [ "a", "be long", "c", "duh", "e" ], bottom: [ "q", "r", "s" ] });
let circuit5 = new Circuit('Gate', { left: [ "a", null, "b" ], right: [ null, "q", null ] });

let grid2 = new Grid(document.querySelector('#grid'));
circuit1.createComponent(grid2, 250, 50);
circuit2.createComponent(grid2, 500, 100);
circuit3.createComponent(grid2, 330, 200);
circuit4.createComponent(grid2, 500, 450);
circuit5.createComponent(grid2, 800, 500);

