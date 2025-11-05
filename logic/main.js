"use strict";

let app = new Application(document.querySelector('#content'), document.querySelector('#toolbar'));
app.initMenu();
app.initToolbar();
app.startFocusMonitor();
app.startLogoMonitor(document.querySelector('#header h1'));


app.toolbar.createActionButton('outline', 'blatest', () => {
    let tmp = new CustomComponent(100, 100, 0, app.circuits.current.uid, app.circuits.current.label);
    app.grid.addItem(tmp);
});