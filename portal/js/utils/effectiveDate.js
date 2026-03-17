import { rewindContext } from '@rewindContext';

export function todayInputDate() {
    return new Date().toISOString().slice(0, 10);
}

export function compactDateToInputDate(value, fallback = todayInputDate()) {
    if (!value) {
        return fallback;
    }

    const stringValue = String(value).trim();
    if (/^\d{8}$/.test(stringValue)) {
        return `${stringValue.slice(0, 4)}-${stringValue.slice(4, 6)}-${stringValue.slice(6, 8)}`;
    }

    const parsed = new Date(stringValue);
    if (Number.isNaN(parsed.getTime())) {
        return fallback;
    }

    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}

export function getEffectiveMaxInputDate() {
    return rewindContext.isActive()
        ? compactDateToInputDate(rewindContext.getDate())
        : todayInputDate();
}

export function clampInputDateToEffectiveMax(value) {
    const maxDate = getEffectiveMaxInputDate();
    if (!value) {
        return maxDate;
    }

    return value > maxDate ? maxDate : value;
}