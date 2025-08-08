// This annoys you, doesn't it?
Object.defineProperty(Object.prototype, "map", {
    value: function(c) {
        let result = Object.create(this);
        for ([ k, v ] of Object.entries(this)) {
            result[k] = c(v);
        }
        return result;
    }
});