/**
 * AI Security Reports Page
 * 
 * Features:
 * - Generate new security posture reports
 * - View report generation queue/status
 * - Download completed reports
 * - Report templates (Full Posture, Vulnerability Summary, Compliance Check)
 * 
 * API Endpoints:
 * - POST /api/v1/orgs/{orgId}/ai-analyst/run - Generate report
 * - GET /api/v1/orgs/{orgId}/ai-analyst/reports - List reports
 * - GET /api/v1/orgs/{orgId}/ai-analyst/reports/{reportId} - Get report detail
 */

import { api } from '@api';
import { orgContext } from '@orgContext';

const { html, Component } = window;

export default class AIReportsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: false,
            error: null,
            reports: [],
            generating: false,
            selectedTemplate: 'full-posture',
            generationStatus: null,
            continuationToken: null,
            hasMore: false
        };
        this.orgChangeListener = null;
    }

    componentDidMount() {
        // Subscribe to org changes for auto-refresh
        this.orgChangeListener = orgContext.onChange(() => {
            this.loadReports();
        });
        this.loadReports();
    }

    componentWillUnmount() {
        if (this.orgChangeListener) {
            this.orgChangeListener();
        }
    }

    async loadReports() {
        const org = orgContext.getCurrentOrg();
        if (!org || !org.orgId) {
            this.setState({ error: 'No organization selected', loading: false });
            return;
        }

        this.setState({ loading: true, error: null });

        try {
            const response = await api.get(`/api/v1/orgs/${org.orgId}/ai-analyst/reports?limit=20`);
            
            if (response.success) {
                this.setState({
                    reports: response.data.reports || [],
                    continuationToken: response.data.continuationToken,
                    hasMore: !!response.data.continuationToken,
                    loading: false
                });
            } else {
                this.setState({
                    error: response.message || 'Failed to load reports',
                    loading: false
                });
            }
        } catch (err) {
            this.setState({
                error: err.message || 'Failed to load reports',
                loading: false
            });
        }
    }

    async generateReport() {
        const org = orgContext.getCurrentOrg();
        if (!org || !org.orgId) {
            this.setState({ error: 'No organization selected' });
            return;
        }

        const { selectedTemplate } = this.state;
        
        this.setState({ generating: true, error: null, generationStatus: 'Initializing report generation...' });

        try {
            // Map template to prompt
            const prompts = {
                'full-posture': 'Generate a comprehensive security posture report covering vulnerabilities, compliance, devices, and risk trends.',
                'vulnerability-summary': 'Generate a vulnerability assessment report with CVE analysis and remediation priorities.',
                'compliance-check': 'Generate a compliance status report showing policy violations and security gaps.'
            };

            const prompt = prompts[selectedTemplate] || prompts['full-posture'];

            this.setState({ generationStatus: 'Sending request to AI engine...' });

            const response = await api.post(`/api/v1/orgs/${org.orgId}/ai-analyst/run`, {
                prompt: prompt,
                includeRecommendations: true,
                waitSeconds: 30 // Poll for 30 seconds
            });

            if (response.success) {
                this.setState({
                    generationStatus: response.data.status === 'completed' 
                        ? 'Report generated successfully!' 
                        : 'Report queued for generation. Refresh to check status.',
                    generating: false
                });
                
                // Reload reports list after 2 seconds
                setTimeout(() => this.loadReports(), 2000);
            } else {
                this.setState({
                    error: response.message || 'Failed to generate report',
                    generating: false,
                    generationStatus: null
                });
            }
        } catch (err) {
            this.setState({
                error: err.message || 'Failed to generate report',
                generating: false,
                generationStatus: null
            });
        }
    }

    async downloadReport(reportId) {
        const org = orgContext.getCurrentOrg();
        if (!org || !org.orgId) return;

        try {
            const response = await api.get(`/api/v1/orgs/${org.orgId}/ai-analyst/reports/${reportId}`);
            
            if (response.success && response.data) {
                // Create downloadable markdown file
                const report = response.data;
                const markdown = this.formatReportAsMarkdown(report);
                
                const blob = new Blob([markdown], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `security-report-${reportId}.md`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } else {
                this.setState({ error: response.message || 'Failed to download report' });
            }
        } catch (err) {
            this.setState({ error: err.message || 'Failed to download report' });
        }
    }

    formatReportAsMarkdown(report) {
        let md = `# Security Report\n\n`;
        md += `**Report ID:** ${report.reportId}\n`;
        md += `**Generated:** ${new Date(report.createdAt).toLocaleString()}\n`;
        md += `**Status:** ${report.status}\n\n`;
        
        if (report.sections && report.sections.length > 0) {
            report.sections.forEach(section => {
                md += `## ${section.title}\n\n`;
                md += `${section.content}\n\n`;
            });
        }
        
        if (report.recommendations && report.recommendations.length > 0) {
            md += `## Recommendations\n\n`;
            report.recommendations.forEach((rec, idx) => {
                md += `${idx + 1}. **${rec.title}** (Priority: ${rec.priority})\n`;
                md += `   ${rec.description}\n\n`;
            });
        }
        
        return md;
    }

    handleTemplateChange(e) {
        this.setState({ selectedTemplate: e.target.value });
    }

    async loadMoreReports() {
        const org = orgContext.getCurrentOrg();
        if (!org || !org.orgId || !this.state.continuationToken) return;

        this.setState({ loading: true });

        try {
            const response = await api.get(
                `/api/v1/orgs/${org.orgId}/ai-analyst/reports?limit=20&continuationToken=${this.state.continuationToken}`
            );
            
            if (response.success) {
                this.setState(prevState => ({
                    reports: [...prevState.reports, ...(response.data.reports || [])],
                    continuationToken: response.data.continuationToken,
                    hasMore: !!response.data.continuationToken,
                    loading: false
                }));
            }
        } catch (err) {
            this.setState({ error: err.message, loading: false });
        }
    }

    render() {
        const { loading, error, reports, generating, selectedTemplate, generationStatus, hasMore } = this.state;

        return h('div', { class: 'ai-reports-page' },
            h('div', { class: 'page-header' },
                h('h1', null, 'AI Security Reports'),
                h('p', { class: 'page-description' }, 
                    'Generate comprehensive security posture reports using AI analysis of your infrastructure.'
                )
            ),

            error && html`
                <div class="alert alert-danger alert-dismissible fade show">
                    <div class="d-flex">
                        <div>
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <circle cx="12" cy="12" r="9"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </div>
                        <div>
                            <h4 class="alert-title">Error</h4>
                            <div class="text-secondary">${error}</div>
                        </div>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" onClick=${() => this.setState({ error: null })}></button>
                </div>
            `,

            // Generation Panel
            h('div', { class: 'card mb-4 card-hover' },
                h('div', { class: 'card-stamp card-stamp-lg' },
                    h('div', { class: 'card-stamp-icon bg-primary' },
                        html`
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="32" height="32" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M8 9h8"/>
                                <path d="M8 13h6"/>
                                <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z"/>
                            </svg>
                        `
                    )
                ),
                h('div', { class: 'card-header' },
                    h('h3', { class: 'card-title' }, 'Generate New Report'),
                    h('div', { class: 'card-subtitle' }, 'AI-powered security analysis and recommendations')
                ),
                h('div', { class: 'card-body' },
                    h('div', { class: 'form-group' },
                        h('label', { for: 'template-select' }, 'Report Template'),
                        h('select', {
                            id: 'template-select',
                            class: 'form-control',
                            value: selectedTemplate,
                            onChange: (e) => this.handleTemplateChange(e),
                            disabled: generating
                        },
                            h('option', { value: 'full-posture' }, 'Full Security Posture (Comprehensive)'),
                            h('option', { value: 'vulnerability-summary' }, 'Vulnerability Assessment'),
                            h('option', { value: 'compliance-check' }, 'Compliance Status Report')
                        )
                    ),
                    
                    generationStatus && h('div', { class: 'alert alert-info mt-3' },
                        h('i', { class: 'fas fa-spinner fa-spin mr-2' }),
                        generationStatus
                    ),

                    h('button', {
                        class: 'btn btn-primary mt-3',
                        onClick: () => this.generateReport(),
                        disabled: generating
                    },
                        generating 
                            ? h('span', null, 
                                h('i', { class: 'fas fa-spinner fa-spin mr-2' }),
                                'Generating...'
                            )
                            : h('span', null,
                                h('i', { class: 'fas fa-magic mr-2' }),
                                'Generate Report'
                            )
                    )
                )
            ),

            // Reports List
            h('div', { class: 'card' },
                h('div', { class: 'card-header' },
                    h('div', { class: 'header-with-actions' },
                        h('h3', null, 'Report History'),
                        h('button', {
                            class: 'btn btn-sm btn-outline-secondary',
                            onClick: () => this.loadReports(),
                            disabled: loading
                        },
                            h('i', { class: 'fas fa-sync-alt' }),
                            ' Refresh'
                        )
                    )
                ),
                h('div', { class: 'card-body' },
                    loading && reports.length === 0 && html`
                        <div class="d-flex align-items-center justify-content-center" style="min-height: 300px;">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading reports...</span>
                            </div>
                        </div>
                    `,

                    !loading && reports.length === 0 && html`
                        <div class="text-center py-5 text-muted">
                            <i class="fas fa-file-alt fa-3x mb-3"></i>
                            <h4>No reports generated yet</h4>
                            <p>Generate your first security report using the panel above.</p>
                        </div>
                    `,

                    reports.length > 0 && h('div', { class: 'table-responsive' },
                        h('table', { class: 'table table-hover' },
                            h('thead', null,
                                h('tr', null,
                                    h('th', null, 'Report ID'),
                                    h('th', null, 'Generated'),
                                    h('th', null, 'Status'),
                                    h('th', null, 'Type'),
                                    h('th', null, 'Actions')
                                )
                            ),
                            h('tbody', null,
                                reports.map(report => 
                                    h('tr', { key: report.reportId },
                                        h('td', null, 
                                            h('code', null, report.reportId.substring(0, 12) + '...')
                                        ),
                                        h('td', null, new Date(report.createdAt).toLocaleString()),
                                        h('td', null,
                                            h('span', {
                                                class: `badge badge-${this.getStatusBadgeClass(report.status)}`
                                            }, report.status)
                                        ),
                                        h('td', null, report.reportType || 'Security Posture'),
                                        h('td', null,
                                            h('button', {
                                                class: 'btn btn-sm btn-primary mr-2',
                                                onClick: () => this.downloadReport(report.reportId),
                                                disabled: report.status !== 'completed'
                                            },
                                                h('i', { class: 'fas fa-download' }),
                                                ' Download'
                                            ),
                                            h('button', {
                                                class: 'btn btn-sm btn-outline-secondary',
                                                onClick: () => window.location.href = `#/ai-reports/${report.reportId}`
                                            },
                                                h('i', { class: 'fas fa-eye' }),
                                                ' View'
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    ),

                    hasMore && h('div', { class: 'text-center mt-3' },
                        h('button', {
                            class: 'btn btn-outline-primary',
                            onClick: () => this.loadMoreReports(),
                            disabled: loading
                        },
                            loading 
                                ? h('span', null, h('i', { class: 'fas fa-spinner fa-spin mr-2' }), 'Loading...')
                                : 'Load More'
                        )
                    )
                )
            )
        );
    }

    getStatusBadgeClass(status) {
        const statusMap = {
            'completed': 'success',
            'running': 'info',
            'queued': 'warning',
            'failed': 'danger'
        };
        return statusMap[status] || 'secondary';
    }
}
