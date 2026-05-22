"use strict";

// A power/ground/NC symbol that connects to overlapping component ports without a wire.
class Power extends SimulationComponent {

    static TYPE_LABEL = 'Power';
    static TYPE_LABEL_LONG = 'Power / Ground / NC';
    static TYPE_DESCRIPTION = 'Place directly on a component port to connect without a wire.';
    static MODE_LABELS = { ground: 'Ground', power: 'Power', nc: 'Not connected' };

    static EDIT_DIALOG = [
        { name: 'mode', label: 'Type', type: 'select', options: Power.MODE_LABELS },
        ...Component.EDIT_DIALOG,
    ];

    #mode = 'ground';
    #port;

    constructor(app, x, y, rotation, mode = 'ground') {
        assert.enum(['ground', 'power', 'nc'], mode);
        super(app, x, y, rotation, { 'left': ['q'] }, 'power');
        this.#port = this.portByName('q');
        this.#port.label = '';
        this.#port.position = new Point(Grid.SPACING / 2, Grid.SPACING / 2);
        this.#mode = mode;
    }

    // Override to fix size at exactly one grid cell regardless of port layout.
    updateDimensions() {
        this.width = Grid.SPACING;
        this.height = Grid.SPACING;
    }

    // Snap origin to multiples of SPACING so the component center lands on port snap-points.
    // (Standard Grid.align snaps to n*SPACING - SPACING/2; this variant snaps to n*SPACING.)
    align(x, y) {
        const half = Grid.SPACING / 2;
        const [ax, ay] = Grid.align(x - half, y - half);
        return [ax + half, ay + half];
    }

    // Link component to a grid.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => `<b>${this.typeLabel}</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
        this.element.classList.add('status-outline');
        this.element.setAttribute('data-power-mode', this.#mode);
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [this.x, this.y, this.rotation, this.#mode],
        };
    }

    // Declare simulation item: 0 for ground, 1 for power, null (high-Z) for NC.
    declare(sim, config, suffix) {
        const bit = this.#mode === 'ground' ? 0 : (this.#mode === 'power' ? 1 : null);
        return sim.declareConst(bit, suffix, null);
    }

    // Returns the symbol text displayed in the component.
    get topMarkings() {
        if (this.#mode === 'ground') {
            return 'V<span class="sub">0</span>'; // ⏚
        } else if (this.#mode === 'power') {
            return 'V<span class="sub">cc</span>';
        } else {
            return 'x';
        }
    }

    // Override top-markings with the gate type.
    get typeLabel() {
        return Power.MODE_LABELS[this.#mode];
    }

    // Renders the component and updates the mode attribute for CSS coloring.
    renderFull() {
        if (!super.renderFull()) {
            return false;
        }
        this.element.setAttribute('data-power-mode', this.#mode);
        return true;
    }

    // Returns { title, fields, data } for the edit dialog.
    static editDialogConfig(descriptor, defaults = {}) {
        return {
            title: 'Configure power symbol',
            fields: Power.EDIT_DIALOG,
            data: {
                mode: descriptor['#t'] ?? defaults.mode ?? 'ground',
                rotation: defaults.rotation ?? 0,
            },
        };
    }

    // Returns the app-level placement defaults relevant to this component.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.power;
    }

    // Handle edit hotkey.
    async onEdit() {
        const { title, fields, data } = Power.editDialogConfig({}, { mode: this.#mode, rotation: this.rotation });
        const config = await dialog(title, fields, data);
        if (config) {
            this.#mode = config.mode;
            this.rotation = config.rotation;
            this.redraw();
            this.grid.trackAction('Edit power symbol');
        }
    }

    // Returns button label and hover message for each sub-type descriptor.
    static descriptorInfo(desc) {
        const mode = desc['#t'] ?? 'ground';
        const label = Power.MODE_LABELS[mode];
        return { label, hoverMessage: `<b>${label}</b>. ${Power.TYPE_DESCRIPTION}` };
    }

    static fromDescriptor(app, desc, overrideDefaults = {}) {
        const d = app.config.placementDefaults;
        const mode = overrideDefaults.mode ?? desc['#t'] ?? 'ground';
        return (grid, x, y) => grid.addItem(new Power(
            app,
            x,
            y,
            overrideDefaults.rotation ?? d.power?.rotation ?? 0,
            mode
        ), false);
    }
}

GridItem.CLASSES['Power'] = Power;
