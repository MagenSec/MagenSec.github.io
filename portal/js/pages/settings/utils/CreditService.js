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

/**
 * Estimate daily credit burn from historical samples.
 * Ignores non-decreasing intervals (top-ups/rotations) and obvious outliers.
 */
export function estimateDailyBurnRate(history, org = null) {
    if (!Array.isArray(history) || history.length < 2) return null;

    const points = history
        .map((h) => {
            const ts = new Date(h.date || h.timestamp || h.createdAt || '').getTime();
            const remaining = Number(h.remainingCredits ?? h.creditsRemaining);
            return { ts, remaining };
        })
        .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.remaining))
        .sort((a, b) => a.ts - b.ts);

    if (points.length < 2) return null;

    const maxReasonableBurn = Math.max(50, Number(org?.seats || 0) * 5);
    const rates = [];

    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        const consumed = prev.remaining - curr.remaining;
        if (consumed <= 0) continue;

        const daySpan = (curr.ts - prev.ts) / MS_PER_DAY;
        if (!Number.isFinite(daySpan) || daySpan <= 0) continue;

        const rate = consumed / daySpan;
        if (!Number.isFinite(rate) || rate <= 0 || rate > maxReasonableBurn) continue;
        rates.push(rate);
    }

    if (rates.length === 0) return null;

    // Prefer median for robustness against occasional spikes.
    rates.sort((a, b) => a - b);
    const mid = Math.floor(rates.length / 2);
    return rates.length % 2 === 0
        ? (rates[mid - 1] + rates[mid]) / 2
        : rates[mid];
}

/**
 * Project exhaustion date using inferred burn rate from history.
 */
export function calculateProjectedExhaustionFromHistory(org, history) {
    if (!org || !Number.isFinite(Number(org.remainingCredits)) || Number(org.remainingCredits) <= 0) {
        return null;
    }
    const burnRate = estimateDailyBurnRate(history, org);
    if (!burnRate || burnRate <= 0) return null;
    return calculateProjectedExhaustion(org, burnRate);
}
