/**
 * Software Inventory Page — 3-tab comprehensive view
 *
 * Tabs:
 *   1. All Software   — full catalogue with search, risk badge, freeware flag
 *   2. At Risk        — apps with CVEs, sorted by risk, expanded CVE details
 *   3. License Tracking — inline license management (add / edit / remove)
 *
 * Data sources:
 *   • api.getSoftwareInventory(orgId)  → {apps[{name,version,vendor,deviceCount,devices[],cveCount,riskScore,status,isFreeware,cves[]}]}
 *   • api.getAppLicenses(orgId)        → {licenses[{appKey,licenseType,expiryDate,notes,updatedAt,updatedBy}]}
 *
 * Caching: SWR (Stale-While-Revalidate) pattern using localStorage
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';
import { magiContext } from '@magiContext';
import { getEffectiveMaxInputDate } from '../../utils/effectiveDate.js';
import { SegmentedControl } from '../../components/shared/CommonComponents.js';
import { FilterToolbar, PaginationBar, SortableHeader } from '../../components/shared/DataControls.js';

const { html, Component } = window;

// ─── constants ──────────────────────────────────────────────────────────────

const RISK_ORDER = { Critical: 5, High: 4, Medium: 3, Low: 2, Unknown: 1, None: 0 };

const RISK_BADGE = {
    Critical: 'bg-danger text-white',
    High:     'bg-warning text-white',
    Medium:   'bg-info text-white',
    Low:      'bg-success text-white',
    Unknown:  'bg-secondary text-white',
    None:     'bg-secondary-lt text-secondary',
};

const LICENSE_TYPES = ['Commercial', 'Open Source', 'Freeware', 'Trial', 'Subscription', 'Enterprise', 'OEM', 'Unknown'];
const BUNDLE_INSTALL_COHORT_WINDOW_MS = 6 * 60 * 60 * 1000;

function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
}

function displayValue(value, fallback = 'Unknown') {
    const cleaned = String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    return cleaned || fallback;
}

function firstPresent(...values) {
    return values.find(value => value !== undefined && value !== null && String(value).trim() !== '') || null;
}

function parseTimeMs(value) {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
}

function minIso(values) {
    const times = values.map(parseTimeMs).filter(time => time !== null);
    return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

function maxIso(values) {
    const times = values.map(parseTimeMs).filter(time => time !== null);
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function uniqBy(items, keyFn) {
    const seen = new Set();
    const result = [];
    for (const item of items || []) {
        const key = keyFn(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(item);
    }
    return result;
}

function renderMarkdown(text) {
    if (!text) return '';
    const raw = window.marked ? window.marked.parse(text) : String(text).replace(/\n/g, '<br>');
    return window.DOMPurify ? window.DOMPurify.sanitize(raw) : raw;
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

const IconRefresh = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/>
        <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>
    </svg>`;

const IconSearch = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"/>
        <path d="M21 21l-6 -6"/>
    </svg>`;

const IconPackage = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="48" height="48" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <polyline points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5 12 3"/>
        <line x1="12" y1="12" x2="20" y2="7.5"/>
        <line x1="12" y1="12" x2="12" y2="21"/>
        <line x1="12" y1="12" x2="4" y2="7.5"/>
    </svg>`;

const IconShieldOff = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="48" height="48" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"/>
        <line x1="3" y1="3" x2="21" y2="21"/>
    </svg>`;

const IconLicense = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="48" height="48" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <polyline points="3 10 21 10"/>
        <line x1="7" y1="15" x2="7" y2="15.01"/>
        <line x1="11" y1="15" x2="13" y2="15"/>
    </svg>`;

// ─── main component ──────────────────────────────────────────────────────────

export class SoftwareInventoryPage extends Component {
    constructor(props) {
        super(props);
        const cacheKey = this._currentCacheKey();
        const cached = cacheKey ? this._readCache(cacheKey) : null;
        const cachedApps = cached?.data?.apps || [];
        const cachedMeta = cached?.data?.meta || {};
        const initialTab = this.getTabFromHash() || 'all';
        this.state = {
            apps: cachedApps,
            licenses: cached?.data?.licenses || {},          // keyed by appKey
            loading: cachedApps.length === 0,
            error: null,
            inventorySource: cachedMeta.source || (cachedApps.length ? 'cache' : null),
            inventoryAsOfDateUtc: cachedMeta.asOfDateUtc || null,
            inventoryCachedAtUtc: cachedMeta.cachedAtUtc || null,
            activeTab: initialTab,      // 'all' | 'atrisk' | 'licenses'
            searchQuery: '',
            sortCol: initialTab === 'licenses' ? 'name' : 'deviceCount',
            sortDir: initialTab === 'licenses' ? 'asc' : 'desc',
            page: 1,
            pageSize: 25,
            groupBy: 'application',
            licenseStatusFilter: 'all',
            licenseTypeFilter: 'all',
            isRefreshing: cachedApps.length > 0 && cached?.stale,
            expandedGroups: {},
            deepLinkFilter: null,
            // License editing state
            editingKey: null,      // appKey currently being edited
            editForm: {},          // { licenseType, expiryDate, notes }
            savingKey: null,       // appKey currently being saved
            saveError: null,
            detailsAppKey: null,
            magiAppKey: null,
            magiLoading: false,
            magiAnswer: null,
            magiError: null,
            magiCacheId: null,
            magiFeedback: null,
            magiWasCached: false,
            bundleMagiLoadingKey: null,
            bundleMagiResults: {},
            bundleMagiErrors: {},
        };
        this._unsubOrg = null;
        this._rewindUnsub = null;
        this._isMounted = false;
        this._lastAppliedHash = '';
    }

    // ─── lifecycle ───────────────────────────────────────────────────────────

    async componentDidMount() {
        this._isMounted = true;
        this._unsubOrg = orgContext.onChange(() => this.loadData(true));
        this._rewindUnsub = rewindContext.onChange(() => this.loadData(true));
        this._hashChangeHandler = () => this.applyDeepLinkFilterFromHash();
        window.addEventListener('hashchange', this._hashChangeHandler);
        this.applyDeepLinkFilterFromHash();
        await this.loadData();
    }

    componentWillUnmount() {
        this._isMounted = false;
        if (this._unsubOrg) this._unsubOrg();
        if (this._rewindUnsub) this._rewindUnsub();
        if (this._hashChangeHandler) window.removeEventListener('hashchange', this._hashChangeHandler);
        magiContext.clear();
    }

    componentDidUpdate() {
        const hash = window.location.hash || '';
        if (this._isActiveRoute() && hash !== this._lastAppliedHash) {
            this.applyDeepLinkFilterFromHash();
        }
    }

    _reapplyHashFilter() {
        this._lastAppliedHash = '';
        this.applyDeepLinkFilterFromHash();
    }

    _isActiveRoute() {
        return (window.location.hash || '').startsWith('#!/apps');
    }

    // ─── caching helpers ─────────────────────────────────────────────────────

    _currentCacheKey() {
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId;
        if (!orgId) return null;

        const rewindDate = api.getEffectiveDate();
        return rewindDate ? `sw_inventory_${orgId}_${rewindDate}` : `sw_inventory_${orgId}`;
    }

    _readCache(key, ttlMin = 15) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const { data, ts } = JSON.parse(raw);
            const stale = (Date.now() - ts) >= ttlMin * 60_000;
            return { data, stale };
        } catch { return null; }
    }

    _writeCache(key, data) {
        try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* ignore quota */ }
    }

    _normalizeInventoryResponse(response) {
        const data = response?.data ?? {};
        const apps = Array.isArray(data?.apps)
            ? data.apps
            : Array.isArray(data)
                ? data
                : [];

        return {
            apps,
            meta: {
                source: data?.source || null,
                asOfDateUtc: data?.asOfDateUtc || null,
                cachedAtUtc: data?.cachedAtUtc || null,
                isSnapshot: !!data?.isSnapshot
            }
        };
    }

    async _loadLicenses(orgId) {
        if (orgContext.isIndividualUser()) return {};
        const response = await api.getAppLicenses(orgId);
        const licenseArr = response?.data?.licenses ?? response?.data ?? [];
        const licenses = {};
        for (const license of licenseArr) {
            if (license.appKey) licenses[license.appKey] = license;
        }
        return licenses;
    }

    _writeInventoryCache(cacheKey, apps, licenses, meta) {
        if (!cacheKey) return;
        this._writeCache(cacheKey, { apps, licenses, meta });
    }

    _inventorySourceLabel() {
        const { inventorySource, inventoryAsOfDateUtc, isRefreshing } = this.state;
        if (rewindContext.isActive()) return `Captured ${inventoryAsOfDateUtc || getEffectiveMaxInputDate()}`;
        if (isRefreshing && (inventorySource === 'snapshot' || inventorySource === 'cache')) return 'Fast inventory · refreshing live';
        if (inventorySource === 'snapshot') return `Captured inventory ${inventoryAsOfDateUtc || ''}`.trim();
        if (inventorySource === 'cache') return 'Cached inventory';
        if (inventorySource === 'current') return 'Live current';
        return null;
    }

    _deviceKey(device) {
        return String(device?.deviceId || device?.deviceName || '').trim();
    }

    _appDeviceKeys(app) {
        return new Set((app?.devices || []).map(device => this._deviceKey(device)).filter(Boolean));
    }

    _appDeviceEntries(app) {
        return (app?.devices || [])
            .map(device => {
                const key = this._deviceKey(device);
                const firstSeen = firstPresent(device?.firstSeen, device?.FirstSeen, app?.firstSeen, app?.FirstSeen);
                const lastSeen = firstPresent(device?.lastSeen, device?.LastSeen, app?.lastSeen, app?.LastSeen);
                return {
                    key,
                    firstSeen,
                    lastSeen,
                    firstSeenMs: parseTimeMs(firstSeen),
                };
            })
            .filter(entry => entry.key);
    }

    _collectCves(rows) {
        const cves = [];
        let fallbackCount = 0;
        for (const row of rows || []) {
            const rowCves = Array.isArray(row.cves) ? row.cves : [];
            if (rowCves.length) cves.push(...rowCves);
            else fallbackCount += row.cveCount || 0;
        }
        const unique = uniqBy(cves, cve => normalizeKey(cve?.id));
        return { cves: unique, count: unique.length || fallbackCount };
    }

    _highestRisk(rows) {
        return [...(rows || [])]
            .sort((a, b) => (RISK_ORDER[b.riskScore] ?? 0) - (RISK_ORDER[a.riskScore] ?? 0))[0]?.riskScore || 'None';
    }

    _aggregateAppRows(rows = this.state.apps) {
        const groups = new Map();
        for (const row of rows || []) {
            const key = `${normalizeKey(row.name)}|${normalizeKey(row.vendor)}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    name: displayValue(row.name, 'Unknown application'),
                    vendor: displayValue(row.vendor, 'Unknown vendor'),
                    rawRows: [],
                });
            }
            groups.get(key).rawRows.push(row);
        }

        return Array.from(groups.values()).map(group => {
            const versionGroups = new Map();
            for (const row of group.rawRows) {
                const versionKey = row.version || 'Unknown';
                if (!versionGroups.has(versionKey)) versionGroups.set(versionKey, []);
                versionGroups.get(versionKey).push(row);
            }

            const versions = Array.from(versionGroups.entries()).map(([version, versionRows]) => {
                const devices = uniqBy(versionRows.flatMap(row => {
                    const rowFirstSeen = firstPresent(row.firstSeen, row.FirstSeen);
                    const rowLastSeen = firstPresent(row.lastSeen, row.LastSeen);
                    return (row.devices || []).map(device => ({
                        ...device,
                        firstSeen: firstPresent(device.firstSeen, device.FirstSeen, rowFirstSeen),
                        lastSeen: firstPresent(device.lastSeen, device.LastSeen, rowLastSeen),
                    }));
                }), d => this._deviceKey(d));
                const { cves, count } = this._collectCves(versionRows);
                return {
                    version,
                    riskScore: this._highestRisk(versionRows),
                    cveCount: count,
                    cves,
                    devices,
                    deviceCount: devices.length || Math.max(...versionRows.map(row => row.deviceCount || 0), 0),
                    firstSeen: minIso([...versionRows.map(row => firstPresent(row.firstSeen, row.FirstSeen)), ...devices.map(device => firstPresent(device.firstSeen, device.FirstSeen))]),
                    lastSeen: maxIso([...versionRows.map(row => firstPresent(row.lastSeen, row.LastSeen)), ...devices.map(device => firstPresent(device.lastSeen, device.LastSeen))]),
                    updatedFromVersion: versionRows.find(row => row.updatedFromVersion)?.updatedFromVersion || null,
                };
            }).sort((a, b) => (RISK_ORDER[b.riskScore] ?? 0) - (RISK_ORDER[a.riskScore] ?? 0) || b.deviceCount - a.deviceCount || String(a.version).localeCompare(String(b.version)));

            const devices = uniqBy(group.rawRows.flatMap(row => {
                const rowFirstSeen = firstPresent(row.firstSeen, row.FirstSeen);
                const rowLastSeen = firstPresent(row.lastSeen, row.LastSeen);
                return (row.devices || []).map(device => ({
                    ...device,
                    firstSeen: firstPresent(device.firstSeen, device.FirstSeen, rowFirstSeen),
                    lastSeen: firstPresent(device.lastSeen, device.LastSeen, rowLastSeen),
                }));
            }), d => this._deviceKey(d));
            const { cves, count } = this._collectCves(group.rawRows);
            const primaryVersion = versions[0] || { version: 'Unknown', riskScore: 'None', deviceCount: 0, cveCount: 0, cves: [], devices: [] };
            const bundle = group.rawRows.find(row => row.bundle)?.bundle || null;

            return {
                ...group,
                version: primaryVersion.version,
                versions,
                versionCount: versions.length,
                devices,
                deviceCount: devices.length || Math.max(...group.rawRows.map(row => row.deviceCount || 0), 0),
                cves,
                cveCount: count,
                riskScore: this._highestRisk(group.rawRows),
                firstSeen: minIso([...group.rawRows.map(row => firstPresent(row.firstSeen, row.FirstSeen)), ...devices.map(device => firstPresent(device.firstSeen, device.FirstSeen))]),
                lastSeen: maxIso([...group.rawRows.map(row => firstPresent(row.lastSeen, row.LastSeen)), ...devices.map(device => firstPresent(device.lastSeen, device.LastSeen))]),
                bundle,
                isFreeware: group.rawRows.some(row => row.isFreeware),
                status: group.rawRows.find(row => row.status)?.status || null,
                updatedFromVersion: primaryVersion.updatedFromVersion,
            };
        });
    }

    _bundleAppKey(app) {
        return `${normalizeKey(app?.name)}|${normalizeKey(app?.vendor)}|${normalizeKey(app?.version)}`;
    }

    _classifyBundleApp(app, section) {
        if (app?.bundle?.familyKey || app?.bundle?.familyLabel) {
            return {
                key: app.bundle.familyKey || 'backend-bundle',
                label: app.bundle.familyLabel || app.bundle.name || 'Backend bundle',
            };
        }

        const name = String(app?.name || '').toLowerCase();
        const vendor = String(app?.vendor || section?.vendor || '').toLowerCase();
        const version = String(app?.version || section?.version || '');
        const isMicrosoft = vendor.includes('microsoft');
        const isModernEdgeVersion = /^1[0-9]{2}\./.test(version);

        if (isMicrosoft) {
            if (/(office|word|excel|powerpoint|outlook|onenote|access|publisher|visio|project|microsoft 365|onedrive for business)/.test(name)) {
                return { key: 'office', label: 'Microsoft Office' };
            }
            if (/(visual studio|msbuild|windows sdk|debugger|build tools|vc\+\+|vcredist|\.net sdk|dotnet|sql server data tools)/.test(name)) {
                return { key: 'visual-studio', label: 'Visual Studio developer tools' };
            }
            if (/(edge|webview2)/.test(name) || (name === 'copilot' && isModernEdgeVersion)) {
                return { key: 'edge', label: 'Microsoft Edge' };
            }
            if (/(defender|smartscreen)/.test(name)) return { key: 'windows-security', label: 'Windows security component' };
            if (/family safety/.test(name)) return { key: 'windows-family', label: 'Windows family component' };
            if (/(xbox|game ui|gaming)/.test(name)) return { key: 'xbox', label: 'Xbox/Gaming component' };
            if (/(assigned access|lock app|kiosk)/.test(name)) return { key: 'windows-kiosk', label: 'Windows kiosk component' };
            if (/(windows|shell experience|feature experience|app runtime)/.test(name)) return { key: 'windows-platform', label: 'Windows platform component' };
        }

        if (/(adobe|acrobat|creative cloud|photoshop|illustrator|premiere|lightroom|audition|after effects|indesign)/.test(`${name} ${vendor}`)) {
            return { key: 'adobe', label: 'Adobe application suite' };
        }
        if (/(chrome|firefox|browser|webview)/.test(name)) return { key: 'browser-runtime', label: 'Browser runtime' };
        if (/(redistributable|runtime|vc\+\+|visual c\+\+|\.net runtime|java)/.test(name)) return { key: 'runtime', label: 'Runtime redistributable' };

        return { key: 'unknown', label: 'Unclassified component' };
    }

    _bundleFamilySummary(apps, section) {
        const backendBundle = section.bundle || apps.find(app => app.bundle)?.bundle;
        if (backendBundle) {
            return {
                label: backendBundle.name || 'Software bundle',
                confidence: backendBundle.confidence || 'Low',
                primaryKey: backendBundle.familyKey || 'backend-bundle',
                isLikelyBundle: backendBundle.isLikelyBundle !== false,
                reason: backendBundle.reason || 'Backend-derived bundle assignment.',
            };
        }

        const counts = new Map();
        apps.forEach(app => {
            const key = app.bundleFamily?.key || 'unknown';
            if (key === 'unknown') return;
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const total = apps.length || 1;
        const [primaryKey, primaryCount = 0] = ranked[0] || ['unknown', 0];
        const share = primaryCount / total;
        const labels = {
            office: 'Microsoft Office suite',
            'visual-studio': 'Visual Studio developer tools',
            edge: 'Microsoft Edge package',
            adobe: 'Adobe application suite',
            runtime: 'Runtime redistributables',
            'windows-platform': 'Windows platform components',
        };
        const recognizedSuite = ['office', 'visual-studio', 'edge', 'adobe', 'runtime', 'windows-platform'].includes(primaryKey);
        const microsoftVendor = String(section.vendor || '').toLowerCase().includes('microsoft');
        const distinctFamilies = ranked.filter(([key]) => key !== 'unknown').length;
        const windowsInboxKeys = new Set(['windows-security', 'windows-family', 'xbox', 'windows-kiosk', 'windows-platform']);
        const isMixedMicrosoftInbox = microsoftVendor
            && distinctFamilies >= 3
            && share < 0.7
            && ranked.some(([key]) => windowsInboxKeys.has(key));

        if (isMixedMicrosoftInbox) {
            return {
                label: 'Mixed Microsoft inbox components',
                confidence: 'Low',
                primaryKey,
                isLikelyBundle: false,
                reason: `${primaryCount}/${total} apps share the closest product family, but the group mixes Windows security, family, gaming, kiosk, or Edge components. Treat this as a shared vendor/version cluster, not a software bundle.`,
            };
        }

        if (recognizedSuite && share >= 0.5) {
            return {
                label: labels[primaryKey],
                confidence: share >= 0.75 ? 'High' : 'Medium',
                primaryKey,
                isLikelyBundle: true,
                reason: `${primaryCount}/${total} apps match ${labels[primaryKey]} signals.`,
            };
        }

        return {
            label: `${section.vendor || 'Vendor'} ${section.version || ''}`.trim() || 'Unknown software bundle',
            confidence: 'Low',
            primaryKey,
            isLikelyBundle: false,
            reason: primaryCount > 0
                ? `${primaryCount}/${total} apps share the closest product family, which is not enough to call this a suite.`
                : 'No strong suite pattern was detected from application names.',
        };
    }

    _bundleInstallCohesion(apps) {
        const backendBundle = apps.find(app => app.bundle?.firstSeenCohesion)?.bundle;
        if (backendBundle?.firstSeenCohesion) {
            const appCohortCounts = new Map();
            apps.forEach(app => {
                if (app.bundle?.memberConfidence === 'high') {
                    appCohortCounts.set(this._bundleAppKey(app), 1);
                }
            });
            return {
                hasEvidence: backendBundle.firstSeenCohesion.level !== 'unknown',
                level: backendBundle.firstSeenCohesion.level || 'unknown',
                ratio: Number(backendBundle.firstSeenCohesion.ratio || 0),
                appCohortCounts,
                label: backendBundle.firstSeenCohesion.label || 'FirstSeen not available for this inventory payload',
            };
        }

        const observationsByDevice = new Map();
        const appCohortCounts = new Map();
        let totalDated = 0;
        let coSeen = 0;

        apps.forEach(app => {
            this._appDeviceEntries(app).forEach(entry => {
                if (entry.firstSeenMs === null) return;
                totalDated += 1;
                if (!observationsByDevice.has(entry.key)) observationsByDevice.set(entry.key, []);
                observationsByDevice.get(entry.key).push({ app, ...entry });
            });
        });

        observationsByDevice.forEach(entries => {
            entries.forEach(entry => {
                const hasNeighbor = entries.some(other => other.app !== entry.app && Math.abs(other.firstSeenMs - entry.firstSeenMs) <= BUNDLE_INSTALL_COHORT_WINDOW_MS);
                if (!hasNeighbor) return;
                coSeen += 1;
                const key = this._bundleAppKey(entry.app);
                appCohortCounts.set(key, (appCohortCounts.get(key) || 0) + 1);
            });
        });

        if (totalDated === 0) {
            return {
                hasEvidence: false,
                level: 'unknown',
                ratio: 0,
                appCohortCounts,
                label: 'FirstSeen not available for this inventory payload',
            };
        }

        const ratio = coSeen / totalDated;
        const level = ratio >= 0.7 ? 'strong' : ratio >= 0.35 ? 'partial' : 'weak';
        const label = level === 'strong'
            ? `${Math.round(ratio * 100)}% of dated app/device observations share a FirstSeen cohort`
            : level === 'partial'
                ? `${Math.round(ratio * 100)}% of dated app/device observations share a FirstSeen cohort`
                : `Only ${Math.round(ratio * 100)}% of dated app/device observations share a FirstSeen cohort`;

        return { hasEvidence: true, level, ratio, appCohortCounts, label };
    }

    _enrichBundleSection(section) {
        const apps = this._aggregateAppRows(section.rawRows).map(app => ({
            ...app,
            bundleFamily: this._classifyBundleApp(app, section),
        }));
        const bundleDeviceKeys = new Set(apps.flatMap(app => [...this._appDeviceKeys(app)]));
        const deviceCount = bundleDeviceKeys.size;
        const familySummary = this._bundleFamilySummary(apps, section);
        const cohesion = this._bundleInstallCohesion(apps);
        const scoredApps = apps.map(app => {
            const appDeviceKeys = this._appDeviceKeys(app);
            const coverage = deviceCount > 0 ? appDeviceKeys.size / deviceCount : 1;
            if (app.bundle?.bundleId) {
                return {
                    ...app,
                    bundleDeviceCoverage: coverage,
                    bundleDeviceCoverageLabel: app.bundle.deviceCoverageLabel || `${appDeviceKeys.size}/${deviceCount || appDeviceKeys.size || 1} devices`,
                    bundleConfidence: app.bundle.memberConfidence || 'low',
                    bundleConfidenceReason: app.bundle.memberConfidenceReason || app.bundle.reason || 'Backend-derived bundle evidence.',
                };
            }

            const coverageCore = deviceCount <= 1 || appDeviceKeys.size === deviceCount;
            const familyAligned = familySummary.isLikelyBundle && (!familySummary.primaryKey || app.bundleFamily?.key === familySummary.primaryKey);
            const installAligned = !cohesion.hasEvidence || (cohesion.appCohortCounts.get(this._bundleAppKey(app)) || 0) > 0 || deviceCount <= 1;
            const isCore = coverageCore && familyAligned && installAligned;
            const reason = !coverageCore
                ? 'Seen on only part of the bundle device set; treat as adjacent or optional evidence.'
                : !familyAligned
                    ? `Looks like ${app.bundleFamily?.label || 'another component'}, not ${familySummary.label}.`
                    : !installAligned
                        ? 'Does not share a FirstSeen cohort with another app in this candidate.'
                        : 'Seen on every represented device and aligned with the bundle identity evidence.';
            return {
                ...app,
                bundleDeviceCoverage: coverage,
                bundleDeviceCoverageLabel: `${appDeviceKeys.size}/${deviceCount || appDeviceKeys.size || 1} devices`,
                bundleConfidence: isCore ? 'high' : 'low',
                bundleConfidenceReason: reason,
            };
        }).sort((a, b) => {
            if (a.bundleConfidence !== b.bundleConfidence) return a.bundleConfidence === 'high' ? -1 : 1;
            return (b.bundleDeviceCoverage || 0) - (a.bundleDeviceCoverage || 0) || String(a.name || '').localeCompare(String(b.name || ''));
        });

        const coreApps = scoredApps.filter(app => app.bundleConfidence === 'high');
        const lowConfidenceApps = scoredApps.filter(app => app.bundleConfidence === 'low');
        const bundleConfidence = !familySummary.isLikelyBundle || (cohesion.hasEvidence && cohesion.level === 'weak')
            ? 'low'
            : deviceCount > 1 && lowConfidenceApps.length > 0 ? 'mixed' : 'high';
        const identity = this._inferBundleIdentity({ ...section, apps: scoredApps, coreApps, lowConfidenceApps, deviceCount, bundleConfidence, familySummary, bundleCohesion: cohesion });

        return {
            ...section,
            subtitle: identity.isLikelyBundle === false ? 'Shared vendor/version cluster' : 'Likely bundle version',
            apps: scoredApps,
            coreApps,
            lowConfidenceApps,
            coreAppCount: coreApps.length,
            lowConfidenceAppCount: lowConfidenceApps.length,
            bundleDeviceKeys,
            deviceCount,
            appCount: scoredApps.length,
            vulnerableCount: scoredApps.filter(app => (app.cveCount || 0) > 0).length,
            bundleConfidence,
            bundleCohesion: cohesion,
            bundleFamilySummary: familySummary,
            bundleIdentity: identity,
        };
    }

    _inferBundleIdentity(section) {
        const family = section.familySummary || this._bundleFamilySummary(section.apps || [], section);
        const cohesion = section.bundleCohesion;
        let confidence = family.confidence || 'Low';
        if (family.isLikelyBundle === false || section.bundleConfidence === 'low') confidence = 'Low';
        else if (cohesion?.hasEvidence && cohesion.level === 'partial' && confidence === 'High') confidence = 'Medium';
        else if (cohesion?.hasEvidence && cohesion.level === 'weak') confidence = 'Low';

        const baseReason = String(family.reason || '').trim();
        const cohesionLabel = String(cohesion?.label || '').trim();
        const shouldAppendCohesion = cohesionLabel && !baseReason.toLowerCase().includes(cohesionLabel.toLowerCase());
        const cohesionReason = shouldAppendCohesion ? ` ${cohesionLabel}.` : '';
        return {
            label: family.label,
            confidence,
            isLikelyBundle: family.isLikelyBundle,
            reason: `${baseReason}${cohesionReason}`,
        };
    }

    _inventorySourceBadgeClass() {
        const { inventorySource, isRefreshing } = this.state;
        if (isRefreshing && (inventorySource === 'snapshot' || inventorySource === 'cache')) return 'bg-info-lt text-info';
        if (inventorySource === 'snapshot') return 'bg-warning-lt text-warning';
        if (inventorySource === 'cache') return 'bg-info-lt text-info';
        if (inventorySource === 'current') return 'bg-success-lt text-success';
        return 'bg-secondary-lt text-secondary';
    }

    parseDeepLinkFilterFromHash() {
        try {
            const hash = window.location.hash || '';
            const query = hash.includes('?') ? hash.split('?')[1] : '';
            const raw = new URLSearchParams(query).get('filter');
            if (!raw) return null;

            const parsed = { raw, apps: [], vendor: '', version: '', device: '' };
            raw.split('|').forEach(part => {
                const [key, ...rest] = String(part || '').split(':');
                const value = rest.join(':').trim();
                if (!value) return;
                const normalizedKey = key.trim().toLowerCase();
                if (normalizedKey === 'app') parsed.apps.push(value);
                else if (normalizedKey === 'vendor') parsed.vendor = value;
                else if (normalizedKey === 'version') parsed.version = value;
                else if (normalizedKey === 'device') parsed.device = value;
            });

            return parsed;
        } catch {
            return null;
        }
    }

    getTabFromHash() {
        try {
            const hash = window.location.hash || '';
            const query = hash.includes('?') ? hash.split('?')[1] : '';
            const tab = new URLSearchParams(query).get('tab');
            return ['all', 'atrisk', 'licenses'].includes(tab) ? tab : null;
        } catch {
            return null;
        }
    }

    applyDeepLinkFilterFromHash() {
        const hash = window.location.hash || '';
        const parsed = this.parseDeepLinkFilterFromHash();
        const tab = this.getTabFromHash();
        this._lastAppliedHash = hash;
        if (!parsed && !tab) return;

        const searchQuery = parsed ? this.getDeepLinkSearchText(parsed) : this.state.searchQuery;
        this.setState(prev => {
            const nextTab = tab || (parsed ? 'atrisk' : prev.activeTab);
            if (prev.deepLinkFilter?.raw === parsed?.raw && prev.searchQuery === searchQuery && prev.activeTab === nextTab) {
                return null;
            }
            return {
                deepLinkFilter: parsed,
                searchQuery,
                activeTab: nextTab,
                page: 1
            };
        });
    }

    _currentDeepLinkFilter() {
        return this.state.deepLinkFilter || this.parseDeepLinkFilterFromHash();
    }

    getDeepLinkSearchText(filter) {
        if (!filter) return '';
        return filter.apps?.[0] || filter.device || filter.vendor || filter.version || '';
    }

    clearInventoryFilters() {
        const tab = this.state.activeTab || this.getTabFromHash() || 'all';
        const nextHash = `#!/apps?tab=${tab}`;
        if ((window.location.hash || '') !== nextHash) {
            this._lastAppliedHash = nextHash;
            window.location.hash = nextHash;
        }
        this._setPagedState({ searchQuery: '', deepLinkFilter: null, groupBy: 'application' });
    }

    selectTab(tabId) {
        const nextHash = `#!/apps?tab=${tabId}`;
        if (window.location.hash !== nextHash) {
            window.location.hash = nextHash;
        }
        const update = { activeTab: tabId };
        if (tabId === 'licenses' && !['name', 'vendor', 'licenseStatus', 'licenseType', 'expiryDate', 'notes', 'updatedAt'].includes(this.state.sortCol)) {
            update.sortCol = 'name';
            update.sortDir = 'asc';
        }
        this._setPagedState(update);
    }

    // ─── data loading ────────────────────────────────────────────────────────

    async loadData(forceRefresh = false) {
        if (!this._isMounted || !this._isActiveRoute()) return;
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId;
        if (!orgId) {
            this.setState({ error: 'No organisation selected', loading: false });
            return;
        }

        const rewindDate = api.getEffectiveDate();
        const cacheKey = this._currentCacheKey();
        const isHistorical = !!rewindDate;
        const licensePromise = this._loadLicenses(orgId).catch(err => {
            console.warn('[SoftwareInventory] license load failed:', err);
            return this.state.licenses || {};
        });

        if (forceRefresh && this.state.apps.length > 0) {
            this.setState({ isRefreshing: true, error: null });
        }

        // Step 1 — serve from cache immediately (SWR pattern)
        let hasCachedApps = false;
        if (!forceRefresh) {
            const cached = this._readCache(cacheKey);
            if (cached) {
                const cachedApps = cached.data.apps || [];
                const cachedMeta = cached.data.meta || {};
                hasCachedApps = cachedApps.length > 0;
                this.setState({
                    apps: cachedApps,
                    licenses: cached.data.licenses || {},
                    loading: false,
                    isRefreshing: cached.stale,
                    inventorySource: cachedMeta.source || (cachedApps.length ? 'cache' : this.state.inventorySource),
                    inventoryAsOfDateUtc: cachedMeta.asOfDateUtc || null,
                    inventoryCachedAtUtc: cachedMeta.cachedAtUtc || null,
                    error: null,
                });
                this._reapplyHashFilter();
                if (!cached.stale) return;   // fresh — no background fetch needed
            }
        }

        // Step 2 — on cold live loads, request the endpoint's cached-summary path first.
        // It can return the latest cached/snapshot inventory without waiting for full Current enrichment.
        if (!forceRefresh && !isHistorical && !hasCachedApps) {
            try {
                const seedResponse = await api.getSoftwareInventory(orgId, { includeCachedSummary: true });
                if (!this._isMounted || !this._isActiveRoute()) return;
                const seed = this._normalizeInventoryResponse(seedResponse);
                if (seed.apps.length > 0) {
                    hasCachedApps = true;
                    const licenses = this.state.licenses || {};
                    this._writeInventoryCache(cacheKey, seed.apps, licenses, seed.meta);
                    this.setState({
                        apps: seed.apps,
                        licenses,
                        loading: false,
                        isRefreshing: true,
                        inventorySource: seed.meta.source || 'snapshot',
                        inventoryAsOfDateUtc: seed.meta.asOfDateUtc || null,
                        inventoryCachedAtUtc: seed.meta.cachedAtUtc || null,
                        error: null,
                    });
                    this._reapplyHashFilter();
                }
            } catch (seedErr) {
                console.warn('[SoftwareInventory] cached-summary seed failed:', seedErr);
            }
        }

        if (!hasCachedApps && !this.state.apps.length) this.setState({ loading: true, error: null });

        try {
            // Step 3 — refresh full live/historical details in the background.
            const invRes = await api.getSoftwareInventory(orgId, rewindDate ? { date: rewindDate } : {});
            if (!this._isMounted || !this._isActiveRoute()) return;

            const inventory = this._normalizeInventoryResponse(invRes);
            const apps = inventory.apps;
            const licenses = await licensePromise;
            if (!this._isMounted || !this._isActiveRoute()) return;

            this._writeInventoryCache(cacheKey, apps, licenses, inventory.meta);

            this.setState({
                apps,
                licenses,
                loading: false,
                isRefreshing: false,
                inventorySource: inventory.meta.source || (isHistorical ? 'snapshot' : 'current'),
                inventoryAsOfDateUtc: inventory.meta.asOfDateUtc || (isHistorical ? rewindDate : null),
                inventoryCachedAtUtc: inventory.meta.cachedAtUtc || null,
                error: null,
            });
            this._reapplyHashFilter();
        } catch (err) {
            if (!this._isMounted || !this._isActiveRoute()) return;
            console.error('[SoftwareInventory] loadData failed:', err);
            if (!this.state.apps.length) {
                this.setState({ error: err.message || 'Failed to load inventory', loading: false, isRefreshing: false });
            } else {
                this.setState({ isRefreshing: false });
            }
        }
    }

    // ─── derived data helpers ────────────────────────────────────────────────

    _filteredApps() {
        const q = this.state.searchQuery.trim().toLowerCase();
        const deepLink = this._currentDeepLinkFilter();
        let list = this.state.apps;

        if (deepLink) {
            const matchesDeepLink = (a, strict) => {
                const appName = a.name || '';
                const vendor = a.vendor || '';
                const version = a.version || '';
                const devices = Array.isArray(a.devices) ? a.devices : [];

                const appMatch = !deepLink.apps.length || deepLink.apps.some(name => appName.toLowerCase().includes(name.toLowerCase()));
                const deviceMatch = !deepLink.device || devices.some(device =>
                    String(device?.deviceName || '').toLowerCase().includes(deepLink.device.toLowerCase())
                    || String(device?.deviceId || '').toLowerCase().includes(deepLink.device.toLowerCase())
                );
                if (!appMatch || !deviceMatch) return false;
                if (!strict) return true;

                const vendorMatch = !deepLink.vendor || vendor.toLowerCase().includes(deepLink.vendor.toLowerCase());
                const versionMatch = !deepLink.version || version.toLowerCase().includes(deepLink.version.toLowerCase());
                return vendorMatch && versionMatch;
            };

            const strictMatches = list.filter(app => matchesDeepLink(app, true));
            list = strictMatches.length ? strictMatches : list.filter(app => matchesDeepLink(app, false));
        }

        if (q) {
            list = list.filter(a =>
                (a.name  || '').toLowerCase().includes(q) ||
                (a.vendor|| '').toLowerCase().includes(q) ||
                (a.version||'').toLowerCase().includes(q) ||
                (a.cves || []).some(cve => (cve?.id || '').toLowerCase().includes(q)) ||
                (a.devices || []).some(d =>
                    (d.deviceName || '').toLowerCase().includes(q)
                    || (d.deviceId || '').toLowerCase().includes(q)
                )
            );
        }

        list = this._aggregateAppRows(list);

        const { sortCol, sortDir } = this.state;
        list = [...list].sort((a, b) => {
            let av = a[sortCol] ?? '';
            let bv = b[sortCol] ?? '';
            if (sortCol === 'riskScore') {
                av = RISK_ORDER[a.riskScore] ?? 0;
                bv = RISK_ORDER[b.riskScore] ?? 0;
            }
            if (typeof av === 'string') av = av.toLowerCase();
            if (typeof bv === 'string') bv = bv.toLowerCase();
            const cmp = av > bv ? 1 : av < bv ? -1 : 0;
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return list;
    }

    _atRiskApps() {
        return this._filteredApps().filter(a => (a.cveCount || 0) > 0);
    }

    _kpis() {
        const { apps, licenses } = this.state;
        const appRows = this._aggregateAppRows(apps);
        const total    = appRows.length;
        const versionCount = appRows.reduce((sum, app) => sum + (app.versions?.length || 1), 0);
        const vulnVersions = appRows.reduce((sum, app) => sum + (app.versions || []).filter(version => (version.cveCount || 0) > 0).length, 0);
        const vulnApps = appRows.filter(a => (a.cveCount || 0) > 0).length;
        const vulnDevices = new Set(
            apps.filter(a => (a.cveCount || 0) > 0)
                .flatMap(a => (a.devices || []).map(d => d?.deviceId || d?.deviceName || ''))
                .filter(Boolean)
        ).size;
        const freeware = appRows.filter(a => a.isFreeware).length;
        const criticalRows = appRows.reduce((sum, app) => sum + (app.versions || []).filter(version => version.riskScore === 'Critical').length, 0);
        const highRows = appRows.reduce((sum, app) => sum + (app.versions || []).filter(version => version.riskScore === 'High').length, 0);
        const urgentRows = criticalRows + highRows;
        const manuallyTracked = appRows.filter(a => !!licenses[this._appKey(a)]).length;
        const licensed = manuallyTracked + freeware; // Freeware is auto-classified
        const unlicensed = Math.max(0, total - licensed);
        const deviceCoverage = new Set(
            apps.flatMap(a => (a.devices || []).map(d => d?.deviceId || d?.deviceName || '').filter(Boolean))
        ).size;
        const licenseCompletion = total > 0 ? Math.round((licensed / total) * 100) : 0;
        return { total, versionCount, vulnVersions, vulnApps, vulnDevices, freeware, criticalRows, highRows, urgentRows, licensed, unlicensed, licenseCompletion, deviceCoverage };
    }

    _appKey(app) { return encodeURIComponent(app.name || ''); }

    _openDetails(app) {
        this.setState({ detailsAppKey: this._appKey(app) });
    }

    _closeDetails() {
        this.setState({ detailsAppKey: null });
    }

    _findAppByKey(appKey) {
        if (!appKey) return null;
        return this._aggregateAppRows(this.state.apps).find(a => this._appKey(a) === appKey) || null;
    }

    _setPagedState(update) {
        this.setState({ ...update, page: 1 });
    }

    _paginateRows(rows) {
        const pageSize = Number(this.state.pageSize) || 25;
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        const page = Math.min(Math.max(1, Number(this.state.page) || 1), totalPages);
        const start = (page - 1) * pageSize;
        return { page, pageSize, rows: rows.slice(start, start + pageSize), total: rows.length };
    }

    _getVersionBreakdown(appName) {
        const target = (appName || '').toLowerCase();
        const rows = this.state.apps.filter(a => (a.name || '').toLowerCase() === target);
        return rows
            .map(a => ({
                version: a.version || 'Unknown',
                riskScore: a.riskScore || 'Unknown',
                cveCount: a.cveCount || 0,
                devices: Array.isArray(a.devices) ? a.devices : [],
            }))
            .sort((a, b) => (b.devices.length - a.devices.length));
    }

    // ─── sort helpers ────────────────────────────────────────────────────────

    _sort(col) {
        const { sortCol, sortDir } = this.state;
        this._setPagedState({
            sortCol: col,
            sortDir: (sortCol === col && sortDir === 'desc') ? 'asc' : 'desc',
        });
    }

    _sortIcon(col) {
        if (this.state.sortCol !== col) return html`<span class="text-muted ms-1" style="opacity:.35">↕</span>`;
        return html`<span class="text-primary ms-1">${this.state.sortDir === 'asc' ? '↑' : '↓'}</span>`;
    }

    // ─── license editing ─────────────────────────────────────────────────────

    _startEdit(app) {
        const key = this._appKey(app);
        const existing = this.state.licenses[key] || {};
        this.setState({
            editingKey: key,
            saveError: null,
            editForm: {
                licenseType: existing.licenseType || 'Unknown',
                expiryDate:  existing.expiryDate ? existing.expiryDate.split('T')[0] : '',
                notes:       existing.notes || '',
            },
        });
    }

    _cancelEdit() { this.setState({ editingKey: null }); }

    async _saveEdit(app) {
        const key = this._appKey(app);
        const { editForm } = this.state;
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;

        this.setState({ savingKey: key, saveError: null });
        try {
            const payload = {
                licenseType: editForm.licenseType,
                expiryDate:  editForm.expiryDate ? new Date(editForm.expiryDate).toISOString() : null,
                notes:       editForm.notes || null,
            };
            const res = await api.setAppLicense(org.orgId, app.name, payload);
            if (!res?.success) throw new Error(res?.message || 'Failed to save');

            // Merge updated license into local state
            const licenses = { ...this.state.licenses, [key]: { appKey: key, ...payload, updatedAt: new Date().toISOString() } };
            this._writeInventoryCache(
                `sw_inventory_${org.orgId}`,
                this.state.apps,
                licenses,
                {
                    source: this.state.inventorySource || 'cache',
                    asOfDateUtc: this.state.inventoryAsOfDateUtc,
                    cachedAtUtc: this.state.inventoryCachedAtUtc,
                }
            );
            this.setState({ licenses, editingKey: null, savingKey: null });
        } catch (err) {
            this.setState({ savingKey: null, saveError: err.message });
        }
    }

    async _deleteLicense(app) {
        const key = this._appKey(app);
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;
        if (!confirm(`Remove license record for "${app.name}"?`)) return;

        try {
            await api.deleteAppLicense(org.orgId, app.name);
            const licenses = { ...this.state.licenses };
            delete licenses[key];
            this.setState({ licenses });
        } catch (err) {
            alert(`Delete failed: ${err.message}`);
        }
    }

    _licenseInfo(app) {
        const license = this.state.licenses[this._appKey(app)] || null;
        const expiryDate = license?.expiryDate ? new Date(license.expiryDate) : null;
        const validExpiry = expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null;
        const daysLeft = validExpiry ? Math.ceil((validExpiry - Date.now()) / 86_400_000) : null;

        let status = 'untracked';
        let statusLabel = 'Needs classification';
        let statusBadge = 'bg-warning-lt text-warning';

        if (license && daysLeft !== null && daysLeft < 0) {
            status = 'expired';
            statusLabel = 'Expired';
            statusBadge = 'bg-danger-lt text-danger';
        } else if (license && daysLeft !== null && daysLeft <= 30) {
            status = 'expiring';
            statusLabel = 'Expiring soon';
            statusBadge = 'bg-warning-lt text-warning';
        } else if (license) {
            status = 'tracked';
            statusLabel = 'Classified';
            statusBadge = 'bg-purple-lt text-purple';
        } else if (app.isFreeware) {
            status = 'freeware';
            statusLabel = 'Freeware';
            statusBadge = 'bg-success-lt text-success';
        }

        return {
            license,
            status,
            statusLabel,
            statusBadge,
            type: license?.licenseType || (app.isFreeware ? 'Freeware' : 'Not tracked'),
            expiryDate: validExpiry,
            daysLeft,
            notes: license?.notes || '',
            updatedAt: license?.updatedAt ? new Date(license.updatedAt) : null,
        };
    }

    _filterLicenseApps(appRows) {
        const query = this.state.searchQuery.trim().toLowerCase();
        const statusFilter = this.state.licenseStatusFilter || 'all';
        const typeFilter = this.state.licenseTypeFilter || 'all';

        return appRows.filter(app => {
            const info = this._licenseInfo(app);
            if (statusFilter !== 'all' && info.status !== statusFilter) return false;
            if (typeFilter !== 'all' && info.type !== typeFilter) return false;
            if (!query) return true;

            const haystack = [
                app.name,
                app.vendor,
                info.statusLabel,
                info.type,
                info.notes,
                info.expiryDate ? info.expiryDate.toLocaleDateString() : '',
                ...(app.versions || []).map(version => version.version),
                ...(app.devices || []).flatMap(device => [device?.deviceName, device?.deviceId]),
            ].filter(Boolean).join(' ').toLowerCase();

            return haystack.includes(query);
        });
    }

    _sortLicenseApps(appRows) {
        const { sortCol, sortDir } = this.state;
        const direction = sortDir === 'asc' ? 1 : -1;
        const statusOrder = { expired: 5, expiring: 4, untracked: 3, tracked: 2, freeware: 1 };

        const valueFor = app => {
            const info = this._licenseInfo(app);
            switch (sortCol) {
                case 'vendor': return app.vendor || '';
                case 'licenseStatus': return statusOrder[info.status] || 0;
                case 'licenseType': return info.type || '';
                case 'expiryDate': return info.expiryDate ? info.expiryDate.getTime() : Number.POSITIVE_INFINITY;
                case 'notes': return info.notes || '';
                case 'updatedAt': return info.updatedAt && !Number.isNaN(info.updatedAt.getTime()) ? info.updatedAt.getTime() : 0;
                case 'name':
                default: return app.name || '';
            }
        };

        return [...appRows].sort((a, b) => {
            let av = valueFor(a);
            let bv = valueFor(b);
            if (typeof av === 'string') av = av.toLowerCase();
            if (typeof bv === 'string') bv = bv.toLowerCase();
            const cmp = av > bv ? 1 : av < bv ? -1 : 0;
            return cmp * direction || String(a.name || '').localeCompare(String(b.name || ''));
        });
    }

    _licenseStatusOptions() {
        return [
            { id: 'all', label: 'All statuses' },
            { id: 'untracked', label: 'Needs classification' },
            { id: 'tracked', label: 'Classified' },
            { id: 'freeware', label: 'Freeware' },
            { id: 'expiring', label: 'Expiring soon' },
            { id: 'expired', label: 'Expired' },
        ];
    }

    // ─── render helpers ──────────────────────────────────────────────────────

    _renderKpiStrip(kpis) {
        const cards = [
            {
                label: 'Patch Queue',
                value: kpis.vulnApps,
                accent: kpis.vulnApps > 0 ? 'danger' : 'success',
                hint: kpis.vulnApps > 0
                    ? `${kpis.vulnVersions} vulnerable version${kpis.vulnVersions === 1 ? '' : 's'} \u00b7 ${kpis.vulnDevices} device${kpis.vulnDevices === 1 ? '' : 's'} affected`
                    : 'no apps with open CVEs'
            },
            {
                label: 'Critical / High',
                value: kpis.urgentRows,
                accent: kpis.urgentRows > 0 ? 'warning' : 'success',
                hint: `${kpis.criticalRows} critical \u00b7 ${kpis.highRows} high versions`
            },
            {
                label: 'Applications',
                value: kpis.total,
                accent: 'blue',
                hint: `${kpis.versionCount} version${kpis.versionCount === 1 ? '' : 's'} tracked`
            },
            orgContext.isIndividualUser()
                ? { label: 'Freeware', value: kpis.freeware, accent: 'success', hint: 'clearly identified as free' }
                : { label: 'License Queue', value: kpis.unlicensed, accent: kpis.unlicensed > 0 ? 'purple' : 'success', hint: `${kpis.licenseCompletion}% classified \u00b7 ${kpis.freeware} freeware` },
        ];

        return html`
            <div class="row row-cards mb-3 software-kpi-grid">
                ${cards.map(c => html`
                    <div class="col-6 col-sm-4 col-lg-3">
                        <div class="card card-sm h-100 software-kpi-card software-kpi-${c.accent}">
                            <div class="card-body">
                                <div class="d-flex align-items-start justify-content-between gap-2">
                                    <div class="subheader mb-1">${c.label}</div>
                                    <span class="software-kpi-dot"></span>
                                </div>
                                <div class="software-kpi-value">${c.value}</div>
                                <div class="text-muted small software-kpi-hint">${c.hint}</div>
                            </div>
                        </div>
                    </div>
                `)}
            </div>
        `;
    }

    _renderCommandStrip(kpis, sourceLabel) {
        const hasRisk = kpis.vulnApps > 0;
        const licenseNeedsWork = !orgContext.isIndividualUser() && kpis.unlicensed > 0;
        const headline = hasRisk
            ? `${kpis.vulnApps} app${kpis.vulnApps === 1 ? '' : 's'} need patch review`
            : 'No vulnerable applications in the current view';
        const detail = hasRisk
            ? `${kpis.vulnVersions} vulnerable version${kpis.vulnVersions === 1 ? '' : 's'} across ${kpis.vulnDevices} device${kpis.vulnDevices === 1 ? '' : 's'}.`
            : `${kpis.total} applications and ${kpis.versionCount} versions loaded from ${kpis.deviceCoverage} software-reporting device${kpis.deviceCoverage === 1 ? '' : 's'}.`;

        return html`
            <div class="card mb-3 software-command-strip">
                <div class="card-body d-flex align-items-center justify-content-between gap-3 flex-wrap">
                    <div class="d-flex align-items-start gap-3 flex-fill">
                        <span class="avatar ${hasRisk ? 'bg-danger-lt text-danger' : 'bg-success-lt text-success'} software-command-avatar">
                            ${hasRisk ? kpis.vulnApps : 'OK'}
                        </span>
                        <div>
                            <div class="fw-semibold">${headline}</div>
                            <div class="text-muted small">${detail}</div>
                            ${!orgContext.isIndividualUser() ? html`
                                <div class="d-flex flex-wrap gap-2 mt-2">
                                    <span class="badge bg-purple text-white">${kpis.licensed} classified</span>
                                    <span class="badge ${licenseNeedsWork ? 'bg-warning-lt text-warning' : 'bg-success-lt text-success'}">
                                        ${kpis.unlicensed} license${kpis.unlicensed === 1 ? '' : 's'} to classify
                                    </span>
                                    ${sourceLabel ? html`<span class="badge ${this._inventorySourceBadgeClass()}">${sourceLabel}</span>` : ''}
                                </div>
                            ` : sourceLabel ? html`
                                <div class="mt-2"><span class="badge ${this._inventorySourceBadgeClass()}">${sourceLabel}</span></div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="btn-list justify-content-end">
                        <button type="button" class="btn ${hasRisk ? 'btn-danger' : 'btn-outline-primary'}" onClick=${() => this.selectTab(hasRisk ? 'atrisk' : 'all')}>
                            ${hasRisk ? 'Review Patch Queue' : 'View Inventory'}
                        </button>
                        ${licenseNeedsWork ? html`
                            <button type="button" class="btn btn-outline-secondary" onClick=${() => this.selectTab('licenses')}>
                                Classify Licenses
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    _renderRiskBadge(score) {
        const cls = RISK_BADGE[score] || 'bg-secondary text-white';
        return html`<span class="badge ${cls}">${score || 'N/A'}</span>`;
    }

    _renderSeverityBadge(sev) {
        const map = { Critical: 'bg-danger text-white', High: 'bg-warning text-white', Medium: 'bg-info text-white', Low: 'bg-success text-white', Unknown: 'bg-secondary text-white' };
        const cls = map[sev] || 'bg-secondary text-white';
        return html`<span class="badge ${cls}">${sev}</span>`;
    }

    _renderSortTh(label, col, extra = '') {
        return html`<${SortableHeader}
            label=${label}
            field=${col}
            sortField=${this.state.sortCol}
            sortAsc=${this.state.sortDir === 'asc'}
            onSort=${field => this._sort(field)}
            style=${`white-space:nowrap;${extra}`}
        />`;
    }

    _renderDeviceLinks(devices, maxVisible = 3) {
        if (!devices || devices.length === 0) {
            return html`<span class="text-muted small">No device attribution</span>`;
        }

        const visible = devices.slice(0, maxVisible);
        const remaining = Math.max(0, devices.length - visible.length);

        return html`
            <div class="d-flex flex-wrap gap-1">
                ${visible.map(device => html`
                    <a href=${`#!/devices/${device.deviceId}`} class="badge bg-blue-lt text-blue text-decoration-none">
                        ${device.deviceName || device.deviceId}
                    </a>
                `)}
                ${remaining > 0 ? html`<span class="badge bg-secondary-lt text-secondary">+${remaining} more</span>` : ''}
            </div>
        `;
    }

    _renderDeviceSummary(app) {
        const devices = Array.isArray(app.devices) ? app.devices : [];
        const count = app.deviceCount ?? devices.length;
        if (count <= 0) return html`<span class="text-muted small">No device attribution</span>`;

        if (count === 1) {
            const device = devices[0] || {};
            const label = device.deviceName || device.deviceId;
            return label
                ? html`<a href=${`#!/devices/${device.deviceId || label}`} class="badge bg-blue-lt text-blue text-decoration-none">${label}</a>`
                : html`<span class="fw-semibold">1 device</span>`;
        }

        return html`
            <div class="fw-semibold">${count} devices</div>
            <div class="text-muted small">Open View for the version map</div>
        `;
    }

    _renderVersionSummary(app) {
        const versions = Array.isArray(app.versions) ? app.versions : [];
        if (versions.length === 0) return html`<span class="text-muted">Unknown</span>`;

        const visible = versions.slice(0, 3);
        const remaining = Math.max(0, versions.length - visible.length);
        return html`
            <div class="d-flex flex-column gap-2">
                <div class="d-flex flex-wrap gap-1">
                    ${visible.map(v => html`
                        <span class="badge ${v.cveCount > 0 ? 'bg-danger-lt text-danger' : 'bg-secondary-lt text-secondary'}" title=${`${v.deviceCount} device${v.deviceCount === 1 ? '' : 's'}`}>
                            ${v.version || 'Unknown'}
                        </span>
                    `)}
                    ${remaining > 0 ? html`<span class="badge bg-secondary-lt text-secondary">+${remaining}</span>` : ''}
                </div>
                <div class="small text-muted">
                    ${versions.length} version${versions.length === 1 ? '' : 's'} tracked
                </div>
            </div>
        `;
    }

    _renderAppMeta(app) {
        const versionCount = app.versionCount || app.versions?.length || 1;
        const cveLabel = (app.cveCount || 0) > 0
            ? html`<span class="badge bg-danger-lt text-danger">${app.cveCount} CVE${app.cveCount === 1 ? '' : 's'}</span>`
            : html`<span class="badge bg-success-lt text-success">No CVEs</span>`;

        return html`
            <div class="d-flex flex-wrap gap-1 mt-2">
                ${cveLabel}
                ${app.isFreeware ? html`<span class="badge bg-success-lt text-success">Free</span>` : ''}
                ${app.status ? html`<span class="badge bg-secondary-lt text-secondary">${app.status}</span>` : ''}
                ${versionCount > 1 ? html`<span class="badge bg-warning-lt text-warning">${versionCount} versions tracked</span>` : ''}
                ${app.bundleConfidence === 'high' ? html`<span class="badge bg-success-lt text-success" title=${app.bundleConfidenceReason || ''}>Bundle core · ${app.bundleDeviceCoverageLabel || 'all devices'}</span>` : ''}
                ${app.bundleConfidence === 'low' ? html`<span class="badge bg-warning-lt text-warning" title=${app.bundleConfidenceReason || ''}>Low-confidence bundle member · ${app.bundleDeviceCoverageLabel || 'partial devices'}</span>` : ''}
            </div>
        `;
    }

    _focusVersionForMagi(app) {
        const versions = Array.isArray(app.versions) ? app.versions : [];
        return versions.find(version => (version.cveCount || 0) > 0) || versions[0] || {
            version: app.version || 'Unknown',
            devices: app.devices || [],
            cves: app.cves || [],
            cveCount: app.cveCount || 0,
            riskScore: app.riskScore || 'Unknown'
        };
    }

    _buildMagiFixQuestion(app, focusVersion) {
        const cves = Array.isArray(focusVersion.cves) ? focusVersion.cves : [];
        const cveText = cves.length
            ? cves.slice(0, 8).map(cve => cve.id).filter(Boolean).join(', ')
            : `${focusVersion.cveCount || app.cveCount || 0} linked CVE${(focusVersion.cveCount || app.cveCount || 0) === 1 ? '' : 's'}`;
        return `How should I remediate ${app.name} ${focusVersion.version || ''} from ${app.vendor || 'unknown vendor'} on Windows?\n\n` +
            `Context from the Software page:\n` +
            `- Application: ${app.name}\n` +
            `- Vendor: ${app.vendor || 'Unknown'}\n` +
            `- Installed version focus: ${focusVersion.version || 'Unknown'}\n` +
            `- Affected devices for this version: ${focusVersion.deviceCount || focusVersion.devices?.length || app.deviceCount || 0}\n` +
            `- Overall application versions tracked: ${app.versionCount || app.versions?.length || 1}\n` +
            `- Risk: ${focusVersion.riskScore || app.riskScore || 'Unknown'}\n` +
            `- CVEs: ${cveText}\n\n` +
            `Give me practical remediation steps, the safest update source, rollback notes, and a quick MagenSec verification checklist.`;
    }

    async _askMagiForApp(app) {
        if (!orgContext.hasMagi?.()) {
            window.location.hash = '#!/upgrade?feature=MAGI';
            return;
        }

        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;

        const focusVersion = this._focusVersionForMagi(app);
        const cveId = Array.isArray(focusVersion.cves) ? focusVersion.cves.find(cve => cve?.id)?.id : null;
        const question = this._buildMagiFixQuestion(app, focusVersion);

        this.setState({
            magiAppKey: this._appKey(app),
            magiLoading: true,
            magiAnswer: null,
            magiError: null,
            magiCacheId: null,
            magiFeedback: null,
            magiWasCached: false,
        });

        try {
            const response = await api.askAIAnalyst(org.orgId, {
                action: 'fix',
                question,
                includeContext: true,
                fixAppName: app.name || 'unknown',
                fixVendor: app.vendor || 'unknown',
                fixVersion: focusVersion.version || app.version || 'unknown',
                fixOs: 'windows',
                fixCveId: cveId || null,
                context: {
                    hint: 'software-remediation',
                    route: '#!/apps',
                    source: 'software-ask-magi'
                }
            });

            const answer = response?.data?.answer || response?.answer || response?.data?.response || response?.response;
            if (!response?.success || !answer) {
                throw new Error(response?.message || 'MAGI could not prepare remediation guidance.');
            }

            const citations = response?.data?.citations || [];
            const cacheCitation = citations.find(item => String(item || '').startsWith('cache:'));
            this.setState({
                magiLoading: false,
                magiAnswer: answer,
                magiCacheId: cacheCitation ? String(cacheCitation).slice('cache:'.length) : null,
                magiWasCached: /cached/i.test(response?.message || '') || !!cacheCitation,
            });
        } catch (error) {
            this.setState({
                magiLoading: false,
                magiError: error?.message || 'Failed to contact MAGI.'
            });
        }
    }

    _bundleMagiCacheKey(section) {
        const org = orgContext.getCurrentOrg();
        const orgId = org?.orgId || 'org';
        const effectiveDate = api.getEffectiveDate?.() || 'current';
        return `sw_bundle_magi_${orgId}_${effectiveDate}_${section.key}`;
    }

    _readBundleMagiCache(section) {
        try {
            const raw = localStorage.getItem(this._bundleMagiCacheKey(section));
            if (!raw) return null;
            const cached = JSON.parse(raw);
            if (!cached?.answer || Date.now() - (cached.generatedAt || 0) > 24 * 60 * 60 * 1000) return null;
            return cached;
        } catch { return null; }
    }

    _writeBundleMagiCache(section, result) {
        try { localStorage.setItem(this._bundleMagiCacheKey(section), JSON.stringify(result)); } catch { /* ignore quota */ }
    }

    _buildBundleIdentityQuestion(section) {
        const coreApps = section.coreApps?.length ? section.coreApps : section.apps || [];
        const partialApps = section.lowConfidenceApps || [];
        const formatFirstSeen = app => app.firstSeen ? new Date(app.firstSeen).toLocaleString() : 'FirstSeen unknown';
        const formatApp = app => `${app.name || 'Unknown app'} (${app.bundleDeviceCoverageLabel || `${app.deviceCount || 0} devices`}; ${app.bundleFamily?.label || 'unclassified'}; ${formatFirstSeen(app)})`;
        return `Identify this likely software bundle or suite from the Software page evidence.\n\n` +
            `Vendor/version grouping: ${section.title}\n` +
            `Device coverage: ${section.deviceCount} represented device${section.deviceCount === 1 ? '' : 's'}\n` +
            `Local identity guess: ${section.bundleIdentity?.label || 'Unknown'} (${section.bundleIdentity?.confidence || 'Low'} confidence)\n` +
            `FirstSeen cohesion: ${section.bundleCohesion?.label || 'Unknown'}\n` +
            `Core apps seen on all represented devices:\n${coreApps.map(app => `- ${formatApp(app)}`).join('\n') || '- None'}\n` +
            `Partial/low-confidence apps seen on only some devices:\n${partialApps.map(app => `- ${formatApp(app)}`).join('\n') || '- None'}\n\n` +
            `Return a short operator answer with: bundle name, confidence, why, and whether partial apps should stay attached or be treated as optional/adjacent. If most apps are Microsoft Office, call it Office. If most are Visual Studio developer tools, call it Visual Studio tools. If the group is mostly Microsoft Edge/WebView2/Edge DevTools, call it Microsoft Edge. If product families are mixed even though vendor/version matches, say it is not a real bundle. Do not invent evidence beyond this list.`;
    }

    async _identifyBundleWithMagi(section) {
        if (!orgContext.hasMagi?.()) {
            window.location.hash = '#!/upgrade?feature=MAGI';
            return;
        }

        const org = orgContext.getCurrentOrg();
        if (!org?.orgId || !section?.key) return;

        const cached = this._readBundleMagiCache(section);
        if (cached) {
            this.setState(prev => ({
                bundleMagiResults: { ...prev.bundleMagiResults, [section.key]: { ...cached, cached: true } },
                bundleMagiErrors: { ...prev.bundleMagiErrors, [section.key]: null },
            }));
            return;
        }

        this.setState(prev => ({
            bundleMagiLoadingKey: section.key,
            bundleMagiErrors: { ...prev.bundleMagiErrors, [section.key]: null },
        }));

        try {
            const response = await api.askAIAnalyst(org.orgId, {
                question: this._buildBundleIdentityQuestion(section),
                includeContext: true,
                context: {
                    hint: 'software-bundle-identity',
                    route: '#!/apps',
                    source: 'software-bundle-magi',
                    bundleKey: section.key,
                    bundleTitle: section.title,
                    firstSeenCohesion: section.bundleCohesion?.label || null,
                    localIdentity: section.bundleIdentity?.label || null,
                    coreApps: (section.coreApps || []).map(app => ({ name: app.name, vendor: app.vendor, family: app.bundleFamily?.label, firstSeen: app.firstSeen, deviceCoverage: app.bundleDeviceCoverageLabel })),
                    partialApps: (section.lowConfidenceApps || []).map(app => ({ name: app.name, vendor: app.vendor, family: app.bundleFamily?.label, firstSeen: app.firstSeen, deviceCoverage: app.bundleDeviceCoverageLabel })),
                }
            });

            const answer = response?.data?.answer || response?.answer || response?.data?.response || response?.response;
            if (!response?.success || !answer) {
                throw new Error(response?.message || 'MAGI could not identify this bundle.');
            }

            const result = { answer, generatedAt: Date.now(), cached: false };
            this._writeBundleMagiCache(section, result);
            this.setState(prev => ({
                bundleMagiLoadingKey: null,
                bundleMagiResults: { ...prev.bundleMagiResults, [section.key]: result },
            }));
        } catch (error) {
            this.setState(prev => ({
                bundleMagiLoadingKey: null,
                bundleMagiErrors: { ...prev.bundleMagiErrors, [section.key]: error?.message || 'Failed to contact MAGI.' },
            }));
        }
    }

    _closeMagiPanel() {
        this.setState({ magiAppKey: null, magiLoading: false, magiAnswer: null, magiError: null, magiCacheId: null, magiFeedback: null, magiWasCached: false });
    }

    async _submitMagiFeedback(vote) {
        const cacheId = this.state.magiCacheId;
        if (!cacheId) return;
        const org = orgContext.getCurrentOrg();
        if (!org?.orgId) return;

        this.setState({ magiFeedback: vote });
        try {
            await api.askAIAnalyst(org.orgId, {
                action: vote === 'up' ? 'upvote' : 'downvote',
                cacheId,
                question: this.state.magiAppKey || '',
                context: { hint: 'software-magi-feedback', route: '#!/apps', source: 'software-ask-magi-feedback' }
            });
        } catch {
            // Feedback is non-blocking; keep the UI calm if the vote write fails.
        }
    }

    _renderRowActions(app) {
        const hasRisk = (app.cveCount || 0) > 0;
        return html`
            <div class="btn-list justify-content-end flex-nowrap software-row-actions">
                ${hasRisk ? html`
                    <button type="button" class="btn btn-sm btn-purple" onClick=${() => this._askMagiForApp(app)} title="Ask MAGI for remediation steps">
                        Ask MAGI
                    </button>
                ` : ''}
                <button class="btn btn-sm btn-outline-primary" type="button" onClick=${() => this._openDetails(app)}>
                    View
                </button>
            </div>
        `;
    }

    _renderAppTableRows(apps) {
        return apps.map(app => html`
            <tr class="apps-inventory-row ${(app.cveCount || 0) > 0 ? 'apps-risk-row' : ''}">
                <td>
                    <div class="d-flex align-items-start gap-2">
                        <span class="avatar avatar-sm bg-blue-lt text-blue">
                            ${(app.name || '?')[0].toUpperCase()}
                        </span>
                        <div class="apps-inventory-appcell">
                            <div class="fw-medium text-reset">${app.name || '—'}</div>
                            <div class="text-muted small">${app.vendor || 'Unknown vendor'}</div>
                            ${this._renderAppMeta(app)}
                        </div>
                    </div>
                </td>
                <td>
                    ${this._renderVersionSummary(app)}
                </td>
                <td>
                    ${this._renderDeviceSummary(app)}
                </td>
                <td>
                    <div class="d-flex flex-column gap-2 align-items-start">
                        ${this._renderRiskBadge(app.riskScore)}
                        ${(app.cveCount || 0) > 0
                            ? html`<span class="text-danger small fw-medium">${app.cveCount} linked CVE${app.cveCount === 1 ? '' : 's'}</span>`
                            : html`<span class="text-muted small">No linked CVEs</span>`}
                    </div>
                </td>
                <td class="text-end">
                    ${this._renderRowActions(app)}
                </td>
            </tr>
        `);
    }

    _groupAppsBy(mode, apps) {
        if (mode === 'application') return [];

        const sections = {};
        if (mode === 'vendor') {
            apps.forEach(app => {
                const key = app.vendor || 'Unknown vendor';
                if (!sections[key]) sections[key] = { key, title: key, subtitle: 'Publisher view', apps: [] };
                sections[key].apps.push(app);
            });
        } else if (mode === 'device') {
            apps.forEach(app => {
                const deviceList = Array.isArray(app.devices) && app.devices.length
                    ? app.devices
                    : [{ deviceId: 'unattributed-device', deviceName: 'Unattributed device' }];

                deviceList.forEach(device => {
                    const key = device.deviceId || device.deviceName || 'unattributed-device';
                    if (!sections[key]) {
                        sections[key] = {
                            key,
                            title: device.deviceName || key,
                            subtitle: device.deviceName && device.deviceId && device.deviceName !== device.deviceId ? device.deviceId : '',
                            apps: []
                        };
                    }
                    sections[key].apps.push({ ...app, deviceCount: 1, devices: [device] });
                });
            });
        } else if (mode === 'bundle') {
            const rawRows = apps.flatMap(app => app.rawRows || [app]);
            rawRows.forEach(row => {
                const vendor = displayValue(row.vendor, 'Unknown vendor');
                const version = displayValue(row.version, 'Unknown version');
                const bundle = row.bundle || null;
                const key = bundle?.bundleId || `${normalizeKey(vendor)}|${normalizeKey(version)}`;
                if (!sections[key]) {
                    sections[key] = {
                        key,
                        title: bundle?.name ? `${bundle.name} · ${version}` : `${vendor} · ${version}`,
                        subtitle: bundle?.bundleId ? 'Backend bundle ID' : 'Likely bundle version',
                        vendor,
                        version,
                        bundle,
                        rawRows: []
                    };
                }
                sections[key].rawRows.push(row);
            });

            Object.values(sections).forEach(section => {
                Object.assign(section, this._enrichBundleSection(section));
            });
        }

        return Object.values(sections)
            .filter(section => mode !== 'bundle' || section.apps.length > 1)
            .map(section => {
                const deviceCount = new Set(
                    section.apps.flatMap(app => (app.devices || []).map(d => d?.deviceId || d?.deviceName || '').filter(Boolean))
                ).size || (mode === 'device' ? 1 : 0);
                const vulnerableCount = section.apps.filter(app => (app.cveCount || 0) > 0).length;
                return {
                    ...section,
                    appCount: section.apps.length,
                    vulnerableCount,
                    deviceCount,
                };
            })
            .sort((a, b) => b.vulnerableCount - a.vulnerableCount || b.appCount - a.appCount || a.title.localeCompare(b.title));
    }

    _collapseId(prefix, ...parts) {
        const slug = parts
            .filter(Boolean)
            .join('-')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80);
        return `${prefix}-${slug || 'group'}`;
    }

    _toggleGroup(groupKey) {
        this.setState(prev => ({
            expandedGroups: {
                ...prev.expandedGroups,
                [groupKey]: !prev.expandedGroups[groupKey]
            }
        }));
    }

    _renderBundleInsight(section) {
        if (!section.bundleIdentity) return null;

        const identity = section.bundleIdentity;
        const magiResult = this.state.bundleMagiResults?.[section.key];
        const magiError = this.state.bundleMagiErrors?.[section.key];
        const isLoading = this.state.bundleMagiLoadingKey === section.key;
        const coverageSummary = section.coreAppCount > 0
            ? `${section.coreAppCount} core app${section.coreAppCount === 1 ? '' : 's'} seen on every represented device · ${section.deviceCount} device${section.deviceCount === 1 ? '' : 's'}`
            : `No core app is seen on every represented device · ${section.lowConfidenceAppCount || section.appCount} partial member${(section.lowConfidenceAppCount || section.appCount) === 1 ? '' : 's'} marked low confidence`;
        const confidenceClass = identity.confidence === 'High'
            ? 'bg-success-lt text-success'
            : identity.confidence === 'Medium'
                ? 'bg-info-lt text-info'
                : 'bg-warning-lt text-warning';
        const cohesionBadge = section.bundleCohesion?.hasEvidence
            ? section.bundleCohesion.level === 'strong'
                ? 'bg-success-lt text-success'
                : section.bundleCohesion.level === 'partial'
                    ? 'bg-info-lt text-info'
                    : 'bg-warning-lt text-warning'
            : 'bg-secondary-lt text-secondary';

        return html`
            <div class="card-body border-bottom software-bundle-insight">
                <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
                    <div class="min-width-0">
                        <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
                            <span class=${`badge ${identity.isLikelyBundle === false ? 'bg-secondary-lt text-secondary' : 'bg-purple-lt text-purple'}`}>
                                ${identity.isLikelyBundle === false ? 'Shared version group' : 'Bundle candidate'}
                            </span>
                            <span class=${`badge ${confidenceClass}`}>${identity.confidence} confidence</span>
                            <span class=${`badge ${cohesionBadge}`}>${section.bundleCohesion?.hasEvidence ? 'FirstSeen checked' : 'FirstSeen unavailable'}</span>
                            ${section.lowConfidenceAppCount > 0 ? html`<span class="badge bg-warning-lt text-warning">${section.lowConfidenceAppCount} partial member${section.lowConfidenceAppCount === 1 ? '' : 's'}</span>` : ''}
                        </div>
                        <div class="fw-semibold">${magiResult ? 'MAGI identity ready' : `Suggested identity: ${identity.label}`}</div>
                        <div class="text-muted small">
                            ${coverageSummary} · ${identity.reason}
                        </div>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-purple" disabled=${isLoading} onClick=${() => this._identifyBundleWithMagi(section)}>
                        ${isLoading ? html`<span class="spinner-border spinner-border-sm me-1"></span>` : html`<i class="ti ti-sparkles me-1"></i>`}
                        ${magiResult ? 'Refresh MAGI identity' : 'Identify with MAGI'}
                    </button>
                </div>
                ${magiError ? html`<div class="alert alert-warning mt-3 mb-0 py-2">${magiError}</div>` : ''}
                ${magiResult ? html`
                    <div class="software-bundle-ai-answer mt-3">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span class="badge ${magiResult.cached ? 'bg-success-lt text-success' : 'bg-purple-lt text-purple'}">${magiResult.cached ? 'Cached MAGI identity' : 'MAGI identity'}</span>
                            <span class="text-muted small">${new Date(magiResult.generatedAt).toLocaleString()}</span>
                        </div>
                        <div class="magi-response markdown" dangerouslySetInnerHTML=${{ __html: renderMarkdown(magiResult.answer) }}></div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    _renderGroupedInventorySections(sections) {
        return html`
            ${sections.map(section => {
                const groupKey = this._collapseId('inventory-group', section.key, section.title);
                const isOpen = !!this.state.expandedGroups[groupKey];
                return html`
                    <div class="card mb-3">
                        <div class="card-header">
                            <button class="btn w-100 text-start border-0 bg-transparent shadow-none p-0"
                                    type="button"
                                    onClick=${() => this._toggleGroup(groupKey)}
                                    aria-expanded=${isOpen ? 'true' : 'false'}>
                                <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap w-100">
                                    <div class="flex-fill">
                                        <div class="d-flex align-items-center gap-2 flex-wrap">
                                            <span class="badge bg-blue-lt text-blue">${isOpen ? '−' : '+'}</span>
                                            <h3 class="card-title mb-0">${section.title}</h3>
                                            ${section.subtitle ? html`<span class="text-muted small">${section.subtitle}</span>` : ''}
                                        </div>
                                        <div class="text-muted small mt-1">
                                            ${section.deviceCount} device${section.deviceCount === 1 ? '' : 's'} represented
                                        </div>
                                    </div>
                                    <div class="d-flex gap-2 flex-wrap align-items-center justify-content-end">
                                        <span class="badge bg-blue text-white">${section.appCount} apps</span>
                                        <span class="badge ${section.vulnerableCount > 0 ? 'bg-danger text-white' : 'bg-success text-white'}">
                                            ${section.vulnerableCount} at risk
                                        </span>
                                        <span class="badge bg-secondary-lt text-secondary">${isOpen ? 'Collapse' : 'Expand'}</span>
                                    </div>
                                </div>
                            </button>
                        </div>
                        ${section.bundleIdentity ? this._renderBundleInsight(section) : ''}
                        ${isOpen ? html`
                            <div class="table-responsive apps-inventory-table-wrap">
                                <table class="table table-vcenter card-table table-hover apps-inventory-table">
                                    <thead>
                                        <tr>
                                            ${this._renderSortTh('Application', 'name', 'min-width:240px')}
                                            ${this._renderSortTh('Version', 'version', 'min-width:150px')}
                                            ${this._renderSortTh('Devices', 'deviceCount', 'min-width:220px')}
                                            ${this._renderSortTh('Risk', 'riskScore', 'min-width:120px')}
                                            <th class="text-end" style="min-width:180px">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${this._renderAppTableRows(section.apps)}
                                    </tbody>
                                </table>
                            </div>
                        ` : ''}
                    </div>
                `;
            })}
        `;
    }

    _renderAtRiskCard(app) {
        // Per-card collapse: header is always visible, CVE table renders only on click.
        // Keying on `appKey` (encoded name) keeps state stable across re-renders even when
        // groupBy or sort changes.
        const cardKey = this._collapseId('risk-card', this._appKey(app));
        const isOpen = !!this.state.expandedGroups[cardKey];
        const hasCves = Array.isArray(app.cves) && app.cves.length > 0;
        return html`
            <div class="col-12">
                <div class="card">
                    <div class="card-header">
                        <button class="btn w-100 text-start border-0 bg-transparent shadow-none p-0"
                                type="button"
                                onClick=${() => this._toggleGroup(cardKey)}
                                aria-expanded=${isOpen ? 'true' : 'false'}>
                            <div class="d-flex align-items-center gap-3 w-100">
                                <span class="avatar bg-danger-lt text-danger">
                                    ${(app.name || '?')[0].toUpperCase()}
                                </span>
                                <div class="flex-fill">
                                    <div class="d-flex align-items-center gap-2 flex-wrap">
                                        <h4 class="card-title mb-0">${app.name}</h4>
                                        ${this._renderRiskBadge(app.riskScore)}
                                        ${app.isFreeware ? html`<span class="badge bg-success-lt text-success">Free</span>` : ''}
                                    </div>
                                    <div class="text-muted small mt-1">
                                        ${app.vendor || 'Unknown vendor'} · ${app.versionCount || 1} version${(app.versionCount || 1) === 1 ? '' : 's'} · ${app.deviceCount ?? 0} device${(app.deviceCount ?? 0) !== 1 ? 's' : ''}
                                    </div>
                                </div>
                                <div class="ms-auto d-flex align-items-center gap-2">
                                    <span class="badge bg-danger text-white">${app.cveCount} CVE${app.cveCount !== 1 ? 's' : ''}</span>
                                    <span class="badge bg-secondary-lt text-secondary">${isOpen ? 'Collapse' : 'Expand'}</span>
                                </div>
                            </div>
                        </button>
                    </div>

                    ${isOpen ? html`
                        <div class="card-body py-2 border-bottom">
                            <div class="text-muted small mb-1">Affected devices</div>
                            ${this._renderDeviceSummary(app)}
                        </div>
                        ${hasCves ? html`
                            <div class="table-responsive">
                                <table class="table table-sm table-vcenter mb-0">
                                    <thead class="bg-light">
                                        <tr>
                                            <th>CVE ID</th>
                                            <th>Severity</th>
                                            <th>CVSS Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${app.cves.map(cve => html`
                                            <tr>
                                                <td>
                                                    <a href="#!/cves?cveId=${encodeURIComponent(cve.id)}" class="fw-medium">
                                                        ${cve.id}
                                                    </a>
                                                </td>
                                                <td>${this._renderSeverityBadge(cve.severity)}</td>
                                                <td>
                                                    <span class="fw-medium">${(cve.score || 0).toFixed(1)}</span>
                                                    <div class="progress progress-sm mt-1" style="width:80px">
                                                        <div class="progress-bar ${cve.score >= 9 ? 'bg-danger' : cve.score >= 7 ? 'bg-warning' : cve.score >= 4 ? 'bg-info' : 'bg-success'}"
                                                             style="width:${Math.min(100, (cve.score / 10) * 100).toFixed(0)}%">
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        `)}
                                    </tbody>
                                </table>
                            </div>
                        ` : html`
                            <div class="card-body text-muted small">
                                CVE details not yet enriched for this application.
                            </div>
                        `}
                    ` : ''}
                </div>
            </div>
        `;
    }

    _renderAtRiskTableRows(apps) {
        return apps.map(app => {
            const cves = Array.isArray(app.cves) ? app.cves : [];
            const visibleCves = cves.slice(0, 3);
            const remainingCves = Math.max(0, cves.length - visibleCves.length);
            return html`
                <tr class="apps-inventory-row apps-risk-row">
                    <td>
                        <div class="d-flex align-items-start gap-2">
                            <span class="avatar avatar-sm bg-danger-lt text-danger">
                                ${(app.name || '?')[0].toUpperCase()}
                            </span>
                            <div class="apps-inventory-appcell">
                                <div class="fw-medium text-reset">${app.name || '—'}</div>
                                <div class="text-muted small">${app.vendor || 'Unknown vendor'} · ${app.versionCount || 1} version${(app.versionCount || 1) === 1 ? '' : 's'}</div>
                                <div class="d-flex flex-wrap gap-1 mt-2">
                                    ${app.isFreeware ? html`<span class="badge bg-success-lt text-success">Free</span>` : ''}
                                    ${app.status ? html`<span class="badge bg-secondary-lt text-secondary">${app.status}</span>` : ''}
                                    ${app.bundleConfidence === 'high' ? html`<span class="badge bg-success-lt text-success" title=${app.bundleConfidenceReason || ''}>Bundle core · ${app.bundleDeviceCoverageLabel || 'all devices'}</span>` : ''}
                                    ${app.bundleConfidence === 'low' ? html`<span class="badge bg-warning-lt text-warning" title=${app.bundleConfidenceReason || ''}>Low-confidence bundle member · ${app.bundleDeviceCoverageLabel || 'partial devices'}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td>
                        ${this._renderDeviceSummary(app)}
                    </td>
                    <td>
                        <div class="d-flex flex-column gap-2 align-items-start">
                            ${this._renderRiskBadge(app.riskScore)}
                            <span class="badge bg-danger text-white">${app.cveCount || 0} CVE${(app.cveCount || 0) === 1 ? '' : 's'}</span>
                        </div>
                    </td>
                    <td>
                        <div class="d-flex flex-wrap gap-1">
                            ${visibleCves.length > 0 ? visibleCves.map(cve => html`
                                <a href=${`#!/cves?cveId=${encodeURIComponent(cve.id)}`} class="badge bg-danger-lt text-danger text-decoration-none">
                                    ${cve.id}
                                </a>
                            `) : html`<span class="text-muted small">Enrichment pending</span>`}
                            ${remainingCves > 0 ? html`<span class="badge bg-secondary-lt text-secondary">+${remainingCves} more</span>` : ''}
                        </div>
                    </td>
                    <td class="text-end">
                        ${this._renderRowActions(app)}
                    </td>
                </tr>
            `;
        });
    }

    // ─── All Software tab ────────────────────────────────────────────────────

    _renderAllTab() {
        const filtered = this._filteredApps();
        const { groupBy } = this.state;
        const paged = this._paginateRows(filtered);

        const groupedSections = this._groupAppsBy(groupBy, filtered);
        const pagedSections = this._paginateRows(groupedSections);
        const allApplications = this._aggregateAppRows(this.state.apps);
        const allSections = groupBy === 'application' ? [] : this._groupAppsBy(groupBy, allApplications);
        const resultCount = groupBy === 'application' ? filtered.length : groupedSections.length;
        const totalCount = groupBy === 'application' ? allApplications.length : allSections.length;
        const deepLink = this._currentDeepLinkFilter();
        const activeFilters = [
            this.state.searchQuery ? `Search: ${this.state.searchQuery}` : null,
            deepLink ? 'Deep link filter' : null,
            groupBy !== 'application' ? `Grouped by ${groupBy}` : null
        ].filter(Boolean);

        return html`
            <${FilterToolbar}
                resultCount=${resultCount}
                totalCount=${totalCount}
                activeFilters=${activeFilters}
                onClear=${() => this.clearInventoryFilters()}>
                <div class="flex-fill" style="min-width:260px;">
                    <label class="form-label small text-muted mb-1">Search</label>
                    <div class="input-icon">
                        <span class="input-icon-addon"><${IconSearch} /></span>
                        <input type="search" class="form-control"
                               placeholder="Search app, vendor, version, or device..."
                               value=${this.state.searchQuery}
                               onInput=${event => this._setPagedState({ searchQuery: event.target.value })} />
                    </div>
                </div>
                <div style="min-width:220px;">
                    <label class="form-label small text-muted mb-1">View</label>
                    <${SegmentedControl}
                        options=${[
                            { id: 'application', label: 'Application' },
                            { id: 'vendor', label: 'Vendor' },
                            { id: 'device', label: 'Device' },
                            { id: 'bundle', label: 'Bundle' }
                        ]}
                        value=${groupBy}
                        onChange=${value => this._setPagedState({ groupBy: value })}
                    />
                </div>
            </${FilterToolbar}>
            <div class="card mb-3">
                ${filtered.length === 0 ? html`
                    <div class="empty py-5">
                        <div class="empty-icon text-muted"><${IconPackage} /></div>
                        <p class="empty-title">No applications found</p>
                        <p class="empty-subtitle text-muted">
                            ${this.state.searchQuery ? `No results for "${this.state.searchQuery}"` : 'No apps reported yet'}
                        </p>
                    </div>
                ` : html`
                    ${groupBy === 'application' ? html`
                        <div class="table-responsive apps-inventory-table-wrap">
                            <table class="table table-vcenter card-table table-hover apps-inventory-table">
                                <thead>
                                    <tr>
                                        ${this._renderSortTh('Application', 'name', 'min-width:240px')}
                                        ${this._renderSortTh('Version', 'version', 'min-width:150px')}
                                        ${this._renderSortTh('Devices', 'deviceCount', 'min-width:220px')}
                                        ${this._renderSortTh('Risk', 'riskScore', 'min-width:120px')}
                                        <th class="text-end" style="min-width:180px">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this._renderAppTableRows(paged.rows)}
                                </tbody>
                            </table>
                        </div>
                        <${PaginationBar}
                            page=${paged.page}
                            pageSize=${paged.pageSize}
                            total=${paged.total}
                            itemLabel="applications"
                            onPageChange=${page => this.setState({ page })}
                            onPageSizeChange=${pageSize => this.setState({ pageSize, page: 1 })}
                        />
                    ` : html`
                        <div class="p-3">
                            ${pagedSections.rows.length
                                ? this._renderGroupedInventorySections(pagedSections.rows)
                                : html`
                                    <div class="empty py-5">
                                        <div class="empty-icon text-muted"><${IconPackage} /></div>
                                        <p class="empty-title">No bundle candidates found</p>
                                        <p class="empty-subtitle text-muted">Bundle view groups two or more applications from the same vendor on the same version.</p>
                                    </div>
                                `}
                        </div>
                        <${PaginationBar}
                            page=${pagedSections.page}
                            pageSize=${pagedSections.pageSize}
                            total=${pagedSections.total}
                            itemLabel="groups"
                            onPageChange=${page => this.setState({ page })}
                            onPageSizeChange=${pageSize => this.setState({ pageSize, page: 1 })}
                        />
                    `}
                `}
            </div>`;
    }

    _renderDetailsDrawer() {
        const app = this._findAppByKey(this.state.detailsAppKey);
        const open = !!app;
        const versions = app ? this._getVersionBreakdown(app.name) : [];

        return html`
            <div
                class="apps-details-backdrop ${open ? 'show' : ''}"
                onClick=${() => this._closeDetails()}
            ></div>
            <aside class="apps-details-drawer ${open ? 'open' : ''}" aria-hidden=${open ? 'false' : 'true'}>
                ${app ? html`
                        ${section.bundleIdentity ? this._renderBundleInsight(section) : ''}
                    <div class="apps-details-header">
                        <div>
                            <div class="text-muted small">Application details</div>
                            <h3 class="apps-details-title mb-1">${app.name || 'Unknown App'}</h3>
                            <div class="text-muted small">${app.vendor || 'Unknown vendor'}</div>
                        </div>
                        <button class="btn btn-sm btn-ghost-secondary" onClick=${() => this._closeDetails()}>Close</button>
                    </div>

                    <div class="apps-details-kpis">
                        <span class="badge bg-blue text-white">${versions.length} version${versions.length === 1 ? '' : 's'}</span>
                        <span class="badge bg-secondary text-white">
                            ${versions.reduce((sum, v) => sum + v.devices.length, 0)} device${versions.reduce((sum, v) => sum + v.devices.length, 0) === 1 ? '' : 's'}
                        </span>
                        ${this._renderRiskBadge(app.riskScore)}
                    </div>

                    <div class="apps-details-body">
                        ${versions.map(v => html`
                            <section class="card mb-2 apps-version-card">
                                <div class="card-body py-2">
                                    <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                                        <div>
                                            <div class="fw-semibold">v${v.version}</div>
                                            <div class="small text-muted">${v.devices.length} install location${v.devices.length === 1 ? '' : 's'}</div>
                                        </div>
                                        <div class="d-flex align-items-center gap-2">
                                            ${this._renderRiskBadge(v.riskScore)}
                                            ${v.cveCount > 0
                                                ? html`<span class="badge bg-danger-lt text-danger">${v.cveCount} CVE${v.cveCount === 1 ? '' : 's'}</span>`
                                                : html`<span class="badge bg-success-lt text-success">No CVEs</span>`}
                                        </div>
                                    </div>
                                    <div class="apps-details-device-list mt-2">
                                        ${v.devices.length > 0
                                            ? v.devices.map(d => html`
                                                <a class="badge bg-blue-lt text-blue text-decoration-none" href=${`#!/devices/${d.deviceId}`}>
                                                    ${d.deviceName || d.deviceId}
                                                </a>
                                            `)
                                            : html`<span class="text-muted small">No device attribution</span>`}
                                    </div>
                                </div>
                            </section>
                        `)}
                    </div>
                ` : ''}
            </aside>
        `;
    }

    _renderMagiPanel() {
        const app = this._findAppByKey(this.state.magiAppKey);
        if (!app) return null;

        const focusVersion = this._focusVersionForMagi(app);
        const { magiLoading, magiAnswer, magiError, magiWasCached, magiCacheId, magiFeedback } = this.state;

        return html`
            <div class="modal modal-blur show d-block" tabIndex="-1" style="background:rgba(0,0,0,0.5);"
                 onClick=${event => event.target === event.currentTarget && this._closeMagiPanel()}>
                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content software-magi-modal">
                        <div class="modal-header software-magi-header">
                            <div>
                                <div class="text-uppercase small fw-semibold opacity-75 mb-1">Officer MAGI remediation</div>
                                <h5 class="modal-title text-white mb-0">${app.name}</h5>
                                <div class="small text-white-50 mt-1">${app.vendor || 'Unknown vendor'} · ${focusVersion.version || 'Unknown version'}</div>
                            </div>
                            <button type="button" class="btn-close btn-close-white" onClick=${() => this._closeMagiPanel()} aria-label="Close MAGI remediation"></button>
                        </div>
                        <div class="modal-body">
                            <div class="d-flex flex-wrap gap-2 mb-3">
                                ${this._renderRiskBadge(focusVersion.riskScore || app.riskScore)}
                                <span class="badge bg-blue-lt text-blue">${focusVersion.deviceCount || focusVersion.devices?.length || app.deviceCount || 0} affected device${(focusVersion.deviceCount || focusVersion.devices?.length || app.deviceCount || 0) === 1 ? '' : 's'}</span>
                                <span class="badge bg-secondary-lt text-secondary">${app.versionCount || 1} version${(app.versionCount || 1) === 1 ? '' : 's'} tracked</span>
                                ${magiWasCached ? html`<span class="badge bg-success-lt text-success">Cached response</span>` : ''}
                                ${magiCacheId ? html`<span class="badge bg-purple-lt text-purple">Admin-reviewable</span>` : ''}
                            </div>

                            ${magiLoading ? html`
                                <div class="d-flex align-items-center gap-3 py-4 justify-content-center">
                                    <div class="spinner-border text-purple"></div>
                                    <span class="text-muted">MAGI is checking the remediation cache...</span>
                                </div>
                            ` : magiError ? html`
                                <div class="alert alert-danger">${magiError}</div>
                            ` : magiAnswer ? html`
                                <div class="magi-response" dangerouslySetInnerHTML=${{ __html: renderMarkdown(magiAnswer) }}></div>
                            ` : ''}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-link link-secondary me-auto" onClick=${() => this._closeMagiPanel()}>Close</button>
                            ${magiAnswer && magiCacheId ? html`
                                <span class="text-muted small">Helpful?</span>
                                <button class="btn btn-sm btn-icon ${magiFeedback === 'up' ? 'btn-success' : 'btn-outline-success'}"
                                        onClick=${() => this._submitMagiFeedback('up')}
                                        disabled=${!!magiFeedback}
                                        title="Helpful">
                                    <i class="ti ti-thumb-up"></i>
                                </button>
                                <button class="btn btn-sm btn-icon ${magiFeedback === 'down' ? 'btn-danger' : 'btn-outline-danger'}"
                                        onClick=${() => this._submitMagiFeedback('down')}
                                        disabled=${!!magiFeedback}
                                        title="Not helpful">
                                    <i class="ti ti-thumb-down"></i>
                                </button>
                            ` : ''}
                            <a class="btn btn-outline-purple" href=${`#!/analyst?q=${encodeURIComponent(this._buildMagiFixQuestion(app, focusVersion))}`}>
                                Open in MAGI
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ─── At Risk tab ─────────────────────────────────────────────────────────

    _renderAtRiskTab() {
        const allAtRisk = this._aggregateAppRows(this.state.apps).filter(app => (app.cveCount || 0) > 0);
        const atRisk = this._atRiskApps();
        const { groupBy } = this.state;
        const allAtRiskSections = groupBy === 'application' ? [] : this._groupAppsBy(groupBy, allAtRisk);
        const visibleAtRiskSections = groupBy === 'application' ? [] : this._groupAppsBy(groupBy, atRisk);
        const resultCount = groupBy === 'application' ? atRisk.length : visibleAtRiskSections.length;
        const totalCount = groupBy === 'application' ? allAtRisk.length : allAtRiskSections.length;
        const deepLink = this._currentDeepLinkFilter();
        const activeFilters = [
            this.state.searchQuery ? `Search: ${this.state.searchQuery}` : null,
            deepLink ? 'Deep link filter' : null,
            groupBy !== 'application' ? `Grouped by ${groupBy}` : null
        ].filter(Boolean);
        const toolbar = html`
            <${FilterToolbar}
                resultCount=${resultCount}
                totalCount=${totalCount}
                activeFilters=${activeFilters}
                onClear=${() => this.clearInventoryFilters()}>
                <div class="flex-fill" style="min-width:260px;">
                    <label class="form-label small text-muted mb-1">Search</label>
                    <div class="input-icon">
                        <span class="input-icon-addon"><${IconSearch} /></span>
                        <input type="search" class="form-control"
                               placeholder="Search risky app, vendor, CVE, or device..."
                               value=${this.state.searchQuery}
                               onInput=${event => this._setPagedState({ searchQuery: event.target.value })} />
                    </div>
                </div>
                <div style="min-width:220px;">
                    <label class="form-label small text-muted mb-1">View</label>
                    <${SegmentedControl}
                        options=${[
                            { id: 'application', label: 'Application' },
                            { id: 'vendor', label: 'Vendor' },
                            { id: 'device', label: 'Device' },
                            { id: 'bundle', label: 'Bundle' }
                        ]}
                        value=${groupBy}
                        onChange=${value => this._setPagedState({ groupBy: value })}
                    />
                </div>
            </${FilterToolbar}>`;

        if (atRisk.length === 0) {
            return html`
                ${toolbar}
                <div class="card">
                    <div class="empty py-5">
                        <div class="empty-icon text-success"><${IconShieldOff} /></div>
                        <p class="empty-title text-success">No vulnerable applications</p>
                        <p class="empty-subtitle text-muted">${allAtRisk.length ? 'No risky applications match the current filters.' : 'All installed applications are clean — no CVEs detected.'}</p>
                    </div>
                </div>`;
        }

        if (groupBy === 'application') {
            const paged = this._paginateRows(atRisk);
            return html`
                ${toolbar}
                <div class="card">
                    <div class="table-responsive apps-inventory-table-wrap">
                        <table class="table table-vcenter card-table table-hover apps-inventory-table apps-risk-table">
                            <thead>
                                <tr>
                                    ${this._renderSortTh('Application', 'name', 'min-width:260px')}
                                    ${this._renderSortTh('Devices', 'deviceCount', 'min-width:220px')}
                                    ${this._renderSortTh('Risk', 'riskScore', 'min-width:120px')}
                                    ${this._renderSortTh('CVEs', 'cveCount', 'min-width:220px')}
                                    <th class="text-end" style="min-width:180px">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this._renderAtRiskTableRows(paged.rows)}
                            </tbody>
                        </table>
                    </div>
                    <${PaginationBar}
                        page=${paged.page}
                        pageSize=${paged.pageSize}
                        total=${paged.total}
                        itemLabel="risky applications"
                        onPageChange=${page => this.setState({ page })}
                        onPageSizeChange=${pageSize => this.setState({ pageSize, page: 1 })}
                    />
                </div>`;
        }

        const sections = this._groupAppsBy(groupBy, atRisk);
        const pagedSections = this._paginateRows(sections);
        return html`
            ${toolbar}
            ${pagedSections.rows.length === 0 ? html`
                <div class="card">
                    <div class="empty py-5">
                        <div class="empty-icon text-muted"><${IconPackage} /></div>
                        <p class="empty-title">No risky bundle candidates found</p>
                        <p class="empty-subtitle text-muted">Bundle view groups two or more risky applications from the same vendor on the same version.</p>
                    </div>
                </div>
            ` : pagedSections.rows.map(section => {
                const groupKey = this._collapseId('risk-group', section.key, section.title);
                const isOpen = !!this.state.expandedGroups[groupKey];
                return html`
                    <div class="card mb-3">
                        <div class="card-header">
                            <button class="btn w-100 text-start border-0 bg-transparent shadow-none p-0"
                                    type="button"
                                    onClick=${() => this._toggleGroup(groupKey)}
                                    aria-expanded=${isOpen ? 'true' : 'false'}>
                                <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap w-100">
                                    <div class="flex-fill">
                                        <div class="d-flex align-items-center gap-2 flex-wrap">
                                            <span class="badge bg-danger-lt text-danger">${isOpen ? '−' : '+'}</span>
                                            <h3 class="card-title mb-0">${section.title}</h3>
                                            ${section.subtitle ? html`<span class="text-muted small">${section.subtitle}</span>` : ''}
                                        </div>
                                        <div class="text-muted small mt-1">
                                            ${section.appCount} risky app${section.appCount === 1 ? '' : 's'} · ${section.deviceCount} device${section.deviceCount === 1 ? '' : 's'} impacted
                                        </div>
                                    </div>
                                    <div class="d-flex gap-2 flex-wrap align-items-center justify-content-end">
                                        <span class="badge bg-danger text-white">${section.vulnerableCount} vulnerable apps</span>
                                        <span class="badge bg-secondary-lt text-secondary">${isOpen ? 'Collapse' : 'Expand'}</span>
                                    </div>
                                </div>
                            </button>
                        </div>
                        ${isOpen ? html`
                            <div class="card-body">
                                <div class="row row-cards">
                                    ${section.apps.map(app => this._renderAtRiskCard(app))}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            })}
            ${pagedSections.rows.length > 0 ? html`
                <div class="card">
                    <${PaginationBar}
                        page=${pagedSections.page}
                        pageSize=${pagedSections.pageSize}
                        total=${pagedSections.total}
                        itemLabel="risk groups"
                        onPageChange=${page => this.setState({ page })}
                        onPageSizeChange=${pageSize => this.setState({ pageSize, page: 1 })}
                    />
                </div>
            ` : ''}
        `;
    }

    // ─── License Tracking tab ────────────────────────────────────────────────

    _renderLicenseTab() {
        const { apps, licenses, editingKey, editForm, savingKey, saveError } = this.state;
        const appRows = this._aggregateAppRows(apps);
        const filteredRows = this._sortLicenseApps(this._filterLicenseApps(appRows));
        const paged = this._paginateRows(filteredRows);
        const statusOptions = this._licenseStatusOptions();
        const typeOptions = ['all', 'Not tracked', ...LICENSE_TYPES];
        const statusLabel = statusOptions.find(option => option.id === this.state.licenseStatusFilter)?.label || 'All statuses';
        const classifiedCount = appRows.filter(app => this._licenseInfo(app).status !== 'untracked').length;
        const activeFilters = [
            this.state.searchQuery ? `Search: ${this.state.searchQuery}` : null,
            this.state.licenseStatusFilter !== 'all' ? statusLabel : null,
            this.state.licenseTypeFilter !== 'all' ? `Type: ${this.state.licenseTypeFilter}` : null,
        ].filter(Boolean);

        if (appRows.length === 0) {
            return html`
                <div class="card">
                    <div class="empty py-5">
                        <div class="empty-icon text-muted"><${IconLicense} /></div>
                        <p class="empty-title">No applications loaded</p>
                        <p class="empty-subtitle text-muted">Load the inventory first by refreshing the page.</p>
                    </div>
                </div>`;
        }

        return html`
            <${FilterToolbar}
                resultCount=${filteredRows.length}
                totalCount=${appRows.length}
                activeFilters=${activeFilters}
                onClear=${() => this._setPagedState({ searchQuery: '', licenseStatusFilter: 'all', licenseTypeFilter: 'all' })}>
                <div class="flex-fill" style="min-width:260px;">
                    <label class="form-label small text-muted mb-1">Search</label>
                    <div class="input-icon">
                        <span class="input-icon-addon"><${IconSearch} /></span>
                        <input type="search" class="form-control"
                               placeholder="Search app, vendor, license, notes, device..."
                               value=${this.state.searchQuery}
                               onInput=${event => this._setPagedState({ searchQuery: event.target.value })} />
                    </div>
                </div>
                <div style="min-width:190px;">
                    <label class="form-label small text-muted mb-1">Status</label>
                    <select class="form-select"
                            value=${this.state.licenseStatusFilter}
                            onChange=${event => this._setPagedState({ licenseStatusFilter: event.target.value })}>
                        ${statusOptions.map(option => html`
                            <option value=${option.id} selected=${this.state.licenseStatusFilter === option.id}>${option.label}</option>
                        `)}
                    </select>
                </div>
                <div style="min-width:180px;">
                    <label class="form-label small text-muted mb-1">Type</label>
                    <select class="form-select"
                            value=${this.state.licenseTypeFilter}
                            onChange=${event => this._setPagedState({ licenseTypeFilter: event.target.value })}>
                        ${typeOptions.map(type => html`
                            <option value=${type} selected=${this.state.licenseTypeFilter === type}>${type === 'all' ? 'All types' : type}</option>
                        `)}
                    </select>
                </div>
            </${FilterToolbar}>
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">License Registry</h3>
                    <div class="card-options text-muted small">
                        ${classifiedCount} of ${appRows.length} applications classified
                    </div>
                </div>
                ${filteredRows.length === 0 ? html`
                    <div class="empty py-5">
                        <div class="empty-icon text-muted"><${IconLicense} /></div>
                        <p class="empty-title">No license records match</p>
                        <p class="empty-subtitle text-muted">Adjust search, status, or type filters to see more applications.</p>
                    </div>
                ` : html`
                <div class="table-responsive">
                    <table class="table table-vcenter card-table">
                        <thead>
                            <tr>
                                ${this._renderSortTh('Application', 'name', 'min-width:220px')}
                                ${this._renderSortTh('Vendor', 'vendor', 'min-width:180px')}
                                ${this._renderSortTh('Status', 'licenseStatus', 'min-width:150px')}
                                ${this._renderSortTh('License Type', 'licenseType', 'min-width:150px')}
                                ${this._renderSortTh('Expires', 'expiryDate', 'min-width:130px')}
                                ${this._renderSortTh('Notes', 'notes', 'min-width:200px')}
                                ${this._renderSortTh('Last Updated', 'updatedAt', 'min-width:140px')}
                                <th class="w-1"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${paged.rows.map(app => {
                                const key  = this._appKey(app);
                                const lic  = licenses[key];
                                const info = this._licenseInfo(app);
                                const isEditing = editingKey === key;

                                if (isEditing) {
                                    return html`
                                        <tr class="table-active">
                                            <td>
                                                <div class="d-flex align-items-center gap-2">
                                                    <span class="avatar avatar-sm bg-purple-lt text-purple">
                                                        ${(app.name || '?')[0].toUpperCase()}
                                                    </span>
                                                    <span class="fw-medium">${app.name}</span>
                                                </div>
                                            </td>
                                            <td class="text-muted">${app.vendor || '—'}</td>
                                            <td><span class=${`badge ${info.statusBadge}`}>${info.statusLabel}</span></td>
                                            <td>
                                                <select class="form-select form-select-sm"
                                                        style="min-width:130px"
                                                        value=${editForm.licenseType}
                                                        onChange=${e => this.setState({ editForm: { ...editForm, licenseType: e.target.value } })}>
                                                    ${LICENSE_TYPES.map(t => html`
                                                        <option value=${t} selected=${editForm.licenseType === t}>${t}</option>
                                                    `)}
                                                </select>
                                            </td>
                                            <td>
                                                <input type="date" class="form-control form-control-sm"
                                                       style="min-width:140px"
                                                       value=${editForm.expiryDate}
                                                       onChange=${e => this.setState({ editForm: { ...editForm, expiryDate: e.target.value } })} />
                                            </td>
                                            <td colspan="2">
                                                <input type="text" class="form-control form-control-sm"
                                                       placeholder="Optional notes…"
                                                       value=${editForm.notes}
                                                       onInput=${e => this.setState({ editForm: { ...editForm, notes: e.target.value } })} />
                                                ${saveError ? html`<div class="text-danger small mt-1">${saveError}</div>` : ''}
                                            </td>
                                            <td class="text-end" style="white-space:nowrap">
                                                <button class="btn btn-sm btn-primary me-1"
                                                    data-mutates-state="true"
                                                        disabled=${savingKey === key}
                                                        onClick=${() => this._saveEdit(app)}>
                                                    ${savingKey === key
                                                        ? html`<span class="spinner-border spinner-border-sm me-1"></span>Saving…`
                                                        : 'Save'}
                                                </button>
                                                <button class="btn btn-sm btn-ghost-secondary"
                                                        onClick=${() => this._cancelEdit()}>Cancel</button>
                                            </td>
                                        </tr>`;
                                }

                                return html`
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center gap-2">
                                                <span class="avatar avatar-sm ${lic ? 'bg-purple-lt text-purple' : 'bg-secondary-lt text-secondary'}">
                                                    ${(app.name || '?')[0].toUpperCase()}
                                                </span>
                                                <div>
                                                    <span class="fw-medium">${app.name}</span>
                                                    ${app.isFreeware ? html`
                                                        <span class="badge bg-success-lt text-success ms-1 small">Free</span>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        </td>
                                        <td class="text-muted">${app.vendor || '—'}</td>
                                        <td><span class=${`badge ${info.statusBadge}`}>${info.statusLabel}</span></td>
                                        <td>
                                            ${lic
                                                ? html`<span class="badge bg-purple-lt text-purple">${lic.licenseType}</span>`
                                                : app.isFreeware
                                                    ? html`<span class="badge bg-success-lt text-success">Freeware</span>`
                                                    : html`<span class="text-muted fst-italic small">Not tracked</span>`}
                                        </td>
                                        <td>
                                            ${lic?.expiryDate
                                                ? (() => {
                                                    const d = new Date(lic.expiryDate);
                                                    const daysLeft = Math.ceil((d - Date.now()) / 86_400_000);
                                                    const cls = daysLeft < 0 ? 'text-danger' : daysLeft < 30 ? 'text-warning' : 'text-muted';
                                                    return html`<span class="${cls}">${d.toLocaleDateString()} ${daysLeft < 0 ? '(expired)' : daysLeft < 30 ? `(${daysLeft}d left)` : ''}</span>`;
                                                  })()
                                                : html`<span class="text-muted">—</span>`}
                                        </td>
                                        <td class="text-muted small" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                                            ${lic?.notes || '—'}
                                        </td>
                                        <td class="text-muted small">
                                            ${lic?.updatedAt ? new Date(lic.updatedAt).toLocaleDateString() : '—'}
                                        </td>
                                        <td class="text-end" style="white-space:nowrap">
                                            ${!orgContext.isReadOnly() ? html`
                                            <button class="btn btn-sm btn-ghost-primary me-1"
                                                    onClick=${() => this._startEdit(app)}>
                                                ${lic ? 'Edit' : 'Add'}
                                            </button>
                                            ${lic ? html`
                                                <button class="btn btn-sm btn-ghost-danger"
                                                    data-mutates-state="true"
                                                        onClick=${() => this._deleteLicense(app)}>✕</button>
                                            ` : ''}
                                            ` : html`<span class="text-muted small" title="Auditors cannot edit licenses">View only</span>`}
                                        </td>
                                    </tr>`;
                            })}
                        </tbody>
                    </table>
                </div>
                <${PaginationBar}
                    page=${paged.page}
                    pageSize=${paged.pageSize}
                    total=${paged.total}
                    itemLabel="applications"
                    onPageChange=${page => this.setState({ page })}
                    onPageSizeChange=${pageSize => this.setState({ pageSize, page: 1 })}
                />
                `}
            </div>`;
    }

    // ─── main render ─────────────────────────────────────────────────────────

    render() {
        const { loading, error, activeTab, apps, isRefreshing, groupBy } = this.state;
        const sourceLabel = this._inventorySourceLabel();

        // Full-screen loading state
        if (loading && !apps.length) {
            return html`
                <div class="d-flex align-items-center justify-content-center" style="min-height:60vh;">
                    <div class="text-center">
                        <div class="spinner-border text-primary mb-3"></div>
                        <p class="text-muted">Loading software inventory…</p>
                    </div>
                </div>`;
        }

        // Error state (only if no cached data to fall back on)
        if (error && !apps.length) {
            return html`
                <div class="container-xl mt-4">
                    <div class="alert alert-danger">
                        <h4 class="alert-title">Failed to load inventory</h4>
                        <div class="text-muted">${error}</div>
                        <button class="btn btn-sm btn-danger mt-2" onClick=${() => this.loadData(true)}>Retry</button>
                    </div>
                </div>`;
        }

        const kpis = this._kpis();

        const TABS = [
            { id: 'all',      label: `All Software`,  badge: kpis.total,    badgeCls: 'bg-blue text-white' },
            // At Risk badge counts DISTINCT apps (matches the dashboard's "apps with known
            // vulnerabilities" tile). The version-row count is shown inside each app card.
            { id: 'atrisk',   label: `Patch Queue`,   badge: kpis.vulnApps, badgeCls: kpis.vulnApps > 0 ? 'bg-danger text-white' : 'bg-success text-white' },
            ...(!orgContext.isIndividualUser() ? [{ id: 'licenses', label: `Licenses`, badge: kpis.licensed, badgeCls: 'bg-purple text-white' }] : []),
        ];

        return html`
            <!-- Page header -->
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="text-uppercase text-muted fw-semibold small mb-1">Assets · Software</div>
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">Software</h2>
                                ${sourceLabel ? html`
                                    <span class="badge ${this._inventorySourceBadgeClass()}">${sourceLabel}</span>
                                ` : ''}
                                ${isRefreshing ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width:10px;height:10px;"></span>
                                        Refreshing…
                                    </span>
                                ` : ''}
                            </div>
                            <div class="page-subtitle mt-1 text-muted">
                                Applications, tracked versions, affected devices, and CVE exposure across your fleet${rewindContext.isActive() ? html` — as of ${getEffectiveMaxInputDate()}` : ''}
                            </div>
                        </div>
                        <div class="col-auto d-flex gap-2">
                            <button class="btn btn-secondary" onClick=${() => this.loadData(true)}>
                                <${IconRefresh} /> Refresh Live
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    <!-- KPI strip -->
                    ${this._renderKpiStrip(kpis)}

                    ${this._renderCommandStrip(kpis, sourceLabel)}

                    <!-- Tabs (primary navigation) -->
                    <ul class="nav nav-tabs mb-3">
                        ${TABS.map(t => html`
                            <li class="nav-item">
                                <button type="button" class="nav-link ${activeTab === t.id ? 'active' : ''} d-flex align-items-center gap-2"
                                              onclick=${() => this.selectTab(t.id)}>
                                    ${t.label}
                                    <span class="badge ${t.badgeCls} ms-1">${t.badge}</span>
                                </button>
                            </li>
                        `)}
                    </ul>

                    <!-- Tab content -->
                    ${activeTab === 'all'      ? this._renderAllTab()     : ''}
                    ${activeTab === 'atrisk'   ? this._renderAtRiskTab()  : ''}
                    ${activeTab === 'licenses' ? this._renderLicenseTab() : ''}
                </div>
            </div>
            ${this._renderDetailsDrawer()}
            ${this._renderMagiPanel()}
        `;
    }
}
