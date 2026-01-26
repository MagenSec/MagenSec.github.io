/**
 * CreditService - Credit calculations and date utilities
 * Extracted from Settings.js
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const ORG_DURATION_OPTIONS = [
    { label: '6 months (180 days)', value: 180 },
    { label: '1 year (365 days)', value: 365 },
    { label: '2 years (730 days)', value: 730 },
    { label: '3 years (1095 days)', value: 1095 }
];

/**
 * Calculate days left until credit exhaustion
 */
export function getDaysLeftInfo(projectedExhaustion) {
    if (!projectedExhaustion) {
        return { daysLeft: null, targetDate: null };
    }

    const targetDate = new Date(projectedExhaustion);
    if (Number.isNaN(targetDate.getTime())) {
        return { daysLeft: null, targetDate: null };
    }

    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();
    const daysLeft = Math.max(0, Math.ceil(diffMs / MS_PER_DAY));
    return { daysLeft, targetDate };
}

/**
 * Format credit history entry for display
 */
export function formatCreditHistoryEntry(entry) {
    const date = new Date(entry.timestamp || entry.createdAt);
    const type = entry.type || entry.changeType;
    const change = entry.change || entry.changeAmount || 0;
    const reason = entry.reason || entry.changeReason || '';
    
    return {
        date: date.toLocaleDateString(),
        time: date.toLocaleTimeString(),
        type,
        change,
        reason,
        formattedChange: change > 0 ? `+${change}` : `${change}`
    };
}

/**
 * Calculate projected exhaustion date
 */
export function calculateProjectedExhaustion(org, dailyBurnRate) {
    if (!org || !org.remainingCredits || !dailyBurnRate || dailyBurnRate <= 0) {
        return null;
    }

    const daysUntilExhaustion = Math.ceil(org.remainingCredits / dailyBurnRate);
    const exhaustionDate = new Date();
    exhaustionDate.setDate(exhaustionDate.getDate() + daysUntilExhaustion);
    
    return exhaustionDate.toISOString();
}
