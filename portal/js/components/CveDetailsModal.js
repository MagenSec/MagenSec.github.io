/**
 * CVE Details Modal - Displays comprehensive vulnerability information
 * Features:
 * - Severity and CVSS/EPSS scores
 * - Exploit availability (KEV status)
 * - Threat intelligence from multiple sources
 * - Affected devices and applications
 * - Remediation guidance
 */

import { api } from '@api';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

export function CveDetailsModal({ cveId, orgId, isOpen, onClose }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [cveData, setCveData] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedRemediationApp, setSelectedRemediationApp] = useState('');

    useEffect(() => {
        if (isOpen && cveId && orgId) {
            loadCveDetails();
        }
    }, [isOpen, cveId, orgId]);

    const loadCveDetails = async () => {
        setLoading(true);
        setError(null);
        try {
            // Call new /insights endpoint with CVE ID
            const response = await api.get(`/api/v1/orgs/${orgId}/insights?cves=${cveId}`);
            if (response.success && response.data && response.data.cves && response.data.cves.length > 0) {
                // Extract the first CVE from the array (since we're querying single CVE)
                const cveInfo = response.data.cves[0];
                
                // Map new data structure to expected format
                const mappedData = {
                    cveId: cveInfo.cveId,
                    severity: cveInfo.severity,
                    cvssScore: cveInfo.cvssScore,
                    epssScore: cveInfo.epssScore,
                    epssPercentile: cveInfo.epssPercentile,
                    description: cveInfo.description,
                    published: cveInfo.published,
                    updated: cveInfo.updated || cveInfo.published,
                    hasExploit: cveInfo.hasExploit,
                    ransomwareAssociated: cveInfo.ransomwareAssociated,
                    affectedApplications: (cveInfo.affectedApplications || []).map(app => ({
                        appName: app.appName || app.AppName,
                        vendor: app.vendor || app.Vendor || '',
                        vulnerableVersions: app.vulnerableVersions || app.versions || app.Versions || [],
                        deviceCount: app.deviceCount || (app.devices ? app.devices.length : 0)
                    })),
                    affectedDevices: (cveInfo.affectedDevices || []).map(device => ({
                        deviceId: device.deviceId || device.DeviceId,
                        deviceName: device.deviceName || device.DeviceName,
                        lastSeen: device.lastSeen || device.LastSeen,
                        affectedApps: device.affectedApps || device.affectedApplications || device.AffectedApps || []
                    })),
                    threatIntelligence: cveInfo.threatIntel || {},
                    remediationGuidance: (cveInfo.threatIntel && cveInfo.threatIntel.remediationGuidance) || '',
                    references: (cveInfo.references || []).map(ref => ({
                        title: ref.title,
                        url: ref.url
                    })),
                    patches: cveInfo.patches || []
                };
                
                setCveData(mappedData);
            } else {
                setError(response.message || 'Failed to load CVE details');
            }
        } catch (err) {
            setError(err.message || 'Error loading CVE details');
            console.error('[CveDetailsModal] Error loading CVE:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const getSeverityBadgeClass = (severity) => {
        if (!severity) return 'bg-secondary-lt text-secondary';
        const s = String(severity).toLowerCase();
        if (s === 'critical') return 'bg-danger-lt text-danger';
        if (s === 'high') return 'bg-warning-lt text-warning';
        if (s === 'medium') return 'bg-info-lt text-info';
        if (s === 'low') return 'bg-success-lt text-success';
        return 'bg-secondary-lt text-secondary';
    };

    const getSeverityColor = (severity) => {
        if (!severity) return '#0d6efd';
        const s = String(severity).toLowerCase();
        if (s === 'critical') return '#dc3545';
        if (s === 'high') return '#fd7e14';
        if (s === 'medium') return '#0dcaf0';
        if (s === 'low') return '#198754';
        return '#6c757d';
    };

    const formatScore = (score) => {
        if (score === null || score === undefined) return 'N/A';
        return typeof score === 'number' ? score.toFixed(1) : score;
    };

    const buildInventoryFilter = (app) => {
        const parts = [];
        if (app?.appName) parts.push(`app:${app.appName}`);
        if (app?.vendor) parts.push(`vendor:${app.vendor}`);
        const version = app?.vulnerableVersions?.[0];
        if (version) parts.push(`version:${version}`);
        return parts.join('|');
    };

    const buildFilterFromApps = (apps) => {
        if (!Array.isArray(apps) || apps.length === 0) return '';
        return apps.map(a => `app:${a}`).join('|');
    };

    const goToInventory = (filter) => {
        if (!filter) return;
        window.location.hash = `#!/inventory?filter=${encodeURIComponent(filter)}`;
        onClose?.();
    };

    return html`
        <div class="modal ${isOpen ? 'show d-block' : ''}" style=${isOpen ? 'background-color: rgba(0,0,0,0.5)' : 'display: none'}>
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <!-- Header -->
                    <div class="modal-header bg-light border-bottom">
                        <div>
                            <h4 class="modal-title mb-1">${cveId}</h4>
                            ${cveData && html`
                                <div class="text-muted small">
                                    <span class="badge ${getSeverityBadgeClass(cveData.severity)}">${cveData.severity}</span>
                                    ${cveData.cvssScore && html`
                                        <span class="ms-2">CVSS ${formatScore(cveData.cvssScore)}</span>
                                    `}
                                    ${cveData.hasExploit && html`
                                        <span class="badge bg-danger-lt text-danger ms-2">
                                            <i class="ti ti-alert-circle me-1"></i>
                                            Known Exploit Available
                                        </span>
                                    `}
                                </div>
                            `}
                        </div>
                        <button 
                            type="button" 
                            class="btn-close" 
                            aria-label="Close" 
                            onClick=${onClose}
                        ></button>
                    </div>

                    <!-- Body -->
                    <div class="modal-body">
                        ${loading && html`
                            <div class="text-center py-5">
                                <div class="spinner-border text-primary mb-3" role="status"></div>
                                <div class="text-muted">Loading CVE details...</div>
                            </div>
                        `}

                        ${error && html`
                            <div class="alert alert-danger">
                                <strong>Error:</strong> ${error}
                            </div>
                        `}

                        ${cveData && !loading && html`
                            <!-- Tabs -->
                            <ul class="nav nav-tabs mb-3">
                                <li class="nav-item">
                                    <a 
                                        class=${`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
                                        href="#"
                                        onClick=${(e) => { e.preventDefault(); setActiveTab('overview'); }}
                                    >
                                        Overview
                                    </a>
                                </li>
                                <li class="nav-item">
                                    <a 
                                        class=${`nav-link ${activeTab === 'impact' ? 'active' : ''}`}
                                        href="#"
                                        onClick=${(e) => { e.preventDefault(); setActiveTab('impact'); }}
                                    >
                                        Your Impact
                                    </a>
                                </li>
                                <li class="nav-item">
                                    <a 
                                        class=${`nav-link ${activeTab === 'intelligence' ? 'active' : ''}`}
                                        href="#"
                                        onClick=${(e) => { e.preventDefault(); setActiveTab('intelligence'); }}
                                    >
                                        Threat Intel
                                    </a>
                                </li>
                                <li class="nav-item">
                                    <a 
                                        class=${`nav-link ${activeTab === 'remediation' ? 'active' : ''}`}
                                        href="#"
                                        onClick=${(e) => { e.preventDefault(); setActiveTab('remediation'); }}
                                    >
                                        Remediation
                                    </a>
                                </li>
                            </ul>

                            <!-- Overview Tab -->
                            ${activeTab === 'overview' && html`
                                <!-- Score Cards -->
                                <div class="row row-cards mb-4">
                                    <!-- CVSS Score -->
                                    <div class="col-sm-6 col-lg-3">
                                        <div class="card">
                                            <div class="card-body">
                                                <div class="text-muted small text-uppercase fw-semibold mb-1">CVSS Score</div>
                                                <div class="d-flex align-items-baseline">
                                                    <div class="h2 mb-0 me-2" style="color: ${getSeverityColor(cveData.severity)};">
                                                        ${formatScore(cveData.cvssScore)}
                                                    </div>
                                                    <div class="ms-auto">
                                                        <span class="badge ${getSeverityBadgeClass(cveData.severity)}">${cveData.severity}</span>
                                                    </div>
                                                </div>
                                                <div class="progress progress-sm mt-2">
                                                    <div class="progress-bar" style="${`background-color: ${getSeverityColor(cveData.severity)}; width: ${(cveData.cvssScore / 10) * 100}%`}"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- EPSS Score -->
                                    <div class="col-sm-6 col-lg-3">
                                        <div class="card">
                                            <div class="card-body">
                                                <div class="text-muted small text-uppercase fw-semibold mb-1">EPSS Score</div>
                                                <div class="h2 mb-0">
                                                    ${formatScore((cveData.epssScore ?? 0) * 100)}%
                                                </div>
                                                <div class="progress progress-sm mt-2">
                                                    <div class="progress-bar bg-warning" style="${`width: ${(cveData.epssScore ?? 0) * 100}%`}"></div>
                                                </div>
                                                ${cveData.epssPercentile ? html`
                                                    <div class="text-muted small mt-2">
                                                        Top ${(100 - (cveData.epssPercentile * 100)).toFixed(1)}% most likely to be exploited
                                                    </div>
                                                ` : html`
                                                    <div class="text-muted small mt-2">Probability of exploitation</div>
                                                `}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Affected Apps -->
                                    <div class="col-sm-6 col-lg-3">
                                        <div class="card">
                                            <div class="card-body">
                                                <div class="text-muted small text-uppercase fw-semibold mb-1">Affected Apps</div>
                                                <div class="h2 mb-0 text-primary">
                                                    ${cveData.affectedApplications?.length || 0}
                                                </div>
                                                <div class="text-muted small mt-2">
                                                    Vulnerable applications
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Exploit Status -->
                                    <div class="col-sm-6 col-lg-3">
                                        <div class="card">
                                            <div class="card-body">
                                                <div class="text-muted small text-uppercase fw-semibold mb-1">Exploit Status</div>
                                                <div class="h2 mb-0" style="color: ${cveData.hasExploit ? '#dc3545' : '#198754'};">
                                                    ${cveData.hasExploit ? html`
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="32" height="32" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <path d="M12 9v4" />
                                                            <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
                                                            <path d="M12 16h.01" />
                                                        </svg>
                                                    ` : html`
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="32" height="32" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <path d="M5 12l5 5l10 -10" />
                                                        </svg>
                                                    `}
                                                </div>
                                                <div class="text-muted small mt-2">
                                                    ${cveData.hasExploit ? 'Known exploit' : 'No known exploit'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Critical Alert Banner -->
                                ${cveData.hasExploit && html`
                                    <div class="alert alert-danger d-flex align-items-center mb-3" role="alert">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                            <path d="M12 9v4" />
                                            <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
                                            <path d="M12 16h.01" />
                                        </svg>
                                        <div class="flex-fill">
                                            <strong>Active Exploitation Detected</strong>
                                            <div class="small mt-1">This vulnerability is listed in CISA KEV catalog. Immediate remediation recommended.</div>
                                        </div>
                                    </div>
                                `}

                                <!-- Remediation Guidance -->
                                ${cveData.remediationGuidance && html`
                                    <div class="alert alert-info mb-3" role="alert">
                                        <h5 class="alert-heading">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-1" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                <path d="M12 8h.01" />
                                                <path d="M11 12h1v4h1" />
                                                <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9z" />
                                            </svg>
                                            Remediation Guidance
                                        </h5>
                                        <p class="mb-0">${cveData.remediationGuidance}</p>
                                    </div>
                                `}

                                <div class="mb-3">
                                    <h5>Description</h5>
                                    <p class="text-muted">${cveData.description || 'No description available'}</p>
                                </div>

                                ${cveData.published && html`
                                    <div class="mb-3">
                                        <div class="row">
                                            <div class="col-6">
                                                <strong>Published:</strong> ${new Date(cveData.published).toLocaleDateString()}
                                            </div>
                                            ${cveData.updated && html`
                                                <div class="col-6">
                                                    <strong>Last Updated:</strong> ${new Date(cveData.updated).toLocaleDateString()}
                                                </div>
                                            `}
                                        </div>
                                    </div>
                                `}

                                ${cveData.references && cveData.references.length > 0 && html`
                                    <div class="mb-3">
                                        <h5>References</h5>
                                        <div class="list-group list-group-sm">
                                            ${cveData.references.map(ref => html`
                                                <a href="${ref.url}" target="_blank" rel="noopener" class="list-group-item list-group-item-action small">
                                                    ${ref.title || ref.url}
                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon ms-2" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                        <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
                                                        <path d="M11 13l9 -9" />
                                                        <path d="M15 4h5v5" />
                                                    </svg>
                                                </a>
                                            `)}
                                        </div>
                                    </div>
                                `}
                            `}

                            <!-- Your Impact Tab -->
                            ${activeTab === 'impact' && html`
                                <div class="mb-4">
                                    <!-- Affected Applications Table -->
                                    ${cveData.affectedApplications && cveData.affectedApplications.length > 0 ? html`
                                        <div class="mb-4">
                                            <h5 class="mb-3">
                                                Affected Applications (${cveData.affectedApplications.length})
                                            </h5>
                                            <div class="table-responsive">
                                                <table class="table table-vcenter table-striped card-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Application</th>
                                                            <th>Vendor</th>
                                                            <th>Vulnerable Versions</th>
                                                            <th class="text-end">Devices</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        ${cveData.affectedApplications.map(app => html`
                                                            <tr>
                                                                <td>
                                                                    <div class="d-flex align-items-center">
                                                                        <span class="avatar avatar-sm me-2 bg-warning-lt">
                                                                            ${(app.appName || 'A').substring(0, 2).toUpperCase()}
                                                                        </span>
                                                                        <strong>${app.appName || 'Unknown'}</strong>
                                                                    </div>
                                                                </td>
                                                                <td class="text-muted">${app.vendor || 'N/A'}</td>
                                                                <td>
                                                                    ${app.vulnerableVersions && app.vulnerableVersions.length > 0 ? html`
                                                                        <div class="d-flex flex-wrap gap-1">
                                                                            ${app.vulnerableVersions.map(version => html`
                                                                                <span class="badge bg-danger-lt text-danger">${version}</span>
                                                                            `)}
                                                                        </div>
                                                                    ` : html`
                                                                        <span class="text-muted small">Version not specified</span>
                                                                    `}
                                                                </td>
                                                                <td class="text-end">
                                                                    <span class="badge bg-primary-lt text-primary">${app.deviceCount || 0}</span>
                                                                </td>
                                                            </tr>
                                                        `)}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ` : html`
                                        <div class="alert alert-info mb-3">No affected applications detected</div>
                                    `}

                                    <!-- Affected Devices List -->
                                    ${cveData.affectedDevices && cveData.affectedDevices.length > 0 ? html`
                                        <div class="mb-3">
                                            <h5 class="mb-3">
                                                Affected Devices (${cveData.affectedDevices.length})
                                            </h5>
                                            <div class="list-group">
                                                ${cveData.affectedDevices.map(device => html`
                                                    <a href=${`#!/inventory?filter=${encodeURIComponent(buildFilterFromApps(device.affectedApps))}`} class="list-group-item list-group-item-action">
                                                        <div class="d-flex align-items-center">
                                                            <span class="avatar avatar-sm me-2 bg-danger-lt">
                                                                ${(device.deviceName || 'D').substring(0, 2).toUpperCase()}
                                                            </span>
                                                            <div class="flex-fill">
                                                                <div class="font-weight-medium">${device.deviceName || device.deviceId}</div>
                                                                ${device.affectedApps && device.affectedApps.length > 0 ? html`
                                                                    <div class="text-muted small">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-xs me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                            <path d="M4 7l.867 12.143a2 2 0 0 0 2 1.857h10.276a2 2 0 0 0 2 -1.857l.867 -12.143h-16z" />
                                                                            <path d="M8.5 7c0 -1.653 1.5 -4 3.5 -4s3.5 2.347 3.5 4" />
                                                                            <path d="M9.5 17c.413 .462 1 1 2.5 1s2.087 -.538 2.5 -1" />
                                                                        </svg>
                                                                        ${device.affectedApps.join(', ')}
                                                                    </div>
                                                                ` : ''}
                                                                ${device.lastSeen && html`
                                                                    <div class="text-muted small">
                                                                        Last seen: ${new Date(device.lastSeen).toLocaleDateString()}
                                                                    </div>
                                                                `}
                                                            </div>
                                                            <div class="text-end">
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon text-muted" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                    <path d="M9 6l6 6l-6 6" />
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    </a>
                                                `)}
                                            </div>
                                        </div>
                                    ` : html`
                                        <div class="alert alert-info">No affected devices detected</div>
                                    `}
                                </div>
                            `}

                            <!-- Threat Intelligence Tab -->
                            ${activeTab === 'intelligence' && html`
                                <div class="mb-4">
                                    ${cveData.hasExploit && html`
                                        <div class="alert alert-danger mb-3">
                                            <strong>⚠️ Known Exploit Available</strong>
                                            <p class="mb-0 mt-2">This vulnerability is listed in the CISA Known Exploited Vulnerabilities (KEV) catalog. Active exploitation has been observed.</p>
                                        </div>
                                    `}

                                    ${cveData.threatIntelligence && html`
                                        <div class="mb-3">
                                            <h5>Threat Activity</h5>
                                            <div class="row g-2">
                                                ${cveData.threatIntelligence.campaigns && html`
                                                    <div class="col-sm-6">
                                                        <div class="card">
                                                            <div class="card-body p-2">
                                                                <div class="text-muted small">Known Campaigns</div>
                                                                <div class="h3 mb-0">${cveData.threatIntelligence.campaigns.length}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                `}
                                                ${cveData.threatIntelligence.firstSeen && html`
                                                    <div class="col-sm-6">
                                                        <div class="card">
                                                            <div class="card-body p-2">
                                                                <div class="text-muted small">First Observed</div>
                                                                <div class="small">${new Date(cveData.threatIntelligence.firstSeen).toLocaleDateString()}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                `}
                                            </div>
                                        </div>
                                    `}

                                    <h5>Threat Sources</h5>
                                    <div class="list-group list-group-sm">
                                        <div class="list-group-item">
                                            <strong>CISA KEV Catalog:</strong> ${cveData.hasExploit ? html`
                                                <span class="badge bg-danger-lt text-danger ms-2">Listed</span>
                                            ` : html`
                                                <span class="badge bg-success-lt text-success ms-2">Not Listed</span>
                                            `}
                                        </div>
                                        ${cveData.ransomwareAssociated && html`
                                            <div class="list-group-item">
                                                <strong>Ransomware Association:</strong>
                                                <span class="badge bg-danger-lt text-danger ms-2">Associated</span>
                                            </div>
                                        `}
                                    </div>
                                </div>
                            `}

                            <!-- Remediation Tab -->
                            ${activeTab === 'remediation' && html`
                                <div class="mb-4">
                                    <h5>Remediation Steps</h5>

                                    ${cveData.affectedApplications && cveData.affectedApplications.length > 0 ? html`
                                        <div class="card mb-3">
                                            <div class="card-body">
                                                <div class="text-muted small text-uppercase fw-semibold mb-2">Jump to affected application</div>
                                                <div class="d-flex flex-wrap gap-2 align-items-center">
                                                    <select class="form-select form-select-sm w-auto" value=${selectedRemediationApp}
                                                        onChange=${(e) => setSelectedRemediationApp(e.target.value)}>
                                                        <option value="">Select application</option>
                                                        ${cveData.affectedApplications.map(app => {
                                                            const label = app.vendor ? `${app.appName} · ${app.vendor}` : app.appName;
                                                            return html`<option value=${buildInventoryFilter(app)}>${label}</option>`;
                                                        })}
                                                    </select>
                                                    <button class="btn btn-sm btn-primary" disabled=${!selectedRemediationApp}
                                                        onClick=${() => goToInventory(selectedRemediationApp)}>
                                                        <i class="ti ti-arrow-right me-1"></i>
                                                        Open Inventory
                                                    </button>
                                                </div>
                                                <div class="text-muted small mt-2">Opens inventory filtered by app, vendor, and version.</div>
                                            </div>
                                        </div>
                                    ` : ''}
                                    
                                    <!-- Vendor Advisories & References -->
                                    ${cveData.references && cveData.references.length > 0 ? html`
                                        <div class="mb-3">
                                            <h6>Official Advisories</h6>
                                            <div class="list-group list-group-sm">
                                                ${cveData.references.map(ref => html`
                                                    ${ref.url && (ref.url.includes('advisory') || ref.url.includes('security') || ref.url.includes('patch') || ref.url.includes('kb')) ? html`
                                                        <a href="${ref.url}" target="_blank" rel="noopener" class="list-group-item list-group-item-action small">
                                                            <div class="d-flex align-items-center justify-content-between">
                                                                <div>
                                                                    <strong>${ref.title || 'Advisory'}</strong>
                                                                    <div class="text-muted small">${new URL(ref.url).hostname}</div>
                                                                </div>
                                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon text-primary" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                    <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
                                                                    <path d="M11 13l9 -9" />
                                                                    <path d="M15 4h5v5" />
                                                                </svg>
                                                            </div>
                                                        </a>
                                                    ` : ''}`)}
                                            </div>
                                        </div>
                                    ` : ''}

                                    ${cveData.patches && cveData.patches.length > 0 ? html`
                                        <div class="mb-3">
                                            <h6>Available Patches</h6>
                                            <div class="list-group list-group-sm">
                                                ${cveData.patches.map((patch, idx) => html`
                                                    <div class="list-group-item">
                                                        <div class="d-flex align-items-start">
                                                            <span class="badge bg-success-lt text-success me-2">P${idx + 1}</span>
                                                            <div class="flex-fill">
                                                                <strong>${patch.version || patch.title}</strong>
                                                                ${patch.releaseDate && html`
                                                                    <div class="text-muted small">Released: ${new Date(patch.releaseDate).toLocaleDateString()}</div>
                                                                `}
                                                            </div>
                                                        </div>
                                                    </div>
                                                `)}
                                            </div>
                                        </div>
                                    ` : ''}

                                    <h6>Recommended Actions</h6>
                                    <ol class="text-muted small">
                                        <li>Prioritize patching ${cveData.severity === 'CRITICAL' ? 'immediately - this is critical' : 'as soon as patches are available'}</li>
                                        <li>Update affected applications to the latest version</li>
                                        ${cveData.hasExploit && html`<li>Monitor for suspicious activity related to this CVE</li>`}
                                        <li>Restrict access to affected services if patching is delayed</li>
                                        <li>Enable additional logging and monitoring on affected systems</li>
                                    </ol>

                                    <div class="alert alert-info small mt-3">
                                        <strong>Deadline:</strong> Based on severity and EPSS score, target remediation by the date shown in your dashboard.
                                    </div>
                                </div>
                            `}
                        `}
                    </div>

                    <!-- Footer -->
                    <div class="modal-footer border-top">
                        <a href=${`https://nvd.nist.gov/vuln/detail/${cveId}`} target="_blank" rel="noopener" class="btn btn-link btn-sm">
                            <i class="ti ti-external-link me-1"></i>
                            NVD Details
                        </a>
                        ${cveData && cveData.affectedApplications && cveData.affectedApplications.length > 0 && html`
                            <a href=${`#!/inventory?filter=${encodeURIComponent(cveData.affectedApplications.map(a => `app:${a.appName}`).join('|'))}`} class="btn btn-primary btn-sm">
                                <i class="ti ti-list-check me-1"></i>
                                View in Inventory
                            </a>
                        `}
                        <button type="button" class="btn btn-secondary btn-sm" onClick=${onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}
