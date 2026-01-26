/**
 * Risk Scoring Helper Utilities
 * Shared helpers for risk calculations, severity mapping, CVE analysis
 */

/**
 * Get severity weight (0.5 to 3)
 */
export function severityWeight(sev) {
    const s = String(sev || '').toUpperCase();
    if (s === 'CRITICAL') return 3;
    if (s === 'HIGH') return 2;
    if (s === 'MEDIUM') return 1;
    if (s === 'LOW') return 0.5;
    return 0;
}

/**
 * Get severity label from weight
 */
export function severityLabelFromWeight(weight) {
    if (weight >= 3) return 'CRITICAL';
    if (weight >= 2) return 'HIGH';
    if (weight >= 1) return 'MEDIUM';
    return 'LOW';
}

/**
 * Calculate risk score from CVE list
 */
export function scoreFromCves(cves) {
    const counts = cves.reduce((acc, c) => {
        const s = String(c.severity || '').toUpperCase();
        if (s === 'CRITICAL') acc.crit += 1;
        else if (s === 'HIGH') acc.high += 1;
        else if (s === 'MEDIUM') acc.med += 1;
        else if (s) acc.low += 1;
        return acc;
    }, { crit: 0, high: 0, med: 0, low: 0 });

    const total = counts.crit + counts.high + counts.med + counts.low;
    const worstWeight = counts.crit > 0 ? severityWeight('CRITICAL')
        : counts.high > 0 ? severityWeight('HIGH')
        : counts.med > 0 ? severityWeight('MEDIUM')
        : counts.low > 0 ? severityWeight('LOW')
        : 0;

    return Math.min(100, Math.max(0, total * 2 + worstWeight * 10));
}

/**
 * Get risk score value from summary (normalize various field names)
 */
export function getRiskScoreValue(summary, deviceFallbackScore = 0) {
    const raw = summary
        ? (summary.score ?? summary.riskScore ?? summary.riskScoreNormalized ?? summary.risk ?? 0)
        : deviceFallbackScore;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

/**
 * Normalize summary data structure
 */
export function normalizeSummary(summary) {
    if (!summary) return null;

    const critical = summary.criticalCveCount ?? summary.critical ?? summary.criticalCves ?? 0;
    const high = summary.highCveCount ?? summary.high ?? summary.highCves ?? 0;
    const medium = summary.mediumCveCount ?? summary.medium ?? summary.mediumCves ?? 0;
    const low = summary.lowCveCount ?? summary.low ?? summary.lowCves ?? 0;
    const cveCount = summary.totalCveCount ?? summary.cveCount ?? summary.cves ?? (critical + high + medium + low);
    const vulnerableApps = summary.vulnerableAppCount ?? summary.vulnerableApps ?? null;

    const knownExploitCount = summary.knownExploitCount ?? summary.exploitedCveCount ?? summary.exploitCount ?? 0;
    const knownExploitIds = summary.knownExploitIds ?? summary.exploitedCveIds ?? [];

    const worstSeverity = (summary.highestRiskBucket || '').toUpperCase()
        || (critical > 0 ? 'CRITICAL' : high > 0 ? 'HIGH' : medium > 0 ? 'MEDIUM' : low > 0 ? 'LOW' : 'LOW');
    const derivedWeight = severityWeight(worstSeverity);

    const baseScore = summary.riskScore
        ?? summary.score
        ?? summary.riskScoreNormalized
        ?? summary.risk
        ?? (cveCount ? (cveCount * 2 + derivedWeight * 10) : 0);

    const baseConstituents = summary.riskScoreConstituents || summary.constituents || {};
    let cveIds = (summary.cveIds || summary.topCveIds || summary.recentCveIds || []).filter(Boolean);
    if ((!cveIds || cveIds.length === 0) && Array.isArray(summary.cves)) {
        cveIds = summary.cves
            .map(c => c?.cveId || c?.cveID)
            .filter(id => typeof id === 'string' && id.length > 0);
    }

    const maxCvssNormalized = summary.maxCvssNormalized
        ?? summary.maxCvss
        ?? summary.highestCvssNormalized
        ?? summary.highestCvss
        ?? baseConstituents.maxCvssNormalized
        ?? baseConstituents.maxCvss;

    return {
        apps: summary.appCount ?? summary.apps ?? null,
        cves: cveCount ?? null,
        vulnerableApps,
        criticalCves: critical,
        highCves: high,
        mediumCves: medium,
        lowCves: low,
        worstSeverity,
        score: Math.min(100, Math.max(0, Math.round(baseScore ?? 0))),
        constituents: {
            ...baseConstituents,
            knownExploitCount,
            knownExploitIds,
            cveIds,
            maxCvssNormalized,
            cveCount
        }
    };
}

/**
 * Recalculate risk score using Hybrid Model with constituents
 */
export function recalculateRiskScore(summary, knownExploits, cveInventory) {
    if (!summary || summary.score === undefined) {
        return { score: 0, constituents: null, enrichmentFactors: {} };
    }
    
    const constituents = summary.constituents || summary.riskScoreConstituents;
    if (!constituents || constituents.cveCount === 0) {
        return { score: summary.score, constituents, enrichmentFactors: {} };
    }
    
    // Base calculation: CVSS × EPSS
    let riskFactor = constituents.maxCvssNormalized * constituents.maxEpssStored;
    
    // Check if any CVE is a known exploit
    const hasKnownExploit = knownExploits && cveInventory.some(cve => 
        knownExploits.has(cve.cveId)
    );
    const exploitFactor = hasKnownExploit ? 1.5 : 1.0;
    
    // Time decay: EPSS degrades over time
    const epssDate = new Date(constituents.epssDate);
    const daysSinceEpss = (Date.now() - epssDate) / (1000 * 60 * 60 * 24);
    const timeDecayFactor = Math.max(0.1, 1.0 - (daysSinceEpss / 365));
    
    // Final score with all factors
    const finalRisk = (
        riskFactor *
        constituents.exposureFactor *
        constituents.privilegeFactor *
        exploitFactor *
        timeDecayFactor
    ) * 100;
    
    const enrichedScore = Math.round(finalRisk * 100) / 100;
    
    return {
        score: enrichedScore,
        constituents,
        enrichmentFactors: {
            hasKnownExploit,
            timeDecayFactor: Math.round(timeDecayFactor * 10000) / 10000,
            daysSinceEpss: Math.round(daysSinceEpss)
        }
    };
}

/**
 * Get severity styles (fill and outline classes)
 */
export function getSeverityStyles(severity) {
    const styles = {
        CRITICAL: { fill: 'bg-danger text-white', outline: 'btn-outline-danger' },
        HIGH: { fill: 'bg-orange text-white', outline: 'btn-outline-orange' },
        MEDIUM: { fill: 'bg-yellow text-dark', outline: 'btn-outline-yellow' },
        LOW: { fill: 'bg-lime text-dark', outline: 'btn-outline-lime' },
        CLEAN: { fill: 'bg-secondary text-white', outline: 'btn-outline-secondary' }
    };

    const key = severity?.toUpperCase?.() || 'CLEAN';
    return styles[key] || styles.CLEAN;
}

/**
 * Get severity color class
 */
export function getSeverityColor(severity) {
    return getSeverityStyles(severity).fill;
}

/**
 * Get severity outline class
 */
export function getSeverityOutlineClass(severity) {
    return getSeverityStyles(severity).outline;
}

/**
 * Classify CVE detection source (db vs ai)
 */
export function classifyDetectionSource(cve) {
    const source = (cve?.detectionMethod || cve?.howFound || cve?.source || cve?.detectedBy || '').toString().toLowerCase();
    if (source.includes('ai') || source.includes('heur')) return 'ai';
    return 'db';
}

/**
 * Get detection buckets (db and ai counts with highest severity)
 */
export function getDetectionBuckets(cves = []) {
    const buckets = { db: { count: 0, highest: null }, ai: { count: 0, highest: null } };
    (cves || []).forEach((cve) => {
        const bucket = classifyDetectionSource(cve);
        buckets[bucket].count += 1;
        const w = severityWeight(cve.severity);
        const currW = buckets[bucket].highest ? severityWeight(buckets[bucket].highest) : 0;
        if (w > currW) {
            buckets[bucket].highest = cve.severity;
        }
    });
    return buckets;
}
