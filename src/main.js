"use strict";

const app = Application.create(document.querySelector('#content'), document.querySelector('#toolbar'));

// confirm when leaving page with unsaved changes
window.addEventListener("beforeunload", (event) => {
    if (app.haveChanges) {
        event.preventDefault();
        event.returnValue = true;
    }
});

// load built-in libraries
{
    for (let content of loadFiles) {
        const fileLid = app.circuits.addLibrary(content.label, null, true);
        app.circuits.unserialize(content, fileLid);
    }
}

// add 'Open example' button on github demo
if (location.hostname === 'sinesc.github.io' && location.pathname === '/silicon-tracer/') {
    const loadExample = app.toolbar.createActionButton('Open example', 'Loads an example circuit.', async () => {
        const response = await fetch('https://sinesc.github.io/silicon-tracer/res/examples/basics.stc');
        const content = await response.json();
        const uid = app.circuits.unserialize(content);
        app.circuits.select(uid);
        app.simulations.select(app.circuits.current, app.config.autoCompile);
        loadExample.node.classList.add('toolbar-menu-button-disabled', 'example-button-fade');
        setTimeout(() => loadExample.node.remove(), 1500);
    });
    loadExample.node.classList.add('example-button');
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

    window.renameAll = function(search, replace) {
        for (const circuit of values(app.circuits.all)) {
            circuit.label = circuit.label.replace(search, replace);
        }
    };

    window.currentIssue = function(backend = 'js') {
        app.config.singleStep = true;
        //app.config.backend = backend; // TODO not yet working
        //app.simulation.current.markDirty();
        const sim = app.simulations.current.engine;
        sim.setConstValue(0, 1); // ON port
        sim.setClockFrequency(0, 0, 5); // 5 ticks per cycle

    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'F10') {
            if (e.shiftKey) {
                app.simulation.current.markDirty();
            } else {
                app.config.debugSingleStep = !app.config.debugSingleStep;
                console.log('DEBUG: app.config.debugSingleStep ' + (app.config.debugSingleStep ? 'enabled.' : 'disabled.'));
            }
            e.preventDefault();
        }
    });

    console.log(`DEBUG mode enabled.
Hotkeys:
    F10             enable instruction single stepping
    SHIFT+F10       recompile simulation
References:
    app             application
    cfg             configuration
    sim             simulation
Tools:
    mem()           output simulation memory
    layout()        output simulation layout
    bin(val)        output val as binary
    binAll(iter)    output iterable as binary
    renameAll(s,r)  rename all circuits using regex/replace`);
};

{
    // a blast from a past where we still owned our stuff
    const logo = document.querySelector('#header h1');
    logo.onmouseenter = () => app.setStatus('Cheesy 80s logo. It is ticklish.');
    logo.onmouseleave = () => app.clearStatus();
    logo.onclick = () => logo.setAttribute('data-c', ((parseInt(logo.getAttribute('data-c') ?? 0) + 1) % 6));
}