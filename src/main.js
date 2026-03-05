"use strict";

const app = Application.create(document.querySelector('#content'), document.querySelector('#toolbar'));

// confirm when leaving page with unsaved changes
window.addEventListener("beforeunload", (event) => {
    if (app.haveChanges) {
        event.preventDefault();
        event.returnValue = true;
    }
});

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

    const bin = window.bin = function(value) {
        let result = '';
        for (let i = 31; i >= 0; --i) {
            result += (value & (1 << i)) !== 0 ? '1' : '.';
            if ((i % 8) === 0) {
                result += ' ';
            }
        }
        result += '(' + value + ')';
        return result;
    };

    const binAll = window.binAll = function(val) {
        let result = '';
        for (let i = 0; i < val.length; ++i) {
            result += i.toString().padStart(4, ' ') + ': ' + bin(val[i]) + "\n";
        }
        console.log(result);
    };

    window.mem = () => console.log(binAll(sim.mem));
    window.layout = () => {
        const sim = app.simulations.current.engine;
        console.log('probes', sim.probes);
        console.log('ports', sim.ports);
        console.log('nets', sim.nets);
        console.log('net->input', sim.layout.netToInputBitmap);
        console.log('output->net', sim.layout.outputToNetBitmap);
        console.log('operations', sim.layout.operations);
    };
    Object.defineProperty(window, 'cfg', { get: () => app.config });
    Object.defineProperty(window, 'sim', { get: () => app.simulations.current.engine });
    

    document.addEventListener('keydown', (e) => {
        if (e.key === 'F10') {
            app.config.debugSingleStep = !app.config.debugSingleStep;
            console.log('DEBUG: app.config.debugSingleStep ' + (app.config.debugSingleStep ? 'enabled.' : 'disabled.'));
            e.preventDefault();
        }
    });

    console.log(`DEBUG mode enabled.
Hotkeys:
    F10     enable instruction single stepping
References:
    app              application
    cfg              configuration
    sim              simulation
Tools:
    mem()            output simulation memory
    layout()         output simulation layout
    bin(val)         output val as binary
    binAll(iterable) output iterable as binary`);
};

{
    // a blast from a past where we still owned our stuff
    const logo = document.querySelector('#header h1');
    logo.onmouseenter = () => app.setStatus('Cheesy 80s logo. It is ticklish.');
    logo.onmouseleave = () => app.clearStatus();
    logo.onclick = () => logo.setAttribute('data-c', ((parseInt(logo.getAttribute('data-c') ?? 0) + 1) % 6));
}