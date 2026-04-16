"use strict";

// Base class for display components (Constant, Probe) that format bus values as strings.
class DisplayComponent extends SimulationComponent {

    static DISPLAY_FORMATS = { 'auto': 'Auto', 'hex': 'Hex', 'dec': 'Decimal', 'bin': 'Binary' };

    static SIZE_MAP = {
        "1":  { bin: 1, hex: 1, dec: 1 },
        "2":  { bin: 2, hex: 1, dec: 1 },
        "4":  { bin: 2, hex: 1, dec: 1 },
        "8":  { bin: 3, hex: 2, dec: 2 },
        "16": { bin: 5, hex: 2, dec: 2 },
        "32": { bin: 9, hex: 3, dec: 3 },
    };

    // Looks up a visual size value from SIZE_MAP for the given channel count and display format.
    static lookupSize(channels, format) {
        assert.integer(channels);
        assert.string(format);
        let result = 1;
        for (const key of Object.keys(DisplayComponent.SIZE_MAP).map(Number).sort((a, b) => a - b)) {
            if (key > channels) break;
            const entry = DisplayComponent.SIZE_MAP[String(key)];
            if (format in entry) result = entry[format];
        }
        return result;
    }

    // Resolves 'auto' display format to a concrete format ('hex', 'dec', or 'bin').
    static resolveFormat(displayFormat, channels) {
        if (displayFormat !== 'auto') return displayFormat;
        return channels === 1 ? 'dec' : 'hex';
    }

    // Formats value/driven bits as a display string.
    // Accepts Number (up to 32 bits, converted via >>> 0) or BigInt for any width.
    static formatValue(valueBits, drivenBits, dataWidth, displayFormat) {
        const bigValue = typeof valueBits === 'bigint' ? valueBits : BigInt(valueBits >>> 0);
        const bigDriven = typeof drivenBits === 'bigint' ? drivenBits : BigInt(drivenBits >>> 0);
        const bigMask = (1n << BigInt(dataWidth)) - 1n;
        const drivenMasked = bigDriven & bigMask;
        if (drivenMasked === 0n) return '~';
        const allDriven = drivenMasked === bigMask;
        const v = bigValue & bigMask;
        const fmt = displayFormat === 'auto' ? (dataWidth === 1 ? 'dec' : (allDriven ? 'hex' : 'bin')) : displayFormat;
        if (fmt === 'hex') {
            return allDriven ? '0x' + v.toString(16).toUpperCase() : '~';
        } else if (fmt === 'dec') {
            return allDriven ? String(v) : '~';
        } else {
            // bin: represent each bit; '~' for undriven bits
            let result = '';
            for (let i = dataWidth - 1; i >= 0; i--) {
                const bit = BigInt(i);
                result += (drivenMasked >> bit) & 1n ? String(Number((v >> bit) & 1n)) : '~';
            }
            return dataWidth === 1 ? result : '0b' + result;
        }
    }
}
