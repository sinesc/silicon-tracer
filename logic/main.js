"use strict";

let app = new Application(document.querySelector('#content'), document.querySelector('#toolbar'));
app.initMenu();
app.initToolbar();
app.startFocusMonitor();
app.startLogoMonitor(document.querySelector('#header h1'));


app.toolbar.createActionButton('outline', 'blatest', () => {
    let current = app.circuits.currentIndex;
    app.circuits.generateOutline(current);
});