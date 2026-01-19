"use strict";

// Wire splitter/joiner.
class Splitter extends Component {

    static MULTI_PORT_TEMPLATE = 'n{i}';
    static SINGLE_PORT_NAME = 'm';

    static #EDIT_DIALOG = [
        { name: 'numSplits', label: 'Number of n-ports', type: 'int', check: (v, f) => { const p = Number.parseSI(v, true); return isFinite(p) && p >= 2 && p <= 64; } },
        { name: 'gapPosition', label: 'Pin gap (when n-ports is even)', type: 'select', options: { start: "Next to n0", middle: "Middle", end: "Next to nMax", none: "None (rotation moves splitter)" } },
        { name: 'orientation', label: 'Position of 1-port', type: 'select', options: { start: "Opposite of n0", middle: "Middle", end: "Opposite of nMax" } },
        ...Component.EDIT_DIALOG,
    ];

    #numSplits;
    #gapPosition = 'middle';
    #orientation = 'start';

    constructor(app, x, y, numSplits, gapPosition = 'middle', orientation = 'start') {
        assert.number(numSplits);
        assert.enum([ 'start', 'middle', 'end', 'none' ], gapPosition);
        assert.enum([ 'start', 'middle', 'end' ], orientation);
        const { left, right/*, channelMap*/ } = Splitter.#generatePorts(numSplits, gapPosition, orientation);
        super(app, x, y, { 'left': left, 'right': right }, 'splitter', null);
        this.#numSplits = numSplits;
        this.#gapPosition = gapPosition;
        this.#orientation = orientation;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.#numSplits, this.#gapPosition, this.#orientation ]},
        };
    }

    // Link splitter to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.element.classList.add('splitter');
        this.setHoverMessage(this.inner, `<b>Wire-splitter/joiner</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return null;
    }

    // Handle edit hotkey.
    async onEdit() {
        const config = await dialog("Configure splitter", Splitter.#EDIT_DIALOG, { numSplits: this.#numSplits, gapPosition: this.#gapPosition, orientation: this.#orientation, rotation: this.rotation });
        if (config) {
            const grid = this.grid;
            this.unlink();
            const { left, right } = Splitter.#generatePorts(config.numSplits, config.gapPosition, config.orientation);
            this.setPortsFromNames({ 'left': left, 'right': right });
            this.#numSplits = config.numSplits;
            this.#gapPosition = config.gapPosition;
            this.#orientation = config.orientation;
            this.link(grid);
            this.rotation = config.rotation; // needs to be on grid for rotation to properly update x/y/width/height
            this.redraw();
        }
    }

    // Generates splitter port layout based on number of inputs.
    static #generatePorts(numSplits, gapPosition, orientation) {

        // compute blank spot if n-port count is even
        let blankAt = -1;
        let numSlots = numSplits;

        if (numSplits % 2 === 0 && gapPosition !== 'none') {
            numSlots += 1;
            blankAt = gapPosition === 'middle' ? (numSlots - 1) / 2 : (gapPosition === 'end' ? numSlots - 1 : 0);
        }

        const outputAt = orientation === 'middle' ? Math.round((numSlots - 1) / 2) : (orientation === 'start' ? numSlots - 1 : 0);

        //const channelMap = { };

        const left = [];
        const right = [];
        let split = 0;

        for (let i = 0; i < numSlots; ++i) {

            // n side (left)
            if (i === blankAt) {
                left.push(null);
            } else {
                const name = Splitter.MULTI_PORT_TEMPLATE.replace('{i}', '' + split);
                left.push(name);
                //channelMap[name] = 1;
                split += 1;
            }

            // 1 side
            if (i === outputAt) {
                right.push(Splitter.SINGLE_PORT_NAME);
                //channelMap['1'] = 1;
            } else if (right.length === 0 || right[right.length -1] !== '1') {
                right.push(null);
            }
        }

        return { left, right/*, channelMap*/ };
    }
}
