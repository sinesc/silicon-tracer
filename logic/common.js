"use strict";

// This annoys you, doesn't it?
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

Object.defineProperty(String.prototype, "toUpperFirst", {
    value: function() {
        return this.length > 0 ? this.charAt(0).toUpperCase() + this.slice(1) : '';
    }
});

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

    static async openFile() {
        return await window.showOpenFilePicker(File.OPTIONS);
    }

    static makeName(name) {
        return (name || 'unnamed').replace(/\.stc$/, '').replace(/[^a-zA-Z0-9\-\_]/g, '-').replace(/^-+/, '') + '.stc';
    }
}