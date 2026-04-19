"use strict";

// Opens a modal hex-editor.
function hexeditor(title, bitsPerValue, data, valuesPerRow = 8) {
    assert.string(title);
    assert.integer(bitsPerValue, false, 1, 32);
    assert.integer(valuesPerRow, false, 1, 16);
    assert.class(Uint8Array, data);

    // build html
    const blackout = html(null, 'div', 'dialog-blackout');
    const containerElement = html(blackout, 'div', 'dialog-container hexeditor-dialog');
    html(containerElement, 'div', 'dialog-title', title);
    const contentElement = html(containerElement, 'div', 'dialog-content');
    const editorElement = html(contentElement, 'div', 'hexeditor-editor');
    const gridElement = html(editorElement, 'div', 'hexeditor-grid');

    const scrollbarElement = document.createElement('input');
    scrollbarElement.type = 'range';
    scrollbarElement.classList.add('hexeditor-scrollbar');
    scrollbarElement.min = 0;
    scrollbarElement.step = 1;
    scrollbarElement.value = 0;
    editorElement.appendChild(scrollbarElement);

    const cloned = data.slice();
    const hexDigits = Math.ceil(bitsPerValue / 4);
    const maxValue = bitsPerValue === 32 ? 0xFFFFFFFF : (1 << bitsPerValue) - 1;
    const totalValues = (cloned.length * 8) / bitsPerValue;
    const totalRows = Math.ceil(totalValues / valuesPerRow);
    const addrDigits = Math.max(4, totalValues > 1 ? Math.ceil(Math.log2(totalValues) / 4) : 1);
    let topRow = 0;
    let visibleRows = 1;
    let inputRows = []; // inputRows[r][c] = <input>
    let addrElements = [];
    let confirm, cancel; // defined later in Promise, referenced via closure in delegated key handler

    // Read bitsPerValue bits starting at bit offset index*bitsPerValue from cloned (LSB-first within each byte)
    const getValue = (index) => {
        const bitOffset = index * bitsPerValue;
        let value = 0;
        for (let b = 0; b < bitsPerValue; b++) {
            const byteIdx = Math.floor((bitOffset + b) / 8);
            const bitIdx = (bitOffset + b) % 8;
            if ((cloned[byteIdx] >> bitIdx) & 1) {
                value |= (1 << b);
            }
        }
        return value >>> 0;
    };

    // Write bitsPerValue bits starting at bit offset index*bitsPerValue into cloned
    const setValue = (index, value) => {
        const bitOffset = index * bitsPerValue;
        for (let b = 0; b < bitsPerValue; b++) {
            const byteIdx = Math.floor((bitOffset + b) / 8);
            const bitIdx = (bitOffset + b) % 8;
            if ((value >>> b) & 1) {
                cloned[byteIdx] |= (1 << bitIdx);
            } else {
                cloned[byteIdx] &= ~(1 << bitIdx);
            }
        }
    };

    const formatValue = (v) => (v >>> 0).toString(16).padStart(hexDigits, '0');

    const isValidInput = (s) => {
        if (!/^[0-9a-fA-F]+$/.test(s) || s.length > hexDigits) return false;
        return parseInt(s, 16) <= maxValue;
    };

    const focusInput = (r, c) => {
        if (r >= 0 && r < visibleRows && c >= 0 && c < valuesPerRow) {
            const input = inputRows[r][c];
            if (!input.disabled) {
                input.focus();
                input.select();
            }
        }
    };

    const refreshGrid = () => {
        scrollbarElement.max = Math.max(0, totalRows - visibleRows);
        scrollbarElement.value = topRow;
        for (let r = 0; r < visibleRows; r++) {
            const rowStart = (topRow + r) * valuesPerRow;
            addrElements[r].textContent = rowStart.toString(16).padStart(addrDigits, '0');
            for (let c = 0; c < valuesPerRow; c++) {
                const idx = rowStart + c;
                const input = inputRows[r][c];
                if (idx < totalValues) {
                    input.value = formatValue(getValue(idx));
                    input.disabled = false;
                    input.classList.remove('hexeditor-unused', 'dialog-error');
                } else {
                    input.value = '';
                    input.disabled = true;
                    input.classList.add('hexeditor-unused');
                    input.classList.remove('dialog-error');
                }
            }
        }
    };

    const scrollTo = (newTop) => {
        topRow = Math.max(0, Math.min(newTop, Math.max(0, totalRows - visibleRows)));
        refreshGrid();
    };

    const buildGrid = () => {
        gridElement.innerHTML = '';
        addrElements = [];
        inputRows = [];
        for (let r = 0; r < visibleRows; r++) {
            const rowEl = html(gridElement, 'div', 'hexeditor-row');
            const addrEl = html(rowEl, 'span', 'hexeditor-addr');
            addrElements.push(addrEl);
            const cols = [];
            for (let c = 0; c < valuesPerRow; c++) {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'hexeditor-cell';
                input.spellcheck = false;
                input.autocomplete = 'off';
                input.style.width = `calc(${hexDigits}ch + 1.2em)`;
                input.dataset.r = r;
                input.dataset.c = c;
                rowEl.appendChild(input);
                cols.push(input);
            }
            inputRows.push(cols);
        }
        refreshGrid();
    };

    const computeVisibleRows = () => {
        const inputHeight = 32;
        return Math.max(1, Math.min(totalRows, Math.floor(window.innerHeight * 0.6 / inputHeight)));
    };

    const handleResize = () => {
        const newRows = computeVisibleRows();
        if (newRows !== visibleRows) {
            visibleRows = newRows;
            topRow = Math.min(topRow, Math.max(0, totalRows - visibleRows));
            buildGrid();
        }
    };

    const handleWheel = (e) => {
        e.preventDefault();
        scrollTo(topRow + (e.deltaY > 0 ? 1 : -1));
    };

    const handleInput = (e) => {
        const cell = e.target.closest('.hexeditor-cell');
        if (!cell) return;
        const r = parseInt(cell.dataset.r);
        const c = parseInt(cell.dataset.c);
        const idx = (topRow + r) * valuesPerRow + c;
        if (idx >= totalValues) return;
        if (isValidInput(cell.value)) {
            setValue(idx, parseInt(cell.value, 16));
            cell.classList.remove('dialog-error');
        } else {
            cell.classList.add('dialog-error');
        }
    };

    const handleNavigate = (e) => {
        const cell = e.target.closest('.hexeditor-cell');
        if (!cell) return;
        e.stopPropagation();
        if (e.key === 'Enter') { confirm?.(); return; }
        if (e.key === 'Escape') { cancel?.(); return; }
        const r2 = parseInt(cell.dataset.r);
        const c2 = parseInt(cell.dataset.c);
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                // prev field, wrapping to prev row / scrolling up
                if (c2 > 0) {
                    focusInput(r2, c2 - 1);
                } else if (r2 > 0) {
                    focusInput(r2 - 1, valuesPerRow - 1);
                } else if (topRow > 0) {
                    scrollTo(topRow - 1);
                    focusInput(0, valuesPerRow - 1);
                }
            } else {
                // next field, wrapping to next row / scrolling down
                const nextC = c2 + 1;
                const nextIdx = (topRow + r2) * valuesPerRow + nextC;
                if (nextC < valuesPerRow && nextIdx < totalValues) {
                    focusInput(r2, nextC);
                } else if ((topRow + r2 + 1) * valuesPerRow < totalValues) {
                    if (r2 + 1 < visibleRows) {
                        focusInput(r2 + 1, 0);
                    } else {
                        scrollTo(topRow + 1);
                        focusInput(visibleRows - 1, 0);
                    }
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (r2 > 0) {
                focusInput(r2 - 1, c2);
            } else if (topRow > 0) {
                scrollTo(topRow - 1);
                focusInput(0, c2);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextRowValueIdx = (topRow + r2 + 1) * valuesPerRow + c2;
            if (nextRowValueIdx < totalValues) {
                if (r2 + 1 < visibleRows) {
                    focusInput(r2 + 1, c2);
                } else {
                    scrollTo(topRow + 1);
                    focusInput(visibleRows - 1, c2);
                }
            }
        } else if (e.key === 'ArrowLeft') {
            if (e.target.selectionStart === 0 && e.target.selectionEnd === 0) {
                e.preventDefault();
                if (c2 > 0) focusInput(r2, c2 - 1);
            }
        } else if (e.key === 'ArrowRight') {
            const len = e.target.value.length;
            if (e.target.selectionStart === len && e.target.selectionEnd === len) {
                e.preventDefault();
                const nextIdx2 = (topRow + r2) * valuesPerRow + c2 + 1;
                if (c2 + 1 < valuesPerRow && nextIdx2 < totalValues) focusInput(r2, c2 + 1);
            }
        }
    };

    const handleBlur = (e) => {
        const cell = e.target.closest('.hexeditor-cell');
        if (!cell || cell.disabled) return;
        if (isValidInput(cell.value)) {
            cell.value = formatValue(parseInt(cell.value, 16));
        }
    };

    const validate = () => {
        let hasErrors = false;
        for (let r = 0; r < visibleRows; r++) {
            for (let c = 0; c < valuesPerRow; c++) {
                const input = inputRows[r][c];
                if (!input.disabled) {
                    const valid = isValidInput(input.value);
                    input.classList.toggle('dialog-error', !valid);
                    if (!valid) hasErrors = true;
                }
            }
        }
        return hasErrors;
    };

    // attach handlers
    gridElement.addEventListener('input', handleInput);
    gridElement.addEventListener('keydown', handleNavigate);
    gridElement.addEventListener('blur', handleBlur, true);
    scrollbarElement.oninput = () => scrollTo(parseInt(scrollbarElement.value));
    window.addEventListener('resize', handleResize);
    editorElement.addEventListener('wheel', handleWheel, { passive: false });

    // initialize the grid
    visibleRows = computeVisibleRows();
    buildGrid();
    if (totalValues > 0) focusInput(0, 0);

    // bottom button row
    const rowElement = html(contentElement, 'div', 'dialog-button-row');
    const cancelElement = html(rowElement, 'span', 'dialog-button dialog-cancel', 'Cancel');
    const confirmElement = html(rowElement, 'span', 'dialog-button dialog-confirm', 'Ok');
    document.body.appendChild(blackout);

    return new Promise((resolve) => {
        confirm = () => {
            if (!validate()) {
                window.removeEventListener('resize', handleResize);
                editorElement.removeEventListener('wheel', handleWheel);
                blackout.remove();
                data.set(cloned);
                resolve(true);
            }
        };
        cancel = () => {
            window.removeEventListener('resize', handleResize);
            editorElement.removeEventListener('wheel', handleWheel);
            blackout.remove();
            resolve(false);
        };
        confirmElement.onclick = confirm;
        cancelElement.onclick = cancel;
        containerElement.onclick = (e) => e.stopPropagation();
        blackout.onclick = cancel;
    });
}
