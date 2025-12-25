"use strict";

const app = Application.create(document.querySelector('#content'), document.querySelector('#toolbar'));

// add 'Open example' button on github demo
if (location.hostname === 'sinesc.github.io' && location.pathname === '/silicon-tracer/') {
    const [ exampleButton ] = app.toolbar.createActionButton('Open example', 'Loads an example circuit.', async () => {
        const response = await fetch('https://sinesc.github.io/silicon-tracer/doc/basics.stc');
        const content = await response.json();
        const uid = app.circuits.unserialize(content);
        app.circuits.select(uid);
        app.simulations.select(app.circuits.current, app.config.autoCompile);
        exampleButton.classList.add('toolbar-menu-button-disabled', 'example-button-fade');
        setTimeout(() => exampleButton.remove(), 1500);
    });
    exampleButton.classList.add('example-button');
}

// dev/debug stuff
app.debug = () => {

    app.config.debugCompileComments = true;
    app.config.debugShowGid = true;
    app.config.debugShowCoords = true;
    app.config.debugShowWireBox = true;

    app.toolbar.createActionButton('Dump ASM', 'Outputs simulation code to console.', () => {
        const sim = app.simulations.current;
        if (sim) {
            const portInfo = [];
            for (const { offset, meta } of sim.engine.nets) {
                for (const port of meta) {
                    const gid = port.match(/@(g[a-f0-9]+)@/)[1] ?? null;
                    const item = app.circuits.current.itemByGID(gid);
                    if (item) {
                        portInfo.push('// port ' + item.name + ' @ mem[' + offset + ']');
                    }
                }
            }
            console.log(sim.engine.code() + portInfo.join("\n"));
        } else {
            console.log('No simulation running');
        }
    });

    let tick = 0;
    app.toolbar.createActionButton('Tick', 'Ticks the simulation once', () => {
        app.config.singleStep = true;
        app.simulations.current.tick(1);
        console.clear();
        console.log('tick ' + (tick++));
        const mem = app.simulations.current.engine.mem();
        for (const [ k, v ] of Object.entries(mem.io)) {
            const abbrev = k.replace(/@(g[a-f0-9]+)@/g, (m, h) => ':' + h.substr(1, 6) + ':');
            console.log(abbrev + ': ' + bin(v));
        }
        for (const [ k, v ] of Object.entries(mem.net)) {
            console.log(k + ': ' + bin(v));
        }
        for (const [ k, v ] of Object.entries(mem.clock)) {
            console.log(k + ': ' + v);
        }
    });

    window.bin = function(value) {
        let result = '';
        for (const i of [ 5, 4, 1, 0 ]) {
            result += ((value & (1 << i)) > 0 ? '1' : '.');
            if (i === Simulation.ARRAY_BITS / 2) {
                result += ' ';
            }
        }
        return result;
    };

    window.binAll = function(val) {
        for (let i = 0; i < val.length; ++i) {
            console.log('' + i + ': ' + window.bin(val[i]));
        }
    };

};

{
    // a blast from when we still owned our stuff
    const logo = document.querySelector('#header h1');
    logo.onmouseenter = () => app.setStatus('Cheesy 80s logo. It is ticklish.');
    logo.onmouseleave = () => app.clearStatus();
    logo.onclick = () => logo.setAttribute('data-c', ((parseInt(logo.getAttribute('data-c') ?? 0) + 1) % 6));
}