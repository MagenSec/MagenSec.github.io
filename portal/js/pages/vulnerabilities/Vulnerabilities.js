/**
 * Vulnerabilities Page - CVE tracking and remediation guidance
 * TRUE Stale-While-Revalidate (SWR) caching pattern
 * 
 * Pattern:
 * - Always display cached data (even if stale)
 * - Background refresh runs transparently
 * - User sees "Refreshing..." badge during background fetch
 * - Instant load from localStorage for repeat visits
 */

import { auth } from '@auth';
import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { parseMitreTechniques } from '../../data/mitre-ttp-catalog.js';
import { getFixVersionLabel } from '../../utils/fixVersion.js';
import { MagiFixPanel } from '../../components/MagiFixPanel.js';
import { CveDetailsModal } from '../../components/CveDetailsModal.js';
import { nvdCveCache } from '../../utils/nvdCveCache.js';
import { SegmentedControl, CollapsibleSectionCard, resolveDeviceLabel } from '../../components/shared/CommonComponents.js';

const { html, Component } = window;

function formatSuspiciousCount(count) {
    const numeric = Number(count) || 0;
    return numeric === 256 ? '256+' : String(numeric);
}

export class VulnerabilitiesPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            vulnerabilities: [],
            reviewItems: [],
            summary: null,
            severityFilter: 'all',
            groupBy: 'application',
            expandedSections: {},
            deviceMap: {},
            isRefreshingInBackground: false,
            reviewDrafts: {},
            reviewSubmittingKey: null,
            reviewDrawer: null,
            magiFixApp: null, // { appName, vendor, version }
            selectedCveId: null,
            nvdDetails: {},  // { [cveId]: { description, references, ... } }
            deepLinkApp: null, // ?app=X from email deep-links
        };
        this.orgUnsubscribe = null;
        this._rewindUnsub = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadVulnerabilities());
        this._rewindUnsub = rewindContext.onChange(() => this.loadVulnerabilities());

        // Deep-link: ?app=AppName from email "Fix this now" links
        const hash = window.location.hash || '';
        const qIdx = hash.indexOf('?');
        if (qIdx >= 0) {
            const params = new URLSearchParams(hash.substring(qIdx));
            const appFilter = params.get('app');
            if (appFilter) {
                this.setState({ deepLinkApp: appFilter });
            }
        }

        this.loadVulnerabilities();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
        if (this._rewindUnsub) this._rewindUnsub();
    }

    _cacheKey() {
        const orgId = orgContext.getCurrentOrg()?.orgId || 'default';
        const effectiveDate = api.getEffectiveDate?.() || 'current';
        return `vulnerabilities_v6_${orgId}_${effectiveDate}`;
    }

    /**
     * SWR Cache Helper: Get cached vulnerabilities data
     * Returns { data, isStale } - NEVER deletes expired cache
     */
    getCachedVulnerabilities() {
        try {
            const cached = localStorage.getItem(this._cacheKey());
            if (!cached) return null;

            const { data, timestamp } = JSON.parse(cached);
            const ageMs = Date.now() - timestamp;
            const TTL_MS = 10 * 60 * 1000; // 10 minutes

            const isStale = ageMs >= TTL_MS;
            if (isStale) {
                console.log('[Vulnerabilities] 📦 Cache HIT (stale): Displaying cached data');
            } else {
                console.log('[Vulnerabilities] 📦 Cache HIT (fresh): Displaying cached data');
            }
            return { data, isStale };
        } catch (err) {
            console.warn('[Vulnerabilities] Cache read error:', err);
        }
        return null;
    }

    /**
     * SWR Cache Helper: Save vulnerabilities to cache
     */
    setCachedVulnerabilities(data) {
        try {
            localStorage.setItem(
                this._cacheKey(),
                JSON.stringify({ data, timestamp: Date.now() })
            );
        } catch (err) {
            console.warn('[Vulnerabilities] Cache write error:', err);
        }
    }

    buildAttributionKey(appName, vendor, version) {
        return `${(appName || 'Unknown Application').trim().toLowerCase()}||${(vendor || 'Unknown vendor').trim().toLowerCase()}||${(version || 'Unknown version').trim().toLowerCase()}`;
    }

    async enrichDeviceAttribution(orgId, vulnerabilities, deviceRows = []) {
        if (!Array.isArray(vulnerabilities) || vulnerabilities.length === 0) return vulnerabilities;

        const knownDeviceIds = (Array.isArray(deviceRows) ? deviceRows : [])
            .map(device => device?.deviceId)
            .filter(Boolean);

        const hasAttributionGaps = vulnerabilities.some(v => (Number(v?.affectedDevices) || 0) > 0 && (!Array.isArray(v.deviceIds) || v.deviceIds.length === 0));
        if (!hasAttributionGaps || knownDeviceIds.length === 0) {
            return vulnerabilities;
        }

        const appDeviceIndex = {};

        const targetDeviceIds = knownDeviceIds.slice(0, 60);
        for (let i = 0; i < targetDeviceIds.length; i += 10) {
            const batch = targetDeviceIds.slice(i, i + 10);
            await Promise.all(batch.map(async (deviceId) => {
                try {
                    const alertsResp = await api.getAlerts(orgId, { state: 'ALL', deviceId, limit: 500 });
                    const alerts = alertsResp?.data?.alerts || [];
                    for (const alert of (Array.isArray(alerts) ? alerts : [])) {
                        if (String(alert?.domain || '').toLowerCase() !== 'vulnerability') continue;
                        const keys = [
                            this.buildAttributionKey(alert.appName, alert.appVendor, alert.appVersion),
                            this.buildAttributionKey(alert.appName, alert.appVendor, ''),
                            this.buildAttributionKey(alert.appName, '', '')
                        ];
                        for (const key of keys) {
                            if (!appDeviceIndex[key]) appDeviceIndex[key] = new Set();
                            appDeviceIndex[key].add(alert.deviceId || deviceId);
                        }
                    }
                } catch (error) {
                    console.debug('[Vulnerabilities] Could not enrich attribution from alerts for', deviceId, error);
                }
            }));
        }

        return vulnerabilities.map(v => {
            const existingIds = Array.isArray(v.deviceIds) ? v.deviceIds.filter(Boolean) : [];
            if (existingIds.length > 0) {
                return { ...v, deviceIds: existingIds };
            }

            const affectedCount = Number(v.affectedDevices) || 0;
            const candidateKeys = [
                this.buildAttributionKey(v.appName || v.app, v.vendor, v.version),
                this.buildAttributionKey(v.appName || v.app, v.vendor, ''),
                this.buildAttributionKey(v.appName || v.app, '', '')
            ];
            const matchedIds = candidateKeys
                .map(key => Array.from(appDeviceIndex[key] || []))
                .find(ids => ids.length > 0) || [];

            if (matchedIds.length > 0) {
                return {
                    ...v,
                    deviceIds: matchedIds.slice(0, affectedCount > 0 ? affectedCount : matchedIds.length)
                };
            }

            if (affectedCount > 0 && affectedCount >= knownDeviceIds.length) {
                return {
                    ...v,
                    deviceIds: [...knownDeviceIds]
                };
            }

            return v;
        });
    }

    /**
     * SWR Pattern: Load from cache first, then fetch fresh in background
     */
    async loadVulnerabilities(forceRefresh = false) {
        const currentOrg = orgContext.getCurrentOrg();
        const orgId = currentOrg?.orgId || auth.getUser()?.email;

        // Step 1: Try cache first (unless force refresh)
        if (!forceRefresh) {
            const cached = this.getCachedVulnerabilities();
            if (cached) {
                console.log('[Vulnerabilities] ⚡ Loading from cache immediately...');
                this.setState({
                    vulnerabilities: cached.data.vulnerabilities || [],
                    reviewItems: cached.data.reviewItems || [],
                    summary: cached.data.summary,
                    loading: false,
                    isRefreshingInBackground: true,
                    error: null
                });
                // Continue to background refresh (don't return!)
            }
        }

        // Step 2: Show loading state if no cache
        if (!this.state.vulnerabilities.length) {
            this.setState({ loading: true, error: null });
        }

        try {
            // Step 3: Fetch fresh data via the unified page-bundle endpoint.
            // Bundle returns: cve-list (vulns + review items, discriminated by isReviewItem),
            //                 cve-device-facts (per-CVE per-device pairs),
            //                 security-snapshot (KPI summary), device-fleet (id→name map).
            const response = await api.getPageBundle(orgId, 'vulnerabilities');

            if (response.success) {
                const atoms = response.data?.atoms || {};
                const cveListRows = atoms['cve-list']?.data || [];
                const deviceRows = atoms['device-fleet']?.data || [];
                const securityData = atoms['security-snapshot']?.data || [];
                const securitySnap = Array.isArray(securityData) ? securityData[0] : securityData;

                // Split cve-list into legacy { vulnerabilities, reviewItems } shape via isReviewItem flag.
                const vulnerabilities = [];
                const reviewItems = [];
                for (const row of cveListRows) {
                    if (row?.isReviewItem) reviewItems.push(row);
                    else vulnerabilities.push(row);
                }

                // Build deviceId → deviceName map from device-fleet atom.
                const deviceMap = {};
                for (const device of (Array.isArray(deviceRows) ? deviceRows : [])) {
                    if (device?.deviceId) deviceMap[device.deviceId] = device.deviceName || device.deviceId;
                }

                // Synthesize summary chips directly from the vulnerability rows we
                // are about to display. Previously this preferred
                // securitySnap.bySeverity (which aggregates ALL domains —
                // Compliance + AV + VULN + …) and only fell back to row counts
                // when missing. That made the chips read "43 High" while the
                // body showed "0 vulnerabilities" because the snapshot included
                // compliance/AV alerts that have no place on this page. Chips
                // and body must agree, so we now count VULN-only rows period.
                const summary = {
                    critical: vulnerabilities.filter(v => v.severity === 'Critical').length,
                    high: vulnerabilities.filter(v => v.severity === 'High').length,
                    medium: vulnerabilities.filter(v => v.severity === 'Medium').length,
                    low: vulnerabilities.filter(v => v.severity === 'Low').length,
                    needsReview: reviewItems.length
                };

                const data = { vulnerabilities, reviewItems, summary };

                // Cache the response
                this.setCachedVulnerabilities(data);

                // Update UI with fresh data
                this.setState({
                    vulnerabilities,
                    reviewItems,
                    summary,
                    deviceMap,
                    freshness: response.data?.freshness || response.freshness || null,
                    loading: false,
                    isRefreshingInBackground: false,
                    error: null
                });

                console.log('[Vulnerabilities] ✅ Fresh data loaded from page-bundle', {
                    vulns: vulnerabilities.length,
                    reviewItems: reviewItems.length,
                    devices: Object.keys(deviceMap).length,
                    freshness: response.data?.freshness
                });
            } else {
                throw new Error(response.message || 'Failed to load vulnerabilities');
            }
        } catch (error) {
            console.error('[Vulnerabilities] Load failed:', error);
            this.setState({
                error: error.message,
                loading: false,
                isRefreshingInBackground: false
            });
        }
    }

    getSeverityBadge(severity) {
        const map = { 'Critical': 'danger', 'High': 'warning', 'Medium': 'info', 'Low': 'secondary' };
        return map[severity] || 'secondary';
    }

    async loadNvdDetail(cveId) {
        if (!cveId || this.state.nvdDetails[cveId]) return;
        const data = await nvdCveCache.get(cveId);
        if (data) {
            this.setState(prev => ({
                nvdDetails: { ...prev.nvdDetails, [cveId]: data }
            }));
        }
    }

    getSeverityRankValue(severity) {
        return { Critical: 4, High: 3, Medium: 2, Low: 1 }[severity] || 0;
    }

    buildAppGroups(items) {
        const byApp = {};
        items.forEach(v => {
            const appName = v.appName || v.app || 'Unknown Application';
            const vendor = v.vendor || 'Unknown vendor';
            const version = v.version || 'Unknown version';
            const key = `${appName}||${vendor}||${version}`;
            if (!byApp[key]) {
                byApp[key] = {
                    appName,
                    vendor,
                    version,
                    cves: [],
                    deviceIds: new Set(),
                    maxAffectedDevices: 0,
                    hasAttributionGap: false
                };
            }

            const group = byApp[key];
            group.cves.push(v);
            group.maxAffectedDevices = Math.max(group.maxAffectedDevices, Number(v.affectedDevices) || 0);

            const deviceIds = Array.isArray(v.deviceIds) ? v.deviceIds.filter(Boolean) : [];
            if (deviceIds.length > 0) {
                deviceIds.forEach(deviceId => group.deviceIds.add(deviceId));
            } else if ((Number(v.affectedDevices) || 0) > 0) {
                group.hasAttributionGap = true;
            }
        });

        return Object.values(byApp)
            .map(group => ({
                ...group,
                deviceIds: Array.from(group.deviceIds),
                totalDevices: group.deviceIds.size || group.maxAffectedDevices || 0
            }))
            .sort((a, b) => {
                const aMax = Math.max(...a.cves.map(c => this.getSeverityRankValue(c.severity)), 0);
                const bMax = Math.max(...b.cves.map(c => this.getSeverityRankValue(c.severity)), 0);
                return bMax - aMax || b.cves.length - a.cves.length;
            });
    }

    buildGroupedViews(items, groupBy) {
        const appGroups = this.buildAppGroups(items);
        if (groupBy === 'application') {
            return {
                appGroups,
                highRiskGroups: appGroups.filter(g => g.cves.some(c => c.severity === 'Critical' || c.severity === 'High')),
                lowRiskGroups: appGroups.filter(g => !g.cves.some(c => c.severity === 'Critical' || c.severity === 'High')),
            };
        }

        const sections = {};
        if (groupBy === 'vendor') {
            appGroups.forEach(group => {
                const key = group.vendor || 'Unknown vendor';
                if (!sections[key]) sections[key] = { key, title: key, appGroups: [] };
                sections[key].appGroups.push(group);
            });
        } else if (groupBy === 'device') {
            const pendingKey = '__device-attribution-pending__';
            appGroups.forEach(group => {
                const deviceIds = new Set(Array.isArray(group.deviceIds) ? group.deviceIds.filter(Boolean) : []);
                if (!deviceIds.size) deviceIds.add(pendingKey);

                deviceIds.forEach(deviceId => {
                    const attributionPending = deviceId === pendingKey;
                    const label = attributionPending
                        ? 'Device attribution pending'
                        : resolveDeviceLabel(deviceId, this.state.deviceMap, 'Device attribution pending');

                    if (!sections[deviceId]) {
                        sections[deviceId] = {
                            key: deviceId,
                            title: label,
                            subtitle: attributionPending
                                ? ((group.totalDevices || 0) > 0
                                    ? `${group.totalDevices} device${group.totalDevices === 1 ? '' : 's'} counted from telemetry; names are still syncing.`
                                    : 'Specific endpoint names were not attached to this CVE record yet.')
                                : (label !== deviceId ? deviceId : ''),
                            appGroups: [],
                            attributionPending
                        };
                    }

                    const scopedCves = attributionPending
                        ? group.cves
                        : group.cves.filter(c => {
                            if (!Array.isArray(c.deviceIds) || !c.deviceIds.length) return false;
                            return c.deviceIds.includes(deviceId);
                        });

                    sections[deviceId].appGroups.push({ ...group, cves: scopedCves });
                });
            });
        }

        return {
            sections: Object.values(sections)
                .map(section => {
                    const totalCves = section.appGroups.reduce((sum, group) => sum + group.cves.length, 0);
                    const explicitDeviceCount = new Set(
                        section.appGroups.flatMap(group =>
                            group.cves.flatMap(c => Array.isArray(c.deviceIds) ? c.deviceIds.filter(Boolean) : [])
                        )
                    ).size;
                    const fallbackDeviceCount = Math.max(
                        ...section.appGroups.map(group => Number(group.totalDevices) || Number(group.maxAffectedDevices) || 0),
                        0
                    );
                    const deviceCount = explicitDeviceCount || fallbackDeviceCount || (groupBy === 'device' ? 1 : 0);

                    const worstSeverity = section.appGroups
                        .flatMap(group => group.cves)
                        .reduce((worst, cve) =>
                            this.getSeverityRankValue(cve.severity) > this.getSeverityRankValue(worst) ? cve.severity : worst,
                            'Low');

                    return {
                        ...section,
                        totalCves,
                        appCount: section.appGroups.length,
                        deviceCount,
                        worstSeverity,
                    };
                })
                .sort((a, b) =>
                    this.getSeverityRankValue(b.worstSeverity) - this.getSeverityRankValue(a.worstSeverity)
                    || b.totalCves - a.totalCves
                    || a.title.localeCompare(b.title)
                )
        };
    }

    makeCollapseId(prefix, ...parts) {
        const slug = parts
            .filter(Boolean)
            .join('-')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);
        return `${prefix}-${slug || 'group'}`;
    }

    toggleExpandedSection(key) {
        this.setState(prev => ({
            expandedSections: {
                ...prev.expandedSections,
                [key]: !prev.expandedSections[key]
            }
        }));
    }

    openReviewDrawer(group, primaryCve = null) {
        this.setState({ reviewDrawer: { group, primaryCve } });
    }

    closeReviewDrawer() {
        this.setState({ reviewDrawer: null });
    }

    async submitAppReview(group, primaryCve = null) {
        const orgId = orgContext.getCurrentOrg()?.orgId;
        if (!orgId) {
            window.toast?.show?.('No organization is selected.', 'warning', 3000);
            return;
        }

        const reviewKey = this.buildAttributionKey(group.appName, group.vendor, group.version);
        const reason = (this.state.reviewDrafts[reviewKey] || '').trim();
        if (!reason) {
            window.toast?.show?.('Please add a short note explaining why this looks incorrect.', 'warning', 3500);
            return;
        }

        try {
            this.setState({ reviewSubmittingKey: reviewKey });
            const response = await api.submitVulnerabilityReview(orgId, {
                appName: group.appName,
                vendor: group.vendor,
                version: group.version,
                cveIds: group.cves.map(c => c.cveId).filter(Boolean).slice(0, 24),
                reason
            });

            if (!response?.success) {
                throw new Error(response?.message || 'Could not send the review request.');
            }

            window.toast?.show?.('Marked for review. The triage team now has your note and contact context.', 'success', 4000);
            this.setState(prev => ({
                reviewSubmittingKey: null,
                reviewDrawer: null,
                reviewDrafts: { ...prev.reviewDrafts, [reviewKey]: '' }
            }));
            await this.loadVulnerabilities(true);
        } catch (error) {
            this.setState({ reviewSubmittingKey: null });
            if (error?.message !== 'TIME_WARP_READ_ONLY') {
                window.toast?.show?.(error?.message || 'Could not send the review request.', 'error', 4000);
            }
        }
    }

    renderNestedSection(section, groupBy) {
        const tone = this.getSeverityBadge(section.worstSeverity);
        const sectionKey = this.makeCollapseId('vuln-section', groupBy, section.key, section.title);
        const isOpen = !!this.state.expandedSections[sectionKey];

        return html`
            <${CollapsibleSectionCard}
                title=${section.title}
                subtitle=${section.subtitle || ''}
                meta=${groupBy === 'vendor'
                    ? `${section.appCount} exposed app${section.appCount === 1 ? '' : 's'} · ${section.deviceCount} device${section.deviceCount === 1 ? '' : 's'}`
                    : section.attributionPending
                        ? `${section.appCount} exposed app${section.appCount === 1 ? '' : 's'} · device names still syncing`
                        : `${section.appCount} exposed app${section.appCount === 1 ? '' : 's'} on this device`}
                badges=${[
                    { text: `${formatSuspiciousCount(section.totalCves)} CVE${section.totalCves === 1 ? '' : 's'}`, className: `bg-${tone} text-white` },
                    { text: isOpen ? 'Collapse' : 'Expand', className: 'bg-secondary-lt text-secondary' }
                ]}
                accent=${tone}
                isOpen=${isOpen}
                onToggle=${() => this.toggleExpandedSection(sectionKey)}>
                <div class="row row-cards">
                    ${section.appGroups.map(group => this.renderAppGroup(group))}
                </div>
            </${CollapsibleSectionCard}>
        `;
    }

    renderReviewDrawer() {
        const current = this.state.reviewDrawer;
        if (!current?.group) return null;

        const { group, primaryCve } = current;
        const reviewKey = this.buildAttributionKey(group.appName, group.vendor, group.version);
        const reviewNote = this.state.reviewDrafts[reviewKey] || '';
        const reviewBusy = this.state.reviewSubmittingKey === reviewKey;
        const alreadyQueued = (this.state.reviewItems || []).some(item => this.buildAttributionKey(item.appName, item.vendor, item.version) === reviewKey);

        return html`
            <div class="apps-details-backdrop show" onClick=${() => this.closeReviewDrawer()}></div>
            <aside class="apps-details-drawer open" aria-hidden="false">
                <div class="apps-details-header">
                    <div>
                        <div class="text-muted small">Request a review</div>
                        <h3 class="apps-details-title mb-1">${group.appName || 'Unknown Application'}</h3>
                        <div class="text-muted small">${group.vendor || 'Unknown vendor'} · ${group.version || 'Unknown version'}</div>
                    </div>
                    <button class="btn btn-sm btn-ghost-secondary" onClick=${() => this.closeReviewDrawer()}>Close</button>
                </div>

                <div class="apps-details-kpis">
                    <span class="badge bg-warning text-white">Manual review</span>
                    <span class="badge bg-primary text-white">${group.totalDevices || 0} device${(group.totalDevices || 0) === 1 ? '' : 's'}</span>
                    ${primaryCve?.cveId ? html`<span class="badge bg-secondary text-white">${primaryCve.cveId}</span>` : null}
                    ${alreadyQueued ? html`<span class="badge bg-warning text-white">Already in review</span>` : null}
                </div>

                <div class="apps-details-body">
                    <div class="card mb-3">
                        <div class="card-body">
                            <div class="fw-semibold mb-1">Why this is here</div>
                            <div class="text-muted small">Use this only when the app/CVE pairing looks incorrect. Your note and account email are attached so the team can validate and follow up.</div>
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">What looks off?</label>
                        <textarea
                            class="form-control"
                            rows="5"
                            placeholder="Example: This CVE is for Adobe Flash / legacy Edge, not current Edge on Windows 11."
                            value=${reviewNote}
                            onInput=${(e) => this.setState(prev => ({ reviewDrafts: { ...prev.reviewDrafts, [reviewKey]: e.target.value } }))}
                        ></textarea>
                    </div>

                    <div class="d-flex gap-2 justify-content-end">
                        <button class="btn btn-outline-secondary" onClick=${() => this.closeReviewDrawer()}>Cancel</button>
                        <button class="btn btn-warning text-white" disabled=${reviewBusy || alreadyQueued} onClick=${() => this.submitAppReview(group, primaryCve)}>
                            ${reviewBusy ? 'Sending…' : alreadyQueued ? 'Queued for review' : 'Send for review'}
                        </button>
                    </div>
                </div>
            </aside>
        `;
    }

    renderReviewQueue(reviewItems) {
        const items = Array.isArray(reviewItems) ? reviewItems : [];
        if (!items.length) return null;

        const formatWhen = (value) => {
            if (!value) return 'Backoff active';
            const dt = new Date(value);
            return Number.isNaN(dt.getTime()) ? 'Backoff active' : dt.toLocaleString();
        };

        const reviewKey = this.makeCollapseId('review-queue', 'confidence-pending');
        const isOpen = !!this.state.expandedSections[reviewKey];

        return html`
            <${CollapsibleSectionCard}
                title=${'Confidence pending'}
                subtitle=${'These applications are being held for review and are not counted as confirmed CVEs yet.'}
                meta=${`${items.length} app${items.length === 1 ? '' : 's'} awaiting manual analysis`}
                badges=${[
                    { text: `${items.length} need review`, className: 'bg-warning text-white' },
                    { text: isOpen ? 'Collapse' : 'Expand', className: 'bg-secondary-lt text-secondary' }
                ]}
                accent=${'warning'}
                isOpen=${isOpen}
                onToggle=${() => this.toggleExpandedSection(reviewKey)}>
                <div class="table-responsive">
                    <table class="table table-vcenter mb-0">
                        <thead>
                            <tr>
                                <th>Application</th>
                                <th>How it matched</th>
                                <th>Devices</th>
                                <th>Next retry</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(item => html`
                                <tr>
                                    <td>
                                        <div class="fw-medium">${item.appName || 'Unknown Application'}</div>
                                        <div class="text-muted small">${item.vendor || 'Unknown vendor'} · ${item.version || 'Unknown version'}</div>
                                    </td>
                                    <td>
                                        <div class="d-flex gap-1 flex-wrap">
                                            <span class="badge bg-warning-lt text-warning">${item.resolutionConfidence || 'low'} confidence</span>
                                            <span class="badge bg-secondary-lt text-secondary">${item.resolvedVia || 'unresolved'}</span>
                                        </div>
                                    </td>
                                    <td>${Number(item.affectedDevices) || 0}</td>
                                    <td><span class="text-muted small">${formatWhen(item.retryAfterUtc || item.checkedUtc)}</span></td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                </div>
            </${CollapsibleSectionCard}>
        `;
    }

    render() {
        const { loading, error, vulnerabilities, reviewItems, severityFilter, groupBy, isRefreshingInBackground, summary, deepLinkApp } = this.state;

        if (loading && !vulnerabilities.length) {
            return html`<div class="d-flex align-items-center justify-content-center" style="min-height: 60vh;"><div class="spinner-border text-primary"></div></div>`;
        }

        if (error && !vulnerabilities.length) {
            return html`<div class="alert alert-danger"><h4 class="alert-title">Error</h4><div>${error}</div></div>`;
        }

        let filtered = severityFilter === 'all' ? vulnerabilities : vulnerabilities.filter(v => v.severity === severityFilter);

        // Deep-link filter: ?app=AppName from email "Fix this now" links
        if (deepLinkApp) {
            filtered = filtered.filter(v =>
                (v.appName || v.app || '').toLowerCase().includes(deepLinkApp.toLowerCase()));
        }

        const criticalCount = Number(summary?.critical ?? vulnerabilities.filter(v => v.severity === 'Critical').length);
        const highCount = Number(summary?.high ?? vulnerabilities.filter(v => v.severity === 'High').length);
        const mediumCount = Number(summary?.medium ?? vulnerabilities.filter(v => v.severity === 'Medium').length);
        const lowCount = Number(summary?.low ?? vulnerabilities.filter(v => v.severity === 'Low').length);
        const needsReviewCount = Number(summary?.needsReview ?? reviewItems.length);

        // Compute distinct CVEs and affected devices client-side from the row payload so the
        // header narrates the actionable story (which CVEs / which devices) instead of just
        // the device×CVE×version exposure count which can balloon as NVD/CPE sync runs.
        const uniqueCveSet = new Set();
        const affectedDeviceSet = new Set();
        const uniqueCveBySev = { Critical: new Set(), High: new Set(), Medium: new Set(), Low: new Set() };
        for (const v of vulnerabilities) {
            const cve = (v.cveId || '').toUpperCase();
            if (cve) {
                uniqueCveSet.add(cve);
                if (uniqueCveBySev[v.severity]) uniqueCveBySev[v.severity].add(cve);
            }
            if (Array.isArray(v.deviceIds)) v.deviceIds.forEach(id => id && affectedDeviceSet.add(id));
        }
        const totalExposures = criticalCount + highCount + mediumCount + lowCount;
        const uniqueCveTotal = uniqueCveSet.size;
        const affectedDeviceTotal = affectedDeviceSet.size;

        const groupedView = this.buildGroupedViews(filtered, groupBy);

        return html`
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">Your Risk Map</h2>
                                ${window.FreshnessBadge ? html`<${window.FreshnessBadge} freshness=${this.state.freshness} refreshing=${isRefreshingInBackground} />` : (isRefreshingInBackground ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;"></span>
                                        Refreshing...
                                    </span>
                                ` : '')}
                            </div>
                            <div class="page-subtitle mt-2">
                                <div class="d-flex flex-column gap-1">
                                    ${uniqueCveTotal > 0 ? html`
                                        <div class="text-muted small">
                                            <strong class="text-body">${uniqueCveTotal.toLocaleString()}</strong> unique CVE${uniqueCveTotal === 1 ? '' : 's'}
                                            \u00b7 <strong class="text-body">${affectedDeviceTotal.toLocaleString()}</strong> device${affectedDeviceTotal === 1 ? '' : 's'} affected
                                            \u00b7 <strong class="text-body">${totalExposures.toLocaleString()}</strong> open exposure${totalExposures === 1 ? '' : 's'}
                                            <span class="text-muted ms-1" title="An exposure = one device with one vulnerable app version. The same CVE on multiple devices counts as multiple exposures.">(?)</span>
                                        </div>
                                    ` : ''}
                                    <div class="d-flex gap-2 flex-wrap align-items-center">
                                        <span class="badge bg-danger text-white" title=${`${uniqueCveBySev.Critical.size} unique critical CVE${uniqueCveBySev.Critical.size === 1 ? '' : 's'} \u00b7 ${criticalCount} open exposure${criticalCount === 1 ? '' : 's'}`}>${criticalCount} Critical</span>
                                        <span class="badge bg-warning text-white" title=${`${uniqueCveBySev.High.size} unique high CVE${uniqueCveBySev.High.size === 1 ? '' : 's'} \u00b7 ${highCount} open exposure${highCount === 1 ? '' : 's'}`}>${highCount} High</span>
                                        <span class="badge bg-info text-white" title=${`${uniqueCveBySev.Medium.size} unique medium CVE${uniqueCveBySev.Medium.size === 1 ? '' : 's'} \u00b7 ${mediumCount} open exposure${mediumCount === 1 ? '' : 's'}`}>${mediumCount} Medium</span>
                                        <span class="badge bg-success text-white" title=${`${uniqueCveBySev.Low.size} unique low CVE${uniqueCveBySev.Low.size === 1 ? '' : 's'} \u00b7 ${lowCount} open exposure${lowCount === 1 ? '' : 's'}`}>${lowCount} Low</span>
                                        ${needsReviewCount > 0 && orgContext.isSiteAdmin() ? html`<span class="badge bg-warning text-white">${needsReviewCount} Needs review</span>` : ''}
                                        ${rewindContext.isActive() ? html`<span class="badge bg-azure-lt text-azure">As of ${api.getEffectiveDate?.() || 'selected date'}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-primary" onClick=${() => this.loadVulnerabilities(true)}>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="page-body">
                <div class="container-xl">
                    <div class="card mb-3">
                        <div class="card-body py-3">
                            <div class="triage-filter-toolbar">
                                <div class="triage-filter-block">
                                    <div class="triage-filter-label">Severity</div>
                                    <${SegmentedControl}
                                        options=${[
                                            { id: 'all', label: 'All' },
                                            { id: 'Critical', label: 'Critical', badge: criticalCount },
                                            { id: 'High', label: 'High', badge: highCount },
                                            { id: 'Medium', label: 'Medium', badge: mediumCount },
                                            { id: 'Low', label: 'Low', badge: lowCount }
                                        ]}
                                        value=${severityFilter}
                                        onChange=${value => this.setState({ severityFilter: value })}
                                    />
                                </div>
                                <div class="triage-filter-block">
                                    <div class="triage-filter-label">Group by</div>
                                    <${SegmentedControl}
                                        options=${[
                                            { id: 'application', label: 'Application' },
                                            { id: 'vendor', label: 'Vendor' },
                                            { id: 'device', label: 'Device' }
                                        ]}
                                        value=${groupBy}
                                        onChange=${value => this.setState({ groupBy: value })}
                                    />
                                </div>
                            </div>
                            <div class="text-muted small mt-2">
                                ${groupBy === 'application'
                                    ? 'Application view starts collapsed so you can scan exposed apps first. Expand a card to review CVEs, and click any CVE for details without leaving the page.'
                                    : groupBy === 'vendor'
                                        ? 'Vendor view nests exposed applications under each publisher.'
                                        : 'Device view shows which endpoints are carrying each risky app/version. If names are still syncing, the card will say Device attribution pending.'}
                            </div>
                        </div>
                    </div>
                    ${reviewItems.length > 0 && orgContext.isSiteAdmin() ? this.renderReviewQueue(reviewItems) : ''}
                    ${filtered.length === 0 ? html`
                        <div class="empty">
                            <div class="empty-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9" /><path d="M9 12l2 2l4 -4" /></svg>
                            </div>
                            <p class="empty-title">No vulnerabilities found</p>
                            <p class="empty-subtitle text-muted">
                                ${severityFilter === 'all'
                                    ? (reviewItems.length > 0
                                        ? 'No confirmed CVEs are showing right now. The items above are still being confidence-checked.'
                                        : 'Great! No CVEs detected across your devices.')
                                    : `No ${severityFilter} severity vulnerabilities found.`}
                            </p>
                        </div>
                    ` : groupBy === 'application' ? html`
                        <div class="row row-cards">
                            ${groupedView.highRiskGroups.map(group => this.renderAppGroup(group))}
                        </div>
                        ${groupedView.lowRiskGroups.length > 0 ? html`
                            <div class="accordion mt-3" id="lowRiskAccordion">
                                <div class="accordion-item">
                                    <h2 class="accordion-header">
                                        <button class="accordion-button collapsed" type="button"
                                                data-bs-toggle="collapse" data-bs-target="#lowRiskBody">
                                            Lower Risk (${formatSuspiciousCount(groupedView.lowRiskGroups.reduce((n, g) => n + g.cves.length, 0))} CVEs across ${groupedView.lowRiskGroups.length} apps)
                                        </button>
                                    </h2>
                                    <div id="lowRiskBody" class="accordion-collapse collapse">
                                        <div class="accordion-body p-0">
                                            <div class="row row-cards p-3">
                                                ${groupedView.lowRiskGroups.map(group => this.renderAppGroup(group))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    ` : html`
                        ${groupedView.sections.map(section => this.renderNestedSection(section, groupBy))}
                    `}
                </div>
            </div>
            <${CveDetailsModal}
                cveId=${this.state.selectedCveId}
                orgId=${orgContext.getCurrentOrg()?.orgId}
                isOpen=${!!this.state.selectedCveId}
                onClose=${() => this.setState({ selectedCveId: null })}
            />
            ${this.state.magiFixApp ? html`
                <div
                    class="modal show d-block cve-details-modal-backdrop magi-fix-modal"
                    style="background-color: rgba(2,6,23,0.72);"
                    onClick=${() => this.setState({ magiFixApp: null })}>
                    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable cve-details-modal-dialog"
                        onClick=${(e) => e.stopPropagation()}>
                        <div class="modal-content magi-fix-modal__content">
                            <${MagiFixPanel}
                                appName=${this.state.magiFixApp.appName}
                                vendor=${this.state.magiFixApp.vendor}
                                version=${this.state.magiFixApp.version || ''}
                                cveId=${this.state.magiFixApp.cveId || ''}
                                onClose=${() => this.setState({ magiFixApp: null })}
                            />
                        </div>
                    </div>
                </div>
            ` : null}
            ${this.renderReviewDrawer()}
        `;
    }

    renderAppGroup(group) {
        const totalDevices = group.totalDevices || Math.max(...group.cves.map(c => c.affectedDevices || 0), 0);
        const worstSeverity = group.cves.reduce((worst, c) => {
            const rank = { Critical: 4, High: 3, Medium: 2, Low: 1 };
            return (rank[c.severity] || 0) > (rank[worst] || 0) ? c.severity : worst;
        }, 'Low');
        const severityColor = this.getSeverityBadge(worstSeverity);
        const primaryCve = [...group.cves].sort((a, b) => {
            const rank = { Critical: 4, High: 3, Medium: 2, Low: 1 };
            return (rank[b.severity] || 0) - (rank[a.severity] || 0) || (b.epss || 0) - (a.epss || 0);
        })[0] || null;
        const knownExploitCount = group.cves.filter(c => c.knownExploit || c.epss > 0.5).length;
        const appKey = this.makeCollapseId('vuln-app', group.appName, group.vendor, group.version);
        const isOpen = !!this.state.expandedSections[appKey];
        const reviewKey = this.buildAttributionKey(group.appName, group.vendor, group.version);
        const reviewNote = this.state.reviewDrafts[reviewKey] || '';
        const reviewBusy = this.state.reviewSubmittingKey === reviewKey;
        const alreadyQueued = (this.state.reviewItems || []).some(item => this.buildAttributionKey(item.appName, item.vendor, item.version) === reviewKey);
        const devicePreview = (group.deviceIds || [])
            .slice(0, 3)
            .map(deviceId => resolveDeviceLabel(deviceId, this.state.deviceMap, deviceId));

        const metaParts = [
            `${totalDevices} device${totalDevices === 1 ? '' : 's'} affected`
        ];
        if (devicePreview.length > 0) {
            metaParts.push(`${devicePreview.join(', ')}${group.deviceIds.length > 3 ? ` +${group.deviceIds.length - 3} more` : ''}`);
        } else if (group.hasAttributionGap && totalDevices > 0) {
            metaParts.push('device attribution pending');
        }
        if (primaryCve?.cveId) {
            metaParts.push(`Top issue ${primaryCve.cveId}`);
        }

        return html`
            <div class="col-12">
                <${CollapsibleSectionCard}
                    title=${group.appName}
                    subtitle=${`${group.vendor || 'Unknown vendor'} · ${group.version || 'Unknown version'}`}
                    meta=${metaParts.join(' · ')}
                    badges=${[
                        { text: worstSeverity, className: `bg-${severityColor} text-white` },
                        { text: `${formatSuspiciousCount(group.cves.length)} CVE${group.cves.length !== 1 ? 's' : ''}`, className: `bg-${severityColor}-lt text-${severityColor}` },
                        ...(totalDevices > 0 ? [{ text: `${totalDevices} device${totalDevices === 1 ? '' : 's'}`, className: 'bg-primary-lt text-primary' }] : []),
                        ...(knownExploitCount > 0 ? [{ text: `${knownExploitCount} KEV`, className: 'bg-danger-lt text-danger' }] : [])
                    ]}
                    accent=${severityColor}
                    isOpen=${isOpen}
                    onToggle=${() => this.toggleExpandedSection(appKey)}
                    className=${'vuln-app-card'}>
                    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                        <div class="text-muted small">Click a CVE ID for the full impact and remediation view. Use the external-link icon for NVD.</div>
                        <div class="d-flex gap-2 flex-wrap">
                            ${typeof orgContext !== 'undefined' && orgContext.hasAddOn && orgContext.hasAddOn('MAGI') ? html`
                                <button class="btn btn-sm btn-outline-purple" title="Ask MAGI for fix guidance"
                                    onClick=${() => this.setState({
                                        selectedCveId: null,
                                        magiFixApp: { appName: group.appName, vendor: group.vendor, version: primaryCve?.version || '', cveId: primaryCve?.cveId || '' }
                                    })}>
                                    <i class="ti ti-brain me-1"></i>Ask MAGI for fix guidance
                                </button>
                            ` : null}
                            <button
                                class="btn btn-sm btn-outline-warning"
                                title="If you think this app/CVE combination looks wrong, open the review drawer"
                                onClick=${() => this.openReviewDrawer(group, primaryCve)}>
                                <i class="ti ti-flag-3 me-1"></i>${alreadyQueued ? 'In review' : 'Request review'}
                            </button>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm table-vcenter mb-0">
                            <thead class="vuln-table-head">
                                <tr>
                                    <th>CVE</th>
                                    <th>Severity</th>
                                    <th>CVSS</th>
                                    <th>EPSS</th>
                                    <th>Techniques</th>
                                    <th>Fix</th>
                                    <th class="text-end">Devices</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${group.cves
                                    .sort((a, b) => ({ Critical: 4, High: 3, Medium: 2, Low: 1 }[b.severity] || 0) - ({ Critical: 4, High: 3, Medium: 2, Low: 1 }[a.severity] || 0))
                                    .map(vuln => {
                                        const sc = this.getSeverityBadge(vuln.severity);
                                        const hasExploit = vuln.knownExploit || vuln.epss > 0.5;
                                        const epssColor = vuln.epss > 0.5 ? 'danger' : vuln.epss > 0.2 ? 'warning' : 'success';
                                        const ttps = parseMitreTechniques(vuln.mitreTechniques);
                                        const fix = getFixVersionLabel(vuln, vuln.vendor || group.vendor);
                                        const deviceLabels = (Array.isArray(vuln.deviceIds) ? vuln.deviceIds : [])
                                            .filter(Boolean)
                                            .slice(0, 2)
                                            .map(deviceId => resolveDeviceLabel(deviceId, this.state.deviceMap, deviceId));

                                        return html`
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-start gap-2 flex-wrap">
                                                        <button
                                                            type="button"
                                                            class="btn btn-link p-0 fw-medium vuln-cve-trigger"
                                                            onClick=${() => this.setState({ selectedCveId: vuln.cveId })}
                                                            onMouseEnter=${() => this.loadNvdDetail(vuln.cveId)}>
                                                            ${vuln.cveId}
                                                        </button>
                                                        <a
                                                            href="https://nvd.nist.gov/vuln/detail/${vuln.cveId}"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            class="text-muted"
                                                            title="Open ${vuln.cveId} on NVD in a new tab"
                                                            onMouseEnter=${() => this.loadNvdDetail(vuln.cveId)}>
                                                            <i class="ti ti-external-link"></i>
                                                        </a>
                                                        ${hasExploit ? html`
                                                            <span class="badge bg-danger-lt text-danger" title="Actively exploited in the wild" style="font-size: 0.65rem;">KEV</span>
                                                        ` : ''}
                                                    </div>
                                                    ${this.state.nvdDetails[vuln.cveId]?.description ? html`
                                                        <div class="text-muted small mt-1" style="max-width:320px;white-space:normal;line-height:1.35;">
                                                            ${this.state.nvdDetails[vuln.cveId].description.slice(0, 140)}${this.state.nvdDetails[vuln.cveId].description.length > 140 ? '…' : ''}
                                                        </div>
                                                    ` : ''}
                                                </td>
                                                <td><span class="badge bg-${sc} text-white">${vuln.severity}</span></td>
                                                <td>
                                                    ${vuln.cvssScore ? html`
                                                        <span class="fw-medium">${vuln.cvssScore}</span>
                                                    ` : html`<span class="text-muted">—</span>`}
                                                </td>
                                                <td>
                                                    ${vuln.epss ? html`
                                                        <span class="badge bg-${epssColor}-lt text-${epssColor}" style="font-size: 0.7rem;">
                                                            ${Math.round(vuln.epss * 100)}%
                                                        </span>
                                                    ` : html`<span class="text-muted">—</span>`}
                                                </td>
                                                <td>
                                                    ${ttps.length > 0 ? html`
                                                        <div class="d-flex gap-1 flex-wrap">
                                                            ${ttps.slice(0, 3).map(t => html`
                                                                <span class="badge" style="background: ${t.colour}22; color: ${t.colour}; font-size: 0.6rem; border: 1px solid ${t.colour}44;"
                                                                      title="${t.tcode}: ${t.name} (${t.tacticLabel})">
                                                                    ${t.tcode}
                                                                </span>
                                                            `)}
                                                            ${ttps.length > 3 ? html`<span class="text-muted small">+${ttps.length - 3}</span>` : ''}
                                                        </div>
                                                    ` : html`<span class="text-muted">—</span>`}
                                                </td>
                                                <td>
                                                    <span class="text-muted small" title="${fix.fixLabel}">
                                                        ${fix.fixVersion ? html`
                                                            <span class="text-success fw-medium">${fix.fixVersion}</span>
                                                        ` : html`${fix.fixLabel}`}
                                                    </span>
                                                </td>
                                                <td class="text-end">
                                                    <div class="fw-medium text-body">${vuln.affectedDevices || 0}</div>
                                                    ${deviceLabels.length > 0 ? html`
                                                        <div class="text-muted small">${deviceLabels.join(', ')}${Array.isArray(vuln.deviceIds) && vuln.deviceIds.length > 2 ? ` +${vuln.deviceIds.length - 2}` : ''}</div>
                                                    ` : ((vuln.affectedDevices || 0) > 0 && !(Array.isArray(vuln.deviceIds) && vuln.deviceIds.length > 0)) ? html`
                                                        <div class="text-warning small">Pending</div>
                                                    ` : html`<span class="text-muted">—</span>`}
                                                </td>
                                            </tr>
                                        `;
                                    })}
                            </tbody>
                        </table>
                    </div>
                </${CollapsibleSectionCard}>
            </div>
        `;
    }
}
