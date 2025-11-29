"use strict";

// Opens a modal dialog with the given fields and returns the user input to the awaiting caller.
function dialog(title, fields, data) {
    assert.string(title),
    assert.array(fields);
    assert.object(data);

    // predefine some validations
    const validations = {
        int: { check: (v, f) => isFinite(Number.parseSI(v, true)), apply: (v, f) => Number.parseSI(v, true) },
        float: { check: (v, f) => isFinite(Number.parseSI(v)), apply: (v, f) => Number.parseSI(v) },
        string: { check: (v, f) => String.isString(v), apply: (v, f) => v },
        select: { check: (v, f) => Object.keys(f.options).includes(v), apply: (v, f) => v },
    };

    // build html form
    const blackout = element(null, 'div', 'dialog-blackout');
    const containerElement = element(blackout, 'div', 'dialog-container');
    element(containerElement, 'div', 'dialog-title', title);
    const contentElement = element(containerElement, 'div', 'dialog-content');
    const tableElement = element(contentElement, 'table');
    const form = [];

    for (const field of values(fields)) {
        // check field definition
        assert.string(field.name);
        assert.string(field.type);
        if (!Object.hasOwn(data, field.name)) {
            throw new Error(`Field "${field.name}" does not exist in the input data`);
        }
        if (!Object.hasOwn(validations, field.type)) {
            if (!Object.hasOwn(data, field.check)) {
                throw new Error(`Field "${field.name}" uses an unknown validation and does not define its own check function`);
            }
            if (!Object.hasOwn(data, field.apply)) {
                throw new Error(`Field "${field.name}" uses an unknown validation and does not define its own apply function`);
            }
        }
        // construct field html, add field to form
        const rowElement = element(tableElement, 'tr', 'dialog-row');
        element(rowElement, 'td', 'dialog-row-label', field.label ?? field.name.toUpperFirst());
        const rowRight = element(rowElement, 'td', 'dialog-row-mask');
        let fieldElement
        if (field.type === 'select') {
            fieldElement = element(rowRight, 'select', 'dialog-row-select', { name: field.name, options: field.options, value: data[field.name] });
        } else {
            fieldElement = element(rowRight, 'input', 'dialog-row-input', { name: field.name, value: data[field.name] });
        }
        form.push({ element: fieldElement, field });
    }

    const rowElement = element(contentElement, 'div', 'dialog-button-row', );
    const cancelElement = element(rowElement, 'span', 'dialog-button dialog-cancel', 'Cancel');
    const confirmElement = element(rowElement, 'span', 'dialog-button dialog-confirm', 'Ok');
    document.body.appendChild(blackout);
    form[0].element.focus();
    if (form[0].element.select) {
        form[0].element.select();
    }

    // validate form input
    const validate = () => {
        const result = {};
        const errors = [];
        for (const { element, field } of values(form)) {
            const check = field.check ?? validations[field.type].check;
            if (check(element.value, field)) {
                const apply = field.apply ?? validations[field.type].apply;
                result[field.name] = apply(element.value, field);
            } else {
                errors.push(field.name);
            }
        }
        return [ errors.length === 0 ? result : null, errors ];
    };

    // return a promise that resolves on ok/cancel
    return new Promise((resolve, reject) => {
        const confirm = () => {
            const [ result, errors ] = validate();
            if (result) {
                blackout.remove();
                resolve(result);
            } else {
                for (const { element, field } of values(form)) {
                    element.classList.toggle('dialog-error', errors.includes(field.name));
                }
            }
        };
        const cancel = () => {
            blackout.remove();
            resolve(null);
        };
        // handle enter/escape for text inputs
        for (const { element, field } of values(form)) {
            if (field.type !== 'select') {
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
        containerElement.onclick = (e) => e.stopPropagation();
        blackout.onclick = cancel;
    })
}