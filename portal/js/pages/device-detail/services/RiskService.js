/**
 * Risk calculation and scoring service
 */

export class RiskService {
    constructor(state) {
        this.state = state;
    }

    calculateRiskScore(device) {
        const fromInventory = () => {
            const cves = this.state?.cveInventory || [];
            if (!Array.isArray(cves) || cves.length === 0) return 0;
            return this.scoreFromCves(cves);
        };

        if (!device || !device.Summary) return fromInventory();

        const summary = typeof device.Summary === 'string' ? JSON.parse(device.Summary) : device.Summary;
        const normalized = this.normalizeSummary(summary);
        const score = normalized?.score ?? 0;

        // If summary shows zero but we have CVEs in inventory, fall back to inventory-based score
        if (!score) {
            return fromInventory();
        }

        return score;
    }

    scoreFromCves(cves) {
        const counts = cves.reduce((acc, c) => {
            const s = String(c.severity || '').toUpperCase();
            if (s === 'CRITICAL') acc.crit += 1;
            else if (s === 'HIGH') acc.high += 1;
            else if (s === 'MEDIUM') acc.med += 1;
            else if (s) acc.low += 1;
            return acc;
        }, { crit: 0, high: 0, med: 0, low: 0 });

        const total = counts.crit + counts.high + counts.med + counts.low;
        const worstWeight = counts.crit > 0 ? this.severityWeight('CRITICAL')
            : counts.high > 0 ? this.severityWeight('HIGH')
            : counts.med > 0 ? this.severityWeight('MEDIUM')
            : counts.low > 0 ? this.severityWeight('LOW')
            : 0;

        return Math.min(100, Math.max(0, total * 2 + worstWeight * 10));
    }

    getRiskScoreValue(summary, deviceFallbackScore = 0) {
        // Normalize various summary shapes to a sane numeric risk score
        const raw = summary
            ? (summary.score ?? summary.riskScore ?? summary.riskScoreNormalized ?? summary.risk ?? 0)
            : deviceFallbackScore;
        const n = Number(raw);
        return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    }

    severityWeight(sev) {
        const s = String(sev || '').toUpperCase();
        if (s === 'CRITICAL') return 3;
        if (s === 'HIGH') return 2;
        if (s === 'MEDIUM') return 1;
        if (s === 'LOW') return 0.5;
        return 0;
    }

    severityLabelFromWeight(weight) {
        if (weight >= 3) return 'CRITICAL';
        if (weight >= 2) return 'HIGH';
        if (weight >= 1) return 'MEDIUM';
        return 'LOW';
    }

    normalizeSummary(summary) {
        if (!summary) return null;

        const critical = summary.criticalCveCount ?? summary.critical ?? summary.criticalCves ?? 0;
        const high = summary.highCveCount ?? summary.high ?? summary.highCves ?? 0;
        const medium = summary.mediumCveCount ?? summary.medium ?? summary.mediumCves ?? 0;
        const low = summary.lowCveCount ?? summary.low ?? summary.lowCves ?? 0;
        const cveCount = summary.totalCveCount ?? summary.cveCount ?? summary.cves ?? (critical + high + medium + low);
        const vulnerableApps = summary.vulnerableAppCount ?? summary.vulnerableApps ?? null;
        const score = summary.riskScore ?? summary.score ?? summary.riskScoreNormalized ?? 0;

        return {
            criticalCveCount: critical,
            highCveCount: high,
            mediumCveCount: medium,
            lowCveCount: low,
            cveCount,
            vulnerableApps,
            score
        };
    }

    getRiskColorClass(score) {
        const n = Number(score);
        if (n >= 80) return 'bg-danger';
        if (n >= 60) return 'bg-warning';
        if (n >= 40) return 'bg-primary';
        return 'bg-success';
    }

    getRiskColor(score) {
        const n = Number(score);
        if (n >= 80) return 'danger';
        if (n >= 60) return 'warning';
        if (n >= 40) return 'primary';
        return 'success';
    }
}
