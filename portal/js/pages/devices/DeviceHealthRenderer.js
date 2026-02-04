/**
 * Device Health & Risk Rendering Helpers
 * Unified components for displaying device health, risk, and patch compliance
 * Consumes new API fields: health, risk, patchCompliance
 */

export function renderHealthStatus(device) {
    if (!device) {
        return { status: 'unknown', icon: '?', color: 'secondary', text: 'Unknown' };
    }

    // Calculate health from device's lastHeartbeat, lastTelemetry, and inactiveMinutes
    const inactiveMinutes = device.inactiveMinutes || 0;
    const lastHeartbeat = device.lastHeartbeat ? new Date(device.lastHeartbeat) : null;
    const lastTelemetry = device.lastTelemetry ? new Date(device.lastTelemetry) : null;
    const state = (device.state || '').toLowerCase();
    
    let status, icon, color, text, animated, reason;
    
    if (state === 'blocked') {
        status = 'blocked';
        icon = '⊘';
        color = 'dark';
        text = 'Blocked';
        animated = false;
        reason = 'Device is blocked';
    } else if (!lastHeartbeat) {
        status = 'error';
        icon = '!';
        color = 'danger';
        text = 'Error';
        animated = false;
        reason = 'No heartbeat data';
    } else if (lastHeartbeat && lastTelemetry && Math.abs((lastHeartbeat.getTime() - lastTelemetry.getTime()) / 60000) > 30) {
        status = 'error';
        icon = '!';
        color = 'danger';
        text = 'Error';
        animated = false;
        reason = 'Heartbeat/telemetry mismatch';
    } else if (inactiveMinutes > 30) {
        status = 'offline';
        icon = '●';
        color = 'danger';
        text = 'Offline';
        animated = false;
        reason = `Last seen ${inactiveMinutes}m ago`;
    } else {
        status = 'online';
        icon = '●';
        color = 'success';
        text = 'Online';
        animated = true;
        reason = 'Active';
    }

    return {
        status,
        icon,
        color,
        text,
        animated,
        reason,
        lastActivityMinutes: inactiveMinutes,
        score: null,
        grade: null
    };
}

export function renderRiskIndicator(device) {
    // Calculate risk from device summary (apps, CVEs)
    const summary = device.summary || device.Summary;
    
    // Return null score if no summary data available
    if (!summary) {
        return {
            score: null,
            severity: 'UNKNOWN',
            badge: 'bg-secondary',
            trend7d: 0,
            trend30d: 0,
            trajectory: 'stable',
            criticalCves: 0,
            highCves: 0,
            mediumCves: 0,
            lowCves: 0,
            vulnerableApps: 0,
            patchCompliance: null
        };
    }
    
    const appCount = summary.appCount || summary.AppCount || 0;
    const cveCount = summary.cveCount || summary.CveCount || 0;
    const criticalCves = summary.criticalCveCount || summary.CriticalCveCount || 0;
    const highCves = summary.highCveCount || summary.HighCveCount || 0;
    const mediumCves = summary.mediumCveCount || summary.MediumCveCount || 0;
    const lowCves = summary.lowCveCount || summary.LowCveCount || 0;
    const vulnerableApps = summary.vulnerableAppCount || summary.VulnerableAppCount || 0;
    
    // Calculate risk score (0-100, where 100 = WORST)
    // Formula: weighted by severity + vulnerable app ratio
    let riskScore = 0;
    if (appCount > 0) {
        const vulnAppRatio = vulnerableApps / appCount;
        riskScore = (criticalCves * 10) + (highCves * 5) + (mediumCves * 2) + (lowCves * 0.5);
        riskScore += (vulnAppRatio * 30); // Vulnerable app ratio contributes up to 30 points
        riskScore = Math.min(100, Math.round(riskScore));
    }
    
    // Severity based on score (INVERTED: 100 = WORST)
    const severity = riskScore >= 80 ? 'CRITICAL' :
                    riskScore >= 60 ? 'HIGH' :
                    riskScore >= 40 ? 'MEDIUM' : 'LOW';

    const badge = severity === 'CRITICAL' ? 'bg-danger' :
                 severity === 'HIGH' ? 'bg-warning' :
                 severity === 'MEDIUM' ? 'bg-info' :
                 'bg-success';

    return {
        score: riskScore,
        severity,
        badge,
        trend7d: 0,
        trend30d: 0,
        trajectory: 'stable',
        criticalCves,
        highCves,
        mediumCves,
        lowCves,
        vulnerableApps,
        patchCompliance: null
    };
}

export function renderPatchStatus(device) {
    // Calculate patch compliance from device summary
    const summary = device.summary || device.Summary;
    
    // Return null if no summary data available
    if (!summary) {
        return { 
            compliant: false, 
            percent: null, 
            pending: null, 
            badge: 'bg-secondary-lt',
            text: 'No data',
            trend7d: null,
            lastScan: null
        };
    }
    
    const appCount = summary.appCount || summary.AppCount || 0;
    const vulnerableApps = summary.vulnerableAppCount || summary.VulnerableAppCount || 0;
    const cveCount = summary.cveCount || summary.CveCount || 0;
    
    if (appCount === 0) {
        return { 
            compliant: false, 
            percent: null, 
            pending: null, 
            badge: 'bg-secondary-lt',
            text: 'No apps',
            trend7d: null,
            lastScan: null
        };
    }
    
    // Formula: Patch % = ((total apps - vulnerable apps) / total apps) * 100
    // Adjusted down by CVE density (more CVEs = worse compliance)
    const baseCompliance = ((appCount - vulnerableApps) / appCount) * 100;
    const cveDensity = cveCount / appCount; // CVEs per app
    const cvePenalty = Math.min(30, cveDensity * 10); // Up to 30% penalty
    const patchPercent = Math.max(0, Math.round(baseCompliance - cvePenalty));
    
    const badge = patchPercent >= 90 ? 'bg-success-lt' :
                 patchPercent >= 75 ? 'bg-info-lt' :
                 patchPercent >= 50 ? 'bg-warning-lt' :
                 'bg-danger-lt';

    return {
        compliant: patchPercent >= 90,
        percent: patchPercent,
        pending: vulnerableApps,
        badge,
        text: `${patchPercent}% Patched`,
        trend7d: null,
        lastScan: summary.lastScanTime || null
    };
}

export function getStatusDotClass(health) {
    if (!health) return 'status-dot status-secondary';

    const map = {
        'online': 'status-dot status-dot-animated status-green',
        'offline': 'status-dot status-red',
        'blocked': 'status-dot status-dark',
        'error': 'status-dot status-red',
        'unknown': 'status-dot status-secondary'
    };

    return map[health.status] || 'status-dot status-secondary';
}

export function getTrendIcon(trendValue) {
    if (trendValue > 5) return '↑';      // Worsening
    if (trendValue < -5) return '↓';     // Improving
    return '→';                           // Stable
}

export function getTrendColor(trendValue) {
    if (trendValue > 5) return 'danger';  // Worsening
    if (trendValue < -5) return 'success'; // Improving
    return 'muted';                       // Stable
}

export function getTrendClass(trendValue) {
    if (trendValue > 5) return 'text-danger';
    if (trendValue < -5) return 'text-success';
    return 'text-muted';
}

export function isVersionOutdated(currentVersion, latestVersion) {
    if (!currentVersion || !latestVersion) return false;
    
    // Parse version strings (e.g., "26.10.44095.0")
    const parseCurrent = currentVersion.split('.').map(v => parseInt(v) || 0);
    const parseLatest = latestVersion.split('.').map(v => parseInt(v) || 0);
    
    // Compare major.minor.build
    for (let i = 0; i < 3; i++) {
        const c = parseCurrent[i] || 0;
        const l = parseLatest[i] || 0;
        if (c < l) return true;
        if (c > l) return false;
    }
    
    return false;
}
