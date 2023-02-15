/**
 * Helper class (simulating Python collections.defaultdict)
 */
var DefaultMap = class DefaultMap extends Map {
    get(key) {
        if (!this.has(key)) {
            super.set(key, this.default(key))
        }
        return super.get(key);
    }

    constructor(defaultFunction, entries) {
        super(entries);
        this.default = defaultFunction;
    }
}

var arraysEqual = function(arr1, arr2) {
    if (arr1.length != arr2.length) {
        return false
    }
    for (let i = arr1.length; i--;) {
        if (arr1[i] !== arr2[i])
            return false
    }
    return true
}
