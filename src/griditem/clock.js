"use strict";

// Basic clock provider.
class Clock extends SimulationComponent {

    static TYPE_LABEL = 'Clock';

    // 'int' dialog validation overrides that accept empty input (empty value is applied as null).
    // Used by the mutually exclusive 'frequency' and 'ticks' fields.
    static INT_OPTIONAL_CHECK = (v, f) => v.trim() === '' || Number.isInteger(Number.parseSI(v));
    static INT_OPTIONAL_RESTORE = (v, f) => v == null ? '' : Number.formatSI(v, true);

    static EDIT_DIALOG = [
        { name: 'frequency', label: 'Frequency in Hz', type: 'int', exclusive: 'rate', check: Clock.INT_OPTIONAL_CHECK, restore: Clock.INT_OPTIONAL_RESTORE, postCheck: (v, f) => v === null || (isFinite(v) && v >= 1) },
        { name: 'ticks', label: 'Interval in ticks (flip every N ticks)', type: 'int', exclusive: 'rate', check: Clock.INT_OPTIONAL_CHECK, restore: Clock.INT_OPTIONAL_RESTORE, postCheck: (v, f) => v === null || (Number.isInteger(v) && v >= 1) },
        ...Component.EDIT_DIALOG,
    ];

    frequency = 1;
    ticks = null; // when set, the output flips every `ticks` simulation ticks and `frequency` is ignored

    constructor(app, x, y, rotation) {
        super(app, x, y, rotation, { left: [ 'enable' ], right: [ 'c' ] }, 'clock', 1);
    }

    // Serializes the object for writing to disk.
    serialize() {
        return {
            ...super.serialize(),
            '#a': [ this.x, this.y, this.rotation ],
            frequency: this.frequency,
            ticks: this.ticks,
        };
    }

    // Link clock to a grid, enabling it to be rendered.
    link(grid) {
        super.link(grid);
        this.setHoverMessage(this.inner, () => `<b>${this.rateLabel}</b>. <i>E</i> Edit, ${Component.HOTKEYS}.`, { type: 'hover' });
    }

    // Human readable description of the clock rate.
    get rateLabel() {
        return this.ticks == null
            ? `${Number.formatSI(this.frequency ?? 1, true)}Hz Clock`
            : `Clock, flips every ${Number.formatSI(this.ticks)} ticks`;
    }

    // Declare component simulation item.
    declare(sim, config, suffix) {
        return this.ticks == null
            ? sim.declareClock(this.frequency ?? 1, config.targetTPS, suffix)
            : sim.declareClock(0, this.ticks, suffix); // a frequency of 0 makes the simulation interpret tps as the number of ticks per output flip
    }

    // Returns { title, fields, data } for the edit dialog given a descriptor and defaults.
    static editDialogConfig(_descriptor, defaults = {}) {
        return {
            title: 'Configure clock',
            fields: Clock.EDIT_DIALOG,
            data: { frequency: defaults.frequency ?? null, ticks: defaults.ticks ?? null, rotation: defaults.rotation ?? 0 },
        };
    }

    // Returns the app-level placement defaults relevant to this component descriptor.
    static getPlacementDefaults(app, _descriptor) {
        return app.config.placementDefaults.clock;
    }

    // Handle edit hotkey.
    async onEdit() {
        const { title, fields, data } = Clock.editDialogConfig({}, { frequency: this.frequency, ticks: this.ticks, rotation: this.rotation });
        const config = await dialog(title, fields, data);
        if (config) {
            this.frequency = config.frequency;
            this.ticks = config.ticks;
            if (this.rotation !== config.rotation) {
                // rotation changed, need to rebuilt sim
                this.rotation = config.rotation;
                this.redraw();
            } else {
                // only frequency/ticks may have changed, just set it without restaring the sim
                const sim = this.app.simulations.current;
                if (this.simIds.length > 0 && sim) {
                    const ticksMode = this.ticks != null;
                    sim.engine.setClockFrequency(this.simIds[0], ticksMode ? 0 : this.frequency, ticksMode ? this.ticks : this.app.config.targetTPS);
                }
            }
            this.app.config.placementDefaults.clock ??= { };
            this.app.config.placementDefaults.clock.frequency = this.frequency;
            this.app.config.placementDefaults.clock.ticks = this.ticks;
            this.app.config.placementDefaults.clock.rotation = this.rotation;
            this.grid.trackAction('Edit clock');
        }
    }

    static fromDescriptor(app, _desc, overrideDefaults = {}) {
        const d = app.config.placementDefaults.clock;
        return (grid, x, y) => {
            const c = new Clock(app, x, y, overrideDefaults.rotation ?? d.rotation);
            // an explicit null in the overrides means "not set" and must not fall back to the app defaults
            c.frequency = Object.hasOwn(overrideDefaults, 'frequency') ? overrideDefaults.frequency : (d.frequency ?? 1);
            c.ticks = Object.hasOwn(overrideDefaults, 'ticks') ? overrideDefaults.ticks : (d.ticks ?? null);
            return grid.addItem(c, false);
        };
    }
}

GridItem.CLASSES['Clock'] = Clock;
