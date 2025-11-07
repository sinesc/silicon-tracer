"use strict";

let app = new Application(document.querySelector('#content'), document.querySelector('#toolbar'));
app.initMenu();
app.initToolbar();
app.startFocusMonitor();
app.startLogoMonitor(document.querySelector('#header h1'));

// temporary stuff

app.toolbar.createActionButton('Dump ASM', 'Outputs simulation code to console.', () => {
    if (app.sim) {
        let portInfo = [];
        for (let { offset, meta } of app.sim.engine.nets) {
            for (let port of meta) {
                portInfo.push('// port ' + port + ' mem[' + offset + ']');
            }
        }
        console.log(app.sim.engine.code() + portInfo.join("\n"));
    } else {
        console.log('No simulation running');
    }
});