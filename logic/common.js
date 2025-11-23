"use strict";

Object.defineProperty(Object.prototype, "map", {
    value: function(c) {
        let result = Object.create(this);
        for (let [ k, v ] of Object.entries(this)) {
            result[k] = c(k, v);
        }
        return result;
    }
});

Object.defineProperty(Array.prototype, "swapRemove", {
    value: function(i) {
        if (i < this.length - 1) {
            this[i] = this.pop();
        } else {
            this.pop();
        }
    }
});

String.isString = function(s) {
    return typeof s === 'string';
}

Function.isFunction = function(f) {
    return typeof f === 'function';
}

Object.defineProperty(String.prototype, "toUpperFirst", {
    value: function() {
        return this.length > 0 ? this.charAt(0).toUpperCase() + this.slice(1) : '';
    }
});

// format number with metric units
Number.formatSI = function(number) {
    const SI_PREFIXES_CENTER_INDEX = 8;
    const siPrefixes = [ 'y', 'z', 'a', 'f', 'p', 'n', 'μ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y' ];
    if (number === 0) {
        return number.toString();
    }
    const EXP_STEP_SIZE = 3;
    const base = Math.floor(Math.log10(Math.abs(number)));
    const siBase = (base < 0 ? Math.ceil : Math.floor)(base / EXP_STEP_SIZE);
    const prefix = siPrefixes[siBase + SI_PREFIXES_CENTER_INDEX];
    if (siBase === 0) {
        return number.toString();
    }
    const baseNumber = parseFloat((number / Math.pow(10, siBase * EXP_STEP_SIZE)).toFixed(2));
    return `${baseNumber}${prefix}`;
};

// Normalizes javascript iteration mess. Yields [ key, value ].
function *pairs(iterable) {
    if (Array.isArray(iterable)) {
        for (const [ k, v ] of iterable.entries()) {
            yield [ k, v ];
        }
    } else if (iterable instanceof Map) {
        for (const [ k, v ] of iterable) {
            yield [ k, v ];
        }
    } else if (iterable instanceof Set) {
        let i = 0;
        for (const v of iterable) {
            yield [ i++, v ];
        }
    } else if (typeof iterable === 'object') {
        for (const [ k, v ] of Object.entries(iterable)) {
            yield [ k, v ];
        }
    } else {
        throw new Error('Unsupported iterable');
    }
}

// Normalizes javascript iteration mess. Yields keys yielded by pair.
function *keys(iterable) {
    for (const [ k , v ] of pairs(iterable)) {
        yield k;
    }
}

// Normalizes javascript iteration mess. Yields values yielded by pair.
function *values(iterable) {
    for (const [ k , v ] of pairs(iterable)) {
        yield v;
    }
}

function assert(condition, message = null) {
    if (!condition) {
        throw new Error(message ?? 'Assertion failed');
    }
}

// Provide non-stupid typeof
assert.ty = function(val) {
    if (val === null) {
        return 'null';
    } else if (typeof val === 'number') {
        if (!Number.isFinite(val)) {
            return '' + val;
        } else {
            return 'number';
        }
    } else if (Array.isArray(val)) {
        return 'array';
    } else {
        return typeof val;
    }
}

assert.string = function(val, allow_null = false, message = null) {
    let ty = assert.ty(val);
    if (ty !== 'string' && !(allow_null && ty === 'null')) {
        throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected string, got ' + ty);
    }
}

assert.bool = function(val, allow_null = false, message = null) {
    let ty = assert.ty(val);
    if (ty !== 'boolean' && !(allow_null && ty === 'null')) {
        throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected boolean, got ' + ty);
    }
}

assert.number = function(val, allow_null = false, message = null) {
    let ty = assert.ty(val);
    if (ty !== 'number' && !(allow_null && ty === 'null')) {
        throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected number, got ' + ty);
    }
}

assert.array = function(val, allow_null = false, itemTester = null, message = null) {
    let ty = assert.ty(val);
    if (ty !== 'array' && !(allow_null && ty === 'null')) {
        throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected array, got ' + ty);
    }
    if (typeof itemTester === 'function') {
        for (const item of val) {
            itemTester(item);
        }
    }
}

assert.object = function(val, allow_null = false, message = null) {
    let ty = assert.ty(val);
    if (ty !== 'object' && !(allow_null && ty === 'null')) {
        throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected object, got ' + ty);
    }
}

assert.function = function(val, allow_null = false, message = null) {
    let ty = assert.ty(val);
    if (ty !== 'function' && !(allow_null && ty === 'null')) {
        throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected function, got ' + ty);
    }
}

assert.class = function(constructor, val, allow_null = false, message = null) {
    if (!(val instanceof constructor) && !(allow_null && val === null)) {
        let ty = assert.ty(val);
        ty = ty === 'object' ? 'instance of ' + val.constructor.name : ty;
        throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected instance of ' + constructor.name + ', got ' + ty);
    }
}

// Creates an HTML element.
function element(parent = null, type = 'div', classNames = null, contents = null) {
    assert.class(Node, parent, true);
    assert.string(type);
    assert.string(classNames, true);
    const element = document.createElement(type);
    if (classNames) {
        element.classList.add(...classNames.split(' '));
    }
    if (contents) {
        if (type === 'div' || type === 'span' || type === 'th' || type === 'td') {
            assert.string(contents);
            element.innerHTML = contents;
        } else if (type === 'input') {
            assert.object(contents);
            element.type = 'text';
            element.name = contents.name;
            element.value = contents.value;
        } else if (type === 'select') {
            assert.object(contents);
            element.name = contents.name;
            for (const [ k, v ] of pairs(contents.options)) {
                const option = document.createElement("option");
                option.value = k;
                option.text = v;
                option.selected = k === contents;
                element.appendChild(option);
            }
        }
    }
    if (parent) {
        parent.appendChild(element);
    }
    return element;
}


class Point {
    x;
    y;
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    // Returns whether the point lies on the given horizontal/vertical line // TODO generalize using colinearity/distance
    onLine(line) {
        let p = this;
        let [ w1, w2 ] = line;
        if (w1.x === w2.x && w1.x === p.x) {
            if (w1.y > w2.y) {
                [ w2, w1 ] = [ w1, w2 ];
            }
            return w1.y <= p.y && w2.y >= p.y;
        } else if (w1.y === w2.y && w1.y === p.y) {
            if (w1.x > w2.x) {
                [ w2, w1 ] = [ w1, w2 ];
            }
            return w1.x <= p.x && w2.x >= p.x;
        } else {
            return false;
        }
    }
    // Returns a comparable representation of the object as comparing points directly always results in false due to JS sucking
    get c() {
        return this.x + ':' + this.y;
    }
}

class WeakUnorderedSet {
    #items;
    constructor(array = []) {
        this.#items = array.map((i) => new WeakRef(i));
    }
    clear() {
        this.#items = [];
    }
    add(item) {
        this.#items.push(new WeakRef(item));
    }
    forEach(fn) {
        for (let i = 0; i < this.#items.length; ++i) {
            let item = this.#items[i].deref();
            if (item) {
                fn(item)
            } else {
                // remove from array by replacing with last entry. afterwards next iteration has to repeat this index.
                if (i < this.#items.length - 1) {
                    this.#items[i] = this.#items.pop();
                    --i;
                } else {
                    this.#items.pop()
                }
            }
        }
    }
}

class File {
    static OPTIONS = {
        types: [
            {
                description: "Silicon Tracer circuit",
                accept: {
                    "text/plain": [ ".stc" ],
                },
            },
        ],
        startIn: 'documents',
        id: 'circuits',
    };

    static async verifyPermission(fileHandle) {
        const opts = { mode: "readwrite" };
        if ((await fileHandle.queryPermission(opts)) === "granted") {
            return true;
        }
        if ((await fileHandle.requestPermission(opts)) === "granted") {
            return true;
        }
        return false;
    }

    static async saveAs(suggestedName) {
        let name = File.makeName(suggestedName);
        return await window.showSaveFilePicker({
            ...File.OPTIONS,
            suggestedName: name,
        });
    }

    static async openFile(existingHandle) {
        let options = existingHandle ? { ...File.OPTIONS, startIn: existingHandle } : File.OPTIONS;
        return await window.showOpenFilePicker(options);
    }

    static makeName(name) {
        return (name || 'unnamed').replace(/\.stc$/, '').replace(/[^a-zA-Z0-9\-\_]/g, '-').replace(/^-+/, '') + '.stc';
    }
}