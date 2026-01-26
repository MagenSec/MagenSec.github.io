import { api } from '@api';
import { logger } from '@config';
import { orgContext } from '@orgContext';

const { html, Component } = window;

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

        this.setState({ loading: true, error: null });

        try {
            // Try latest persisted report
            const response = await api.getLatestAIReport(currentOrg.orgId);
            
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

            // No report available - auto-trigger generation and start polling
            logger.info('[AI Posture] No report found, auto-triggering generation');
            await this.autoGenerateReport();
        } catch (err) {
            // Check if it's a NOT_FOUND error (no report exists yet - normal state)
            if (err?.response?.error === 'NOT_FOUND' || err?.message?.includes('No report')) {
                logger.info('[AI Posture] No existing report found, auto-triggering generation');
                await this.autoGenerateReport();
                return;
            }
            
            // Real error - show to user
            logger.error('[AI Posture] Failed to load report:', err);
            this.setState({
                error: err?.message || 'Failed to load AI reports',
                loading: false
            });
        }
    }

    async autoGenerateReport() {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg || !currentOrg.orgId) return;

        this.setState({ pollingForReport: true, loading: false });

        try {
            // Trigger report generation
            logger.info('[AI Posture] Generating report...');
            const generateResponse = await api.generateAIReport(currentOrg.orgId, {
                prompt: 'Full security posture analysis',
                model: 'heuristic',
                waitSeconds: 30
            });

            // Check if generate API returned report immediately
            const generateData = generateResponse?.data || generateResponse;
            if (generateData?.report) {
                // Report generated successfully - use it directly
                logger.info('[AI Posture] Report generated successfully');
                this.setState({ 
                    currentReport: generateData, 
                    pollingForReport: false,
                    error: null
                });
                return;
            }

            // Generate API timed out or returned without report - start polling /latest
            logger.info('[AI Posture] Report generation queued, starting polling...');
            this.startPolling();
        } catch (err) {
            logger.error('[AI Posture] Auto-generation failed:', err);
            this.setState({
                error: err?.message || 'Failed to generate report automatically',
                pollingForReport: false
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
                const response = await api.getLatestAIReport(currentOrg.orgId);
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

        this.setState({ generating: true, error: null });

        try {
            const res = await api.generateAIReport(currentOrg.orgId, {
                prompt: 'Full security posture analysis',
                model: 'heuristic',
                waitSeconds: 30
            });

            if (res?.success === false) {
                throw new Error(res.message || res.error || 'Report generation failed');
            }

            const report = res?.data || res;
            this.setState({ currentReport: report, generating: false, error: null });
        } catch (err) {
            logger.error('[AI Posture] Failed to generate report:', err);
            this.setState({
                error: err?.message || 'Failed to generate report',
                generating: false
            });
        }
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
                    
                    // Build ApexCharts options with safe defaults
                    const options = {
                        chart: {
                            type: chartConfig.type,
                            height: 350,
                            toolbar: { show: true },
                            animations: { enabled: true }
                        },
                        series: Array.isArray(chartConfig.series) ? chartConfig.series : [],
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
                        options.xaxis = { categories: chartConfig.categories || [] };
                        options.plotOptions = {
                            bar: { horizontal: false, columnWidth: '55%' }
                        };
                    } else if (chartConfig.type === 'line') {
                        options.xaxis = { categories: chartConfig.categories || [] };
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
                    
                    // Render chart
                    const chart = new ApexCharts(chartDiv, options);
                    chart.render();
                    
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
                    <p class="text-muted">Generate an AI-powered security posture report for today</p>
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

        const riskScore = currentReport.riskScore || currentReport.summaryScore || 0;
        const completedAt = currentReport.completedAt || currentReport.generatedAt || currentReport.generatedAtUtc;
        const dateStr = completedAt ? new Date(completedAt).toLocaleString() : 'Just now';

        return html`
            <div class="p-4 posture-ai-report">
                <div class="row mb-4">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-body">
                                <h5 class="card-title">Risk Score</h5>
                                <div class="display-4 ${riskScore > 70 ? 'text-danger' : riskScore > 40 ? 'text-warning' : 'text-success'}">
                                    ${riskScore.toFixed(1)}
                                </div>
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
                    <button class="btn btn-primary" onClick=${() => this.loadReports()}>Retry</button>
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
                                AI Security Posture
                            </h2>
                            <div class="page-subtitle">
                                <span class="text-muted">AI-generated security analysis and recommendations</span>
                            </div>
                        </div>
                        <div class="col-auto ms-auto">
                            <div class="btn-group">
                                ${this.state.currentReport ? html`
                                    <button 
                                        class="btn btn-outline-primary"
                                        disabled=${this.state.emailingSending}
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
                        <h3 class="card-title">Today's Security Posture Report</h3>
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
