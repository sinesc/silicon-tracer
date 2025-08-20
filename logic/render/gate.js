class Gate extends Component {

    static START_LETTER = 97; // 65 for capitalized

    type;
    numInputs;

    constructor(grid, x, y, type, numInputs) {

        // compute blank spots for symmetry
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
            let letter = String.fromCharCode(Gate.START_LETTER + i);
            left.push(letter);
            if (i === blankAfter) {
                left.push(null);
            }
        }

        // output
        let right = [];
        for (let i = 0; i < numSlots; ++i) {
            right.push(i === outputAt ? String.fromCharCode(Gate.START_LETTER + 16) : null);
        }

        let name = type.toUpperFirst();
        super(grid, x, y, { 'left': left, 'right': right }, name);
        this.type = type;
        this.numInputs = numInputs;
        this.setHoverMessage(this.inner, '<b>' + name + '-Gate</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate', { type: 'hover' });
    }
}