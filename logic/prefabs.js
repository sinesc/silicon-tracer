class Prefabs {
    static START_LETTER = 97; // 65 for capitalized

    static createGate(grid, x, y, fn, numInputs) {
        // compute blank spots
        let blankAfter = -1;
        let numSlots = numInputs;
        if (numInputs % 2 === 0) {
            blankAfter = numInputs / 2 - 1;
            numSlots += 1;
        }
        let outputAt = (numSlots - 1) / 2;
        // inputs
        let left = [];
        for (let i = 0; i < numInputs; ++i) {
            let letter = String.fromCharCode(Prefabs.START_LETTER + i);
            left.push(letter);
            if (i === blankAfter) {
                left.push(null);
            }
        }
        // output
        let right = [];
        for (let i = 0; i < numSlots; ++i) {
            right.push(i === outputAt ? String.fromCharCode(Prefabs.START_LETTER + 16) : null);
        }
        // drop onto grid
        return new Component(grid, fn, x, y, 0, { 'left': left, 'right': right });
    }

    static createPortLeft(grid, x, y, name) {
        return new Port(grid, name, x, y, 0, { 'left': [ '' ], 'top': [ null, null ] });
    }

    static createPortRight(grid, x, y, name) {
        return new Port(grid, name, x, y, 0, { 'right': [ '' ], 'top': [ null, null ] });
    }
}