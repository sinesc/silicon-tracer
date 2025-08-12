let c = new Compilable();

c.ioDecl('a1', 'i')
c.ioDecl('b1', 'i');
c.ioDecl('q1', 'o');
c.gateDecl('nand', [ 'a1', 'b1' ], 'q1');

c.ioDecl('a2', 'i')
c.ioDecl('b2', 'i');
c.ioDecl('q2', 'o');
c.gateDecl('nand', [ 'a2', 'b2' ], 'q2');

let set = c.netDecl([ 'a1' ]);
let reset = c.netDecl([ 'a2' ]);
let out1 = c.netDecl([ 'q1', 'b2' ]);
let out2 = c.netDecl([ 'q2', 'b1' ]);

c.compile();

let mem = new Uint8Array(20);

c.setNet(mem, set, 1);
c.setNet(mem, reset, 1);


c.simulate(mem);

console.log(c.getNet(mem, set), c.getNet(mem, reset), c.getNet(mem, out1), c.getNet(mem, out2));