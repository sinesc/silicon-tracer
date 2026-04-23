"use strict";

// Basic clock provider.
class Clock extends SimulationComponent {

    static TYPE_LABEL = 'Clock';

    static EDIT_DIALOG = [
        { name: 'frequency', label: 'Frequency in Hz', type: 'int', postCheck: (v, f) => isFinite(v) && v >= 1 },
        ...Component.EDIT_DIALOG,
    ];

    frequency = 1;

    constructor(app, x, y, rotation) {
        super(app, x, y, rotation, { left: [ 'enable' ], right: [ 'c' ] }, 'clock', 1);
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation ],
            frequency: this.frequency,
        };
    }

    // Link clock to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => `<b>${Number.formatSI(this.frequency, true)}Hz Clock</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return sim.declareClock(this.frequency, config.targetTPS, suffix);
    }

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    static editDialogConfig(_descriptor, defaults = {}) {
        return {
            title: 'Configure clock',
            fields: Clock.EDIT_DIALOG,
            data: { frequency: Number.formatSI(defaults.frequency ?? 1, true), rotation: defaults.rotation ?? 0 },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.clock;
    }

    // Handle edit hotkey.
    async onEdit() {
        const { title, fields, data } = Clock.editDialogConfig({}, { frequency: this.frequency, rotation: this.rotation });
        const config = await dialog(title, fields, data);
        if (config) {
            this.frequency = config.frequency;
            if (this.rotation !== config.rotation) {
                // rotation changed, need to rebuilt sim
                this.rotation = config.rotation;
                this.redraw();
            } else {
                // only frequency may have changed, just set it without restaring the sim
                const sim = this.app.simulations.current;
                if (this.simIds.length > 0 && sim) {
                    sim.engine.setClockFrequency(this.simIds[0], this.frequency);
                }
            }
            this.grid.trackAction('Edit clock');
        }
    }

    static fromDescriptor(app, _desc, overrideDefaults = {}) {
        const d = app.config.placementDefaults;
        return (grid, x, y) => {
            const c = new Clock(app, x, y, overrideDefaults.rotation ?? d.clock.rotation);
            if (overrideDefaults.frequency != null) c.frequency = overrideDefaults.frequency;
            return grid.addItem(c, false);
        };
    }
}

GridItem.CLASSES['Clock'] = Clock;
