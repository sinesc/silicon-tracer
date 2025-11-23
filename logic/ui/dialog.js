"use strict";

// Opens a modal dialog with the given fields and returns the user input to the awaiting caller.
function dialog(title, fields, data) {
    assert.string(title),
    assert.array(fields);
    assert.object(data);

    const blackout = element(null, 'div', 'dialog-blackout');
    const containerElement = element(blackout, 'div', 'dialog-container');
    element(containerElement, 'div', 'dialog-title', title);
    const contentElement = element(containerElement, 'div', 'dialog-content');
    const tableElement = element(contentElement, 'table');
    const formElements = [];

    for (const field of values(fields)) {
        const rowElement = element(tableElement, 'tr', 'dialog-row');
        element(rowElement, 'td', 'dialog-row-label', field.label ?? field.name.toUpperFirst());
        const rowRight = element(rowElement, 'td', 'dialog-row-mask');
        let rowField
        if (field.type === 'select') {
            rowField = element(rowRight, 'select', 'dialog-row-select', { name: field.name, options: field.options, value: data[field.name] });
        } else {
            rowField = element(rowRight, 'input', 'dialog-row-input', { name: field.name, value: data[field.name] });
        }
        formElements.push(rowField);
    }

    const rowElement = element(contentElement, 'div', 'dialog-button-row', );
    const cancelElement = element(rowElement, 'span', 'dialog-button dialog-cancel', 'Cancel');
    const confirmElement = element(rowElement, 'span', 'dialog-button dialog-confirm', 'Ok');
    document.body.appendChild(blackout);
    formElements[0].focus();

    return new Promise((resolve, reject) => {
        const confirm = () => {
            blackout.remove();
            const result = {};
            for (const element of values(formElements)) {
                result[element.name] = element.value;
            }
            resolve(result);
        };
        const cancel = () => {
            blackout.remove();
            resolve(null);
        };
        for (const element of values(formElements)) {
            if (element.nodeName === 'INPUT') {
                element.onkeydown = (e) => {
                    e.stopPropagation();
                    if (e.keyCode === 13) {
                        confirm();
                    } else if (e.keyCode === 27) {
                        cancel();
                    }
                };
            }
        }
        confirmElement.onclick = confirm;
        cancelElement.onclick = cancel;
    })
}