

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

}, 100);

let test = new Component(10, 10);