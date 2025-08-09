
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


let grid2 = new Grid(document.querySelector('#grid'));

let component1 = new Component(grid2, 'Gate', 50, 50, { left: [ "a", "b" ], right: [ "q" ], top: [ "x", "y" ], bottom: [ "g" ] });
let component2 = new Component(grid2, 'Bait', 100, 100, { left: [ "a" ], right: [ "q", "r", "s" ], top: [ "x" ], bottom: [ "g", "h", "i", "j" ] });
let component3 = new Component(grid2, 'Bleeep', 30, 200, { left: [ "a", "b", "c", "d", "e" ], right: [ "q", "r", "s" ] });
let component4 = new Component(grid2, 'Blubb', 200, 450, { top: [ "a", "b", "c", "d", "e" ], bottom: [ "q", "r", "s" ] });
let component5 = new Component(grid2, 'Gate', 500, 500, { left: [ "a", null, "b" ], right: [ null, "q", null ] });


let connection1 = new Connection(grid2, 300, 300, 600, 600);
let connection2 = new Connection(grid2, 200, 200, 200, 600);
let connection3 = new Connection(grid2, 700, 400, 900, 400);