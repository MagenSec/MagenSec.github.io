import { api } from '@api';
import { nvdCveCache } from '../utils/nvdCveCache.js';
import { metricPhrase, metricTitle } from '../utils/metricUnits.js';

const { html } = window;

export function formatFriendlyDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? '—'
        : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function safeHostname(url) {
    try { return new URL(url).hostname; } catch { return ''; }
}

function dedupeReferences(refs = []) {
    const seen = new Set();
    return refs.filter(ref => {
        const url = ref?.url || ref?.Url || '';
        const title = ref?.title || ref?.Title || '';
        const key = `${url}|${title}`;
        if (!url || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function getSeverityBadgeClass(severity) {
    if (!severity) return 'bg-secondary-lt text-secondary';
    const s = String(severity).toLowerCase();
    if (s === 'critical') return 'bg-danger text-white';
    if (s === 'high') return 'bg-warning text-white';
    if (s === 'medium') return 'bg-info text-white';
    if (s === 'low') return 'bg-success text-white';
    return 'bg-secondary text-white';
}

export function getSeverityColor(severity) {
    if (!severity) return '#0d6efd';
    const s = String(severity).toLowerCase();
    if (s === 'critical') return '#d63939';
    if (s === 'high') return '#f76707';
    if (s === 'medium') return '#0054a6';
    if (s === 'low') return '#2fb344';
    return '#6c757d';
}

export function formatScore(score) {
    if (score === null || score === undefined || score === '') return 'N/A';
    return typeof score === 'number' ? score.toFixed(1) : String(score);
}

/**
 * Reverse-derive a severity label from a CVSS base score using the standard CVSS v3.x bands.
 * Used when MSRC has CVSS but the org-scoped detail call has no severity (OS-level CVE, etc.).
 */
export function severityFromCvss(score) {
    if (score === null || score === undefined || score === '') return 'Unknown';
    const n = Number(score);
    if (!Number.isFinite(n)) return 'Unknown';
    if (n >= 9.0) return 'Critical';
    if (n >= 7.0) return 'High';
    if (n >= 4.0) return 'Medium';
    if (n > 0) return 'Low';
    return 'Unknown';
}

export function buildInventoryFilter(app) {
    const parts = [];
    if (app?.appName) parts.push(`app:${app.appName}`);
    if (app?.vendor) parts.push(`vendor:${app.vendor}`);
    const version = app?.vulnerableVersions?.[0];
    if (version) parts.push(`version:${version}`);
    return parts.join('|');
}

export function buildMagenSecRemediationChecklist(cveData) {
    if (!cveData) return [];
    const deviceCount = cveData.impact?.totalDevices ?? cveData.affectedDevices?.length ?? 0;
    const appCount = cveData.impact?.totalApplications ?? cveData.affectedApplications?.length ?? 0;
    return [
        `Use MagenSec to scope the blast radius: ${deviceCount} affected device${deviceCount === 1 ? '' : 's'} across ${appCount} affected application${appCount === 1 ? '' : 's'}.`,
        cveData.hasExploit
            ? 'Treat this as urgent: exploitation intelligence is present, so prioritize the vendor-approved mitigation or patch in the next safe change window.'
            : 'Prioritize the affected applications by business criticality and your next approved change window.',
        'Apply the vendor patch, workaround, or compensating control through the customer’s normal change process — MagenSec guides and verifies, but does not auto-patch endpoints.',
        'After the change, refresh signals in MagenSec, confirm the vulnerable version is gone from Inventory or Devices, and use Time Warp to show the risk trend improved over time.'
    ].filter(Boolean);
}

export async function loadCveDetailsData(orgId, cveId) {
    if (!orgId || !cveId) {
        throw new Error('Organization or CVE identifier is missing');
    }

    // Four parallel calls:
    //   1. Org-scoped CVE detail (apps + devices) — the historical 'application vuln' path
    //   2. NVD cache lookup (CVSS/description/refs)
    //   3. Devices list (for ID → name resolution)
    //   4. MSRC enrichment (Microsoft-side context: title, impact types, fix matrix). This
    //      lights up the modal for KB-MISSING / OS-level vulnerabilities that the application
    //      scan path can't see.
    const [detailResp, nvdData, devicesResp, msrcResp] = await Promise.all([
        api.get(`/api/v1/orgs/${orgId}/cve/${encodeURIComponent(cveId)}`).catch(() => null),
        nvdCveCache.get(cveId).catch(() => null),
        api.getDevices(orgId).catch(() => ({ success: false, data: [] })),
        api.getMsrcCveDetail?.(orgId, cveId).catch(() => null) ?? Promise.resolve(null)
    ]);

    let cveInfo = detailResp?.success && detailResp?.data ? detailResp.data : null;

    if (!cveInfo) {
        const fallbackResp = await api.get(`/api/v1/orgs/${orgId}/insights?cves=${encodeURIComponent(cveId)}`);
        if (fallbackResp.success && fallbackResp.data?.cves?.length > 0) {
            cveInfo = fallbackResp.data.cves[0];
        }
    }

    // MSRC fallback — if the org-scoped detail call returned nothing (typical for
    // OS-level CVEs that never matched an installed application), we still want to
    // open the modal as long as MSRC has SOMETHING to say about this CVE id.
    const msrc = msrcResp?.success ? msrcResp.data : null;
    if (!cveInfo && msrc?.found) {
        cveInfo = {
            cveId,
            severity: severityFromCvss(msrc.maxCvss),
            cvssScore: msrc.maxCvss,
            description: msrc.title || '',
            isKev: msrc.isExploited,
            affectedApplications: [],
            affectedDevices: [],
            references: [{ source: 'MSRC', url: msrc.msrcUrl }]
        };
    }

    if (!cveInfo) {
        throw new Error(detailResp?.message || 'Failed to load CVE details');
    }

    const deviceMap = {};
    const deviceRows = devicesResp?.data?.devices || devicesResp?.data || [];
    for (const device of (Array.isArray(deviceRows) ? deviceRows : [])) {
        if (device?.deviceId) deviceMap[device.deviceId] = device.deviceName || device.deviceId;
    }

    const mergedReferences = dedupeReferences([
        ...(cveInfo.references || []).map(ref => ({ title: ref.title || ref.Title || ref.source || 'Reference', url: ref.url || ref.Url })),
        ...((nvdData?.references || []).map(ref => ({ title: ref.source || ref.title || 'NVD reference', url: ref.url })) || [])
    ]);

    const affectedApplications = (cveInfo.affectedApplications || []).map(app => ({
        appName: app.appName || app.AppName,
        vendor: app.vendor || app.Vendor || '',
        vulnerableVersions: app.vulnerableVersions || app.versions || app.Versions || [],
        deviceCount: app.deviceCount || (app.devices ? app.devices.length : 0)
    }));

    const affectedDevices = (cveInfo.affectedDevices || []).map(device => {
        const deviceId = device.deviceId || device.DeviceId;
        return {
            deviceId,
            deviceName: device.deviceName || device.DeviceName || deviceMap[deviceId] || deviceId,
            deviceState: device.deviceState || device.DeviceState || 'UNKNOWN',
            alertState: device.alertState || device.AlertState || 'OPEN',
            openAlerts: device.openAlerts || device.OpenAlerts || 0,
            lastSeen: device.lastSeen || device.LastSeen,
            affectedApps: device.affectedApps || device.affectedApplications || device.AffectedApps || []
        };
    });

    return {
        cveId: cveInfo.cveId || cveId,
        severity: cveInfo.severity,
        cvssScore: cveInfo.cvssScore ?? nvdData?.cvssV40 ?? nvdData?.cvssV31,
        epssScore: cveInfo.epssScore,
        epssPercentile: cveInfo.epssPercentile,
        description: cveInfo.description || nvdData?.description || '',
        published: nvdData?.published || cveInfo.published,
        updated: nvdData?.lastModified || cveInfo.lastUpdated || cveInfo.updated || cveInfo.published,
        hasExploit: cveInfo.isKev ?? cveInfo.hasExploit ?? cveInfo.knownExploit,
        ransomwareAssociated: cveInfo.ransomwareAssociated,
        affectedApplications,
        affectedDevices,
        impact: cveInfo.impact || {
            totalDevices: affectedDevices.length,
            totalApplications: affectedApplications.length,
            totalOpenAlerts: affectedDevices.reduce((sum, device) => sum + (device.openAlerts || 0), 0),
            hasActiveExposure: affectedDevices.some(device => (device.openAlerts || 0) > 0)
        },
        threatIntelligence: {
            published: nvdData?.published || cveInfo.published,
            lastUpdated: nvdData?.lastModified || cveInfo.lastUpdated || cveInfo.updated,
            references: mergedReferences,
            hasExploit: cveInfo.isKev ?? cveInfo.hasExploit,
            epssScore: cveInfo.epssScore,
            epssPercentile: cveInfo.epssPercentile
        },
        remediationGuidance: cveInfo.remediationGuidance || '',
        references: mergedReferences,
        patches: cveInfo.patches || [],
        msrc: msrc && msrc.found ? msrc : null
    };
}

export function CveDetailsContent({
    cveData,
    loading = false,
    error = null,
    activeTab = 'overview',
    onTabChange = () => {},
    selectedRemediationApp = '',
    onSelectRemediationApp = () => {},
    onNavigate = null
}) {
    const remediationChecklist = cveData ? buildMagenSecRemediationChecklist(cveData) : [];
    const displayRemediationGuidance = cveData?.remediationGuidance && !/run vulnerability scanner|vulnerability scanning tool/i.test(cveData.remediationGuidance)
        ? cveData.remediationGuidance
        : '';

    const goToInventory = (filter) => {
        if (!filter) return;
        window.location.hash = `#!/inventory?filter=${encodeURIComponent(filter)}`;
        onNavigate?.();
    };

    if (loading && !cveData) {
        return html`
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" role="status"></div>
                <div class="text-muted">Loading CVE details...</div>
            </div>
        `;
    }

    if (error && !cveData) {
        return html`<div class="alert alert-danger"><strong>Error:</strong> ${error}</div>`;
    }

    if (!cveData) {
        return html`<div class="alert alert-warning">CVE details not available.</div>`;
    }

    return html`
        <ul class="nav nav-tabs mb-3">
            ${['overview', 'impact', 'intelligence', 'remediation'].map(tab => html`
                <li class="nav-item">
                    <a
                        class=${`nav-link ${activeTab === tab ? 'active' : ''}`}
                        href="#"
                        onClick=${(e) => { e.preventDefault(); onTabChange(tab); }}>
                        ${tab === 'impact' ? 'Your Impact' : tab === 'intelligence' ? 'Threat Intel' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </a>
                </li>
            `)}
        </ul>

        ${activeTab === 'overview' && html`
            <div class="row row-cards mb-4">
                <div class="col-sm-6 col-lg-3">
                    <div class="card"><div class="card-body">
                        <div class="text-muted small text-uppercase fw-semibold mb-1">CVSS Score</div>
                        <div class="d-flex align-items-baseline">
                            <div class="h2 mb-0 me-2" style=${`color:${getSeverityColor(cveData.severity)}`}>${formatScore(cveData.cvssScore)}</div>
                            <div class="ms-auto"><span class=${`badge ${getSeverityBadgeClass(cveData.severity)}`}>${cveData.severity || 'Unknown'}</span></div>
                        </div>
                        <div class="progress progress-sm mt-2"><div class="progress-bar" style=${`background-color:${getSeverityColor(cveData.severity)};width:${((Number(cveData.cvssScore) || 0) / 10) * 100}%`}></div></div>
                    </div></div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card"><div class="card-body">
                        <div class="text-muted small text-uppercase fw-semibold mb-1">EPSS Score</div>
                        <div class="h2 mb-0">${formatScore((cveData.epssScore ?? 0) * 100)}%</div>
                        <div class="progress progress-sm mt-2"><div class="progress-bar bg-warning" style=${`width:${(cveData.epssScore ?? 0) * 100}%`}></div></div>
                        <div class="text-muted small mt-2">
                            ${cveData.epssPercentile ? `Top ${(100 - (cveData.epssPercentile * 100)).toFixed(1)}% most likely to be exploited` : 'Probability of exploitation'}
                        </div>
                    </div></div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card"><div class="card-body">
                        <div class="text-muted small text-uppercase fw-semibold mb-1">Affected Apps</div>
                        <div class="h2 mb-0 text-primary">${cveData.affectedApplications?.length || 0}</div>
                        <div class="text-muted small mt-2">Vulnerable applications</div>
                    </div></div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card"><div class="card-body">
                        <div class="text-muted small text-uppercase fw-semibold mb-1">Exploit Status</div>
                        <div class="h3 mb-0" style=${`color:${cveData.hasExploit ? '#d63939' : '#2fb344'}`}>${cveData.hasExploit ? 'Known exploit' : 'Observed risk'}</div>
                        <div class="text-muted small mt-2">${cveData.hasExploit ? 'Active exploitation intelligence is present' : 'No direct KEV signal in the current feed'}</div>
                    </div></div>
                </div>
            </div>

            ${cveData.hasExploit ? html`
                <div class="alert alert-danger mb-3">
                    <strong>⚠ Active Exploitation Detected</strong>
                    <div class="small mt-1">This vulnerability is listed in active-exploitation intelligence. Immediate remediation is recommended.</div>
                </div>
            ` : ''}

            ${displayRemediationGuidance ? html`
                <div class="alert alert-info mb-3">
                    <strong>Remediation Guidance</strong>
                    <div class="small mt-1">${displayRemediationGuidance}</div>
                </div>
            ` : ''}

            <div class="card mb-3"><div class="card-body">
                <h5>Description</h5>
                <p class="text-muted mb-0">${cveData.description || 'No description available'}</p>
            </div></div>

            ${cveData.msrc ? html`
                <div class="card mb-3 cve-msrc-card">
                    <div class="card-header d-flex flex-wrap align-items-center gap-2">
                        <h3 class="card-title mb-0">
                            <i class="ti ti-shield-lock me-1"></i>
                            Microsoft Security Response Center
                        </h3>
                        ${cveData.msrc.isExploited ? html`
                            <span class="badge bg-danger text-white">
                                <i class="ti ti-flame me-1"></i>Exploited in the wild
                            </span>
                        ` : ''}
                        <a href=${cveData.msrc.msrcUrl}
                           target="_blank" rel="noopener"
                           class="btn btn-sm btn-outline-primary ms-auto">
                            <i class="ti ti-external-link me-1"></i>Open MSRC update guide
                        </a>
                    </div>
                    <div class="card-body">
                        ${cveData.msrc.title ? html`
                            <div class="mb-3">
                                <div class="text-muted small text-uppercase fw-semibold mb-1">Vulnerability</div>
                                <div class="fw-bold">${cveData.msrc.title}</div>
                            </div>
                        ` : ''}

                        <div class="row row-cards mb-3">
                            ${cveData.msrc.maxCvss ? html`
                                <div class="col-sm-4">
                                    <div class="text-muted small text-uppercase fw-semibold mb-1">CVSS</div>
                                    <div class="fw-bold">${formatScore(cveData.msrc.maxCvss)}</div>
                                    ${cveData.msrc.cvssVector ? html`<code class="small text-muted">${cveData.msrc.cvssVector}</code>` : ''}
                                </div>
                            ` : ''}
                            ${cveData.msrc.impactTypes?.length ? html`
                                <div class="col-sm-4">
                                    <div class="text-muted small text-uppercase fw-semibold mb-1">Impact</div>
                                    <div class="d-flex flex-wrap gap-1">
                                        ${cveData.msrc.impactTypes.map(impact => html`
                                            <span class="badge bg-secondary-lt text-secondary">${impact}</span>
                                        `)}
                                    </div>
                                </div>
                            ` : ''}
                            <div class="col-sm-4">
                                <div class="text-muted small text-uppercase fw-semibold mb-1">Affected products</div>
                                <div class="fw-bold">${cveData.msrc.productCount ?? cveData.msrc.affected?.length ?? 0}</div>
                                <div class="small text-muted">${cveData.msrc.affected?.length ?? 0} fix${(cveData.msrc.affected?.length ?? 0) === 1 ? '' : 'es'} available</div>
                            </div>
                        </div>

                        ${(cveData.msrc.affected?.length || 0) > 0 ? html`
                            <div class="table-responsive">
                                <table class="table table-sm table-vcenter cve-msrc-table mb-0">
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th>Severity</th>
                                            <th>KB</th>
                                            <th>Fixed build</th>
                                            <th>Released</th>
                                            <th class="text-end">Links</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${cveData.msrc.affected.map(row => html`
                                            <tr>
                                                <td>
                                                    <div class="fw-medium">${row.productName || row.productId}</div>
                                                    ${row.productId && row.productId !== row.productName ? html`<div class="small text-muted">${row.productId}</div>` : ''}
                                                </td>
                                                <td><span class="badge ${getSeverityBadgeClass(row.severity)}">${row.severity || 'Unknown'}</span></td>
                                                <td><code>KB${String(row.kb || '').replace(/^kb/i, '')}</code></td>
                                                <td>${row.fixedBuild || '—'}</td>
                                                <td>${row.releaseDate ? formatFriendlyDate(row.releaseDate) : (row.monthId || '—')}</td>
                                                <td class="text-end">
                                                    ${row.advisoryUrl ? html`
                                                        <a href=${row.advisoryUrl} target="_blank" rel="noopener" class="btn btn-sm btn-outline-secondary me-1" title="Microsoft Update Catalog">
                                                            <i class="ti ti-package"></i>
                                                        </a>
                                                    ` : ''}
                                                    ${row.catalogUrl && row.catalogUrl !== row.advisoryUrl ? html`
                                                        <a href=${row.catalogUrl} target="_blank" rel="noopener" class="btn btn-sm btn-outline-secondary" title="Search the Update Catalog for this KB">
                                                            <i class="ti ti-search"></i>
                                                        </a>
                                                    ` : ''}
                                                </td>
                                            </tr>
                                        `)}
                                    </tbody>
                                </table>
                            </div>
                        ` : html`<div class="text-muted small">MSRC has no fix matrix recorded for this CVE.</div>`}
                    </div>
                </div>
            ` : ''}

            <div class="row row-cards">
                <div class="col-md-6"><div class="card"><div class="card-body"><span class="text-muted">Published</span><div class="fw-bold">${formatFriendlyDate(cveData.published)}</div></div></div></div>
                <div class="col-md-6"><div class="card"><div class="card-body"><span class="text-muted">Last Updated</span><div class="fw-bold">${formatFriendlyDate(cveData.updated)}</div></div></div></div>
            </div>
        `}

        ${activeTab === 'impact' && html`
            ${(cveData.affectedApplications?.length || 0) > 0 ? html`
                <div class="card mb-3">
                    <div class="card-header"><h3 class="card-title">${metricTitle('vulnerableApps')} (${cveData.affectedApplications.length})</h3></div>
                    <div class="table-responsive">
                        <table class="table table-vcenter card-table">
                            <thead><tr><th>Application</th><th>Vendor</th><th>Vulnerable Versions</th><th class="text-end">${metricTitle('affectedDevices')}</th></tr></thead>
                            <tbody>
                                ${cveData.affectedApplications.map(app => html`
                                    <tr>
                                        <td class="fw-medium">${app.appName || 'Unknown'}</td>
                                        <td class="text-muted">${app.vendor || 'N/A'}</td>
                                        <td class="text-muted small">${(app.vulnerableVersions || []).join(', ') || 'Version not specified'}</td>
                                        <td class="text-end"><span class="badge bg-primary text-white">${app.deviceCount || 0}</span></td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </div>
                </div>
            ` : html`<div class="alert alert-info mb-3">No affected applications detected.</div>`}

            ${(cveData.affectedDevices?.length || 0) > 0 ? html`
                <div class="card">
                    <div class="card-header"><h3 class="card-title">${metricTitle('affectedDevices')} (${cveData.affectedDevices.length})</h3></div>
                    <div class="list-group list-group-flush">
                        ${cveData.affectedDevices.map(device => html`
                            <a href=${`#!/devices/${encodeURIComponent(device.deviceId)}`} class="list-group-item list-group-item-action" onClick=${() => onNavigate?.()}>
                                <div class="d-flex align-items-center gap-3">
                                    <span class="avatar avatar-sm bg-danger-lt text-danger">${(device.deviceName || 'D').substring(0, 2).toUpperCase()}</span>
                                    <div class="flex-fill min-w-0">
                                        <div class="fw-medium">${device.deviceName || device.deviceId}</div>
                                        ${device.deviceName && device.deviceName !== device.deviceId ? html`<div class="text-muted small">${device.deviceId}</div>` : ''}
                                        ${(device.affectedApps || []).length > 0 ? html`<div class="text-muted small mt-1">${device.affectedApps.join(', ')}</div>` : ''}
                                    </div>
                                    <div class="d-flex flex-column align-items-end gap-1">
                                        <span class=${`badge bg-${device.deviceState === 'ACTIVE' ? 'success' : device.deviceState === 'DISABLED' ? 'secondary' : 'danger'} text-white`}>${device.deviceState || 'UNKNOWN'}</span>
                                        <span class=${`badge bg-${device.alertState === 'OPEN' ? 'danger' : device.alertState === 'SUPPRESSED' ? 'warning' : 'secondary'} text-white`}>${device.alertState || 'OPEN'}</span>
                                    </div>
                                </div>
                            </a>
                        `)}
                    </div>
                </div>
            ` : html`<div class="alert alert-info">No affected devices detected.</div>`}
        `}

        ${activeTab === 'intelligence' && html`
            <div class="row row-cards mb-3">
                <div class="col-sm-4"><div class="card"><div class="card-body p-3"><div class="text-muted small text-uppercase fw-semibold mb-1">Exploitation Signal</div><div class="h3 mb-1">${cveData.hasExploit ? 'Active' : 'Observed risk'}</div><div class="text-muted small">${cveData.hasExploit ? 'Listed in KEV or active exploit intelligence' : 'No direct KEV evidence in the current feed'}</div></div></div></div>
                <div class="col-sm-4"><div class="card"><div class="card-body p-3"><div class="text-muted small text-uppercase fw-semibold mb-1">Org Exposure</div><div class="h3 mb-1">${metricPhrase('affectedDevices', cveData.impact?.totalDevices ?? cveData.affectedDevices?.length ?? 0)}</div><div class="text-muted small">${metricPhrase('vulnerableApps', cveData.impact?.totalApplications ?? cveData.affectedApplications?.length ?? 0)} currently in scope</div></div></div></div>
                <div class="col-sm-4"><div class="card"><div class="card-body p-3"><div class="text-muted small text-uppercase fw-semibold mb-1">Timeline</div><div class="small"><strong>Published:</strong> ${formatFriendlyDate(cveData.published)}</div><div class="small"><strong>Updated:</strong> ${formatFriendlyDate(cveData.updated)}</div></div></div></div>
            </div>

            <div class="card mb-3"><div class="card-body">
                <h5 class="mb-2">Why this matters in our environment</h5>
                <ul class="mb-0 text-muted small">
                    <li><strong>Severity:</strong> ${cveData.severity || 'Unknown'} with CVSS ${formatScore(cveData.cvssScore)}.</li>
                    <li><strong>Exploitability:</strong> EPSS ${formatScore((cveData.epssScore ?? 0) * 100)}%${cveData.epssPercentile ? ` (percentile ${(cveData.epssPercentile * 100).toFixed(1)}%)` : ''}.</li>
                    <li><strong>Operational scope:</strong> ${(cveData.impact?.totalDevices ?? cveData.affectedDevices?.length ?? 0)} device(s) and ${(cveData.impact?.totalApplications ?? cveData.affectedApplications?.length ?? 0)} app(s) are currently exposed.</li>
                    <li><strong>Use MagenSec:</strong> prioritize which systems to patch first, validate compensating controls, and track improvement over time.</li>
                </ul>
            </div></div>

            <div class="card"><div class="card-header"><h3 class="card-title">Official Sources & Research</h3></div><div class="list-group list-group-flush">
                ${(cveData.references || []).length > 0 ? cveData.references.map(ref => html`
                    <a href="${ref.url}" target="_blank" rel="noopener" class="list-group-item list-group-item-action small">
                        <div class="d-flex align-items-center justify-content-between gap-2">
                            <div class="min-w-0">
                                <div class="fw-medium text-truncate">${ref.title || safeHostname(ref.url) || 'Reference'}</div>
                                <div class="text-muted text-truncate">${safeHostname(ref.url) || ref.url}</div>
                            </div>
                            <i class="ti ti-external-link text-primary"></i>
                        </div>
                    </a>
                `) : html`<div class="list-group-item text-muted small">No external references were available for this CVE.</div>`}
            </div></div>
        `}

        ${activeTab === 'remediation' && html`
            ${(cveData.affectedApplications?.length || 0) > 0 ? html`
                <div class="card mb-3"><div class="card-body">
                    <div class="text-muted small text-uppercase fw-semibold mb-2">Jump to affected application</div>
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        <select class="form-select form-select-sm w-auto" value=${selectedRemediationApp} onChange=${(e) => onSelectRemediationApp(e.target.value)}>
                            <option value="">Select application</option>
                            ${cveData.affectedApplications.map(app => {
                                const label = app.vendor ? `${app.appName} · ${app.vendor}` : app.appName;
                                return html`<option value=${buildInventoryFilter(app)}>${label}</option>`;
                            })}
                        </select>
                        <button class="btn btn-sm btn-primary" disabled=${!selectedRemediationApp} onClick=${() => goToInventory(selectedRemediationApp)}>
                            <i class="ti ti-arrow-right me-1"></i>Open Inventory
                        </button>
                    </div>
                    <div class="text-muted small mt-2">Opens inventory filtered by app, vendor, and version.</div>
                </div></div>
            ` : ''}

            <div class="card mb-3"><div class="card-body">
                <div class="text-muted small text-uppercase fw-semibold mb-2">Recommended workflow in MagenSec</div>
                <ol class="text-muted small mb-0">${remediationChecklist.map(step => html`<li>${step}</li>`)}</ol>
            </div></div>

            ${cveData.patches?.length > 0 ? html`
                <div class="card mb-3"><div class="card-header"><h3 class="card-title">Available Patches</h3></div><div class="list-group list-group-flush">
                    ${cveData.patches.map((patch, idx) => html`
                        <div class="list-group-item">
                            <div class="d-flex align-items-start gap-2">
                                <span class="badge bg-success text-white">P${idx + 1}</span>
                                <div class="flex-fill">
                                    <div class="fw-medium">${patch.version || patch.title}</div>
                                    ${patch.releaseDate ? html`<div class="text-muted small">Released: ${formatFriendlyDate(patch.releaseDate)}</div>` : ''}
                                </div>
                            </div>
                        </div>
                    `)}
                </div></div>
            ` : ''}

            <div class="alert alert-info small mt-3">
                <strong>Validation tip:</strong> After the customer applies the change, use Inventory, Devices, and the vulnerabilities page to confirm the exposed version is gone and the active finding drops out.
            </div>
        `}
    `;
}
