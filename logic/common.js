// This annoys you, doesn't it?
Object.defineProperty(Object.prototype, "map", {
    value: function(c) {
        let result = Object.create(this);
        for ([ k, v ] of Object.entries(this)) {
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

class Point {
    x;
    y;
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}