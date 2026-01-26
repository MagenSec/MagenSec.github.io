/**
 * AI Report Detail Page
 * 
 * Displays a completed AI security report with:
 * - Report metadata (title, generation time, status)
 * - Full report content (HTML formatted)
 * - Download options (PDF/HTML)
 * - Share/print functionality
 * 
 * API Endpoints:
 * - GET /api/v1/orgs/{orgId}/ai-analyst/reports/{reportId} - Get report detail
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import { logger } from '@config';

const { html, Component } = window;

export default class AIReportDetailPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            report: null
        };
    }

    componentDidMount() {
        this.loadReport();
    }

    async loadReport() {
        const org = orgContext.getCurrentOrg();
        const { reportId } = this.props.params || {};

        if (!org || !org.orgId) {
            this.setState({ error: 'No organization selected', loading: false });
            return;
        }

        if (!reportId) {
            this.setState({ error: 'No report ID provided', loading: false });
            return;
        }

        this.setState({ loading: true, error: null });
        logger.info(`[AIReportDetail] Loading report ${reportId} for org ${org.orgId}`);

        try {
            // Accept REPORT-YYYYMMDD or raw YYYYMMDD
            let date = null;
            const m = /^REPORT-(\d{8})$/.exec(reportId);
            if (m) date = m[1];
            else if (/^\d{8}$/.test(reportId)) date = reportId;

            const response = await api.getAIReportByDate(org.orgId, date || reportId);
            if (response && response.success !== false) {
                const report = response.report || response.data || response;
                logger.info('[AIReportDetail] Report loaded successfully:', report);
                this.setState({
                    report,
                    loading: false
                });
            } else {
                logger.error('[AIReportDetail] Failed to load report:', response);
                this.setState({
                    error: (response && (response.message || response.error)) || 'Failed to load report',
                    loading: false
                });
            }
        } catch (err) {
            logger.error('[AIReportDetail] Error loading report:', err);
            this.setState({
                error: err.message || 'Failed to load report',
                loading: false
            });
        }
    }

    formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        try {
            return new Date(dateStr).toLocaleString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateStr;
        }
    }

    getStatusBadge(status) {
        const badges = {
            'Completed': 'success',
            'Running': 'primary',
            'Queued': 'warning',
            'Failed': 'danger',
            'Cancelled': 'secondary'
        };
        const variant = badges[status] || 'secondary';
        return html`<span class="badge bg-${variant}">${status}</span>`;
    }

    handlePrint() {
        window.print();
    }

    async handleDownload(format = 'html') {
        const { report } = this.state;
        if (!report) return;

        try {
            // Create a blob with the report content
            const content = report.reportHtml || report.reportContent || '';
            const blob = new Blob([content], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            
            // Trigger download
            const a = document.createElement('a');
            a.href = url;
            a.download = `security-report-${report.reportId}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            logger.info('[AIReportDetail] Downloaded report:', report.reportId);
        } catch (err) {
            logger.error('[AIReportDetail] Download failed:', err);
            alert('Failed to download report');
        }
    }

    renderReportContent() {
        const { report } = this.state;
        if (!report) return null;

        // Use reportHtml or reportContent
        const content = report.reportHtml || report.reportContent || report.content || '<p>No content available</p>';

        return html`
            <div class="report-content">
                <div dangerouslySetInnerHTML=${{ __html: content }}></div>
            </div>
        `;
    }

    render() {
        const { loading, error, report } = this.state;

        if (loading) {
            return html`
                <div class="container-fluid p-4">
                    <div class="d-flex align-items-center justify-content-center" style="min-height: 400px;">
                        <div class="text-center">
                            <div class="spinner-border text-primary mb-3" role="status"></div>
                            <p class="text-muted">Loading report...</p>
                        </div>
                    </div>
                </div>
            `;
        }

        if (error) {
            return html`
                <div class="container-fluid p-4">
                    <div class="alert alert-danger" role="alert">
                        <h4 class="alert-heading"><i class="bi bi-exclamation-triangle"></i> Error</h4>
                        <p>${error}</p>
                        <hr />
                        <button class="btn btn-sm btn-outline-danger" onclick=${() => window.history.back()}>
                            <i class="bi bi-arrow-left"></i> Go Back
                        </button>
                    </div>
                </div>
            `;
        }

        if (!report) {
            return html`
                <div class="container-fluid p-4">
                    <div class="alert alert-warning" role="alert">
                        <p>Report not found</p>
                        <button class="btn btn-sm btn-outline-warning" onclick=${() => window.history.back()}>
                            <i class="bi bi-arrow-left"></i> Go Back
                        </button>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="container-fluid p-4">
                <!-- Header -->
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <nav aria-label="breadcrumb">
                            <ol class="breadcrumb mb-2">
                                <li class="breadcrumb-item">
                                    <a href="#!/ai-reports" class="text-decoration-none">AI Reports</a>
                                </li>
                                <li class="breadcrumb-item active" aria-current="page">
                                    ${report.reportId?.substring(0, 8)}...
                                </li>
                            </ol>
                        </nav>
                        <h1 class="h3 mb-0">
                            <i class="bi bi-file-earmark-text text-primary"></i>
                            Security Report
                        </h1>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-outline-secondary" onclick=${() => this.handlePrint()}>
                            <i class="bi bi-printer"></i> Print
                        </button>
                        <button class="btn btn-outline-primary" onclick=${() => this.handleDownload('html')}>
                            <i class="bi bi-download"></i> Download
                        </button>
                        <button class="btn btn-outline-secondary" onclick=${() => window.history.back()}>
                            <i class="bi bi-arrow-left"></i> Back
                        </button>
                    </div>
                </div>

                <!-- Report Metadata Card -->
                <div class="card mb-4">
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-3">
                                <label class="text-muted small">Report ID</label>
                                <p class="mb-0 font-monospace">${report.reportId}</p>
                            </div>
                            <div class="col-md-3">
                                <label class="text-muted small">Status</label>
                                <p class="mb-0">${this.getStatusBadge(report.status)}</p>
                            </div>
                            <div class="col-md-3">
                                <label class="text-muted small">Generated</label>
                                <p class="mb-0">${this.formatDate(report.generatedAt || report.createdAt)}</p>
                            </div>
                            <div class="col-md-3">
                                <label class="text-muted small">Type</label>
                                <p class="mb-0">${report.reportType || 'Security Posture'}</p>
                            </div>
                        </div>
                        ${report.prompt ? html`
                            <div class="row mt-3">
                                <div class="col-12">
                                    <label class="text-muted small">Prompt</label>
                                    <p class="mb-0 text-muted">${report.prompt}</p>
                                </div>
                            </div>
                        ` : null}
                    </div>
                </div>

                <!-- Report Content -->
                <div class="card">
                    <div class="card-body report-viewer">
                        ${this.renderReportContent()}
                    </div>
                </div>
            </div>

            <style>
                .report-viewer {
                    min-height: 600px;
                }
                
                .report-content {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                    font-size: 0.95rem;
                    line-height: 1.6;
                }
                
                .report-content h1 {
                    font-size: 1.75rem;
                    margin-top: 2rem;
                    margin-bottom: 1rem;
                    color: #1a1a1a;
                }
                
                .report-content h2 {
                    font-size: 1.5rem;
                    margin-top: 1.5rem;
                    margin-bottom: 0.75rem;
                    color: #2a2a2a;
                }
                
                .report-content h3 {
                    font-size: 1.25rem;
                    margin-top: 1.25rem;
                    margin-bottom: 0.5rem;
                    color: #3a3a3a;
                }
                
                .report-content table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 1rem 0;
                }
                
                .report-content th,
                .report-content td {
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    text-align: left;
                }
                
                .report-content th {
                    background-color: #f8f9fa;
                    font-weight: 600;
                }
                
                .report-content ul,
                .report-content ol {
                    margin-left: 20px;
                    margin-bottom: 1rem;
                }
                
                .report-content code {
                    background-color: #f5f5f5;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-family: 'Courier New', monospace;
                }
                
                .report-content pre {
                    background-color: #f5f5f5;
                    padding: 12px;
                    border-radius: 4px;
                    overflow-x: auto;
                }
                
                @media print {
                    .btn-group,
                    .breadcrumb,
                    nav {
                        display: none !important;
                    }
                    
                    .card {
                        border: none;
                        box-shadow: none;
                    }
                }
            </style>
        `;
    }
}
