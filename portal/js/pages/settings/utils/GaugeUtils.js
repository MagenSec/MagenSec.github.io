/**
 * GaugeUtils - SVG gauge rendering utilities
 * Extracted from Settings.js for reusability
 */

export const GAUGE_GRADIENT_ID = 'settings-gauge-blue-gradient';

/**
 * Convert polar coordinates to Cartesian
 */
export function polarToCartesian(cx, cy, radius, angleInDegrees) {
    // Standard SVG: 0° is at 3 o'clock, increases clockwise
    const angleInRadians = angleInDegrees * Math.PI / 180.0;
    return {
        x: cx + (radius * Math.cos(angleInRadians)),
        y: cy + (radius * Math.sin(angleInRadians))
    };
}

/**
 * Generate SVG arc path for gauge
 */
export function describeArc(cx, cy, radius, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, radius, startAngle);
    const end = polarToCartesian(cx, cy, radius, endAngle);
    
    // For 270° arc (-135° to 135°), we need largeArcFlag=1, sweepFlag=1 (clockwise)
    const arcSize = endAngle - startAngle;
    const largeArcFlag = arcSize > 180 ? 1 : 0;
    const sweepFlag = 1; // Always clockwise for our gauges
    
    return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

/**
 * Calculate percent remaining for gauge display
 */
export function getPercentRemaining(org) {
    if (!org || !org.totalCredits || org.totalCredits <= 0) {
        return null;
    }
    const rawPercent = (org.remainingCredits ?? 0) / org.totalCredits * 100;
    return Math.min(100, Math.max(0, Math.round(rawPercent)));
}
