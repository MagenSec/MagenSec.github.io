/**
 * Unified Dashboard - Security Command Center (merged with Posture Snapshot)
 * Adaptive layout for all user roles
 * Features: AI Analyst, Security Posture, Inventory, Threat Intel
 * Tabs: Overview | Detailed Analysis | Findings Table
 */

import { auth } from '@auth';
import { api } from '@api';
import { config } from '@config';
import { orgContext } from '@orgContext';
import { SavingsCalculator } from '@components/SavingsCalculator.js';

// Shared components
import { StatusBadge, getConnectionStatus, StatusDot } from '@components/shared/StatusBadge.js';
import { SeverityBadge, RiskScoreBadge, GradeBadge } from '@components/shared/Badges.js';
import { LoadingSpinner, ErrorAlert, EmptyState, Card } from '@components/shared/CommonComponents.js';
import { getDonutChartConfig, getRadarChartConfig, getScatterChartConfig, renderChart, destroyChart, severityColors, statusColors } from '@components/charts/ChartHelpers.js';
import { formatTimestamp, formatRelativeTime, formatNumber, formatPercent, roundPercent, formatDeviceList, groupBy, sortBy, uniqueBy } from '@utils/dataHelpers.js';

const { html, Component } = window;

export class DashboardPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            user: null,
            currentOrg: null,
            dashboardData: null,
            deviceStats: { total: 0, active: 0, disabled: 0, blocked: 0 },
            threatSummary: { critical: 0, high: 0, medium: 0, low: 0, total: 0, mitigatedCritical: 0, mitigatedHigh: 0, mitigatedMedium: 0, mitigatedLow: 0, mitigatedTotal: 0 },
            complianceSummary: { score: 0, compliant: 0, nonCompliant: 0, total: 0 },
            recentAlerts: [],
            recentDevices: [],
            licenseInfo: null,
            coverage: { healthy: 0, stale: 0, offline: 0, total: 0 },
            actions: [],
            inventoryStats: { totalApps: 0, vendors: 0 },
            securityScore: 0,
            securityGrade: 'N/A',
            lastScan: 'Never',
            nextScan: 'Pending',
            generatedAt: null,
            refreshInterval: null,
            activeTab: 'overview', // New: tab state (overview | analysis | findings)
            postureSnapshot: null, // New: PostureEngine snapshot data
            loadingPosture: false // New: separate loading state for posture tab
        };
        this.orgUnsubscribe = null;
        this.threatChart = null;
        this.threatChartEl = null;
        this.complianceChart = null;
        this.complianceChartEl = null;
        this.coverageChart = null;
        this.coverageChartEl = null;
        this.radarChart = null;
        this.radarChartEl = null;
        this.savingsChart = null;
        this.savingsChartEl = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => {
            // Clear all dashboard state and charts on org change
            this.setState({
                dashboardData: null,
                deviceStats: { total: 0, active: 0, disabled: 0, blocked: 0 },
                threatSummary: { critical: 0, high: 0, medium: 0, low: 0, total: 0, mitigatedCritical: 0, mitigatedHigh: 0, mitigatedMedium: 0, mitigatedLow: 0, mitigatedTotal: 0 },
                complianceSummary: { score: 0, compliant: 0, nonCompliant: 0, total: 0 },
                recentAlerts: [],
                recentDevices: [],
                licenseInfo: null,
                coverage: { healthy: 0, stale: 0, offline: 0, total: 0 },
                actions: [],
                inventoryStats: { totalApps: 0, vendors: 0 },
                securityScore: 0,
                securityGrade: 'N/A',
                lastScan: 'Never',
                nextScan: 'Pending',
                generatedAt: null,
                postureSnapshot: null,
                loadingPosture: false
            });
            this.destroyCharts();
            if (this.deviceSparklineChart) this.deviceSparklineChart.destroy();
            if (this.scoreSparklineChart) this.scoreSparklineChart.destroy();
            this.loadDashboardData();
        });
        this.loadDashboardData();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
        if (this.state.refreshInterval) {
            clearInterval(this.state.refreshInterval);
        }
        this.destroyCharts();
        if (this.deviceSparklineChart) this.deviceSparklineChart.destroy();
        if (this.scoreSparklineChart) this.scoreSparklineChart.destroy();
    }

    componentDidUpdate(prevProps, prevState) {
        const dataChanged = prevState.dashboardData !== this.state.dashboardData;
        const tabChanged = prevState.activeTab !== this.state.activeTab;
        
        // Render charts when:
        // 1. Data changes while on overview tab
        // 2. Switching TO overview tab (even if data hasn't changed)
        const shouldRenderCharts = (dataChanged && this.state.activeTab === 'overview') || 
                                   (tabChanged && this.state.activeTab === 'overview');
        
        if (shouldRenderCharts) {
            // Use requestAnimationFrame for better performance
            requestAnimationFrame(() => {
                // Render critical charts first
                this.renderThreatChart(this.state.threatSummary);
                this.renderComplianceDonut(this.state.complianceSummary);
                
                // Defer less critical charts to next frame
                requestAnimationFrame(() => {
                    this.renderCoveragePolar(this.state.coverage);
                    this.renderPostureRadar();
                    this.renderPostureSummaryDonuts();
                    this.renderDeviceSparkline();
                    this.renderScoreSparkline();
                });
            });
        }
    }

    async loadDashboardData() {
        try {
            this.setState({ loading: true, error: null });
            
            const user = auth.getUser();
            const currentOrg = orgContext.getCurrentOrg();
            
            if (!user) {
                this.setState({ error: 'Not authenticated', loading: false });
                return;
            }

            this.setState({ user, currentOrg });

            const orgId = currentOrg?.orgId || user.email;
            
            // Single fetch for unified dashboard data
            const dashboardRes = await api.getUnifiedDashboard(orgId);
            
            if (dashboardRes.success && dashboardRes.data) {
                const dashboard = dashboardRes.data;
                
                // Inventory stats from backend
                const inventoryStats = dashboard.inventory || { totalApps: 0, vendors: 0 };

                // License info from backend (normalize to avoid NaN and add daysRemaining)
                const licenseInfo = this.normalizeLicenseInfo(dashboard.license);

                const coverage = dashboard.coverage || { healthy: 0, stale: 0, offline: 0, total: 0 };
                const actions = dashboard.actions || [];
                const generatedAt = dashboard.generatedAt || new Date().toISOString();
                const threatSummary = this.normalizeThreatSummary(dashboard.threats);

                this.setState({
                    dashboardData: dashboard,
                    deviceStats: dashboard.devices || { total: 0, active: 0, disabled: 0, blocked: 0 },
                    threatSummary,
                    complianceSummary: dashboard.compliance || { score: 0, compliant: 0, nonCompliant: 0, total: 0 },
                    recentAlerts: dashboard.alerts || [],
                    recentDevices: dashboard.recentDevices || [],
                    securityScore: dashboard.securityScore || 0,
                    securityGrade: dashboard.grade || 'N/A',
                    lastScan: dashboard.lastScan || 'Never',
                    nextScan: dashboard.nextScan || 'Pending',
                    inventoryStats,
                    licenseInfo,
                    coverage,
                    actions,
                    generatedAt,
                    loading: false
                });
                
                // Auto-load posture snapshot in background for actions widget
                this.loadPostureSnapshotInBackground();
            } else {
                throw new Error(dashboardRes.message || dashboardRes.error || 'Failed to load dashboard data');
            }
        } catch (error) {
            console.error('[UnifiedDashboard] Load failed:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    handleAnalystSearch(query) {
        if (query && query.trim()) {
            window.location.hash = `#!/analyst?q=${encodeURIComponent(query.trim())}`;
        }
    }

    getUserRole() {
        const currentOrg = orgContext.currentOrg;
        if (currentOrg?.role === 'SiteAdmin') return 'SiteAdmin';
        if (currentOrg?.role === 'Owner' || currentOrg?.role === 'ReadWrite') return 'Business';
        return 'EndUser';
    }

    getRiskScore() {
        return this.state.securityScore || 0;
    }

    getRiskColor(score) {
        if (score === null || score === 0) return 'secondary';
        // 100=best (green), 0=worst (red)
        if (score >= 80) return 'success';  // A/B grade
        if (score >= 60) return 'info';     // C/D grade
        if (score >= 40) return 'warning';  // F grade
        return 'danger';                     // Very low
    }

    getRiskLabel(score) {
        // 100=best, 0=worst
        if (score >= 80) return 'Excellent';  // A/B grade
        if (score >= 60) return 'Good';       // C/D grade
        if (score >= 40) return 'Fair';       // F grade
        if (score > 0) return 'Poor';         // Very low
        return 'Not Rated';
    }

    getGradeBadge(score) {
        if (score >= 80) return 'bg-success';
        if (score >= 60) return 'bg-info';
        if (score >= 40) return 'bg-warning';
        return 'bg-danger';
    }

    getGrade(score) {
        if (score >= 80) return 'A';
        if (score >= 60) return 'B';
        if (score >= 40) return 'C';
        return 'D';
    }

    getRemediationSpeedBadge(score) {
        if (score >= 80) return 'bg-success';
        if (score >= 60) return 'bg-info';
        if (score >= 40) return 'bg-warning';
        return 'bg-danger';
    }

    calculateTrend(currentValue, previousValue) {
        if (!previousValue || previousValue === 0) return 0;
        const delta = currentValue - previousValue;
        return Math.round((delta / previousValue) * 100);
    }

    normalizeThreatSummary(threats) {
        const t = threats || {};
        const critical = t.critical ?? 0;
        const high = t.high ?? 0;
        const medium = t.medium ?? 0;
        const low = t.low ?? 0;
        const mitigatedCritical = t.mitigatedCritical ?? 0;
        const mitigatedHigh = t.mitigatedHigh ?? 0;
        const mitigatedMedium = t.mitigatedMedium ?? 0;
        const mitigatedLow = t.mitigatedLow ?? 0;

        return {
            critical,
            high,
            medium,
            low,
            total: t.total ?? (critical + high + medium + low),
            mitigatedCritical,
            mitigatedHigh,
            mitigatedMedium,
            mitigatedLow,
            mitigatedTotal: t.mitigatedTotal ?? (mitigatedCritical + mitigatedHigh + mitigatedMedium + mitigatedLow)
        };
    }

    getActiveThreats() {
        return this.normalizeThreatSummary(this.state.threatSummary);
    }

    getMitigatedThreats() {
        const t = this.normalizeThreatSummary(this.state.threatSummary);
        return {
            critical: t.mitigatedCritical,
            high: t.mitigatedHigh,
            medium: t.mitigatedMedium,
            low: t.mitigatedLow,
            total: t.mitigatedTotal
        };
    }

    safeNumber(value, fallback = 0) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }

    roundPercent(value) {
        if (!Number.isFinite(value)) return 0;
        return Math.round(value * 10) / 10; // keep one decimal for readability
    }

    getCoveragePercents() {
        const { coverage } = this.state;
        const total = this.safeNumber(coverage.total);
        const healthy = this.safeNumber(coverage.healthy);
        const stale = this.safeNumber(coverage.stale);

        const healthyPct = total > 0 ? this.roundPercent((healthy / total) * 100) : 0;
        const stalePct = total > 0 ? this.roundPercent((stale / total) * 100) : 0;
        const offlinePct = total > 0 ? Math.max(0, this.roundPercent(100 - healthyPct - stalePct)) : 0;

        return { healthyPct, stalePct, offlinePct };
    }

    getSeatUsage() {
        const { licenseInfo } = this.state;
        return {
            used: this.safeNumber(licenseInfo?.usedSeats),
            total: this.safeNumber(licenseInfo?.seats),
            pct: this.safeNumber(licenseInfo?.seatUtilization)
        };
    }

    getLicenseDuration() {
        const { licenseInfo } = this.state;
        return {
            days: this.safeNumber(licenseInfo?.daysRemaining),
            pct: this.safeNumber(licenseInfo?.creditUtilization)
        };
    }

    normalizeLicenseInfo(license) {
        if (!license) return null;

        const normalized = {
            ...license,
            seats: this.safeNumber(license.seats),
            usedSeats: this.safeNumber(license.usedSeats),
            remainingCredits: this.safeNumber(license.remainingCredits),
            creditUtilization: this.safeNumber(license.creditUtilization),
            seatUtilization: this.safeNumber(license.seatUtilization)
        };

        normalized.daysRemaining = this.deriveDaysRemaining(normalized);
        return normalized;
    }

    deriveDaysRemaining(license) {
        const candidate = [license.daysRemaining, license.remainingDays, license.estimatedDaysRemaining, license.freeDaysRemaining]
            .find(value => Number.isFinite(Number(value)));

        if (candidate !== undefined) {
            return Math.max(0, Math.round(Number(candidate)));
        }

        const remainingCredits = Number.isFinite(license.remainingCredits) ? license.remainingCredits : null;
        const seatsForCalc = Number.isFinite(license.usedSeats) && license.usedSeats > 0
            ? license.usedSeats
            : (Number.isFinite(license.seats) && license.seats > 0 ? license.seats : null);

        if (remainingCredits !== null && seatsForCalc) {
            return Math.max(0, Math.round(remainingCredits / seatsForCalc));
        }

        return 0;
    }

    formatLicenseDaysDisplay(days) {
        const exact = Math.max(0, Math.round(this.safeNumber(days)));

        let label = `${exact} days`;
        let badgeClass = 'bg-success';

        if (exact >= 730) {
            label = '2+ years';
        } else if (exact >= 365) {
            label = '1+ year';
        } else if (exact >= 180) {
            label = '6+ months';
        }

        if (exact === 0) {
            badgeClass = 'bg-danger text-white';
        } else if (exact <= 30) {
            badgeClass = 'bg-danger';
        } else if (exact <= 60) {
            badgeClass = 'bg-orange';
        } else if (exact <= 90) {
            badgeClass = 'bg-warning';
        }

        return {
            label,
            exact,
            badgeClass,
            tooltip: `${exact} days remaining (exact)`
        };
    }

    renderDisabledAddDeviceButton(label = 'Add device', className = 'btn btn-light') {
        const { html } = window;
        const tooltip = 'One-Click Push install on managed devices (coming soon).';
        return html`
            <span class="d-inline-block" title=${tooltip} aria-label=${tooltip}>
                <button type="button" class=${`${className} disabled`} disabled aria-disabled="true">${label}</button>
            </span>
        `;
    }

    renderThreatCard(threats) {
        const { html } = window;
        const active = this.normalizeThreatSummary(threats);
        const mitigated = {
            critical: active.mitigatedCritical,
            high: active.mitigatedHigh,
            medium: active.mitigatedMedium,
            low: active.mitigatedLow,
            total: active.mitigatedTotal
        };
        const { critical, high, medium, low, total } = active;

        return html`
            <div class="card h-100">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <div>
                        <div class="card-title">Threat Landscape</div>
                        <div class="text-muted small">Active vulnerabilities by severity (30d)</div>
                    </div>
                    <span class="badge bg-danger-lt text-danger">${Math.max(0, (critical + high + medium + low) - (mitigated.total || 0))} open</span>
                </div>
                <div class="card-body">
                    <div id="unified-threat-chart" ref=${(el) => { this.threatChartEl = el; }} style="min-height:240px;"></div>
                    <div class="d-flex gap-3 text-muted small mt-2 flex-wrap">
                        <span class="badge bg-danger-lt text-danger">Critical (open): ${Math.max(0, critical - (mitigated.critical || 0))}</span>
                        <span class="badge bg-warning-lt text-warning">High (open): ${Math.max(0, high - (mitigated.high || 0))}</span>
                        <span class="badge bg-info-lt text-info">Medium (open): ${Math.max(0, medium - (mitigated.medium || 0))}</span>
                        <span class="badge bg-secondary-lt text-secondary">Low (open): ${Math.max(0, low - (mitigated.low || 0))}</span>
                    </div>
                    <div class="text-muted small mt-3">
                        <div class="fw-semibold mb-1">Mitigated in last 30 days</div>
                        <div class="d-flex gap-2 flex-wrap">
                            <span class="badge bg-azure-lt text-azure">Total mitigated: ${mitigated.total}</span>
                            <span class="badge bg-azure-lt text-azure">Critical: ${mitigated.critical}</span>
                            <span class="badge bg-azure-lt text-azure">High: ${mitigated.high}</span>
                            <span class="badge bg-azure-lt text-azure">Medium: ${mitigated.medium}</span>
                            <span class="badge bg-azure-lt text-azure">Low: ${mitigated.low}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderComplianceCard(compliance) {
        const { html } = window;
        const compliant = compliance?.compliant ?? 0;
        const nonCompliant = compliance?.nonCompliant ?? 0;
        const unknown = compliance?.unknown ?? 0;
        const total = compliance?.total ?? 0;
        const score = compliance?.score ?? 0;

        return html`
            <div class="card h-100">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <div>
                        <div class="card-title">Compliance Mix</div>
                        <div class="text-muted small">Compliant vs gaps vs unknowns</div>
                    </div>
                    <span class="badge bg-success-lt text-success">${score}% score</span>
                </div>
                <div class="card-body">
                    <div id="unified-compliance-chart" ref=${(el) => { this.complianceChartEl = el; }} style="min-height:240px;"></div>
                    <div class="text-muted small mt-2">${compliant}/${total} compliant${unknown > 0 ? ` • ${unknown} unknown` : ''}</div>
                </div>
            </div>
        `;
    }

    renderCoverageCard(coverage) {
        const { html } = window;
        const healthy = coverage?.healthy ?? 0;
        const stale = coverage?.stale ?? 0;
        const offline = coverage?.offline ?? 0;
        const total = healthy + stale + offline;

        return html`
            <div class="card h-100">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <div>
                        <div class="card-title">Device Connectivity</div>
                        <div class="text-muted small">Real-time connection status</div>
                    </div>
                    <span class="badge bg-primary-lt text-primary">${total} devices</span>
                </div>
                <div class="card-body">
                    <div id="unified-coverage-chart" ref=${(el) => { this.coverageChartEl = el; }} style="min-height:240px;"></div>
                    <div class="d-flex gap-3 text-muted small mt-2 flex-wrap">
                        <span class="badge bg-success-lt text-success" title="Heartbeat < 30 minutes">Online: ${healthy}</span>
                        <span class="badge bg-warning-lt text-warning" title="Heartbeat 30min - 24hrs">Degraded: ${stale}</span>
                        <span class="badge bg-secondary-lt text-secondary" title="No heartbeat > 24hrs">Offline: ${offline}</span>
                    </div>
                </div>
            </div>
        `;
    }

    renderThreatChart(threats) {
        if (!window.ApexCharts || !this.threatChartEl) {
            return;
        }

        const openCritical = Math.max(0, (threats?.critical ?? 0) - (threats?.mitigatedCritical ?? 0));
        const openHigh = Math.max(0, (threats?.high ?? 0) - (threats?.mitigatedHigh ?? 0));
        const openMedium = Math.max(0, (threats?.medium ?? 0) - (threats?.mitigatedMedium ?? 0));
        const openLow = Math.max(0, (threats?.low ?? 0) - (threats?.mitigatedLow ?? 0));
        const seriesData = [
              Math.round(openCritical || 0),
              Math.round(openHigh || 0),
              Math.round(openMedium || 0),
              Math.round(openLow || 0)
        ];

        // Validate data before charting
        if (!seriesData.every(val => !isNaN(val) && isFinite(val))) {
            console.warn('[ThreatChart] Invalid data - contains NaN values', seriesData);
            return;
        }

        const options = {
            chart: { type: 'bar', height: 240, toolbar: { show: false } },
            series: [{ name: 'Findings', data: seriesData }],
            colors: ['#d63939', '#f59f00', '#3490dc', '#206bc4'],
            plotOptions: { bar: { columnWidth: '45%', distributed: true } },
            dataLabels: { enabled: false },
            xaxis: { categories: ['Critical', 'High', 'Medium', 'Low'] },
            grid: { strokeDashArray: 4 }
        };

        if (this.threatChart) {
            this.threatChart.updateOptions(options);
        } else {
            this.threatChart = new window.ApexCharts(this.threatChartEl, options);
            this.threatChart.render();
        }
    }

    renderComplianceDonut(compliance) {
        if (!window.ApexCharts || !this.complianceChartEl) {
            return;
        }

        const compliant = Math.max(0, compliance?.compliant ?? 0);
        const nonCompliant = Math.max(0, compliance?.nonCompliant ?? 0);
        const unknown = Math.max(0, compliance?.unknown ?? 0);
        const series = [
            Math.round(compliant || 0),
            Math.round(nonCompliant || 0),
            Math.round(unknown || 0)
        ];

        // Validate data before charting
        if (!series.every(val => !isNaN(val) && isFinite(val))) {
            console.warn('[ComplianceChart] Invalid data - contains NaN values', series);
            return;
        }

        const hasData = series.some(v => v > 0);
        const safeSeries = hasData ? series : [1, 0, 0];

        const options = {
            chart: { type: 'donut', height: 240 },
            labels: ['Compliant', 'Non-Compliant', 'Unknown'],
            series: safeSeries,
            colors: ['#2fb344', '#d63939', '#868e96'],
            dataLabels: { enabled: true, formatter: (val) => `${Math.round(val)}%` },
            tooltip: { y: { formatter: (val) => `${Math.round(val)}%` } },
            legend: { position: 'bottom' },
            stroke: { width: 1, colors: ['#fff'] }
        };

        if (this.complianceChart) {
            this.complianceChart.updateOptions(options);
        } else {
            this.complianceChart = new window.ApexCharts(this.complianceChartEl, options);
            this.complianceChart.render();
        }
    }

    renderCoveragePolar(coverage) {
        if (!window.ApexCharts || !this.coverageChartEl) {
            return;
        }

        const healthy = Math.max(0, coverage?.healthy ?? 0);
        const stale = Math.max(0, coverage?.stale ?? 0);
        const offline = Math.max(0, coverage?.offline ?? 0);
        const series = [
            Math.round(healthy || 0),
            Math.round(stale || 0),
            Math.round(offline || 0)
        ];

        // Validate data before charting
        if (!series.every(val => !isNaN(val) && isFinite(val))) {
            console.warn('[CoverageChart] Invalid data - contains NaN values', series);
            return;
        }

        const hasData = series.some(v => v > 0);
        const safeSeries = hasData ? series : [1, 0, 0];

        const options = {
            chart: { type: 'polarArea', height: 240 },
            labels: ['Online', 'Degraded', 'Offline'], // Changed from Healthy/Stale/Offline
            series: safeSeries,
            colors: ['#2fb344', '#f59f00', '#868e96'],
            stroke: { colors: ['#fff'] },
            fill: { opacity: 0.9 },
            dataLabels: { enabled: false },
            tooltip: { y: { formatter: (val) => `${Math.round(val)} devices` } },
            legend: { position: 'bottom' }
        };

        if (this.coverageChart) {
            this.coverageChart.updateOptions(options);
        } else {
            this.coverageChart = new window.ApexCharts(this.coverageChartEl, options);
            this.coverageChart.render();
        }
    }

    renderRadarCard() {
        const { html } = window;
        const stats = this.computeRadarStats();

        return html`
            <div class="card h-100">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <div>
                        <div class="card-title">Posture Radar</div>
                        <div class="text-muted small">Balanced view across key posture dimensions</div>
                    </div>
                    <span class="badge bg-primary-lt text-primary">Radar blend</span>
                </div>
                <div class="card-body py-2">
                    <div class="row align-items-center g-3">
                        <div class="col-md-5">
                            <div class="vstack gap-2 text-muted small">
                                <div class="d-flex align-items-center gap-2">
                                    <span class="badge bg-azure-lt text-azure">Compliance</span>
                                    <span class="fw-semibold text-body">${Math.round(stats.complianceScore)}%</span>
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    <span class="badge bg-success-lt text-success">Coverage</span>
                                    <span class="fw-semibold text-body">${Math.round(stats.coverageHealth)}%</span>
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    <span class="badge bg-primary-lt text-primary">Active</span>
                                    <span class="fw-semibold text-body">${Math.round(stats.activePercent)}%</span>
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    <span class="badge bg-warning-lt text-warning">Threat pressure</span>
                                    <span class="fw-semibold text-body">${Math.round(stats.threatPressure)}</span>
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    <span class="badge bg-secondary-lt text-secondary">Alert load</span>
                                    <span class="fw-semibold text-body">${Math.round(stats.alertLoad)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-7">
                            <div id="unified-radar-chart" ref=${(el) => { this.radarChartEl = el; }} style="min-height:150px;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    computeRadarStats() {
        const toNumber = (v) => {
            const n = typeof v === 'number' ? v : parseFloat(v);
            return Number.isFinite(n) ? n : 0;
        };

        const clamp100 = (n) => Math.max(0, Math.min(100, toNumber(n)));

        const complianceScore = clamp100(this.state.complianceSummary?.score ?? 0);
        const devices = this.state.deviceStats || { total: 0, active: 0 };
        const coverage = this.state.coverage || { healthy: 0, stale: 0, offline: 0, total: 0 };
        const alerts = Array.isArray(this.state.recentAlerts) ? this.state.recentAlerts : [];
        const threats = this.state.threatSummary || { critical: 0, high: 0, medium: 0, low: 0 };

        const totalDevices = toNumber(devices.total);
        const activePercent = totalDevices ? clamp100((toNumber(devices.active) / totalDevices) * 100) : 0;

        const coverageTotal = toNumber(coverage.healthy) + toNumber(coverage.stale) + toNumber(coverage.offline);
        const coverageHealth = coverageTotal ? clamp100(Math.round((toNumber(coverage.healthy) / coverageTotal) * 100)) : 0;

        // Normalize threat pressure to 0-100 scale (not raw count)
        const totalThreats = toNumber(threats.critical) + toNumber(threats.high) + toNumber(threats.medium) + toNumber(threats.low);
        const threatPressure = totalThreats > 0 ? clamp100(Math.min(100, Math.round((toNumber(threats.critical) * 2 + toNumber(threats.high)) / Math.max(1, totalDevices) * 5))) : 0;

        const alertLoad = clamp100(Math.min(100, Math.round((alerts.length || 0) * 10)));

        return {
            complianceScore: Math.round(complianceScore),
            activePercent: Math.round(activePercent),
            coverageHealth: Math.round(coverageHealth),
            threatPressure: Math.round(threatPressure),
            alertLoad: Math.round(alertLoad)
        };
    }

    renderPostureRadar() {
        if (!window.ApexCharts || !this.radarChartEl) {
            return;
        }

        const stats = this.computeRadarStats();
        // All stats are already 0-100 and rounded, safe to invert
        const series = [
            Math.round(stats.complianceScore),
            Math.round(stats.coverageHealth),
            Math.round(stats.activePercent),
            Math.round(Math.max(0, 100 - stats.threatPressure)), // invert: higher pressure -> lower score
            Math.round(Math.max(0, 100 - stats.alertLoad))       // invert alerts
        ];

        // Validate data before charting
        if (!series.every(val => Number.isFinite(val) && val >= 0 && val <= 100)) {
            console.warn('[RadarChart] Invalid data after rounding', series, stats);
            return;
        }

        const options = {
            chart: { type: 'radar', height: 250, toolbar: { show: false } },
            series: [{ name: 'Posture', data: series }],
            labels: ['Compliance', 'Coverage', 'Active Devices', 'Low Threats', 'Low Alerts'],
            yaxis: { show: true, labels: { formatter: (v) => `${Math.round(v)}` } },
            stroke: { width: 2 },
            fill: { opacity: 0.2 },
            markers: { size: 4 },
            colors: ['#4263eb']
        };

        if (this.radarChart) {
            this.radarChart.updateOptions(options);
        } else {
            this.radarChart = new window.ApexCharts(this.radarChartEl, options);
            this.radarChart.render();
        }
    }

    destroyCharts() {
        if (this.threatChart) {
            this.threatChart.destroy();
            this.threatChart = null;
        }
        if (this.complianceChart) {
            this.complianceChart.destroy();
            this.complianceChart = null;
        }
        if (this.coverageChart) {
            this.coverageChart.destroy();
            this.coverageChart = null;
        }
        if (this.savingsChart) {
            this.savingsChart.destroy();
            this.savingsChart = null;
        }
        if (this.deviceRiskChart) {
            this.deviceRiskChart.destroy();
            this.deviceRiskChart = null;
        }
        if (this.cveAgingChart) {
            this.cveAgingChart.destroy();
            this.cveAgingChart = null;
        }
        if (this.threatDonutChart) {
            this.threatDonutChart.destroy();
            this.threatDonutChart = null;
        }
        if (this.complianceDonutChart) {
            this.complianceDonutChart.destroy();
            this.complianceDonutChart = null;
        }
    }

    async loadPostureSnapshotInBackground() {
        // Only load if not already loaded/loading
        if (this.state.postureSnapshot || this.state.loadingPosture) return;
        
        try {
            const org = orgContext.getCurrentOrg();
            if (!org) return;
            
            console.log('[Dashboard] Loading posture snapshot in background for actions');
            const response = await api.getPostureSnapshot(org.orgId, { period: 'daily', force: false });
            const snapshot = response?.data?.snapshot;
            
            if (snapshot) {
                this.setState({ postureSnapshot: snapshot });
                console.log('[Dashboard] Posture snapshot loaded, actions available:', snapshot.actions?.prioritized?.length || 0);
            }
        } catch (err) {
            console.warn('[Dashboard] Failed to load posture snapshot in background:', err.message);
        }
    }

    async loadPostureAndSwitchTab(tab = 'analysis') {
        const { postureSnapshot, loadingPosture } = this.state;
        
        // Avoid loading if already loading
        if (loadingPosture) return;
        
        // Switch tab immediately
        this.setState({ activeTab: tab });
        
        // Load posture data if not already loaded
        if (!postureSnapshot) {
            this.setState({ loadingPosture: true });
            
            try {
                const org = orgContext.getCurrentOrg();
                if (!org) {
                    console.error('[Dashboard] No org selected for posture snapshot');
                    this.setState({ loadingPosture: false });
                    return;
                }
                
                console.log('[Dashboard] Loading posture snapshot for org:', org.orgId);
                const response = await api.getPostureSnapshot(org.orgId, { period: 'daily', force: false });
                console.log('[Dashboard] Posture snapshot response:', response);
                
                // API returns: {success, data: {snapshot, triggeredGeneration}, message}
                const snapshot = response?.data?.snapshot;
                
                if (!snapshot) {
                    console.warn('[Dashboard] No snapshot in response, trying force generation...');
                    const forceResponse = await api.getPostureSnapshot(org.orgId, { period: 'daily', force: true });
                    console.log('[Dashboard] Forced snapshot response:', forceResponse);
                    
                    this.setState({ 
                        postureSnapshot: forceResponse?.data?.snapshot || null,
                        loadingPosture: false 
                    });
                } else {
                    this.setState({ 
                        postureSnapshot: snapshot,
                        loadingPosture: false 
                    });
                }
            } catch (err) {
                console.error('[Dashboard] Failed to load posture snapshot:', err);
                this.setState({ 
                    loadingPosture: false,
                    error: `Failed to load posture data: ${err.message}`
                });
            }
        }
    }

    async forcePostureGeneration() {
        this.setState({ loadingPosture: true, postureSnapshot: null });
        
        try {
            const org = orgContext.getCurrentOrg();
            if (!org) {
                console.error('[Dashboard] No org selected');
                this.setState({ loadingPosture: false });
                return;
            }
            
            console.log('[Dashboard] Forcing posture snapshot generation for org:', org.orgId);
            const response = await api.getPostureSnapshot(org.orgId, { period: 'daily', force: true });
            console.log('[Dashboard] Generated snapshot response:', response);
            
            // API returns: {success, data: {snapshot, triggeredGeneration}, message}
            const snapshot = response?.data?.snapshot;
            
            this.setState({ 
                postureSnapshot: snapshot || null,
                loadingPosture: false 
            });
        } catch (err) {
            console.error('[Dashboard] Failed to generate posture snapshot:', err);
            this.setState({ 
                loadingPosture: false,
                error: `Failed to generate posture snapshot: ${err.message}`
            });
        }
    }

    renderOverviewTab(role, riskScore, riskColor) {
        const { currentOrg, dashboardData, licenseInfo } = this.state;
        const isPersonalOrg = currentOrg?.type === 'Personal';
        const deviceStats = dashboardData?.deviceStats || { total: 0, active: 0, disabled: 0 };
        const threatSummary = this.state.threatSummary || { critical: 0, high: 0, medium: 0, low: 0 };
        const seats = licenseInfo?.seats || 1;
        
        // Fallback: If deviceStats.total is 0 but we have devices data, count from there
        let deviceCount = deviceStats.total;
        if (deviceCount === 0 && dashboardData?.devices?.length > 0) {
            deviceCount = dashboardData.devices.length;
        }
        // Another fallback: check recent devices
        if (deviceCount === 0 && dashboardData?.recentDevices?.length > 0) {
            deviceCount = dashboardData.recentDevices.length;
        }
        
        console.log('[Dashboard] Overview tab - seats:', seats, 'deviceCount:', deviceCount, 'deviceStats:', deviceStats, 'threatSummary:', threatSummary);
        
        return html`
            ${this.renderValuePanel(riskColor)}
            ${this.renderHero(riskScore, riskColor)}
            ${this.renderHighlights()}
            ${this.renderVisualChartsRow()}
            ${this.renderRadarAndKPIsRow(role, riskScore, riskColor)}

            <div class="row row-cards mt-3">
                <div class="col-lg-8">
                    <div class="vstack gap-3">
                        ${this.renderAIAnalystWidget()}
                        ${this.renderActionList()}
                        
                        <!-- Security Savings Calculator -->
                        <${SavingsCalculator} 
                            seats=${Number(seats) || 1}
                            deviceCount=${Number(deviceCount) || 1}
                            vulnerabilities=${{critical: Number(threatSummary.critical) || 0, high: Number(threatSummary.high) || 0}}
                            isPersonal=${!!isPersonalOrg}
                        />
                        
                        ${this.renderPostureWidget()}
                        ${this.renderRecentAlerts()}
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="vstack gap-3">
                        ${this.renderCoverageWidget()}
                        ${this.renderLicenseWidget()}
                        ${this.renderRecentDevices()}
                        ${this.renderInventoryWidget()}
                    </div>
                </div>
            </div>
        `;
    }

    renderAnalysisTab(riskScore, riskColor) {
        const { postureSnapshot, loadingPosture } = this.state;
        
        if (loadingPosture) {
            return html`
                <div class="d-flex align-items-center justify-content-center" style="min-height: 40vh;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading analysis...</span>
                    </div>
                </div>
            `;
        }
        
        if (!postureSnapshot) {
            return html`
                <div class="alert alert-warning">
                    <div class="d-flex align-items-center">
                        <div class="flex-fill">
                            <h4 class="alert-title">Posture Snapshot Not Available</h4>
                            <div class="text-secondary">The security posture snapshot hasn't been generated yet. Click the button to generate one now.</div>
                        </div>
                        <div class="ms-3">
                            <button 
                                class="btn btn-primary"
                                onClick=${() => this.forcePostureGeneration()}
                            >
                                Generate Snapshot
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        const snapshot = postureSnapshot;
        
        return html`
            <div class="row row-cards">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Security Posture Analysis</h3>
                            <div class="card-actions">
                                <button 
                                    class="btn btn-sm btn-ghost-primary me-2"
                                    onClick=${() => this.forcePostureGeneration()}
                                    title="Refresh snapshot"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                    Refresh
                                </button>
                                <span class="badge bg-${riskColor} text-white">${snapshot.risk?.orgScore || riskScore}/100</span>
                            </div>
                        </div>
                        <div class="card-body">
                            ${this.renderSeverityBreakdown(snapshot)}
                            ${this.renderDeviceRiskMatrix(snapshot)}
                            ${this.renderCVEAgingChart(snapshot)}
                            ${this.renderPrioritizedActions(snapshot)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderPostureSummaryDonuts() {
        if (!window.ApexCharts) return;
        
        // Destroy existing charts
        if (this.threatDonutChart) {
            this.threatDonutChart.destroy();
            this.threatDonutChart = null;
        }
        if (this.complianceDonutChart) {
            this.complianceDonutChart.destroy();
            this.complianceDonutChart = null;
        }
        
        // Threat donut
        const t = this.state.threatSummary || {};
        const openCritical = Math.max(0, (t.critical ?? 0) - (t.mitigatedCritical ?? 0));
        const openHigh = Math.max(0, (t.high ?? 0) - (t.mitigatedHigh ?? 0));
        const openMedium = Math.max(0, (t.medium ?? 0) - (t.mitigatedMedium ?? 0));
        const openLow = Math.max(0, (t.low ?? 0) - (t.mitigatedLow ?? 0));
        
        const threatTotal = openCritical + openHigh + openMedium + openLow;
        const threatSeries = [Math.round(openCritical || 0), Math.round(openHigh || 0), Math.round(openMedium || 0), Math.round(openLow || 0)];
        
        // Validate threat data
        if (threatSeries.every(val => !isNaN(val) && isFinite(val))) {
            const threatEl = document.getElementById('posture-threat-donut');
            if (threatEl && threatTotal > 0) {
                const opts = {
                    chart: { type: 'donut', height: 160 },
                    labels: ['Critical', 'High', 'Medium', 'Low'],
                    series: threatSeries,
                    colors: ['#d63939', '#f59f00', '#3490dc', '#206bc4'],
                    dataLabels: { enabled: true, formatter: (val) => `${Math.round(val)}%` },
                    legend: { position: 'bottom' },
                    stroke: { width: 1, colors: ['#fff'] }
                };
                this.threatDonutChart = new window.ApexCharts(threatEl, opts);
                this.threatDonutChart.render();
            }
        }
        
        // Compliance donut
        const c = this.state.complianceSummary || {};
        const compliant = Math.max(0, c.compliant || 0);
        const nonCompliant = Math.max(0, c.nonCompliant || 0);
        const unknown = Math.max(0, c.unknown || 0);
        const compTotal = compliant + nonCompliant + unknown;
        const compSeries = [Math.round(compliant || 0), Math.round(nonCompliant || 0), Math.round(unknown || 0)];
        
        // Validate compliance data
        if (compSeries.every(val => !isNaN(val) && isFinite(val))) {
            const compEl = document.getElementById('posture-compliance-donut');
            if (compEl && compTotal > 0) {
                const opts = {
                    chart: { type: 'donut', height: 160 },
                    labels: ['Compliant', 'Non-Compliant', 'Unknown'],
                    series: compSeries,
                    colors: ['#2fb344', '#d63939', '#868e96'],
                    dataLabels: { enabled: true, formatter: (val) => `${Math.round(val)}%` },
                    legend: { position: 'bottom' },
                    stroke: { width: 1, colors: ['#fff'] }
                };
                this.complianceDonutChart = new window.ApexCharts(compEl, opts);
                this.complianceDonutChart.render();
            }
        }
    }

    renderFindingsTab() {
        const { postureSnapshot, loadingPosture } = this.state;
        
        if (loadingPosture) {
            return html`
                <div class="d-flex align-items-center justify-content-center" style="min-height: 40vh;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading findings...</span>
                    </div>
                </div>
            `;
        }
        
        if (!postureSnapshot || !postureSnapshot.findings) {
            return html`
                <div class="alert alert-info">
                    <h4 class="alert-title">No Findings</h4>
                    <div class="text-secondary">No security findings available. Snapshot may still be generating.</div>
                </div>
            `;
        }
        
        const snapshot = postureSnapshot;
        const findings = snapshot.findings.top10 || [];
        
        return html`
            <div class="row row-cards">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Top Security Findings</h3>
                            <div class="ms-auto">
                                <span class="badge bg-secondary">${findings.length} findings</span>
                            </div>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-vcenter card-table">
                                <thead>
                                    <tr>
                                        <th>Severity</th>
                                        <th>Domain</th>
                                        <th>Title</th>
                                        <th>Affected</th>
                                        <th>Aging</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${findings.length === 0 ? html`
                                        <tr>
                                            <td colspan="5" class="p-4">
                                                <div class="empty">
                                                    <div class="empty-icon">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                                            <path d="M9 12l2 2 4-4"/>
                                                        </svg>
                                                    </div>
                                                    <p class="empty-title">No critical findings</p>
                                                    <p class="empty-subtitle text-muted">
                                                        Your security posture is looking good
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    ` : findings.map(finding => html`
                                        <tr>
                                            <td>
                                                <span class=${`badge bg-${this.getSeverityColor(finding.severity)} text-white`}>
                                                    ${finding.severity}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="badge bg-secondary text-white">${finding.domain || 'Unknown'}</span>
                                            </td>
                                            <td>
                                                <div>${finding.title || finding.description || 'No title'}</div>
                                                ${finding.affectedApplications && finding.affectedApplications.length > 0 ? html`
                                                    <div class="text-muted small">
                                                        Apps: ${finding.affectedApplications.slice(0, 2).map((app, i) => html`
                                                            ${i > 0 ? ', ' : ''}
                                                            <span class="badge bg-info-lt text-info">${app}</span>
                                                        `)}
                                                        ${finding.affectedApplications.length > 2 ? html`<span class="text-muted"> +${finding.affectedApplications.length - 2}</span>` : ''}
                                                    </div>
                                                ` : finding.affectedApplication ? html`
                                                    <div class="text-muted small">App: ${finding.affectedApplication}</div>
                                                ` : ''}
                                            </td>
                                            <td>
                                                ${finding.affectedDevices && finding.affectedDevices.length > 0 ? html`
                                                    <div class="small">
                                                        ${finding.affectedDevices.map((deviceName, i) => html`
                                                            ${i > 0 ? ', ' : ''}
                                                            <span class="badge bg-light text-dark border border-1">${deviceName}</span>
                                                        `)}
                                                        ${finding.affectedDevices.length > 2 ? html`<span class="text-muted"> +${finding.affectedDevices.length - 2} more</span>` : ''}
                                                    </div>
                                                ` : finding.affectedCount ? html`
                                                    <span class="text-muted">${finding.affectedCount} device${finding.affectedCount !== 1 ? 's' : ''}</span>
                                                ` : ''}
                                            </td>
                                            <td>${Math.round(this.safeNumber(finding.agingDays))} days</td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getSeverityColor(severity) {
        const s = String(severity || '').toLowerCase();
        if (s === 'critical') return 'danger';
        if (s === 'high') return 'warning';
        if (s === 'medium') return 'info';
        if (s === 'low') return 'success';
        return 'secondary';
    }

    renderSeverityBreakdown(snapshot) {
        if (!snapshot.findings || !snapshot.findings.bySeverity) {
            return html`
                <div class="alert alert-info mb-4">
                    <strong>Findings by Severity:</strong> No severity data available yet.
                </div>
            `;
        }
        
        const severities = [
            { name: 'Critical', key: 'Critical', color: 'danger' },
            { name: 'High', key: 'High', color: 'warning' },
            { name: 'Medium', key: 'Medium', color: 'info' },
            { name: 'Low', key: 'Low', color: 'success' }
        ];
        
        return html`
            <div class="mb-4">
                <h4 class="mb-3">Findings by Severity</h4>
                <div class="row g-2">
                    ${severities.map(sev => {
                        const count = snapshot.findings.bySeverity[sev.key] || 0;
                        return html`
                            <div class="col-md-3">
                                <div class="card card-sm">
                                    <div class="card-body">
                                        <div class="row align-items-center">
                                            <div class="col-auto">
                                                <span class=${`bg-${sev.color} text-white avatar`}>
                                                    ${sev.name.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <div class="col">
                                                <div class="font-weight-medium">${sev.name}</div>
                                                <div class="text-muted">${count} finding${count !== 1 ? 's' : ''}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </div>
        `;
    }

    renderDeviceRiskMatrix(snapshot) {
        // Chart.js scatter plot showing device risk distribution
        const chartId = 'deviceRiskMatrixChart';
        
        // Parse device data from snapshot.risk.topDeviceRisks
        const devices = snapshot.risk?.topDeviceRisks || [];
        
        // Task 6 Fix: Check if topDeviceRisks exists and has items
        if (!Array.isArray(devices) || devices.length === 0) {
            return html`
                <div class="mb-4">
                    <h4 class="mb-3">Device Risk Distribution</h4>
                    <div class="alert alert-info">
                        <strong>No Data:</strong> Device risk scores will appear here after your first security scan completes.
                    </div>
                </div>
            `;
        }
        
        const dataPoints = devices.map((d, idx) => ({
            x: this.safeNumber(d.critical) * 10 + this.safeNumber(d.high) * 5, // Vulnerability severity score
            y: Math.min(100, idx * (100 / devices.length)), // Exposure level (spread vertically)
            label: d.deviceName || d.deviceId || 'Unknown',
            riskScore: this.safeNumber(d.score, 50),
            critical: this.safeNumber(d.critical),
            high: this.safeNumber(d.high)
        }));
        
        // Render chart after DOM update using requestAnimationFrame
        requestAnimationFrame(() => {
            const canvas = document.getElementById(chartId);
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            if (this.deviceRiskChart) {
                this.deviceRiskChart.destroy();
            }
            
            this.deviceRiskChart = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Device Risk',
                        data: dataPoints,
                        backgroundColor: dataPoints.map(d => {
                            if (d.riskScore >= 75) return 'rgba(220, 53, 69, 0.7)';  // Red: High risk
                            if (d.riskScore >= 50) return 'rgba(255, 193, 7, 0.7)';  // Yellow: Medium risk
                            return 'rgba(32, 201, 151, 0.7)';                         // Green: Low risk
                        }),
                        borderColor: dataPoints.map(d => {
                            if (d.riskScore >= 75) return 'rgb(220, 53, 69)';
                            if (d.riskScore >= 50) return 'rgb(255, 193, 7)';
                            return 'rgb(32, 201, 151)';
                        }),
                        borderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const point = dataPoints[context.dataIndex];
                                    return [
                                        `Device: ${point.label}`,
                                        `Critical: ${point.critical}`,
                                        `High: ${point.high}`,
                                        `Risk Score: ${point.riskScore}`
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Vulnerability Severity' },
                            min: 0,
                            max: 100
                        },
                        y: {
                            title: { display: true, text: 'Device Distribution' },
                            min: 0,
                            max: 100
                        }
                    }
                }
            });
        }, 100);
        
        return html`
            <div class="mb-4">
                <h4 class="mb-3">Device Risk Distribution</h4>
                <div style="height: 300px; position: relative;">
                    <canvas id="${chartId}"></canvas>
                </div>
                <div class="mt-2 d-flex gap-3 justify-content-center">
                    <span><span class="badge" style="background-color: rgb(32, 201, 151);">●</span> Low Risk</span>
                    <span><span class="badge" style="background-color: rgb(255, 193, 7);">●</span> Medium Risk</span>
                    <span><span class="badge" style="background-color: rgb(220, 53, 69);">●</span> High Risk</span>
                </div>
            </div>
        `;
    }

    renderCVEAgingChart(snapshot) {
        // Chart.js line chart showing CVE aging distribution
        const chartId = 'cveAgingChart';
        
        if (!snapshot.findings || !snapshot.findings.aging) {
            return html`
                <div class="mb-4">
                    <h4 class="mb-3">CVE Aging Distribution</h4>
                    <div class="alert alert-info">
                        <strong>No Aging Data:</strong> CVE aging information not available yet.
                    </div>
                </div>
            `;
        }
        
        // Use aging data from snapshot
        const aging = snapshot.findings.aging;
        const labels = ['< 7 days', '7-30 days', '30-90 days', '90+ days'];
        const data = [
            aging.lessThan7Days || 0,    // 0-7 days
            aging.days7To30 || 0,        // 7-30 days
            aging.days30To90 || 0,       // 30-90 days
            aging.moreThan90Days || 0    // 90+ days
        ];
        
        const total = data.reduce((sum, val) => sum + val, 0);
        
        if (total === 0) {
            return html`
                <div class="mb-4">
                    <h4 class="mb-3">CVE Aging Distribution</h4>
                    <div class="alert alert-success">
                        <strong>No Overdue Vulnerabilities:</strong> All vulnerabilities are current.
                    </div>
                </div>
            `;
        }
        
        // Render chart after DOM update using requestAnimationFrame
        requestAnimationFrame(() => {
            const canvas = document.getElementById(chartId);
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            if (this.cveAgingChart) {
                this.cveAgingChart.destroy();
            }
            
            this.cveAgingChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Vulnerability Count',
                        data: data,
                        borderColor: 'rgb(220, 53, 69)',
                        backgroundColor: 'rgba(220, 53, 69, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: 'rgb(220, 53, 69)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => `${context.parsed.y} vulnerabilities`
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Age Range' }
                        },
                        y: {
                            title: { display: true, text: 'Number of CVEs' },
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            }
                        }
                    }
                }
            });
        }, 100);
        
        return html`
            <div class="mb-4">
                <h4 class="mb-3">CVE Aging Distribution</h4>
                <div style="height: 250px; position: relative;">
                    <canvas id="${chartId}"></canvas>
                </div>
                <div class="mt-2 text-center text-muted small">
                    Showing age distribution of ${total} vulnerabilities
                </div>
            </div>
        `;
    }

    renderPrioritizedActions(snapshot) {
        if (!snapshot.actions || !snapshot.actions.prioritized || snapshot.actions.prioritized.length === 0) {
            return html`
                <div class="alert alert-success mb-3">
                    <strong>No Critical Actions:</strong> No high-priority actions required at this time.
                </div>
            `;
        }
        
        const actions = snapshot.actions.prioritized.slice(0, 6);
        
        return html`
            <div class="mb-3">
                <h4 class="mb-3">Prioritized Actions</h4>
                <div class="list-group">
                    ${actions.map((action, idx) => {
                        // Format device list: "a, b, c, ...more"
                        const deviceList = this.formatDeviceList(action.affectedDevices || []);
                        const hasMultipleDevices = action.affectedCount > 1;
                        
                        return html`
                            <div class="list-group-item">
                                <div class="row align-items-center">
                                    <div class="col-auto">
                                        <span class="badge badge-pill bg-primary">${idx + 1}</span>
                                    </div>
                                    <div class="col">
                                        <div>
                                            <strong>${action.title || action.action}</strong>
                                            ${action.affectedApplication ? html`
                                                <span class="badge bg-warning text-white ms-2">App: ${action.affectedApplication}</span>
                                            ` : ''}
                                        </div>
                                        ${deviceList.text ? html`
                                            <div class="text-muted small mt-1">
                                                <strong>Affected:</strong> ${deviceList.links.map((link, i) => html`
                                                    ${i > 0 ? ', ' : ''}
                                                    ${link.href ? html`
                                                        <a href="${link.href}" class="text-primary">${link.name}</a>
                                                    ` : html`<span>${link.name}</span>`}
                                                `)}${deviceList.hasMore ? html`, <span class="text-muted">...${deviceList.remaining} more</span>` : ''}
                                            </div>
                                        ` : ''}
                                        ${action.description ? html`
                                            <div class="text-muted small mt-1">${action.description}</div>
                                        ` : ''}
                                    </div>
                                    <div class="col-auto">
                                        <span class=${`badge bg-${this.getSeverityColor(action.priority || action.severity)} text-white`}>
                                            ${action.priority || action.severity || 'Medium'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </div>
        `;
    }

    formatDeviceList(devices) {
        if (!devices || devices.length === 0) {
            return { text: '', links: [], hasMore: false, remaining: 0 };
        }

        const maxDisplay = 3;
        const displayDevices = devices.slice(0, maxDisplay);
        const remaining = devices.length - maxDisplay;
        const hasMore = devices.length > maxDisplay;

        const links = displayDevices.map(d => ({
            name: d.deviceName || d.deviceId,
            href: d.deviceId ? `#!/devices/${d.deviceId}` : null
        }));

        return {
            text: displayDevices.map(d => d.deviceName || d.deviceId).join(', '),
            links,
            hasMore,
            remaining
        };
    }

    render() {
        const { loading, error, user, currentOrg, activeTab } = this.state;
        
        if (loading) {
            return html`
                <div class="d-flex align-items-center justify-content-center" style="min-height: 60vh;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            `;
        }

        if (error) {
            return html`
                <div class="alert alert-danger">
                    <h4 class="alert-title">Dashboard Error</h4>
                    <div class="text-secondary">${error}</div>
                </div>
            `;
        }

        const role = this.getUserRole();
        const riskScore = this.getRiskScore();
        const riskColor = this.getRiskColor(riskScore);
        const orgName = currentOrg?.name || currentOrg?.orgId || user?.email || 'Your organization';

        return html`
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="page-pretitle">Security Command Center</div>
                            <h2 class="page-title">${orgName}</h2>
                        </div>
                        <div class="col-auto ms-auto">
                            ${this.renderQuickActions()}
                        </div>
                    </div>
                    
                    <!-- Tabbed Navigation -->
                    <div class="nav-tabs-alt mt-3">
                        <ul class="nav nav-tabs">
                            <li class="nav-item">
                                <a 
                                    class=${`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
                                    href="#"
                                    onClick=${(e) => { e.preventDefault(); this.setState({ activeTab: 'overview' }); }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>
                                    Overview
                                </a>
                            </li>
                            <li class="nav-item">
                                <a 
                                    class=${`nav-link ${activeTab === 'analysis' ? 'active' : ''}`}
                                    href="#"
                                    onClick=${(e) => { e.preventDefault(); this.loadPostureAndSwitchTab(); }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="M9 14l2 2l4 -4" /></svg>
                                    Detailed Analysis
                                </a>
                            </li>
                            <li class="nav-item">
                                <a 
                                    class=${`nav-link ${activeTab === 'findings' ? 'active' : ''}`}
                                    href="#"
                                    onClick=${(e) => { e.preventDefault(); this.loadPostureAndSwitchTab('findings'); }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 10m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 16v-5" /></svg>
                                    Findings Table
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    ${activeTab === 'overview' && this.renderOverviewTab(role, riskScore, riskColor)}
                    ${activeTab === 'analysis' && this.renderAnalysisTab(riskScore, riskColor)}
                    ${activeTab === 'findings' && this.renderFindingsTab()}
                </div>
            </div>
        `;
    }

    renderVisualChartsRow() {
        const { html } = window;
        const threats = this.state.threatSummary || {};
        const compliance = this.state.complianceSummary || {};
        const coverage = this.state.coverage || {};

        return html`
            <div class="row row-cards mt-3">
                <div class="col-lg-4">${this.renderThreatCard(threats)}</div>
                <div class="col-lg-4">${this.renderComplianceCard(compliance)}</div>
                <div class="col-lg-4">${this.renderCoverageCard(coverage)}</div>
            </div>
        `;
    }

    renderRadarAndKPIsRow(role, riskScore, riskColor) {
        const { html } = window;
        return html`
            <div class="row row-cards mt-3">
                <div class="col-lg-6">${this.renderRadarCard()}</div>
                <div class="col-lg-6">
                    <div class="row row-cards g-3">
                        ${this.renderKPICards(role, riskScore, riskColor, true)}
                    </div>
                </div>
            </div>
        `;
    }

    renderValuePanel(riskColor) {
        const { threatSummary, licenseInfo } = this.state;
        const coveragePercents = this.getCoveragePercents();
        const seats = this.getSeatUsage();
        const licenseDuration = this.getLicenseDuration();
        const licenseDisplay = this.formatLicenseDaysDisplay(licenseDuration.days);

        return html`
            <div class="card mb-3" style="background: linear-gradient(120deg, #0b7285 0%, #1c7ed6 50%, #4263eb 100%); color: #fff;">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-lg-7">
                            <div class="text-uppercase text-white-50 fw-semibold mb-1">Trusted Security Overview</div>
                            <div class="h2 mb-2">Spot risks faster. Prove readiness instantly.</div>
                            <div class="text-white-70">Real-time telemetry, actionable playbooks, and license health in one view. Ship reports your auditors will love.</div>
                            <div class="btn-list mt-3">
                                <a href="#!/posture" class="btn btn-white">Run full scan</a>
                                ${this.renderDisabledAddDeviceButton('Add device')}
                            </div>
                        </div>
                        <div class="col-lg-5 mt-3 mt-lg-0">
                            <div class="row row-cards g-2">
                                <div class="col-6">
                                    <div class="card bg-white text-body shadow-sm" title="Healthy: Recent heartbeat AND telemetry. Stale: Only heartbeat OR only telemetry. Offline: No heartbeat AND no telemetry.">
                                        <div class="card-body p-3">
                                            <div class="text-muted text-uppercase fw-semibold small">Coverage</div>
                                            <div class="h3 mb-0">${Math.round(coveragePercents.healthyPct)}%</div>
                                            <div class="text-muted small">Healthy telemetry</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="card bg-white text-body shadow-sm">
                                        <div class="card-body p-3">
                                            <div class="text-muted text-uppercase fw-semibold small">Seats used</div>
                                            <div class="h3 mb-0">${seats.used}/${seats.total || '—'}</div>
                                            <div class="text-muted small">${Math.round(seats.pct)}% utilization</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="card bg-white text-body shadow-sm" title=${licenseDisplay.tooltip}>
                                        <div class="card-body p-3">
                                            <div class="text-muted text-uppercase fw-semibold small">Days left</div>
                                            <div class="h3 mb-0">${licenseDisplay.label}</div>
                                            <div class="text-muted small">${licenseDisplay.exact} of ${Math.round((licenseInfo?.remainingCredits ?? 0) / Math.max(1, 1 - ((licenseInfo?.creditUtilization ?? 0) / 100)))} days</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="card bg-white text-body shadow-sm">
                                        <div class="card-body p-3">
                                            <div class="text-muted text-uppercase fw-semibold small">Open threats</div>
                                            <div class="h3 mb-0 text-${riskColor}">${(threatSummary.critical || 0) + (threatSummary.high || 0)}</div>
                                            <div class="text-muted small">Critical / High</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderHero(riskScore, riskColor) {
        const { securityGrade, lastScan, nextScan, coverage, generatedAt } = this.state;
        const coverageTotal = coverage.total || 0;
        const coverageLabel = coverageTotal ? `${coverage.healthy}/${coverageTotal} healthy` : 'No devices yet';

        return html`
            <div class="card bg-dark text-white">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-lg-8">
                            <div class="text-uppercase text-white-50 fw-semibold mb-1">Security posture</div>
                            <div class="d-flex align-items-center">
                                <div class="display-6 mb-0 me-3 text-${riskColor}">${riskScore}</div>
                                <div>
                                    <div class="h3 mb-0">Grade ${securityGrade}</div>
                                    <div class="text-white-70">Last scan: ${lastScan} · Next: ${nextScan}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-4 text-lg-end mt-3 mt-lg-0">
                            <div class="text-white-50">Telemetry coverage</div>
                            <div class="h4 mb-1">${coverageLabel}</div>
                            <div class="text-white-50 small">Updated ${this.formatTimestamp(generatedAt)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderHighlights() {
        const { deviceStats, threatSummary, complianceSummary } = this.state;
        const atRisk = (deviceStats.blocked || 0) + (deviceStats.disabled || 0);
        const hasThreats = (threatSummary.total || 0) > 0;
        const criticalHigh = hasThreats ? (threatSummary.critical || 0) + (threatSummary.high || 0) : '—';
        const hasCompliance = (complianceSummary.total || 0) > 0;
        const complianceScoreLabel = hasCompliance ? `${complianceSummary.score}%` : 'Awaiting scan';

        return html`
            <div class="row row-cards mt-3">
                <div class="col-sm-6 col-lg-3">
                    <div class="card">
                        <div class="card-body">
                            <div class="text-muted text-uppercase fw-semibold small">At-risk endpoints</div>
                            <div class="h2 mb-0">${atRisk}</div>
                            <div class="text-muted small">Blocked + disabled</div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card">
                        <div class="card-body">
                            <div class="text-muted text-uppercase fw-semibold small">Critical/High threats</div>
                            <div class="h2 mb-0">${criticalHigh}</div>
                            <div class="text-muted small">Focus your patching</div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card">
                        <div class="card-body">
                            <div class="text-muted text-uppercase fw-semibold small">Compliance score</div>
                            <div class="h2 mb-0">${complianceScoreLabel}</div>
                            <div class="text-muted small">${complianceSummary.compliant} pass / ${complianceSummary.nonCompliant} fail</div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-lg-3">
                    <div class="card">
                        <div class="card-body">
                            <div class="text-muted text-uppercase fw-semibold small">Telemetry health</div>
                            <div class="h2 mb-0">${this.getCoveragePercents().healthyPct}%</div>
                            <div class="text-muted small">Healthy devices streaming</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderActionList() {
        // Prefer posture.actions.prioritized (detailed) over dashboard.actions (generic)
        const { postureSnapshot, actions: dashboardActions } = this.state;
        const postureActions = postureSnapshot?.actions?.prioritized || [];
        const actions = postureActions.length > 0 ? postureActions : (dashboardActions || []);
        const isPosture = postureActions.length > 0;

        const severityToBadge = (severity) => {
            const s = String(severity || '').toLowerCase();
            if (s === 'critical') return 'bg-danger';
            if (s === 'warning' || s === 'high') return 'bg-warning';
            if (s === 'success' || s === 'low') return 'bg-success';
            return 'bg-info';
        };

        if (!Array.isArray(actions) || actions.length === 0) {
            return html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title">Recommended actions</h3>
                        <div class="card-actions">
                            <span class="badge bg-azure-lt">Landing page focus</span>
                        </div>
                    </div>
                    <div class="list-group list-group-flush">
                        <div class="list-group-item text-muted text-center py-3">No immediate actions. Keep monitoring telemetry.</div>
                    </div>
                </div>
            `;
        }

        // Group, sort, and cap actions (top 4)
        const sorted = actions.slice().sort((a, b) => {
            const sevOrder = { critical: 1, high: 1, warning: 2, medium: 3, success: 4, low: 4, info: 5 };
            const aSev = String(a.severity || a.priority || '').toLowerCase();
            const bSev = String(b.severity || b.priority || '').toLowerCase();
            return (sevOrder[aSev] || 6) - (sevOrder[bSev] || 6);
        }).slice(0, 4);

        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Recommended actions</h3>
                    <div class="card-actions">
                        <span class="badge ${isPosture ? 'bg-success-lt text-success' : 'bg-azure-lt'}">          ${isPosture ? 'Posture-driven' : 'Generic'}
                        </span>
                    </div>
                </div>
                <div class="list-group list-group-flush">
                    ${sorted.map(action => {
                        const severity = action.severity || action.priority || 'info';
                        const deviceList = this.formatDeviceList(action.affectedDevices || []);
                        
                        return html`
                            <div class="list-group-item">
                                <div class="d-flex align-items-start">
                                    <span class="status-dot me-3 ${severityToBadge(severity)}"></span>
                                    <div class="flex-fill">
                                        <div class="d-flex align-items-center">
                                            <div class="fw-semibold">${action.title}</div>
                                            ${action.ctaLabel ? html`<a href="${action.ctaHref || '#'}" class="ms-auto small text-primary">${action.ctaLabel}</a>` : ''}
                                        </div>
                                        ${action.description ? html`
                                            <div class="text-muted small">${action.description}</div>
                                        ` : ''}
                                        ${action.affectedApplication ? html`
                                            <div class="text-muted small mt-1">
                                                <strong>Application:</strong> ${action.affectedApplication}
                                            </div>
                                        ` : ''}
                                        ${deviceList.text ? html`
                                            <div class="text-muted small mt-1">
                                                <strong>Devices:</strong> ${deviceList.links.map((link, i) => html`
                                                    ${i > 0 ? ', ' : ''}
                                                    ${link.href ? html`
                                                        <a href="${link.href}" class="text-primary">${link.name}</a>
                                                    ` : html`<span>${link.name}</span>`}
                                                `)}${deviceList.hasMore ? html`, <span class="text-muted">...${deviceList.remaining} more</span>` : ''}
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </div>
        `;
    }

    renderCoverageWidget() {
        const { coverage } = this.state;
        const { healthyPct, stalePct, offlinePct } = this.getCoveragePercents();
        const total = this.safeNumber(coverage.total);
        const healthy = this.safeNumber(coverage.healthy);
        const stale = this.safeNumber(coverage.stale);
        const offline = this.safeNumber(coverage.offline);
        const healthyTooltip = total > 0 
            ? `${healthy} healthy devices out of ${total} total = ${healthyPct}%`
            : 'No devices yet';

        if (total === 0) {
            return html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title">Telemetry coverage</h3>
                    </div>
                    <div class="card-body text-center text-muted">
                        <div class="empty">
                            <div class="empty-icon">
                                <svg class="icon" width="48" height="48"><circle cx="24" cy="24" r="22" stroke="#868e96" stroke-width="2" fill="none"/><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="#868e96"/></svg>
                            </div>
                            <p class="empty-title">No devices reporting</p>
                            <p class="empty-subtitle text-muted">Add devices to see telemetry coverage</p>
                        </div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Telemetry coverage</h3>
                </div>
                <div class="card-body">
                    <div class="d-flex align-items-center mb-2" title=${healthyTooltip}>
                        <div class="subheader">Healthy</div>
                        <div class="ms-auto h4 mb-0">${healthy}</div>
                    </div>
                    <div class="progress progress-sm mb-3 progress-stacked">
                        <div class="progress-bar bg-success" style=${`width: ${healthyPct}%`} role="progressbar"></div>
                        <div class="progress-bar bg-warning" style=${`width: ${stalePct}%`} role="progressbar"></div>
                        <div class="progress-bar bg-secondary" style=${`width: ${offlinePct}%`} role="progressbar"></div>
                    </div>
                    <div class="small text-muted">Stale: ${stale} · Offline: ${offline}</div>
                </div>
            </div>
        `;
    }

    renderLicenseWidget() {
        const { licenseInfo } = this.state;

        if (!licenseInfo) {
            return html`
                <div class="card mb-3">
                    <div class="card-body text-center text-muted">No license info available.</div>
                </div>
            `;
        }

        const seatPct = this.safeNumber(licenseInfo.seatUtilization);
        const creditPct = this.safeNumber(licenseInfo.creditUtilization);
        const licenseDisplay = this.formatLicenseDaysDisplay(licenseInfo.daysRemaining);

        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">License</h3>
                    <div class="card-actions">
                        <span class="badge ${licenseInfo.status === 'Active' ? 'bg-success-lt text-success' : 'bg-warning-lt text-warning'}">${licenseInfo.status}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="d-flex align-items-center mb-2">
                        <div>Seats</div>
                        <div class="ms-auto">${licenseInfo.usedSeats}/${licenseInfo.seats}</div>
                    </div>
                    <div class="progress progress-sm mb-3">
                        <div class="progress-bar" style=${`width: ${seatPct}%`} role="progressbar"></div>
                    </div>
                    <div class="d-flex align-items-center mb-2" title=${licenseDisplay.tooltip}>
                        <div>Days remaining</div>
                        <div class="ms-auto fw-semibold">${licenseDisplay.label}</div>
                    </div>
                    <div class="text-muted small mb-2">${licenseDisplay.exact} days left · ${Math.round(creditPct)}% consumed</div>
                    <div class="progress progress-sm">
                        <div class="progress-bar ${licenseDisplay.badgeClass}" style=${`width: ${creditPct}%`} role="progressbar"></div>
                    </div>
                </div>
            </div>
        `;
    }

    renderRecentDevices() {
        const { html } = window;
        const devices = this.state.recentDevices || [];

        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2 text-primary" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                        Device Connection Status
                    </h3>
                    <div class="card-actions">
                        <a href="#!/devices" class="btn btn-primary btn-sm">View All</a>
                    </div>
                </div>
                <div class="list-group list-group-flush">
                    ${devices.length ? devices.map(device => this.renderDeviceRow(device)) : html`<div class="list-group-item text-muted text-center py-3">No recent activity</div>`}
                </div>
            </div>
        `;
    }

    renderDeviceRow(device) {
        const { html } = window;
        
        // Use shared component to get connection status
        const status = getConnectionStatus(device);
        
        const deviceName = device.displayName
            || device.friendlyName
            || device.deviceName
            || device.hostname
            || device.name
            || 'Unnamed device';
        const deviceId = device.deviceId || device.id || device.name || device.hostname || '';
        const deviceHref = deviceId ? `#!/devices/${encodeURIComponent(deviceId)}` : '#!/devices';
        const threatCount = device.threats ?? device.threatCount ?? 0;

        return html`
            <div class="list-group-item">
                <div class="row align-items-center">
                    <div class="col-auto">
                        <span class="avatar bg-primary-lt">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                        </span>
                    </div>
                    <div class="col">
                        <div class="text-truncate">
                            <a class="fw-semibold" href="${deviceHref}">${deviceName}</a>
                        </div>
                        <div class="text-muted small mt-1">
                            ${(() => {
                                const connectionStatus = getConnectionStatus(device);
                                return html`<${StatusBadge} 
                                    status=${connectionStatus.status}
                                    color=${connectionStatus.color}
                                    icon=${connectionStatus.icon}
                                    tooltip=${connectionStatus.tooltip}
                                />`;
                            })()}
                            ${threatCount > 0 ? html`<span class="badge bg-danger text-white ms-1">${threatCount} threat${threatCount > 1 ? 's' : ''}</span>` : ''}
                        </div>
                        <div class="text-muted small">Last seen: ${this.formatTimestamp(device.lastSeen || device.lastHeartbeat)}</div>
                    </div>
                    <div class="col-auto">
                        <a href="${deviceHref}" class="btn btn-sm btn-outline-primary">Details</a>
                    </div>
                </div>
            </div>
        `;
    }

    formatTimestamp(value) {
        if (!value) return 'just now';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return value;
        return parsed.toLocaleString();
    }

    renderAIAnalystWidget() {
        return html`
            <div class="card bg-primary-lt mb-3">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <span class="avatar avatar-md bg-primary text-white">AI</span>
                        </div>
                        <div class="col">
                            <h3 class="card-title m-0">AI Security Analyst</h3>
                            <div class="text-muted">Ask questions about your security posture, vulnerabilities, or devices.</div>
                        </div>
                    </div>
                    <div class="mt-3">
                        <div class="input-group input-group-flat">
                            <input type="text" class="form-control" placeholder="e.g., 'Show me critical vulnerabilities' or 'How many devices are non-compliant?'" 
                                onKeydown=${(e) => e.key === 'Enter' && this.handleAnalystSearch(e.target.value)} />
                            <span class="input-group-text">
                                <a href="#" class="link-primary" title="Ask Analyst" onClick=${(e) => {
                                    e.preventDefault();
                                    const input = e.target.closest('.input-group').querySelector('input');
                                    this.handleAnalystSearch(input.value);
                                }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="10" cy="10" r="7" /><line x1="21" y1="21" x2="15" y2="15" /></svg>
                                </a>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    calculateTrend(currentValue, previousValue) {
        if (!previousValue || previousValue === 0) return 0;
        return Math.round(((currentValue - previousValue) / previousValue) * 100);
    }

    getTrendArrow(trend) {
        if (trend === 0) return '';
        const isUp = trend > 0;
        return html`
            <span class="${isUp ? 'text-success' : 'text-danger'} d-inline-flex align-items-center lh-1 ms-2">
                ${Math.abs(trend)}%
                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm ms-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    ${isUp ? html`
                        <path d="M3 17l6-6l4 4l8-8M14 7h7v7"/>
                    ` : html`
                        <path d="M3 7l6 6l4-4l8 8M14 17h7v-7"/>
                    `}
                </svg>
            </span>
        `;
    }

    renderDeviceSparkline() {
        // Mock data - replace with real historical device count data
        const sparklineData = [28, 29, 30, 29, 31, 32, this.state.deviceStats?.active || 32];
        
        // Wait for next frame to ensure canvas is rendered
        requestAnimationFrame(() => {
            const canvas = document.getElementById('device-sparkline');
            if (!canvas) return;
            
            // Destroy existing chart if any
            if (this.deviceSparklineChart) {
                this.deviceSparklineChart.destroy();
            }
            
            this.deviceSparklineChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    datasets: [{
                        data: sparklineData,
                        borderColor: '#0054a6',
                        backgroundColor: 'rgba(0, 84, 166, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    scales: {
                        x: { display: false },
                        y: { display: false }
                    },
                    interaction: { mode: 'index', intersect: false }
                }
            });
        }, 100);
    }

    renderScoreSparkline() {
        // Mock data - replace with real historical security score data
        const sparklineData = [75, 78, 82, 80, 85, 87, this.state.dashboardData?.securityScore || 85];
        
        requestAnimationFrame(() => {
            const canvas = document.getElementById('score-sparkline');
            if (!canvas) return;
            
            if (this.scoreSparklineChart) {
                this.scoreSparklineChart.destroy();
            }
            
            this.scoreSparklineChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    datasets: [{
                        data: sparklineData,
                        borderColor: '#2fb344',
                        backgroundColor: 'rgba(47, 179, 68, 0.1)',
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    scales: {
                        x: { display: false },
                        y: { display: false }
                    },
                    interaction: { mode: 'index', intersect: false }
                }
            });
        }, 100);
    }

    renderKPICards(role, riskScore, riskColor, compact = false) {
        const { deviceStats, licenseInfo, coverage, securityGrade, lastScan, complianceSummary } = this.state;
        const riskLabel = this.getRiskLabel(riskScore);
        
        // Calculate trends (mock previous values - in real implementation, fetch from history)
        const scoreTrend = this.calculateTrend(riskScore, riskScore - 5);
        const deviceTrend = this.calculateTrend(deviceStats.active, deviceStats.active - 2);
        const colClass = compact ? 'col-6' : 'col-sm-6 col-lg-3';

        const scoreCard = html`
            <div class="${colClass}">
                <div class="card card-hover">
                    <div class="card-stamp card-stamp-lg">
                        <div class="card-stamp-icon bg-${riskColor}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="32" height="32" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                <path d="M9 12l2 2 4-4"/>
                            </svg>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">Security Score</div>
                            <div class="ms-auto lh-1">
                                <span class="badge ${this.getGradeBadge(riskScore)}">${securityGrade || this.getGrade(riskScore)}</span>
                            </div>
                        </div>
                        <div class="d-flex align-items-baseline">
                            <div class="h1 mb-0 me-2"><span class="text-${riskColor}">${riskScore}</span></div>
                            <div class="text-muted h3 mb-0">/100</div>
                            ${this.getTrendArrow(scoreTrend)}
                        </div>
                        <div class="d-flex mb-2 mt-2">
                            <div class="text-muted small">${riskLabel}</div>
                            <div class="ms-auto text-muted small">Last: ${lastScan}</div>
                        </div>
                        <div class="progress progress-sm mb-2">
                            <div class="progress-bar bg-${riskColor}" style="width: ${riskScore}%" role="progressbar" aria-valuenow="${riskScore}" aria-valuemin="0" aria-valuemax="100"></div>
                        </div>
                        <div style="height: 40px;">
                            <canvas id="score-sparkline"></canvas>
                        </div>
                    </div>
                </div>
            </div>`;

        const devicesCard = html`
            <div class="${colClass}">
                <div class="card card-hover">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                    <rect x="3" y="4" width="18" height="12" rx="1"/>
                                    <line x1="7" y1="20" x2="17" y2="20"/>
                                    <line x1="9" y1="16" x2="9" y2="20"/>
                                    <line x1="15" y1="16" x2="15" y2="20"/>
                                </svg>
                                Active Endpoints
                            </div>
                            <div class="ms-auto lh-1"><a href="#!/devices" class="btn btn-sm btn-ghost-primary">View All</a></div>
                        </div>
                        <div class="d-flex align-items-baseline">
                            <div class="h1 mb-0 me-2">${deviceStats.active}</div>
                            <div class="text-muted h3 mb-0">/ ${deviceStats.total}</div>
                            ${this.getTrendArrow(deviceTrend)}
                        </div>
                        <div class="d-flex mb-2 mt-2">
                            <div>
                                <span class="status-dot ${deviceStats.blocked > 0 ? 'status-red' : 'status-green'} me-1"></span>
                                <span class="text-${deviceStats.blocked > 0 ? 'danger' : 'success'} small">${deviceStats.blocked} Blocked</span>
                            </div>
                            <div class="ms-auto">
                                <span class="text-muted small">${deviceStats.disabled} Disabled</span>
                            </div>
                        </div>
                        <div class="progress progress-sm mb-2">
                            <div class="progress-bar bg-primary" style="width: ${deviceStats.total ? (deviceStats.active / deviceStats.total * 100) : 0}%" role="progressbar"></div>
                        </div>
                        <div style="height: 40px;">
                            <canvas id="device-sparkline"></canvas>
                        </div>
                    </div>
                </div>
            </div>`;

        const coverageCard = html`
            <div class="${colClass}">
                <div class="card card-hover">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                    <circle cx="12" cy="12" r="2"/>
                                    <path d="M22 12c-2.667 4.667 -6 7 -10 7s-7.333 -2.333 -10 -7c2.667 -4.667 6 -7 10 -7s7.333 2.333 10 7"/>
                                </svg>
                                Telemetry Coverage
                            </div>
                        </div>
                        <div class="d-flex align-items-baseline">
                            <div class="h1 mb-0 me-2">${coverage.healthy}</div>
                            <div class="text-muted h3 mb-0">/ ${coverage.total || 0}</div>
                        </div>
                        <div class="d-flex mb-2 mt-2 gap-2">
                            <div>
                                <span class="status-dot status-dot-animated status-green me-1"></span>
                                <span class="text-success small">${coverage.healthy} Healthy</span>
                            </div>
                            <div>
                                <span class="status-dot status-yellow me-1"></span>
                                <span class="text-warning small">${coverage.stale} Stale</span>
                            </div>
                            <div>
                                <span class="status-dot status-red me-1"></span>
                                <span class="text-danger small">${coverage.offline} Offline</span>
                            </div>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-success" style="width: ${this.getCoveragePercents().healthyPct}%" role="progressbar"></div>
                        </div>
                    </div>
                </div>
            </div>`;

        // Remediation Metrics Card (Sprint 3.5 Phase 2)
        const remediationMetrics = this.state.dashboardData?.remediationMetrics;
        const hasValidMetrics = remediationMetrics && 
            Number.isFinite(remediationMetrics.avgTimeToRemediateDays) && 
            Number.isFinite(remediationMetrics.remediationSpeedScore);
        const remediationCard = hasValidMetrics ? html`
            <div class="${colClass}">
                <div class="card card-hover">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                                    <path d="M9 12l2 2l4-4"/>
                                </svg>
                                Remediation Speed
                            </div>
                            <div class="ms-auto lh-1">
                                <span class="badge ${this.getRemediationSpeedBadge(this.safeNumber(remediationMetrics.remediationSpeedScore))}">
                                    ${Math.round(this.safeNumber(remediationMetrics.remediationSpeedScore))}/100
                                </span>
                            </div>
                        </div>
                        <div class="d-flex align-items-baseline">
                            <div class="h1 mb-0 me-2">${this.safeNumber(remediationMetrics.avgTimeToRemediateDays).toFixed(1)}</div>
                            <div class="text-muted h3 mb-0">days</div>
                        </div>
                        <div class="d-flex mb-2 mt-2">
                            <div class="text-muted small">Avg remediation time</div>
                            <div class="ms-auto">
                                <span class="text-success small">${this.safeNumber(remediationMetrics.remediatedCount)}/${this.safeNumber(remediationMetrics.totalTrackedCount)} fixed</span>
                            </div>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar bg-success" style="width: ${Math.round(this.safeNumber(remediationMetrics.percentageRemediatedUnder7Days))}%" role="progressbar"></div>
                            <div class="progress-bar bg-warning" style="width: ${Math.max(0, Math.round(this.safeNumber(remediationMetrics.percentageRemediatedUnder14Days) - this.safeNumber(remediationMetrics.percentageRemediatedUnder7Days)))}%" role="progressbar"></div>
                        </div>
                        <div class="text-muted small mt-1">
                            ${Math.round(this.safeNumber(remediationMetrics.percentageRemediatedUnder7Days))}% under 7 days
                        </div>
                    </div>
                </div>
            </div>` : '';

        const licenseDaysDisplay = this.formatLicenseDaysDisplay(licenseInfo?.daysRemaining);

        const licenseDaysCard = html`
            <div class="${colClass}">
                <div class="card card-hover">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="subheader">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                    <circle cx="9" cy="12" r="1"/>
                                    <circle cx="15" cy="12" r="1"/>
                                    <path d="M9 7c0 2.667 1 4 3 4s3 -1.333 3 -4"/>
                                    <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9 -9 -1.8 -9 -9 1.8 -9 9 -9z"/>
                                </svg>
                                License Days
                            </div>
                            <div class="ms-auto lh-1">
                                <span class="badge ${licenseInfo?.status === 'Active' ? 'bg-success' : 'bg-warning'}">${licenseInfo?.status || 'Unknown'}</span>
                            </div>
                        </div>
                        <div class="d-flex align-items-baseline" title=${licenseDaysDisplay.tooltip}>
                            <div class="h1 mb-0 me-2">${licenseDaysDisplay.label}</div>
                            <div class="text-muted h3 mb-0">remaining</div>
                        </div>
                        <div class="text-muted small">${licenseDaysDisplay.exact} days left</div>
                        <div class="d-flex mb-2 mt-2">
                            <span class="text-muted small">Seats: ${licenseInfo?.usedSeats ?? 0}/${licenseInfo?.seats ?? 0}</span>
                            <span class="ms-auto text-muted small">${Math.round(licenseInfo?.creditUtilization ?? 0)}% consumed</span>
                        </div>
                        <div class="progress progress-sm">
                            <div class="progress-bar ${licenseDaysDisplay.badgeClass}" style="width: ${Math.round(licenseInfo?.creditUtilization ?? 0)}%" role="progressbar"></div>
                        </div>
                    </div>
                </div>
            </div>`;

        return html`
            ${scoreCard}
            ${devicesCard}
            ${coverageCard}
            ${remediationCard}
            ${remediationCard ? '' : licenseDaysCard}
        `;
    }

    renderPostureWidget() {
        const { threatSummary, complianceSummary } = this.state;
        const hasPostureData = (threatSummary.total || 0) > 0 || (complianceSummary.total || 0) > 0;

        if (!hasPostureData) {
            return html`
                <div class="card mb-3">
                    <div class="card-body text-center py-5">
                        <h3 class="card-title mb-2">Security posture summary</h3>
                        <div class="text-muted mb-3">No posture data yet. Run a full scan to generate threats and compliance scores.</div>
                        <div>
                            <a href="#!/posture" class="btn btn-primary me-2">Run full scan</a>
                            <a href="#!/devices" class="btn btn-outline-secondary">Add devices</a>
                        </div>
                    </div>
                </div>
            `;
        }
        
        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Security Posture Summary</h3>
                    <div class="card-actions">
                        <a href="#!/posture" class="btn btn-sm btn-outline-primary">Full Report</a>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <h4 class="subheader">Threat Distribution</h4>
                            <div class="d-flex align-items-center mb-3">
                                <div class="w-100">
                                    <div id="posture-threat-donut" style="min-height:160px;"></div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <h4 class="subheader">Compliance Status</h4>
                            <div class="d-flex align-items-center">
                                <div class="w-100">
                                    <div id="posture-compliance-donut" style="min-height:160px;"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderRecentAlerts() {
        const { recentAlerts } = this.state;
        
        return html`
            <div class="card mb-3">
                <div class="card-header">
                    <h3 class="card-title">Recent Alerts</h3>
                    <div class="card-actions">
                        <a href="#!/alerts" class="btn btn-sm btn-ghost-secondary">View All</a>
                    </div>
                </div>
                <div class="list-group list-group-flush">
                    ${recentAlerts.length > 0 ? recentAlerts.slice(0, 5).map(alert => html`
                        <div class="list-group-item">
                            <div class="row align-items-center">
                                <div class="col-auto">
                                    <span class="status-dot status-dot-animated ${alert.severity === 'critical' ? 'bg-danger' : alert.severity === 'high' ? 'bg-warning' : 'bg-secondary'} d-block"></span>
                                </div>
                                <div class="col text-truncate">
                                    <a href="#" class="text-body d-block">${alert.title}</a>
                                    <div class="d-block text-muted text-truncate mt-n1">
                                        ${alert.device} &middot; ${alert.detected}
                                    </div>
                                </div>
                                <div class="col-auto">
                                    <a href="#" class="list-group-item-actions">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon text-muted" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 6l6 6l-6 6" /></svg>
                                    </a>
                                </div>
                            </div>
                        </div>
                    `) : html`
                        <div class="list-group-item text-center text-muted py-4">
                            No recent alerts
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    renderInventoryWidget() {
        const { inventoryStats } = this.state;
        const hasInventory = (inventoryStats.totalApps || 0) > 0 || (inventoryStats.vendors || 0) > 0;
        
        return html`
            <div class="card mb-0">
                <div class="card-header">
                    <h3 class="card-title">Software Inventory</h3>
                    <div class="card-actions">
                        <a href="#!/inventory" class="btn btn-sm btn-ghost-secondary">Manage</a>
                    </div>
                </div>
                <div class="card-body">
                    ${hasInventory ? html`
                        <div class="d-flex align-items-center mb-3">
                            <div class="subheader">Total Applications</div>
                            <div class="ms-auto h3 mb-0">${inventoryStats.totalApps}</div>
                        </div>
                        <div class="d-flex align-items-center">
                            <div class="subheader">Unique Vendors</div>
                            <div class="ms-auto h3 mb-0">${inventoryStats.vendors}</div>
                        </div>
                        <div class="mt-3">
                            <a href="#!/inventory" class="btn btn-outline-secondary w-100">View Software Inventory</a>
                        </div>
                    ` : html`
                        <div class="text-center text-muted py-3">
                            No inventory yet. Install the agent and run a software scan.
                        </div>
                        <div class="mt-2 d-flex justify-content-center">
                            <a href="#!/devices" class="btn btn-primary">Add device</a>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    renderPlaceholderTile(title, description, icon) {
        return html`
            <div class="card">
                <div class="card-body text-center py-4">
                    <div class="mb-3">
                        <span class="avatar avatar-xl rounded bg-secondary-lt">
                            ${icon === 'activity' ? html`
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12h4l3 8l4 -16l3 8h4" /></svg>
                            ` : html`
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /><path d="M9 15l2 2l4 -4" /></svg>
                            `}
                        </span>
                    </div>
                    <h3 class="card-title mb-1">${title}</h3>
                    <div class="text-muted">${description}</div>
                </div>
            </div>
        `;
    }

    renderQuickActions() {
        return html`
            <div class="btn-list">
                ${this.renderDisabledAddDeviceButton('Add device', 'btn btn-white')}
                <a href="#!/settings" class="btn btn-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" /><circle cx="12" cy="12" r="3" /></svg>
                    Settings
                </a>
            </div>
        `;
    }
}

// For direct page rendering
if (document.getElementById('page-root')) {
    window.preactRender(html`<${DashboardPage} />`, document.getElementById('page-root'));
}
