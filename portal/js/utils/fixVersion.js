/**
 * Fix Version Utilities - Derive remediation labels from CVE version range data.
 *
 * Logic (user-confirmed):
 *   versionEndExcluding → "Update to {version}" (this IS the first safe version)
 *   versionEndIncluding → "Update past {version}" (need the next version)
 *   Neither             → "Update to latest or contact {vendor}"
 */

/**
 * Compute fix-version display label from CVE match data.
 * @param {{ versionEndExcluding?: string, versionEndIncluding?: string }} match
 * @param {string} [vendor] - App vendor name for fallback message
 * @returns {{ fixVersion: string|null, fixLabel: string }}
 */
export function getFixVersionLabel(match, vendor) {
    if (!match) {
        return { fixVersion: null, fixLabel: formatFallback(vendor) };
    }

    const endExcluding = match.versionEndExcluding || match.VersionEndExcluding;
    const endIncluding = match.versionEndIncluding || match.VersionEndIncluding;

    if (endExcluding) {
        return { fixVersion: endExcluding, fixLabel: `Update to ${endExcluding}` };
    }

    if (endIncluding) {
        return { fixVersion: null, fixLabel: `Update past ${endIncluding}` };
    }

    return { fixVersion: null, fixLabel: formatFallback(vendor) };
}

function formatFallback(vendor) {
    return vendor
        ? `Update to latest or contact ${vendor}`
        : 'Update to latest version';
}
