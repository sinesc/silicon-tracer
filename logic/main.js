
/*
let and = (a, b) => a && b;
let or = (a, b) => (a || b);
let not = (a) => !a;
let nand = (a, b) => !(a && b);
let nor = (a, b) => !(a || b);

let init = () => Math.random() > 0.5 ? true : false;

let d = {};

document.querySelector('#atrue').addEventListener('click', () => d.a = true);
document.querySelector('#afalse').addEventListener('click', () => d.a = false);
document.querySelector('#btrue').addEventListener('click', () => d.b = true);
document.querySelector('#bfalse').addEventListener('click', () => d.b = false);

d.a = init();
d.b = init();
d.x1 = init();

setInterval(function() {
    d.x1 = nor(d.a, d.x2);
    d.x2 = nor(d.b, d.x1);
    document.querySelector('#data').innerHTML = 'a: ' + d.a + '<br>b: ' + d.b + '<br>x1: ' + d.x1 + '<br>x2: ' + d.x2;
}, 500);
*/

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

