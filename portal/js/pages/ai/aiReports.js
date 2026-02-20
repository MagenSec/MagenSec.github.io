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
import { auth } from '@auth';
import { orgContext } from '@orgContext';

const { html, Component } = window;

export default class AIReportsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: false,
            loadingMore: false,
            error: null,
            reports: [],
            generating: false,
            selectedTemplate: 'full-posture',
            selectedModel: 'azure-openai',
            generationStatus: null,
            continuationToken: null,
            hasMore: false,
            isSiteAdmin: false,
            feedbackData: null,
            loadingFeedback: false,
            feedbackDays: 7
        };
        this.scrollObserverRef = React.createRef();
        this.orgChangeListener = null;
    }

    componentDidMount() {
        // Subscribe to org changes for auto-refresh
        this.orgChangeListener = orgContext.onChange(() => {
            this.loadReports();
        });
        this.loadReports();

        // Detect site admin to show quality feedback panel
        const user = auth.getUser();
        if (user?.userType === 'SiteAdmin') {
            this.setState({ isSiteAdmin: true });
            this.loadFeedback();
        }

        // Setup infinite scroll observer
        this.setupInfiniteScroll();
    }
    
    setupInfiniteScroll() {
        if (!this.scrollObserverRef.current) return;
        
        this.observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && this.state.hasMore && !this.state.loading && !this.state.loadingMore) {
                    this.loadMoreReports();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );
        
        this.observer.observe(this.scrollObserverRef.current);
    }

    componentWillUnmount() {
        if (this.orgChangeListener) {
            this.orgChangeListener();
        }
        if (this.observer) {
            this.observer.disconnect();
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
                model: this.state.selectedModel,
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

    async loadFeedback(days) {
        const queryDays = days || this.state.feedbackDays;
        this.setState({ loadingFeedback: true });
        try {
            const response = await api.get(`/api/v1/ai-analyst/metrics/system/feedback?days=${queryDays}`);
            if (response.success) {
                this.setState({ feedbackData: response.data, loadingFeedback: false, feedbackDays: queryDays });
            } else {
                this.setState({ loadingFeedback: false });
            }
        } catch (err) {
            this.setState({ loadingFeedback: false });
        }
    }

    getFailureBadgeClass(failureType) {
        const map = { NO_TELEMETRY: 'bg-warning text-dark', LLM_ERROR: 'bg-danger text-white', INADEQUATE_RESPONSE: 'bg-orange text-white', POLICY_REJECTED: 'bg-secondary text-white' };
        return map[failureType] || 'bg-secondary text-white';
    }

    handleTemplateChange(e) {
        this.setState({ selectedTemplate: e.target.value });
    }

    handleModelChange(model) {
        this.setState({ selectedModel: model });
    }

    async loadMoreReports() {
        const org = orgContext.getCurrentOrg();
        if (!org || !org.orgId || !this.state.continuationToken) return;

        this.setState({ loadingMore: true });

        try {
            const response = await api.get(
                `/api/v1/orgs/${org.orgId}/ai-analyst/reports?limit=20&continuationToken=${this.state.continuationToken}`
            );
            
            if (response.success) {
                this.setState(prevState => ({
                    reports: [...prevState.reports, ...(response.data.reports || [])],
                    continuationToken: response.data.continuationToken,
                    hasMore: !!response.data.continuationToken,
                    loadingMore: false
                }));
            }
        } catch (err) {
            this.setState({ error: err.message, loadingMore: false });
        }
    }

    render() {
        const { loading, error, reports, generating, selectedTemplate, selectedModel, generationStatus, hasMore,
                isSiteAdmin, feedbackData, loadingFeedback, feedbackDays } = this.state;

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
                    // Model selector
                    h('div', { class: 'mb-3' },
                        h('label', { class: 'form-label' }, 'Analysis Engine'),
                        h('div', { class: 'btn-group d-flex', role: 'group' },
                            h('button', {
                                type: 'button',
                                class: `btn ${selectedModel === 'azure-openai' ? 'btn-primary' : 'btn-outline-secondary'} flex-fill`,
                                onClick: () => this.handleModelChange('azure-openai'),
                                disabled: generating
                            },
                                h('span', null, '✨ AI-Powered (GPT-4o)')
                            ),
                            h('button', {
                                type: 'button',
                                class: `btn ${selectedModel === 'heuristic' ? 'btn-secondary' : 'btn-outline-secondary'} flex-fill`,
                                onClick: () => this.handleModelChange('heuristic'),
                                disabled: generating
                            },
                                h('span', null, '📊 Classic (Heuristic)')
                            )
                        ),
                        selectedModel === 'azure-openai' && h('div', { class: 'form-text text-primary mt-1' },
                            '✨ GPT-4o will use your real security telemetry to create a personalized narrative report.'
                        )
                    ),

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
                            : selectedModel === 'azure-openai'
                            ? h('span', null, '✨ Generate AI Report')
                            : h('span', null, '📊 Generate Report')
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
                                        h('td', null, 
                                            report.reportType || 'Security Posture',
                                            report.model && report.model !== 'heuristic' && h('span', {
                                                class: 'badge bg-primary text-white ms-2',
                                                title: `Generated with ${report.model}`
                                            }, '🤖 AI')
                                        ),
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
                        !loading && !this.state.loadingMore && h('div', { 
                            ref: this.scrollObserverRef, 
                            style: 'height: 1px;' 
                        }),
                        this.state.loadingMore && h('div', { class: 'py-3' },
                            h('span', { class: 'spinner-border spinner-border-sm me-2' }),
                            h('span', { class: 'text-muted' }, 'Loading more reports...')
                        )
                    )
                )
            ),

            // AI Quality Issues panel — site admin only
            isSiteAdmin && h('div', { class: 'card mt-4' },
                h('div', { class: 'card-header' },
                    h('h3', { class: 'card-title' },
                        h('span', { class: 'badge bg-danger text-white me-2' }, 'Admin'),
                        'AI Quality Issues'
                    ),
                    h('div', { class: 'card-subtitle text-muted' },
                        'Incidents where the AI gave inadequate responses, had no telemetry, or encountered errors. Fix these to improve answer quality.'
                    ),
                    h('div', { class: 'ms-auto d-flex gap-2 align-items-center' },
                        ['7', '14', '30'].map(d => h('button', {
                            key: d,
                            class: `btn btn-sm ${feedbackDays === parseInt(d) ? 'btn-primary' : 'btn-outline-secondary'}`,
                            onClick: () => this.loadFeedback(parseInt(d))
                        }, `${d}d`)),
                        h('button', {
                            class: 'btn btn-sm btn-outline-secondary',
                            onClick: () => this.loadFeedback(),
                            disabled: loadingFeedback
                        }, loadingFeedback ? '…' : '↻')
                    )
                ),
                h('div', { class: 'card-body' },
                    loadingFeedback && h('div', { class: 'text-center py-4' },
                        h('span', { class: 'spinner-border text-secondary' })
                    ),

                    !loadingFeedback && feedbackData && feedbackData.totalIncidents === 0 && h('div', { class: 'text-center py-4 text-muted' },
                        h('p', { class: 'mb-0' }, `✅ No AI quality incidents in the last ${feedbackDays} days.`)
                    ),

                    !loadingFeedback && feedbackData && feedbackData.totalIncidents > 0 && h('div', null,
                        // Daily summary row
                        h('div', { class: 'd-flex gap-3 mb-4 flex-wrap' },
                            feedbackData.byDay.slice(0, 14).map(day => h('div', {
                                key: day.date,
                                class: 'text-center',
                                style: 'min-width: 64px;'
                            },
                                h('div', { class: 'h4 mb-0 text-danger' }, day.totalCount),
                                h('div', { class: 'text-muted small' }, `${day.date.slice(4,6)}/${day.date.slice(6,8)}`),
                                Object.entries(day.breakdown).map(([type, count]) => h('div', {
                                    key: type,
                                    class: `badge ${this.getFailureBadgeClass(type)} d-block mt-1`,
                                    title: type
                                }, count))
                            ))
                        ),

                        // Incident table
                        h('div', { class: 'table-responsive' },
                            h('table', { class: 'table table-sm table-hover' },
                                h('thead', null,
                                    h('tr', null,
                                        h('th', null, 'Time'),
                                        h('th', null, 'Org'),
                                        h('th', null, 'Type'),
                                        h('th', null, 'Question'),
                                        h('th', null, 'Details')
                                    )
                                ),
                                h('tbody', null,
                                    feedbackData.allIncidents.slice(0, 50).map((inc, idx) => h('tr', { key: idx },
                                        h('td', { class: 'text-muted small text-nowrap' }, new Date(inc.timestamp).toLocaleString()),
                                        h('td', { class: 'small font-monospace' }, inc.orgId),
                                        h('td', null, h('span', { class: `badge ${this.getFailureBadgeClass(inc.failureType)}` }, inc.failureType)),
                                        h('td', { class: 'small', style: 'max-width:280px; word-break:break-word;' }, inc.question),
                                        h('td', { class: 'small text-muted', style: 'max-width:240px; word-break:break-word;' }, inc.details || '—')
                                    ))
                                )
                            )
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
