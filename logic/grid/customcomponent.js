"use strict";

// Custom circuit represented as a component.
class CustomComponent extends Component {

    // Circuit UID for the circuit represented by this custom component
    uid;

    // Component label
    label;

    constructor(x, y, rotation, uid, label) {
        assert.number(rotation);
        assert.string(uid);
        let circuit = app.circuits.byUID(uid);
        super(x, y, circuit.ports, circuit.label);
        this.rotation = rotation;
        this.uid = uid;
        this.label = label;
    }

    // Link custom component to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.element.classList.add('custom');
        this.setHoverMessage(this.inner, '<b>' + this.label + '</b>. <i>LMB</i>: Drag to move. <i>R</i>: Rotate, <i>D</i>: Delete', { type: 'hover' });
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            _: { c: this.constructor.name, a: [ this.x, this.y, this.rotation, this.uid ]},
        };
    }

    // Generates default port outline for the given circuits component representation.
    static generateDefaultOutline(circuitData) {
        // get ports from serialized circuit
        let ports = circuitData.filter((c) => c['_'].c === 'Port');
        let outline = { 'left': [], 'right': [], 'top': [], 'bottom': [] };
        for (let item of ports) {
            // side of the component-port on port-components is opposite of where the port-component is facing
            let side = Component.SIDES[(item.rotation + 2) % 4];
            // keep track of position so we can arrange ports on component by position in schematic
            let sort = side === 'left' || side === 'right' ? item['_'].a[1] : item['_'].a[0]; // we're loading from serialized data format, so it's a bit ugly and will break when component constructor args change // FIXME: no longer loading from serialized
            outline[side].push([ sort, item.name ]);
        }
        let height = Math.nearestOdd(Math.max(1, outline.left.length, outline.right.length));
        let width = Math.nearestOdd(Math.max(1, outline.top.length, outline.bottom.length));
        // arrange ports nicely
        for (let side of Object.keys(outline)) {
            // sort by position
            outline[side].sort(([a,], [b,]) => a - b);
            outline[side] = outline[side].map(([sort, label]) => label);
            // insert spacers for symmetry
            let length = side === 'left' || side === 'right' ? height : width;
            let available = length - outline[side].length;
            let insertEdges = (new Array(Math.floor(available / 2))).fill(null);
            let insertCenter = available % 2 ? [ null ] : [];
            outline[side] = [ ...insertEdges, ...outline[side], ...insertEdges ];
            outline[side].splice(outline[side].length / 2, 0, ...insertCenter);
        }
        // reverse left/bottom due to the way we enumerate ports for easier rotation
        outline['left'].reverse();
        outline['bottom'].reverse();
        return outline;
    }
}