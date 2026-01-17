const { html, Component } = window;

/**
 * Report Preview Page - Visualize email reports that customers receive
 * Shows Basic, Professional, and Premium tier email templates
 * Site Admins can switch between tiers, regular users see their tier
 */
class ReportPreviewPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            snapshot: null,
            orgData: null,
            renderedByTier: null,
            selectedTier: null, // Basic, Professional, Premium
            isSiteAdmin: false,
            sendingEmail: false,
            emailSent: false,
            emailMessage: null,
            showSendMenu: false
        };
    }

    componentDidMount() {
        // Subscribe to org changes
        this.orgUnsubscribe = window.orgContext.onChange(() => this.loadReportData());
        this.loadReportData();
    }

    componentWillUnmount() {
        // Unsubscribe from org changes
        if (this.orgUnsubscribe) {
            this.orgUnsubscribe();
        }
    }

    async loadReportData() {
        this.setState({ loading: true, error: null });

        try {
            const orgContext = window.orgContext;
            const currentOrg = orgContext.getCurrentOrg();

            if (!currentOrg) {
                this.setState({ error: 'No organization selected', loading: false });
                return;
            }

            // Check if user is Site Admin (from auth session)
            const user = window.auth.getUser();
            const isSiteAdmin = user?.userType === 'SiteAdmin';

            // Fetch latest snapshot and org details using API client
            const response = await window.api.getReportPreview(currentOrg.orgId);

            if (!response.success) {
                throw new Error(response.message || 'Failed to load report preview');
            }

            const { snapshot, org, defaultTier, history, rendered } = response.data;

            this.setState({
                loading: false,
                snapshot,
                orgData: org,
                selectedTier: this.state.selectedTier || defaultTier,
                isSiteAdmin,
                history: history || [],
                renderedByTier: rendered || null
            });
        } catch (err) {
            console.error('Error loading report preview:', err);
            this.setState({ 
                loading: false, 
                error: err.message || 'Failed to load report preview' 
            });
        }
    }

    handleTierChange = (tier) => {
        this.setState({ selectedTier: tier, emailSent: false });
    }

    handleSendEmail = async (recipient = 'owner', customEmail = '') => {
        const { selectedTier } = this.state;
        const orgContext = window.orgContext;
        const currentOrg = orgContext.getCurrentOrg();

        this.setState({ sendingEmail: true, emailSent: false, error: null, emailMessage: null, showSendMenu: false });

        try {
            const response = await window.api.sendReport(currentOrg.orgId, selectedTier, recipient, customEmail);

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

    renderTierSelector() {
        const { selectedTier, isSiteAdmin, orgData } = this.state;
        const tiers = [
            { name: 'Basic', icon: '📰', description: 'Awareness' },
            { name: 'Professional', icon: '📊', description: 'Direction' },
            { name: 'Premium', icon: '⭐', description: 'Confidence' }
        ];

        return html`
            <div className="tier-selector">
                <div className="selector-header">
                    <div>
                        <div className="eyebrow">Report Tier</div>
                        <div className="selector-sub">Switch to preview exactly what emails render per tier</div>
                    </div>
                    <div className="pill-context">${orgData?.name || 'Org'} · Default: ${orgData?.licenseType === 'Personal' ? 'Basic' : 'Professional'}</div>
                </div>
                <div className="tier-segmented">
                    ${tiers.map(tier => {
                        const locked = !isSiteAdmin && orgData?.licenseType === 'Personal' && tier.name !== 'Basic';
                        const active = selectedTier === tier.name;
                        return html`
                            <button
                                key=${tier.name}
                                className=${`segment ${active ? 'active' : ''}`}
                                onClick=${() => this.handleTierChange(tier.name)}
                                disabled=${locked}
                                title=${tier.description}
                            >
                                <span className="segment-icon">${tier.icon}</span>
                                <span className="segment-label">${tier.name}</span>
                                ${locked && html`<span className="segment-locked">🔒</span>`}
                            </button>`;
                    })}
                </div>
                ${!isSiteAdmin && html`
                    <p className="tier-note">
                        ${orgData?.licenseType === 'Personal' 
                            ? 'Personal licenses: Basic tier only. Upgrade to Business for Professional tier.'
                            : 'Business licenses: Professional tier included. Premium available as add-on.'
                        }
                    </p>
                `}
            </div>
        `;
    }

    renderEmailPreview() {
        const { snapshot, selectedTier, renderedByTier } = this.state;

        if (!snapshot) {
            return html`<div className="email-preview-empty">No snapshot data available</div>`;
        }

        if (!renderedByTier || !selectedTier) {
            return html`<div className="email-preview-empty">Report preview is still loading</div>`;
        }

        const key = selectedTier.toLowerCase();
        const content = renderedByTier[key] || '';

        if (!content) {
            return html`<div className="email-preview-empty">No preview available for ${selectedTier}</div>`;
        }

        return html`
            <div className="email-preview-container">
                <div className="preview-meta">
                    <span className="chip">Latest Snapshot</span>
                    <span className="chip">Daily</span>
                    <span className="chip chip-muted">7d history loaded</span>
                </div>
                <div className="email-preview-frame" dangerouslySetInnerHTML=${{ __html: content }}></div>
            </div>
        `;
    }

    render() {
        const { loading, error, snapshot, selectedTier, sendingEmail, emailSent, emailMessage, orgData, showSendMenu } = this.state;
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
                    <div className="page-header">
                        <h1>Security Report Preview</h1>
                        <p className="page-subtitle">
                            Visualize email reports that ${orgData?.name || 'your organization'} will receive
                        </p>
                    </div>
                `}

                ${this.renderTierSelector()}

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
                    ${emailSent && html`<span className="success-message">${emailMessage || '✓ Sent successfully'}</span>`}
                </div>

                <div className="report-preview-section">
                    <div className="preview-header">
                        <div>
                            <h2>Email Preview: ${selectedTier} Tier</h2>
                            <p className="preview-sub">Rendered HTML matches the outbound email template.</p>
                        </div>
                        <div className="preview-toggles">
                            <span className="chip">HTML</span>
                            <button className="ghost-btn" onClick=${() => this.setState({})} disabled>Plain Text (soon)</button>
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
                    .eyebrow { font-size: 12px; letter-spacing: 0.05em; color: #94a3b8; text-transform: uppercase; }
                    .selector-sub { color: #475569; font-size: 14px; }
                    .pill-context {
                        background: #f1f5f9;
                        padding: 8px 12px;
                        border-radius: 999px;
                        color: #0f172a;
                        font-weight: 600;
                        font-size: 13px;
                    }
                    .tier-selector {
                        background: #f8fafc;
                        padding: 20px;
                        border-radius: 8px;
                        margin-bottom: 24px;
                        border: 1px solid #e2e8f0;
                    }
                    .tier-segmented {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 6px;
                        margin-top: 10px;
                    }
                    .segment {
                        background: white;
                        border: 2px solid #cbd5e1;
                        border-radius: 8px;
                        padding: 8px 10px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        cursor: pointer;
                        font-weight: 600;
                        color: #0f172a;
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
                        color: #64748b;
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
                    .preview-toggles { display: flex; gap: 8px; align-items: center; }
                    .chip { background: #eef2ff; color: #3730a3; padding: 6px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; }
                    .chip-muted { background: #f1f5f9; color: #475569; }
                    .ghost-btn { background: transparent; border: 1px dashed #cbd5e1; padding: 6px 10px; border-radius: 6px; color: #94a3b8; cursor: not-allowed; }
                    .email-preview-container {
                        background: white;
                        border: 1px solid #e2e8f0;
                        border-radius: 10px;
                        padding: 32px;
                        max-width: 760px;
                        margin: 0 auto;
                        box-shadow: 0 6px 24px rgba(15,23,42,0.08);
                    }
                    .preview-meta { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
                    .email-preview-frame { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                    .email-preview-empty { text-align: center; padding: 60px 20px; font-size: 16px; color: #475569; }
                `}</style>
            </div>
        `;
    }
}

export default ReportPreviewPage;
