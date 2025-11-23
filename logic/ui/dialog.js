"use strict";

function dialog(title, fields, data) {

    const blackout = element(null, 'div', 'dialog-blackout');
    const containerElement = element(blackout, 'div', 'dialog-container');

    const titleElement = element(containerElement, 'div', 'dialog-title', title);
    const contentElement = element(containerElement, 'div', 'dialog-content');

    const tableElement = element(contentElement, 'table');

    for (const field of values(fields)) {
        const rowElement = element(tableElement, 'tr', 'dialog-row');
        const rowLabel = element(rowElement, 'td', 'dialog-row-label', field.label ?? field.name.toUpperFirst());
        const rowRight = element(rowElement, 'td', 'dialog-row-mask');

        let rowField
        if (field.type === 'select') {
            rowField = element(rowRight, 'select', 'dialog-row-select', { name: field.name, options: field.options, value: data[field.name] });
        } else {
            rowField = element(rowRight, 'input', 'dialog-row-input', { name: field.name, value: data[field.name] });
        }
    }

    const rowElement = element(contentElement, 'div', 'dialog-button-row', );
    const cancelElement = element(rowElement, 'span', 'dialog-button dialog-cancel', 'Cancel');
    const confirmElement = element(rowElement, 'span', 'dialog-button dialog-confirm', 'Ok');

    document.body.appendChild(blackout);
}