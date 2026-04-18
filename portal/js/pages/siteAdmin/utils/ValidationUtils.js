/**
 * ValidationUtils - Input validation helpers for SiteAdmin
 * Extracted from SiteAdmin.js
 */

/**
 * Validate email format
 */
export function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate organization name
 */
export function isValidOrgName(name) {
    return name && name.trim().length >= 3;
}

/**
 * Validate seats value
 */
export function isValidSeats(seats) {
    return Number.isInteger(seats) && seats > 0 && seats <= 1000;
}

/**
 * Validate duration value
 */
export function isValidDuration(duration) {
    const validDurations = [180, 365, 730, 1095];
    return validDurations.includes(parseInt(duration));
}
