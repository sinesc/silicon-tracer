"use strict";

// Wire splitter/joiner.
class Splitter extends Component {

    #numSplits;

    constructor(app, x, y, numSplits) {
        assert.number(numSplits);
        const { left, right/*, channelMap*/ } = Splitter.#generatePorts(numSplits);
        super(app, x, y, { 'left': left, 'right': right }, 'splitter', null);
        this.#numSplits = numSplits;
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.#numSplits ]},
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

    // Generates splitter port layout based on number of inputs.
    static #generatePorts(numSplits) {

        //const channelMap = { };

        // n side
        const left = [];
        for (let i = 0; i < numSplits; ++i) {
            const name = `n${i}`;
            left.push(name);
            //channelMap[name] = 1;
        }

        // 1 side
        const right = [];
        right.push('1');
        //channelMap['1'] = 1;

        return { left, right/*, channelMap*/ };
    }
}
