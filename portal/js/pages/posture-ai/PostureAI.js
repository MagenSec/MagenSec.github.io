import { api } from '@api';
import { logger } from '@config';
import { orgContext } from '@orgContext';

const { html, Component } = window;

const SECURITY_REPORT_KIND = 'security-posture';
const COMPLIANCE_REPORT_KIND = 'compliance';
const INVENTORY_REPORT_KIND = 'inventory';

function todayUtcInputDate() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * AI-Based Security Posture Page
 * Legacy AI report generation and viewing via /ai/reports endpoints
 */
export class AIPosturePage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            generating: false,
            error: null,
            currentReport: null,
            selectedReportKind: SECURITY_REPORT_KIND,
            selectedDate: todayUtcInputDate(),
            selectedFramework: 'all',
            selectedTemplate: 'full-posture',
            emailingSending: false,
            showEmailModal: false,
            lastEmailSent: null,
            pollingForReport: false
        };
        this.orgUnsubscribe = null;
        this.pollInterval = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadReports());
        this.loadReports();
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    async loadReports() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) {
            this.setState({ error: 'No organization selected', loading: false });
            return;
        }

        this.setState({ loading: true, error: null, pollingForReport: false, currentReport: null });

        try {
            const params = this.getReportQueryParams();
            // Try latest persisted report
            const response = await api.getLatestAIReport(currentOrg.orgId, params);
            
            // Success - extract report data from unified envelope
            const reportData = response?.data || response;
            if (reportData?.report) {
                // Stop polling if we have a report
                if (this.pollInterval) {
                    clearInterval(this.pollInterval);
                    this.pollInterval = null;
                }
                this.setState({ 
                    currentReport: reportData, 
                    loading: false, 
                    error: null,
                    pollingForReport: false
                });
                return;
            }

            this.setState({
                currentReport: null,
                loading: false,
                error: null,
                pollingForReport: false
            });
        } catch (err) {
            // Check if it's a NOT_FOUND error (no report exists yet - normal state)
            if (err?.response?.error === 'NOT_FOUND' || err?.message?.includes('No report')) {
                logger.info('[AI Posture] No existing report found for selected kind/date');
                this.setState({
                    currentReport: null,
                    loading: false,
                    error: null,
                    pollingForReport: false
                });
                return;
            }
            
            // Transient network errors (e.g. container cold-start, 504 from ingress):
            // start polling so we pick up the report as soon as the backend is ready.
            const isTransient =
                err?.status === 0 ||
                err?.status === 503 ||
                err?.status === 504 ||
                err?.message?.includes('NetworkError') ||
                err?.message?.includes('Failed to fetch') ||
                err?.message?.includes('Network error');
            if (isTransient) {
                logger.info('[AI Posture] Transient network error on report load — starting poll...');
                this.setState({ loading: false });
                this.startPolling();
                return;
            }

            // Real error - show to user
            logger.error('[AI Posture] Failed to load report:', err);
            const rawMessage = err?.message || 'Failed to load AI reports';
            const friendlyMessage = rawMessage.includes('Unable to resolve service for type')
                ? 'AI posture service is temporarily unavailable. You can continue using Security Posture for live risk and compliance insights.'
                : rawMessage;
            this.setState({
                error: friendlyMessage,
                loading: false
            });
        }
    }

    startPolling() {
        // Clear any existing interval
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }

        // Poll every 5 seconds
        this.pollInterval = setInterval(async () => {
            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg || !currentOrg.orgId) {
                this.stopPolling();
                return;
            }

            try {
                const response = await api.getLatestAIReport(currentOrg.orgId, this.getReportQueryParams());
                const reportData = response?.data || response;
                
                if (reportData?.report) {
                    logger.info('[AI Posture] Report ready, stopping poll');
                    this.stopPolling();
                    this.setState({ 
                        currentReport: reportData, 
                        pollingForReport: false,
                        error: null
                    });
                } else {
                    logger.debug('[AI Posture] Report not ready yet, continuing poll...');
                }
            } catch (err) {
                // Continue polling on transient errors
                logger.warn('[AI Posture] Poll check failed, will retry:', err.message);
            }
        }, 5000); // 5 seconds
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.setState({ pollingForReport: false });
    }

    async checkLastEmailSent() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) return;

        try {
            // Get recent audit logs for email sends
            const res = await api.getAuditLogs(currentOrg.orgId, {
                eventType: 'EmailSent',
                subType: 'AttachmentEmail',
                limit: 1
            });

            if (res.success && res.data && res.data.length > 0) {
                const lastEmail = res.data[0];
                const sentAt = new Date(lastEmail.timestamp);
                const hoursSince = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);
                const recipient = lastEmail.metadata?.recipient || 'Unknown';

                this.setState({ 
                    lastEmailSent: { 
                        sentAt, 
                        recipient, 
                        hoursSince,
                        recent: hoursSince < 1 
                    },
                    showEmailModal: true 
                });
            } else {
                // No previous send, proceed directly
                this.setState({ showEmailModal: true, lastEmailSent: null });
            }
        } catch (err) {
            logger.error('[AI Posture] Failed to check email history:', err);
            // On error, show modal without history
            this.setState({ showEmailModal: true, lastEmailSent: null });
        }
    }

    async confirmEmailSend() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) return;

        this.setState({ emailingSending: true, error: null, showEmailModal: false });

        try {
            await api.emailAIReportPDF(currentOrg.orgId);
            this.setState({ emailingSending: false });
            logger.info('[AI Posture] Report PDF sent successfully');
            alert('Security report has been sent to the organization owner via email');
        } catch (err) {
            logger.error('[AI Posture] Failed to email report:', err);
            this.setState({
                error: err?.message || 'Failed to send report email',
                emailingSending: false
            });
        }
    }

    async generateReport() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) return;

        this.setState({ generating: true, pollingForReport: true, error: null, currentReport: null });

        try {
            const payload = {
                prompt: 'Full security posture analysis',
                model: 'heuristic',
                waitSeconds: 30,
                reportKind: this.state.selectedReportKind,
                date: this.state.selectedDate,
            };

            if (this.state.selectedReportKind === COMPLIANCE_REPORT_KIND) {
                payload.framework = this.state.selectedFramework;
            }

            const res = await api.generateAIReport(currentOrg.orgId, payload);

            if (res?.success === false) {
                throw new Error(res.message || res.error || 'Report generation failed');
            }

            // Ensure subsequent reads reflect persisted storage, not stale in-memory GET cache.
            api.clearCache();

            const report = res?.data || res;
            if (report?.report) {
                // Server returned the full report synchronously
                this.setState({ currentReport: report, generating: false, pollingForReport: false, error: null });
            } else {
                // Server queued the report (fire-and-forget) — poll /latest for completion
                logger.info('[AI Posture] Report queued, starting polling...');
                this.setState({ generating: false, pollingForReport: true, error: null });
                this.startPolling();
            }
        } catch (err) {
            logger.error('[AI Posture] Failed to generate report:', err);
            // CORS failures / infrastructure timeouts -> server may still be generating
            const likelyStillGenerating =
                err?.status === 0 ||
                err?.status === 503 ||
                err?.status === 504 ||
                err?.message?.includes('NetworkError') ||
                err?.message?.includes('Failed to fetch') ||
                err?.message?.includes('Network error');
            if (likelyStillGenerating) {
                logger.info('[AI Posture] Generate request timed out - starting poll...');
                this.setState({ generating: false, pollingForReport: true, error: null });
                this.startPolling();
            } else {
                this.setState({
                    error: err?.message || 'Failed to generate report',
                    generating: false,
                    pollingForReport: false
                });
            }
        }
    }

    getReportQueryParams() {
        const params = {
            reportKind: this.state.selectedReportKind,
            date: this.state.selectedDate,
        };

        if (this.state.selectedReportKind === COMPLIANCE_REPORT_KIND) {
            params.framework = this.state.selectedFramework;
        }

        return params;
    }

    renderMarkdownContent(content) {
        // Convert markdown string to HTML
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        
        // Configure marked for GitHub Flavored Markdown
        if (window.marked) {
            const marked = window.marked;
            marked.setOptions({
                breaks: true,
                gfm: true,
                headerIds: true
            });
            
            try {
                const rawHtml = marked.parse(contentStr);
                // Sanitize HTML with full support for tables, charts, etc.
                let cleanHtml = rawHtml;
                if (window.DOMPurify) {
                    cleanHtml = window.DOMPurify.sanitize(rawHtml, {
                        ALLOWED_TAGS: [
                            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                            'p', 'br', 'strong', 'em', 'b', 'i', 'u',
                            'a', 'code', 'pre', 'blockquote',
                            'ul', 'ol', 'li',
                            'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
                            'hr', 'img', 'div', 'span',
                            'dl', 'dt', 'dd',
                            'svg', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
                            'text', 'g', 'marker', 'defs', 'style', 'tspan'
                        ],
                        ALLOWED_ATTR: [
                            'href', 'target', 'rel', 'src', 'alt', 'class', 'id', 'style',
                            'width', 'height', 'viewBox', 'xmlns', 'cx', 'cy', 'r', 'x', 'y',
                            'x1', 'y1', 'x2', 'y2', 'points', 'd', 'stroke', 'fill', 'stroke-width',
                            'data-type', 'role', 'aria-label'
                        ]
                    });
                }
                
                // Create a container that will render after mermaid
                const container = document.createElement('div');
                container.className = 'markdown'; // Use Tabler markdown class for styling
                container.innerHTML = cleanHtml;
                
                // Post-process: Add table borders CSS (Tabler already handles this with .markdown class)
                const tables = container.querySelectorAll('table');
                tables.forEach(table => {
                    if (!table.className.includes('table')) {
                        table.className = (table.className || '') + ' table';
                    }
                });
                
                // Render and return - use requestAnimationFrame for better performance
                const htmlContent = container.innerHTML;
                const vnode = html`<div class="markdown" dangerouslySetInnerHTML=${{ __html: htmlContent }} />`;
                
                // Schedule ApexCharts rendering after DOM update
                requestAnimationFrame(() => {
                    this.processApexCharts();
                });
                
                return vnode;
            } catch (err) {
                logger.error('[AI Posture] Failed to parse markdown:', err);
                return html`<pre style="white-space: pre-wrap;">${contentStr}</pre>`;
            }
        }
        
        // Fallback if marked library not loaded
        return html`<pre style="white-space: pre-wrap;">${contentStr}</pre>`;
    }

    processApexCharts() {
        // Process ApexCharts blocks if library is available
        if (!window.ApexCharts) {
            logger.warn('[AI Posture] ApexCharts library not loaded');
            return;
        }

        const toFiniteNumber = (value, fallback = 0) => {
            const n = Number(value);
            return Number.isFinite(n) ? n : fallback;
        };

        const sanitizeSeries = (chartType, series) => {
            if (!Array.isArray(series)) return [];

            const isRadialLike = chartType === 'pie' || chartType === 'donut' || chartType === 'polarArea' || chartType === 'radialBar';
            if (isRadialLike) {
                if (series.length > 0 && typeof series[0] === 'object' && Array.isArray(series[0]?.data)) {
                    return series[0].data.map((v) => toFiniteNumber(v, 0));
                }
                return series.map((v) => toFiniteNumber(v, 0));
            }

            return series.map((entry) => {
                if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                    if (Array.isArray(entry.data)) {
                        return {
                            ...entry,
                            data: entry.data.map((point) => {
                                if (point && typeof point === 'object' && !Array.isArray(point)) {
                                    if (Object.prototype.hasOwnProperty.call(point, 'y')) {
                                        return { ...point, y: toFiniteNumber(point.y, 0) };
                                    }
                                    return point;
                                }
                                return toFiniteNumber(point, 0);
                            })
                        };
                    }
                    return entry;
                }

                if (Array.isArray(entry)) {
                    return entry.map((v) => toFiniteNumber(v, 0));
                }

                return toFiniteNumber(entry, 0);
            });
        };

        try {
            // Find pre > code.language-apex-chart blocks (marked.js output)
            const chartBlocks = document.querySelectorAll('pre code.language-apex-chart');
            if (chartBlocks.length === 0) {
                logger.debug('[AI Posture] No ApexCharts blocks found');
                return;
            }

            chartBlocks.forEach((codeBlock, index) => {
                try {
                    const chartDataText = codeBlock.textContent.trim();
                    const chartConfig = JSON.parse(chartDataText);
                    
                    // Validate required chart properties
                    if (!chartConfig.type) {
                        logger.warn('[AI Posture] Chart block missing type property');
                        return;
                    }
                    
                    if (!chartConfig.series || (Array.isArray(chartConfig.series) && chartConfig.series.length === 0)) {
                        logger.warn('[AI Posture] Chart block missing or empty series data', { type: chartConfig.type });
                        return;
                    }
                    
                    const preParent = codeBlock.parentElement;
                    
                    // Create chart container
                    const chartDiv = document.createElement('div');
                    chartDiv.className = 'apex-chart-container';
                    chartDiv.id = `apex-chart-${Date.now()}-${index}`;
                    chartDiv.style.marginBottom = '20px';
                    
                    // Replace pre > code with chart div
                    preParent.replaceWith(chartDiv);
                    
                    const sanitizedSeries = sanitizeSeries(chartConfig.type, chartConfig.series);
                    if (!Array.isArray(sanitizedSeries) || sanitizedSeries.length === 0) {
                        logger.warn('[AI Posture] Skipping chart due to empty sanitized series', { type: chartConfig.type });
                        return;
                    }

                    // Build ApexCharts options with safe defaults
                    const options = {
                        chart: {
                            type: chartConfig.type,
                            height: toFiniteNumber(chartConfig.height, 350),
                            toolbar: { show: true },
                            animations: { enabled: true }
                        },
                        series: sanitizedSeries,
                        labels: chartConfig.labels || [],
                        colors: chartConfig.colors || ['#008FFB', '#00E396', '#FEB019', '#FF4560', '#775DD0'],
                        title: {
                            text: chartConfig.title || 'Chart',
                            align: 'center'
                        },
                        dataLabels: { enabled: true },
                        legend: { position: 'bottom' }
                    };

                    // Add type-specific options
                    if (chartConfig.type === 'bar') {
                        const categories = Array.isArray(chartConfig.categories) ? chartConfig.categories : [];
                        options.xaxis = { categories };
                        options.plotOptions = {
                            bar: { horizontal: false, columnWidth: '55%' }
                        };
                    } else if (chartConfig.type === 'line') {
                        const categories = Array.isArray(chartConfig.categories) ? chartConfig.categories : [];
                        options.xaxis = { categories };
                        options.stroke = { curve: 'smooth', width: 3 };
                        if (chartConfig.yaxis) {
                            options.yaxis = chartConfig.yaxis;
                        }
                    } else if (chartConfig.type === 'pie' || chartConfig.type === 'donut') {
                        options.responsive = [{
                            breakpoint: 480,
                            options: {
                                chart: { width: 300 },
                                legend: { position: 'bottom' }
                            }
                        }];
                    }
                    
                    // Render only after the container has measurable size to avoid NaN transforms.
                    let attempts = 0;
                    const renderWhenReady = () => {
                        attempts += 1;
                        if (!chartDiv.isConnected) {
                            return;
                        }

                        const rect = chartDiv.getBoundingClientRect();
                        if ((rect.width <= 0 || rect.height <= 0) && attempts < 8) {
                            setTimeout(renderWhenReady, 120);
                            return;
                        }

                        const chart = new ApexCharts(chartDiv, options);
                        chart.render();
                    };

                    renderWhenReady();
                    
                    logger.debug('[AI Posture] Rendered ApexChart', { 
                        id: chartDiv.id, 
                        type: chartConfig.type,
                        seriesCount: options.series.length
                    });
                } catch (blockErr) {
                    logger.error('[AI Posture] Failed to process ApexChart block:', blockErr);
                }
            });
            
            logger.debug('[AI Posture] ApexCharts processing complete', { 
                blockCount: chartBlocks.length
            });
        } catch (err) {
            logger.error('[AI Posture] ApexCharts rendering failed:', err);
        }
    }

    renderReportContent() {
        const { currentReport } = this.state;

        if (!currentReport) {
            return html`
                <div class="text-center text-muted py-5">
                    <div class="mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="48" height="48" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                            <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
                            <line x1="9" y1="9" x2="10" y2="9" />
                            <line x1="9" y1="13" x2="15" y2="13" />
                            <line x1="9" y1="17" x2="15" y2="17" />
                        </svg>
                    </div>
                    <h3>No Report Available</h3>
                    <p class="text-muted">Generate the selected report scope for the selected UTC day.</p>
                </div>
            `;
        }

        // Parse the report JSON/content
        let reportContent = currentReport.report || currentReport.content || currentReport.outputJson || '';
        if (typeof reportContent === 'string') {
            try {
                reportContent = JSON.parse(reportContent);
            } catch {
                // Keep as string if not JSON
            }
        }

        const riskScore = Number(currentReport.riskScore ?? currentReport.summaryScore);
        const hasRiskScore = Number.isFinite(riskScore);
        const completedAt = currentReport.completedAt || currentReport.generatedAt || currentReport.generatedAtUtc;
        const dateStr = completedAt ? new Date(completedAt).toLocaleString() : 'Just now';
        const reportKind = currentReport.reportKind || this.state.selectedReportKind;
        const reportDate = currentReport.reportDate || this.state.selectedDate;
        const framework = currentReport.framework || this.state.selectedFramework;

        return html`
            <div class="p-4 posture-ai-report">
                <div class="row mb-4">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-body">
                                <h5 class="card-title">Report Summary</h5>
                                ${hasRiskScore ? html`
                                    <div class="display-4 ${riskScore > 70 ? 'text-danger' : riskScore > 40 ? 'text-warning' : 'text-success'}">
                                        ${riskScore.toFixed(1)}
                                    </div>
                                ` : html`
                                    <div class="h2 mb-0">${reportKind}</div>
                                `}
                                <div class="text-muted small mt-1">Date: ${reportDate} · Framework: ${framework || 'n/a'}</div>
                                <div class="text-muted small">Generated: ${dateStr}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Report Content</h3>
                    </div>
                    <div class="card-body report-markdown-content">
                        ${this.renderMarkdownContent(reportContent)}
                    </div>
                </div>
            </div>
        `;
    }

    render() {
        if (this.state.loading) {
            return html`
                <div class="d-flex justify-content-center align-items-center" style="min-height: 50vh;">
                    <div class="spinner-border text-primary" role="status"></div>
                </div>
            `;
        }

        if (this.state.error) {
            return html`
                <div class="container py-4">
                    <div class="alert alert-danger">${this.state.error}</div>
                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-primary" onClick=${() => this.loadReports()}>Retry</button>
                        <a class="btn btn-outline-secondary" href="#!/posture">Open Security Posture</a>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="page-header d-print-none mb-3">
                <div class="container">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <h2 class="page-title">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7" /><circle cx="12" cy="12" r="4" /></svg>
                                Mission Briefing
                            </h2>
                            <div class="page-subtitle">
                                <span class="text-muted">Command deck for security, compliance, and inventory reports with day-specific evidence</span>
                            </div>
                        </div>
                        <div class="col-auto ms-auto">
                            <div class="d-flex align-items-end gap-2 mb-2">
                                <div>
                                    <label class="form-label small text-muted mb-1">Report Type</label>
                                    <select class="form-select form-select-sm" value=${this.state.selectedReportKind} onChange=${(e) => this.setState({ selectedReportKind: e.target.value }, () => this.loadReports())}>
                                        <option value=${SECURITY_REPORT_KIND}>Security Posture</option>
                                        <option value=${COMPLIANCE_REPORT_KIND}>Compliance</option>
                                        <option value=${INVENTORY_REPORT_KIND}>Software Inventory</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="form-label small text-muted mb-1">As-of (UTC)</label>
                                    <input type="date" class="form-control form-control-sm" value=${this.state.selectedDate} onInput=${(e) => this.setState({ selectedDate: e.target.value }, () => this.loadReports())} />
                                </div>
                                ${this.state.selectedReportKind === COMPLIANCE_REPORT_KIND ? html`
                                    <div>
                                        <label class="form-label small text-muted mb-1">Framework</label>
                                        <select class="form-select form-select-sm" value=${this.state.selectedFramework} onChange=${(e) => this.setState({ selectedFramework: e.target.value }, () => this.loadReports())}>
                                            <option value="all">All</option>
                                            <option value="cis">CIS</option>
                                            <option value="nist">NIST</option>
                                            <option value="cert-in">CERT-In</option>
                                            <option value="iso27001">ISO 27001</option>
                                        </select>
                                    </div>
                                ` : null}
                            </div>
                            <div class="btn-group">
                                ${this.state.currentReport ? html`
                                    <button 
                                        class="btn btn-outline-primary"
                                        title=${this.state.selectedReportKind === SECURITY_REPORT_KIND ? 'Email PDF' : 'Email PDF is currently available for Security Posture reports'}
                                        disabled=${this.state.selectedReportKind !== SECURITY_REPORT_KIND || this.state.emailingSending}
                                        onClick=${() => this.checkLastEmailSent()}
                                    >
                                        ${this.state.emailingSending ? html`
                                            <span class="spinner-border spinner-border-sm me-2"></span>
                                            Sending...
                                        ` : html`
                                            <i class="ti ti-mail me-2"></i>
                                            Email PDF
                                        `}
                                    </button>
                                ` : null}
                                <button 
                                    class="btn btn-primary" 
                                    disabled=${this.state.generating || this.state.pollingForReport}
                                    onClick=${() => this.generateReport()}
                                >
                                    ${this.state.generating || this.state.pollingForReport ? html`
                                        <span class="spinner-border spinner-border-sm me-2"></span>
                                        Generating...
                                    ` : 'Generate Report'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="container">
                ${this.state.pollingForReport ? html`
                    <div class="alert alert-info d-flex align-items-center mb-4">
                        <span class="spinner-border spinner-border-sm me-3"></span>
                        <div>
                            <strong>Generating Report...</strong>
                            <p class="mb-0 small">Please wait while we analyze your security posture. This may take up to 30 seconds.</p>
                        </div>
                    </div>
                ` : null}

                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Mission Report</h3>
                    </div>
                    <div class="card-body p-0">
                        ${this.renderReportContent()}
                    </div>
                </div>
                ${this.renderEmailConfirmationModal()}
            </div>
        `;
    }

    renderEmailConfirmationModal() {
        if (!this.state.showEmailModal) return null;

        const { lastEmailSent } = this.state;
        const hasRecent = lastEmailSent && lastEmailSent.recent;

        return html`
            <div class="modal fade show" style="display: block; background: rgba(0,0,0,0.5);" onClick=${(e) => {
                if (e.target.classList.contains('modal')) {
                    this.setState({ showEmailModal: false });
                }
            }}>
                <div class="modal-dialog modal-dialog-centered" onClick=${(e) => e.stopPropagation()}>
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="ti ti-mail me-2"></i>
                                Email Security Report
                            </h5>
                            <button type="button" class="btn-close" onClick=${() => this.setState({ showEmailModal: false })}></button>
                        </div>
                        <div class="modal-body">
                            ${lastEmailSent ? html`
                                <div class="alert ${hasRecent ? 'alert-warning' : 'alert-info'} mb-3">
                                    <div class="d-flex align-items-center mb-2">
                                        <i class="ti ti-clock me-2"></i>
                                        <strong>Last Sent</strong>
                                    </div>
                                    <div class="ms-4">
                                        <div>${lastEmailSent.sentAt.toLocaleString()}</div>
                                        <div class="text-muted small">To: ${lastEmailSent.recipient}</div>
                                        <div class="text-muted small">${lastEmailSent.hoursSince < 1 
                                            ? `${Math.round(lastEmailSent.hoursSince * 60)} minutes ago`
                                            : `${lastEmailSent.hoursSince.toFixed(1)} hours ago`
                                        }</div>
                                    </div>
                                </div>
                                ${hasRecent ? html`
                                    <div class="alert alert-warning">
                                        <i class="ti ti-alert-triangle me-2"></i>
                                        <strong>Warning:</strong> Report was sent recently (within last hour).
                                        Sending again may cause confusion or appear as spam.
                                    </div>
                                ` : ''}
                            ` : html`
                                <div class="alert alert-info">
                                    <i class="ti ti-info-circle me-2"></i>
                                    This will be the first time sending this report.
                                </div>
                            `}
                            <p class="mb-0">
                                The security posture report PDF will be sent to the organization owner's email address.
                            </p>
                        </div>
                        <div class="modal-footer">
                            <button 
                                type="button" 
                                class="btn btn-secondary" 
                                onClick=${() => this.setState({ showEmailModal: false })}
                            >
                                Cancel
                            </button>
                            <button 
                                type="button" 
                                class="btn btn-primary" 
                                onClick=${() => this.confirmEmailSend()}
                            >
                                ${hasRecent ? 'Send Anyway' : 'Send Email'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
