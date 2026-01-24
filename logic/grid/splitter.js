"use strict";

// Wire splitter/joiner.
class Splitter extends Component {

    static MULTI_PORT_TEMPLATE = 'n{i}';
    static SINGLE_PORT_NAME = 'm';

    static #EDIT_DIALOG = [
        { name: 'numSplits', label: 'Number of n-ports', type: 'int', check: (v, f) => { const p = Number.parseSI(v, true); return isFinite(p) && p >= 2 && p <= 64; } },
        { name: 'ordering', label: 'Order of n-ports', type: 'select', options: { ltr: "0 ... n", rtl: "n ... 0" } },
        { name: 'orientation', label: 'Position of single port', type: 'select', options: { start: "Opposite of n0", middle: "Middle", end: "Opposite of nMax" } },
        { name: 'gapPosition', label: 'Pin gap (when n-ports is even)', type: 'select', options: { start: "Next to n0", middle: "Middle", end: "Next to nMax", none: "None (rotation snaps)" } },
        ...Component.EDIT_DIALOG,
    ];

    #numSplits;
    #gapPosition;
    #orientation;
    #ordering;

    constructor(app, x, y, rotation, numSplits, gapPosition = 'none', orientation = 'start', ordering = 'ltr') {
        assert.number(numSplits);
        assert.enum([ 'start', 'middle', 'end', 'none' ], gapPosition);
        assert.enum([ 'start', 'middle', 'end' ], orientation);
        const { left, right/*, channelMap*/ } = Splitter.#generatePorts(numSplits, gapPosition, orientation, ordering);
        super(app, x, y, rotation, { 'left': left, 'right': right }, 'splitter', null);
        this.#numSplits = numSplits;
        this.#gapPosition = gapPosition;
        this.#orientation = orientation;
        this.#ordering = ordering;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.rotation, this.#numSplits, this.#gapPosition, this.#orientation, this.#ordering ]},
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
        const config = await dialog("Configure splitter", Splitter.#EDIT_DIALOG, { numSplits: this.#numSplits, gapPosition: this.#gapPosition, orientation: this.#orientation, ordering: this.#ordering, rotation: this.rotation });
        if (config) {
            const grid = this.grid;
            this.unlink();
            const { left, right } = Splitter.#generatePorts(config.numSplits, config.gapPosition, config.orientation, config.ordering);
            this.setPortsFromNames({ 'left': left, 'right': right });
            this.#numSplits = config.numSplits;
            this.#gapPosition = config.gapPosition;
            this.#orientation = config.orientation;
            this.#ordering = config.ordering;
            this.link(grid);
            this.rotation = config.rotation; // needs to be on grid for rotation to properly update x/y/width/height
            this.redraw();
        }
    }

    // Generates splitter port layout based on number of inputs.
    static #generatePorts(numSplits, gapPosition, orientation, ordering) {

        // compute blank spot if n-port count is even
        let blankAt = -1;
        let numSlots = numSplits;

        // if n-port ordering is inverted also invert ordering for the single port and the gap
        if (ordering === 'rtl') {
            orientation = orientation === 'start' ? 'end' : (orientation === 'end' ? 'start' : orientation);
            gapPosition = gapPosition === 'start' ? 'end' : (gapPosition === 'end' ? 'start' : gapPosition);
        }

        // compute number of ports slots and blank position for the gap
        if (numSplits % 2 === 0 && gapPosition !== 'none') {
            numSlots += 1;
            blankAt = gapPosition === 'middle' ? (numSlots - 1) / 2 : (gapPosition === 'end' ? numSlots - 1 : 0);
        }

        const singlePortAt = orientation === 'middle' ? Math.round((numSlots - 1) / 2) : (orientation === 'start' ? numSlots - 1 : 0);

        // generate ports arrays
        //const channelMap = { };
        const left = [];
        const right = [];
        let split = 0;

        for (let i = 0; i < numSlots; ++i) {

            // n side (left)
            if (i === blankAt) {
                left.push(null);
            } else {
                const name = Splitter.MULTI_PORT_TEMPLATE.replace('{i}', '' + (ordering === 'ltr' ? split : numSplits - 1 - split));
                left.push(name);
                //channelMap[name] = 1;
                split += 1;
            }

            // 1 side
            if (i === singlePortAt) {
                right.push(Splitter.SINGLE_PORT_NAME);
                //channelMap['1'] = 1;
            } else if (right.length === 0 || right[right.length -1] !== '1') {
                right.push(null);
            }
        }

        return { left, right/*, channelMap*/ };
    }
}
