/**
 * DeviceSummaryService - Device summary normalization and enrichment
 */

export class DeviceSummaryService {
    /**
     * Normalize device summary from various API response formats
     */
    static normalizeSummary(summary, severityWeight) {
        if (!summary) return null;
        
        const critical = summary.criticalCveCount ?? summary.critical ?? summary.criticalCves ?? 0;
        const high = summary.highCveCount ?? summary.high ?? summary.highCves ?? 0;
        const medium = summary.mediumCveCount ?? summary.medium ?? summary.mediumCves ?? 0;
        const low = summary.lowCveCount ?? summary.low ?? summary.lowCves ?? 0;
        const cveCount = summary.cveCount ?? (critical + high + medium + low);
        const vulnerableApps = summary.vulnerableAppCount ?? summary.appsWithCves ?? summary.appWithVulnCount ?? 0;
        const knownExploitCount = summary.knownExploitCount ?? summary.exploitedCveCount ?? summary.exploitCount ?? 0;
        const knownExploitIds = summary.knownExploitIds ?? summary.exploitedCveIds ?? [];
        const worstSeverity = (summary.highestRiskBucket || '').toUpperCase() ||
            (critical > 0 ? 'CRITICAL' : high > 0 ? 'HIGH' : medium > 0 ? 'MEDIUM' : low > 0 ? 'LOW' : 'LOW');
        const derivedWeight = severityWeight(worstSeverity);
        
        // Use provided risk score if available, otherwise calculate heuristic
        let baseScore = summary.riskScore;
        if (baseScore === undefined || baseScore === null) {
            baseScore = Math.min(100, cveCount * 2 + derivedWeight * 10);
        }

        const baseConstituents = summary.riskScoreConstituents || {};
        let cveIds = (summary.cveIds || summary.topCveIds || summary.recentCveIds || []).filter(Boolean);
        if ((!cveIds || cveIds.length === 0) && Array.isArray(summary.cves)) {
            cveIds = summary.cves.map(c => c.cveId || c.CVE).filter(Boolean);
        }
        const maxCvssNormalized = summary.maxCvssNormalized ?? summary.maxCvss ?? summary.highestCvssNormalized ?? summary.highestCvss ?? baseConstituents.maxCvssNormalized ?? baseConstituents.maxCvss;
        
        // Fallback: If score is 0 but we have vulnerable apps/CVEs, calculate a heuristic score
        let finalScore = Math.min(100, Math.max(0, Math.round(baseScore ?? 0)));
        
        // Force a minimum score if there are vulnerabilities or high severity
        if (finalScore === 0) {
            if (critical > 0 || high > 0) finalScore = Math.max(20, cveCount * 2);
            else if (medium > 0) finalScore = Math.max(10, cveCount);
            else if (low > 0) finalScore = 5;
        }

        return {
            apps: summary.appCount ?? summary.apps ?? null,
            cves: cveCount ?? null,
            vulnerableApps,
            criticalCves: critical,
            highCves: high,
            mediumCves: medium,
            lowCves: low,
            worstSeverity,
            score: finalScore,
            constituents: {
                ...baseConstituents,
                knownExploitCount,
                knownExploitIds,
                cveIds,
                maxCvssNormalized
            }
        };
    }

    /**
     * Enrich device score with additional risk factors
     */
    static enrichDeviceScore(summary) {
        const constituents = summary.constituents;
        if (!constituents || constituents.cveCount === 0) {
            return { score: summary.score, constituents: summary.constituents || {}, enrichmentFactors: {} };
        }
        
        // Base calculation: CVSS × EPSS
        let riskFactor = constituents.maxCvssNormalized * constituents.maxEpssStored;
        
        // Check if any CVE is a known exploit
        const hasKnownExploit = false; // Updated when we have CVE details
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
     * Get severity weight for scoring
     */
    static severityWeight(sev) {
        const s = (sev || '').toUpperCase();
        if (s === 'CRITICAL') return 3;
        if (s === 'HIGH') return 2;
        if (s === 'MEDIUM') return 1;
        if (s === 'LOW') return 0.5;
        return 0;
    }

    /**
     * Convert severity to CVSS estimate
     */
    static cvssFromWorstSeverity(sev) {
        const s = (sev || '').toUpperCase();
        if (s === 'CRITICAL') return 9.5;
        if (s === 'HIGH') return 7.5;
        if (s === 'MEDIUM') return 5.0;
        if (s === 'LOW') return 2.5;
        return null;
    }

    /**
     * Get severity label from weight
     */
    static severityLabelFromWeight(weight) {
        if (weight >= 3) return 'CRITICAL';
        if (weight >= 2) return 'HIGH';
        if (weight >= 1) return 'MEDIUM';
        if (weight > 0) return 'LOW';
        return 'LOW';
    }
}
