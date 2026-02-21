"use strict";

// Opens a modal dialog with the given fields and returns the user input to the awaiting caller.
function dialog(title, fields, data, extraOptions) {
    const { context, extraClass, cancelable, onChange } = Object.assign({ context: null, extraClass: null, cancelable: true, onChange: () => null }, extraOptions);
    assert.string(title),
    assert.string(extraClass, true),
    assert.array(fields);
    assert.object(data);
    assert.bool(cancelable);
    assert.function(onChange, true);

    // predefine some validations
    const validations = {
        int: { check: (v, f) => Number.isInteger(Number.parseSI(v)), apply: (v, f) => Number.parseSI(v, true) },
        float: { check: (v, f) => Number.isFinite(Number.parseSI(v)), apply: (v, f) => Number.parseSI(v) },
        string: { check: (v, f) => String.isString(v), apply: (v, f) => v },
        select: { check: (v, f) => Object.keys(f.options).includes(v), apply: (v, f) => v },
    };

    // build html form
    const blackout = html(null, 'div', 'dialog-blackout');
    const containerElement = html(blackout, 'div', 'dialog-container' + (extraClass ? ' ' + extraClass : ''));
    html(containerElement, 'div', 'dialog-title', title);
    const contentElement = html(containerElement, 'div', 'dialog-content');
    const tableElement = html(contentElement, 'table');
    const form = [];

    // validate form input
    const validate = () => {
        const result = {};
        const errors = [];
        for (const { element, field } of values(form)) {
            const check = field.check ?? validations[field.type].check;
            if (check.call(context, element.value, field)) {
                const apply = field.apply ?? validations[field.type].apply;
                result[field.name] = apply.call(context, element.value, field);
            } else {
                errors.push(field.name);
            }
        }
        return [ errors.length === 0 ? result : null, errors ];
    };

    const triggerOnChange = (e) => {
        const result = validate();
        if (result[0]) {
            onChange(blackout, result[0]);
        }
    };

    for (const field of values(fields)) {
        if (field.text) {
            const rowElement = html(tableElement, 'tr', 'dialog-row');
            html(rowElement, 'td', 'dialog-row-label', field.text);
        } else {
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
            const rowElement = html(tableElement, 'tr', 'dialog-row');
            html(rowElement, 'td', 'dialog-row-label', field.label ?? field.name.toUpperFirst());
            const rowRight = html(rowElement, 'td', 'dialog-row-mask');
            let fieldElement
            if (field.type === 'select') {
                fieldElement = html(rowRight, 'select', 'dialog-row-select', { name: field.name, options: field.options, value: data[field.name] });
                fieldElement.onchange = triggerOnChange;
            } else {
                fieldElement = html(rowRight, 'input', 'dialog-row-input', { name: field.name, value: data[field.name] });
                fieldElement.onkeyup = triggerOnChange;
                fieldElement.onchange = triggerOnChange;
            }
            form.push({ element: fieldElement, field });
        }
    }

    const rowElement = html(contentElement, 'div', 'dialog-button-row', );
    const cancelElement = cancelable ? html(rowElement, 'span', 'dialog-button dialog-cancel', 'Cancel') : null;
    const confirmElement = html(rowElement, 'span', 'dialog-button dialog-confirm', 'Ok');
    document.body.appendChild(blackout);
    triggerOnChange();

    if (form.length > 0) {
        form[0].element.focus();
        if (form[0].element.select) {
            form[0].element.select();
        }
    }

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
        if (cancelable) {
            cancelElement.onclick = cancel;
        }
        containerElement.onclick = (e) => e.stopPropagation();
        blackout.onclick = cancel;
    })
}

// Opens a modal confirmation dialog with a custom message. Returns true on ok, false on cancel.
function confirmDialog(title, message) {
    assert.string(title);
    assert.string(message);
    return dialog(title, [ { text: message } ], { }, { extraClass: 'confirm-dialog' }).then((v) => !!v, (v) => false);
}

// Opens a modal info dialog with a custom message and an ok button only. Returns true.
function infoDialog(title, message) {
    assert.string(title);
    assert.string(message);
    return dialog(title, [ { text: message } ], { }, { extraClass: 'info-dialog', cancelable: false }).then((v) => !!v, (v) => false);
}

// Opens a modal confirmation dialog used to confirm discarding unsaved changes.
function unsavedDialog(extraMessage) {
    assert.string(extraMessage);
    return confirmDialog('Unsaved changes', `Your project has unsaved changes. ${extraMessage.replace(/(Ok|Cancel)/g, '<b>$1</b>')}`);
}