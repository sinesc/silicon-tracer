"use strict";

const app = new Application(document.querySelector('#content'), document.querySelector('#toolbar'), document.querySelector('#header h1'));
app.start();

// dev/debug stuff

if (false) {

    app.toolbar.createActionButton('Dump ASM', 'Outputs simulation code to console.', () => {
        if (app.sim) {
            let portInfo = [];
            for (let { offset, meta } of app.sim.engine.nets) {
                for (let port of meta) {
                    let gid = port.match(/@(g[a-f0-9]+)@/)[1] ?? null;
                    let item = app.circuits.current.itemByGID(gid);
                    if (item) {
                        portInfo.push('// port ' + item.name + ' @ mem[' + offset + ']');
                    }
                }
            }
            console.log(app.sim.engine.code() + portInfo.join("\n"));
        } else {
            console.log('No simulation running');
        }
    });

    let tick = 0;
    app.toolbar.createActionButton('Tick', 'Ticks the simulation once', () => {
        app.singleStep = true;
        app.runSimulation(1);
        console.clear();
        console.log('tick ' + (tick++));
        let mem = app.sim.engine.mem();
        for (let [ k, v ] of Object.entries(mem.io)) {
            let abbrev = k.replace(/@(g[a-f0-9]+)@/g, (m, h) => ':' + h.substr(1, 6) + ':');
            console.log(abbrev + ': ' + bin(v));
        }
        for (let [ k, v ] of Object.entries(mem.net)) {
            console.log(k + ': ' + bin(v));
        }
        for (let [ k, v ] of Object.entries(mem.clock)) {
            console.log(k + ': ' + v);
        }
    });

    window.bin = function(value) {
        let result = '';
        for (let i of [ 5, 4, 1, 0 ]) {
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

}
