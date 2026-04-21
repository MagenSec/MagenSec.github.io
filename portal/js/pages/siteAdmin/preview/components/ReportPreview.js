const { html, Component } = window;

/**
 * Report Preview Page - Visualize email reports that customers receive
 * Shows Daily and Weekly report templates
 */
class ReportPreviewPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            snapshot: null,
            orgData: null,
            rendered: null,
            reportType: 'daily', // 'daily' or 'weekly'
            isSiteAdmin: false,
            sendingEmail: false,
            emailSent: false,
            emailMessage: null,
            showSendMenu: false,
            refreshing: false,
            isFromCache: false,
            cachedAt: null,
            previewTheme: 'light',
            previewViewport: 'desktop'
        };
    }

    componentDidMount() {
        // Subscribe to org changes
        this.orgUnsubscribe = window.orgContext.onChange(() => this.loadReportData(true));
        this.loadReportData(true);
    }

    componentWillUnmount() {
        // Unsubscribe from org changes
        if (this.orgUnsubscribe) {
            this.orgUnsubscribe();
        }
    }

    async loadReportData(refresh = false) {
        this.setState(refresh
            ? { refreshing: true, error: null }
            : { loading: true, error: null });

        try {
            const orgContext = window.orgContext;
            const currentOrg = orgContext.getCurrentOrg();

            if (!currentOrg) {
                this.setState({ error: 'No organization selected', loading: false, refreshing: false });
                return;
            }

            // Check if user is Site Admin (from auth session)
            const user = window.auth.getUser();
            const isSiteAdmin = user?.userType === 'SiteAdmin';

            // Fetch latest snapshot and org details using API client
            const response = await window.api.getReportPreview(currentOrg.orgId, refresh);

            if (!response.success) {
                throw new Error(response.message || 'Failed to load report preview');
            }

            const { snapshot, org, history, rendered } = response.data;

            this.setState({
                loading: false,
                refreshing: false,
                snapshot,
                orgData: org,
                isSiteAdmin,
                history: history || [],
                rendered: rendered || null,
                isFromCache: rendered?.isFromCache ?? false,
                cachedAt: rendered?.cachedAt ?? null
            });
        } catch (err) {
            console.error('Error loading report preview:', err);
            this.setState({
                loading: false,
                refreshing: false,
                error: err.message || 'Failed to load report preview'
            });
        }
    }

    handleReportTypeChange = (reportType) => {
        this.setState({ reportType, emailSent: false });
    }

    handleRefreshPreview = () => {
        this.loadReportData(true);
    }

    handleSendEmail = async (recipient = 'owner', customEmail = '') => {
        const { reportType } = this.state;
        const orgContext = window.orgContext;
        const currentOrg = orgContext.getCurrentOrg();

        this.setState({ sendingEmail: true, emailSent: false, error: null, emailMessage: null, showSendMenu: false });

        try {
            const response = await window.api.sendReport(currentOrg.orgId, reportType, recipient, customEmail);

            if (!response.success) {
                throw new Error(response.message || 'Failed to send report email');
            }

            this.setState({ sendingEmail: false, emailSent: true, emailMessage: response.message });

            setTimeout(() => {
                this.setState({ emailSent: false, emailMessage: null });
            }, 5000);
        } catch (err) {
            console.error('Error sending test email:', err);
            this.setState({
                sendingEmail: false,
                error: err.message || 'Failed to send test email'
            });
        }
    }

    renderReportTypeSelector() {
        const { reportType, orgData } = this.state;
        const types = [
            { id: 'daily', label: 'Daily Report', description: 'Security snapshot sent every day' },
            { id: 'weekly', label: 'Weekly Brief', description: 'Business summary sent every Monday' }
        ];

        return html`
            <div className="tier-selector">
                <div className="selector-header">
                    <div>
                        <div className="eyebrow">Report Type</div>
                        <div className="selector-sub">Preview the email template delivered to your organization</div>
                    </div>
                    <div className="pill-context">${orgData?.name || 'Org'}</div>
                </div>
                <div className="tier-segmented" style="grid-template-columns: repeat(2, 1fr);">
                    ${types.map(t => html`
                        <button
                            key=${t.id}
                            className=${`segment ${reportType === t.id ? 'active' : ''}`}
                            onClick=${() => this.handleReportTypeChange(t.id)}
                            title=${t.description}
                        >
                            <span className="segment-label">${t.label}</span>
                        </button>`
                    )}
                </div>
            </div>
        `;
    }

    renderEmailPreview() {
        const { snapshot, reportType, rendered, previewTheme, previewViewport } = this.state;

        if (!snapshot) {
            return html`<div className="email-preview-empty">No snapshot data available</div>`;
        }

        if (!rendered) {
            return html`<div className="email-preview-empty">Report preview is still loading</div>`;
        }

        const content = rendered[reportType] || '';

        if (!content) {
            return html`<div className="email-preview-empty">No preview available for ${reportType}</div>`;
        }

        const guidance = reportType === 'daily'
            ? {
                eyebrow: 'Daily mission',
                title: 'Give the owner one clear next step',
                body: 'This brief should make it obvious which vulnerable application to patch first, why it matters, and what improvement to expect after action.'
            }
            : {
                eyebrow: 'Weekly mission',
                title: 'Summarize posture for leadership and operations',
                body: 'This brief should combine posture, trend, SLA risk, compliance, hygiene, insurance readiness, and audit direction in one email-safe view.'
            };

        const shellStyle = `background:${previewTheme === 'dark' ? '#0f172a' : '#f8fafc'};border:1px solid ${previewTheme === 'dark' ? '#1e293b' : '#e2e8f0'};`;
        const frameShellStyle = `max-width:${previewViewport === 'mobile' ? '430px' : '760px'};margin:0 auto;background:${previewTheme === 'dark' ? '#111827' : '#ffffff'};border:1px solid ${previewTheme === 'dark' ? '#334155' : '#dbe7f3'};border-radius:14px;padding:16px;box-shadow:0 10px 30px rgba(15,23,42,.12);`;

        return html`
            <div className="email-preview-container" style=${shellStyle}>
                <div className="preview-guidance">
                    <div className="preview-guidance__eyebrow">${guidance.eyebrow}</div>
                    <div className="preview-guidance__title">${guidance.title}</div>
                    <div className="preview-guidance__body">${guidance.body}</div>
                </div>
                <div className="preview-meta">
                    ${rendered.isFromCache && rendered.cachedAt
                        ? html`<span className="chip chip-sent">Sent ${new Date(rendered.cachedAt).toLocaleString()}</span>`
                        : html`<span className="chip">Live Preview</span>`
                    }
                    <span className="chip">${reportType === 'daily' ? 'Daily' : 'Weekly'}</span>
                    <span className="chip chip-muted">${previewTheme === 'dark' ? 'Dark inbox' : 'Light inbox'}</span>
                    <span className="chip chip-muted">${previewViewport === 'mobile' ? 'Mobile width' : 'Desktop width'}</span>
                </div>
                <div style=${frameShellStyle}>
                    <iframe
                        className="email-preview-iframe"
                        title=${`${reportType} email preview`}
                        srcdoc=${content}
                    ></iframe>
                </div>
            </div>
        `;
    }

    render() {
        const { loading, error, snapshot, reportType, sendingEmail, emailSent, emailMessage, orgData, showSendMenu, refreshing } = this.state;
        const { embedded } = this.props;
        const containerClass = embedded ? 'embedded-preview' : 'page-container';

        if (loading) {
            return html`
                <div className=${containerClass}>
                    <div className="loading-spinner">Loading report preview...</div>
                </div>
            `;
        }

        if (error) {
            return html`
                <div className=${containerClass}>
                    <div className="error-alert">${error}</div>
                </div>
            `;
        }

        return html`
            <div className=${containerClass}>
                ${!embedded && html`
                    <div class="page-header d-print-none mb-3">
                        <div class="container-xl">
                            <h2 class="page-title">
                                <svg class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                                </svg>
                                Report Preview
                            </h2>
                            <div class="page-subtitle">
                                <span class="text-muted">Preview email reports for ${orgData?.name || 'your organization'}</span>
                            </div>
                        </div>
                    </div>
                `}

                ${this.renderReportTypeSelector()}

                <div className="report-actions">
                    <div className="send-group">
                        <button
                            className="btn btn-primary"
                            onClick=${() => this.handleSendEmail('owner')}
                            disabled=${sendingEmail || !snapshot}
                        >
                            ${sendingEmail ? 'Sending...' : 'Send To Owner'}
                        </button>
                        <button
                            className="btn btn-secondary split-toggle"
                            onClick=${() => this.setState({ showSendMenu: !showSendMenu })}
                            disabled=${sendingEmail || !snapshot}
                        >
                            <span className="chevron">▾</span>
                        </button>
                        ${showSendMenu && html`
                            <div className="split-menu">
                                <button onClick=${() => {
                                    const email = window.prompt('Send to which email?');
                                    if (email) this.handleSendEmail('custom', email);
                                }}>Send To Custom…</button>
                            </div>
                        `}
                    </div>
                    <button
                        className="btn btn-outline"
                        onClick=${this.handleRefreshPreview}
                        disabled=${refreshing || !snapshot}
                        title="Regenerate preview from current backend logic (does not overwrite cached sent email)"
                    >
                        ${refreshing ? 'Refreshing\u2026' : '\u21ba Refresh Preview'}
                    </button>
                    ${emailSent && html`<span className="success-message">${emailMessage || '\u2713 Sent successfully'}</span>`}
                </div>

                <div className="report-preview-section">
                    <div className="preview-header">
                        <div>
                            <h2>Email Preview: ${reportType === 'daily' ? 'Daily Report' : 'Weekly Brief'}</h2>
                            <p className="preview-sub">Rendered HTML matches the outbound email template and can be reviewed against light and dark inbox backgrounds.</p>
                        </div>
                        <div className="preview-toggles">
                            <button className=${`ghost-btn preview-toggle ${this.state.previewTheme === 'light' ? 'active' : ''}`} onClick=${() => this.setState({ previewTheme: 'light' })}>Light inbox</button>
                            <button className=${`ghost-btn preview-toggle ${this.state.previewTheme === 'dark' ? 'active' : ''}`} onClick=${() => this.setState({ previewTheme: 'dark' })}>Dark inbox</button>
                            <button className=${`ghost-btn preview-toggle ${this.state.previewViewport === 'desktop' ? 'active' : ''}`} onClick=${() => this.setState({ previewViewport: 'desktop' })}>Desktop</button>
                            <button className=${`ghost-btn preview-toggle ${this.state.previewViewport === 'mobile' ? 'active' : ''}`} onClick=${() => this.setState({ previewViewport: 'mobile' })}>Mobile</button>
                        </div>
                    </div>
                    ${this.renderEmailPreview()}
                </div>

                <style>${`
                    .page-container, .embedded-preview {
                        padding: 0 12px;
                    }
                    .selector-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 12px;
                    }
                    .eyebrow { font-size: 12px; letter-spacing: 0.05em; color: var(--tblr-secondary, #94a3b8); text-transform: uppercase; }
                    .selector-sub { color: var(--tblr-muted-color, #475569); font-size: 14px; }
                    .pill-context {
                        background: var(--tblr-bg-surface-secondary, #f1f5f9);
                        padding: 8px 12px;
                        border-radius: 999px;
                        color: var(--tblr-body-color, #0f172a);
                        font-weight: 600;
                        font-size: 13px;
                    }
                    .tier-selector {
                        background: var(--tblr-bg-surface-secondary, #f8fafc);
                        padding: 20px;
                        border-radius: 8px;
                        margin-bottom: 24px;
                        border: 1px solid var(--tblr-border-color, #e2e8f0);
                    }
                    .tier-segmented {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 6px;
                        margin-top: 10px;
                    }
                    .segment {
                        background: var(--tblr-bg-surface, white);
                        border: 2px solid var(--tblr-border-color, #cbd5e1);
                        border-radius: 8px;
                        padding: 8px 10px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        cursor: pointer;
                        font-weight: 600;
                        color: var(--tblr-body-color, #0f172a);
                        transition: all 0.2s ease;
                        font-size: 13px;
                    }
                    .segment:hover:not(:disabled) { border-color: #6366f1; box-shadow: 0 4px 12px rgba(99,102,241,0.12); }
                    .segment.active { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border-color: transparent; box-shadow: 0 6px 16px rgba(99,102,241,0.25); }
                    .segment:disabled { opacity: 0.55; cursor: not-allowed; }
                    .segment-icon { font-size: 16px; }
                    .segment-label { font-size: 12px; }
                    .segment-locked { margin-left: auto; }
                    .tier-note {
                        font-size: 13px;
                        color: var(--tblr-muted-color, #64748b);
                        margin: 10px 0 0 0;
                    }
                    .report-actions {
                        display: flex;
                        gap: 12px;
                        align-items: center;
                        margin-bottom: 20px;
                    }
                    .send-group { position: relative; display: inline-flex; align-items: stretch; }
                    .btn { border: none; border-radius: 6px; padding: 8px 14px; font-weight: 600; cursor: pointer; font-size: 13px; }
                    .btn-primary { background: linear-gradient(135deg, #0ea5e9, #6366f1); color: white; }
                    .btn-secondary { background: #e2e8f0; color: #0f172a; }
                    .btn-outline { background: white; border: 1px solid #cbd5e1; color: #374151; }
                    .btn-outline:hover:not(:disabled) { background: #f8fafc; border-color: #94a3b8; }
                    .btn:disabled { opacity: 0.55; cursor: not-allowed; }
                    .split-toggle { margin-left: 2px; padding: 8px 8px; }
                    .chevron { font-size: 12px; }
                    .split-menu {
                        position: absolute;
                        top: 100%;
                        right: 0;
                        background: white;
                        border: 1px solid #e2e8f0;
                        box-shadow: 0 8px 18px rgba(15,23,42,0.12);
                        border-radius: 8px;
                        min-width: 180px;
                        z-index: 20;
                        display: flex;
                        flex-direction: column;
                    }
                    .split-menu button {
                        background: white;
                        border: none;
                        padding: 10px 14px;
                        text-align: left;
                        cursor: pointer;
                        font-weight: 600;
                    }
                    .split-menu button:hover { background: #f8fafc; }
                    .success-message { color: #10b981; font-weight: 700; }
                    .report-preview-section h2 { margin: 0; color: #1e293b; }
                    .preview-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
                    .preview-sub { margin: 4px 0 0 0; color: #475569; font-size: 14px; }
                    .preview-toggles { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
                    .chip { background: #eef2ff; color: #3730a3; padding: 6px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; }
                    .chip-muted { background: #f1f5f9; color: #475569; }
                    .chip-sent { background: #f0fdf4; color: #166534; }
                    .ghost-btn { background: transparent; border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 6px; color: #475569; cursor: pointer; }
                    .preview-toggle.active { background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fff; border-color: transparent; }
                    .email-preview-container {
                        border-radius: 10px;
                        padding: 20px;
                        max-width: 980px;
                        margin: 0 auto;
                        box-shadow: 0 6px 24px rgba(15,23,42,0.08);
                    }
                    .preview-guidance { background: rgba(255,255,255,.86); border: 1px solid #dbe7f3; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }
                    .preview-guidance__eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6366f1; margin-bottom: 4px; }
                    .preview-guidance__title { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
                    .preview-guidance__body { font-size: 13px; color: #475569; line-height: 1.5; }
                    .preview-meta { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
                    .email-preview-frame { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                    .email-preview-iframe { width: 100%; min-height: 1200px; border: 0; border-radius: 10px; background: #ffffff; display: block; }
                    .email-preview-empty { text-align: center; padding: 60px 20px; font-size: 16px; color: #475569; }
                `}</style>
            </div>
        `;
    }
}

export default ReportPreviewPage;
