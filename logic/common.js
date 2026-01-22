"use strict";

Object.defineProperty(Object.prototype, "map", {
    value: function(c) {
        assert.function(c);
        const result = Object.create(this);
        for (const [ k, v ] of Object.entries(this)) {
            result[k] = c(k, v, this); // TODO: change argument order to match Array.map()?
        }
        return result;
    }
});

Object.defineProperty(Object.prototype, "filter", {
    value: function(c) {
        assert.function(c);
        const result = Object.create(this);
        for (const [ k, v ] of Object.entries(this)) {
            if (c(k, v, this)) { // TODO: change argument order to match Array.filter()?
                result[k] = v;
            }
        }
        return result;
    }
});

// Removes an element from an array by swapping it with the last array element and popping the array. Returns the removed element.
Object.defineProperty(Array.prototype, "swapRemove", {
    value: function(i) {
        assert.integer(i);
        const item = this[i];
        if (i < this.length - 1) {
            this[i] = this.pop();
        } else {
            this.pop();
        }
        return item;
    }
});

// Removes an element from an array by swapping it with the last array element and popping the array. Returns the removed element or undefined if no element was found.
Object.defineProperty(Array.prototype, "swapRemoveWith", {
    value: function(fn) {
        assert.function(fn);
        const index = this.findIndex(fn);
        if (index > -1) {
            return this.swapRemove(index);
        }
        return undefined;
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

{
    const SI_PREFIXES_CENTER_INDEX = 8;
    const SI_PREFIXES = [ 'y', 'z', 'a', 'f', 'p', 'n', 'μ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y' ];
    const EXP_STEP_SIZE = 3;

    // Formats a number to a string with a metric unit prefix.
    Number.formatSI = function(number, lossless = false, fractionDigits = 2) {
        if (number === 0) {
            return number.toString();
        }
        const base = Math.floor(Math.log10(Math.abs(number)));
        const siBase = (base < 0 ? Math.ceil : Math.floor)(base / EXP_STEP_SIZE);
        const prefix = SI_PREFIXES[siBase + SI_PREFIXES_CENTER_INDEX];
        if (siBase === 0) {
            return number.toString();
        }
        const baseNumber = parseFloat((number / Math.pow(10, siBase * EXP_STEP_SIZE)).toFixed(fractionDigits));
        const result = `${baseNumber}${prefix}`;
        return !lossless || Number.parseSI(result) === number ? result : number.toString();
    };

    // Parses a number with a metric unit prefix to a float.
    Number.parseSI = function(number, asInt = false) {
        number = ''+number;
        const matches = number.match(/^(?<number>(?<sign>[+\-])?(?<integer>[0-9]+)(?:.(?<fraction>[0-9]+))?)(?<prefix>[a-zA-Z])?$/);
        if (matches) {
            const prefixIndex = SI_PREFIXES.indexOf(matches.groups.prefix ?? '');
            if (prefixIndex === -1) {
                return null;
            }
            const prefixMultiplier = Math.pow(10, EXP_STEP_SIZE * (prefixIndex - SI_PREFIXES_CENTER_INDEX));
            const result = parseFloat(matches.groups.number) * prefixMultiplier;
            return isFinite(result) ? (asInt ? Math.round(result) : result) : null;
        } else {
            return null; // should be NaN for consistency with parseFloat/Int if that wasn't just such a horribly bad return value
        }
    }
}

// Returns the fractional part of a number
Math.fract = function(number) {
    return (number - (0 | number));
}

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
    } else if (iterable?.constructor === Object) {
        for (const [ k, v ] of Object.entries(iterable)) {
            yield [ k, v ];
        }
    } else if (iterable?.[Symbol.iterator]) {
        let i = 0;
        for (const v of iterable) {
            yield [ i++, v ];
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

// Normalizes javascript iteration mess. Counts items in an iterable.
function count(iterable) {
    if (Array.isArray(iterable)) {
        return iterable.length;
    } else if (iterable instanceof Map || iterable instanceof Set) {
        return iterable.size; // NO EFFING COMMENT
    } else if (iterable?.constructor === Object) {
        return Object.keys(iterable).length;
    } else if (iterable?.[Symbol.iterator]) {
        let i = 0;
        for (const v of iterable) {
            i++;
        }
        return i;
    } else {
        throw new Error('Unsupported iterable');
    }
}

function assert(condition, message = null) {
    if (!condition) {
        throw new Error(message ?? 'Assertion failed');
    }
}

{
    // A less stupid version of typeof.
    function type(val) {
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

    // Asserts given value is a string.
    assert.string = function(val, allow_null = false, message = null) {
        if (typeof val !== 'string' && !(allow_null && val === null)) {
            const ty = type(val);
            throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected string, got ' + ty);
        }
    }

    // Asserts given value is a bool.
    assert.bool = function(val, allow_null = false, message = null) {
        if (typeof val !== 'boolean' && !(allow_null && val === 'null')) {
            const ty = type(val);
            throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected boolean, got ' + ty);
        }
    }

    // Asserts given value is a finite number.
    assert.number = function(val, allow_null = false, message = null) {
        if (!Number.isFinite(val) && !(allow_null && val === null)) {
            const ty = type(val);
            throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected number, got ' + ty);
        }
    }

    // Asserts given value is an integer number.
    assert.integer = function(val, allow_null = false, message = null) {
        if (!Number.isInteger(val) && !(allow_null && val === null)) {
            const ty = type(val);
            throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected integer, got ' + ty);
        }
    }

    // Asserts given value is an array.
    assert.array = function(val, allow_null = false, itemTester = null, message = null) {
        if (!Array.isArray(val) && !(allow_null && val === null)) {
            const ty = type(val);
            throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected array, got ' + ty);
        }
        if (val !== null && typeof itemTester === 'function') {
            for (const item of val) {
                itemTester(item);
            }
        }
    }

    // Asserts given value is a plain object.
    assert.object = function(val, allow_null = false, objectTester = null, message = null) {
        if (!(allow_null && val === null) && val?.constructor !== Object) {
            let ty = type(val);
            ty = ty === 'object' ? 'instance of ' + val.constructor.name : ty;
            throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected object, got ' + ty);
        }
        if (val !== null && typeof objectTester === 'function') {
            objectTester(val);
        }
    }

    // Asserts given value is a function.
    assert.function = function(val, allow_null = false, message = null) {
        if (typeof val !== 'function' && !(allow_null && val === null)) {
            const ty = type(val);
            throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected function, got ' + ty);
        }
    }

    // Asserts given value is an instance of the given class.
    assert.class = function(constructor, val, allow_null = false, message = null) {
        if (!(val instanceof constructor) && !(allow_null && val === null)) {
            let ty = type(val);
            ty = ty === 'object' ? 'instance of ' + val.constructor.name : ty;
            throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected instance of ' + constructor.name + ', got ' + ty);
        }
    }

    // Asserts given value is one of the allowed values.
    assert.enum = function(allowed, val, allow_null = false, message = null) {
        if (!(allow_null && val === null) && !allowed.includes(val)) {
            throw new Error(message ?? 'Assertion failed: Value is not among the allowed values');
        }
    }

    // Asserts given value is a string or a finite number.
    assert.stringable = function(val, allow_null = false, message = null) {
        if (typeof val !== 'string' && !Number.isFinite(val) && !(allow_null && val === null)) {
            const ty = type(val);
            throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected string or number, got ' + ty);
        }
    }

    // Asserts given value is not a string and iterable using `for .. of pairs()/keys()/values()`.
    assert.iterable = function(val, allow_null = false, message = null) {
        if (typeof val === 'string' || (!allow_null && val === null) || (val !== null && val.constructor !== Object && !val[Symbol.iterator])) {
            const ty = type(val);
            throw new Error(message?.replace('%', ty) ?? 'Assertion failed: Expected iterable, got ' + ty);
        }
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
            assert.object(contents, false, (o) => {
                assert.string(o.name);
                assert.stringable(o.value);
            });
            element.type = 'text';
            element.name = contents.name;
            element.value = contents.value;
        } else if (type === 'select') {
            assert.object(contents, false, (o) => {
                assert.string(o.name);
                assert.stringable(o.value);
                assert.iterable(o.options);
            });
            element.name = contents.name;
            for (const [ k, v ] of pairs(contents.options)) {
                const option = document.createElement("option");
                option.value = k;
                option.text = v;
                option.selected = (''+k) === (''+contents.value);
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
        const p = this;
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
    // Rotate point around center and return as new point.
    rotateAround(center, angle) {
        // move to origin
        const xt = this.x - center.x;
        const yt = this.y - center.y;
        // rotate around oring
        const xr = xt * Math.cos(angle) - yt * Math.sin(angle);
        const yr = xt * Math.sin(angle) - yt * Math.cos(angle);
        // move back to position
        const xcr = xr + center.x;
        const ycr = yr + center.y;
        return new Point(xcr, ycr);
    }
    // Round to integer coordinates and return as new point.
    round() {
        return new Point(Math.round(this.x), Math.round(this.y));
    }
    // Returns a comparable representation of the object as comparing points directly always results in false due to JS sucking
    get c() {
        return this.x + ':' + this.y;
    }
}

function point(x, y) {
    return new Point(x, y);
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
    *[Symbol.iterator]() {
        for (let i = 0; i < this.#items.length; ++i) {
            const item = this.#items[i].deref();
            if (item) {
                yield item;
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
        const name = File.makeName(suggestedName);
        return await window.showSaveFilePicker({
            ...File.OPTIONS,
            suggestedName: name,
        });
    }

    static async openFile(existingHandle) {
        const options = existingHandle ? { ...File.OPTIONS, startIn: existingHandle } : File.OPTIONS;
        return await window.showOpenFilePicker(options);
    }

    static makeName(name) {
        return (name || 'unnamed').replace(/\.stc$/, '').replace(/[^a-zA-Z0-9\-\_]/g, '-').replace(/^-+/, '') + '.stc';
    }
}