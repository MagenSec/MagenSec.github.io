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
            emailSent: false
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

    handleSendTestEmail = async () => {
        const { selectedTier } = this.state;
        const orgContext = window.orgContext;
        const currentOrg = orgContext.getCurrentOrg();

        this.setState({ sendingEmail: true, emailSent: false, error: null });

        try {
            // Use API client for proper base URL handling
            const response = await window.api.sendTestReport(currentOrg.orgId, selectedTier);

            if (!response.success) {
                throw new Error(response.message || 'Failed to send test email');
            }

            this.setState({ sendingEmail: false, emailSent: true });

            setTimeout(() => {
                this.setState({ emailSent: false });
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
        const tiers = ['Basic', 'Professional', 'Premium'];

        return html`
            <div className="tier-selector">
                <label>Report Tier:</label>
                <div className="tier-buttons">
                    ${tiers.map(tier => html`
                        <button
                            key=${tier}
                            className=${`tier-btn ${selectedTier === tier ? 'active' : ''}`}
                            onClick=${() => this.handleTierChange(tier)}
                            disabled=${!isSiteAdmin && orgData?.licenseType === 'Personal' && tier !== 'Basic'}
                        >
                            ${tier}
                            ${!isSiteAdmin && orgData?.licenseType === 'Personal' && tier !== 'Basic' && html`
                                <span className="locked">🔒</span>
                            `}
                        </button>
                    `)}
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
                <div className="email-preview-frame" dangerouslySetInnerHTML=${{ __html: content }}></div>
            </div>
        `;
    }

    render() {
        const { loading, error, snapshot, selectedTier, sendingEmail, emailSent, orgData } = this.state;

        if (loading) {
            return html`
                <div className="page-container">
                    <div className="loading-spinner">Loading report preview...</div>
                </div>
            `;
        }

        if (error) {
            return html`
                <div className="page-container">
                    <div className="error-alert">${error}</div>
                </div>
            `;
        }

        return html`
            <div className="page-container">
                <div className="page-header">
                    <h1>Security Report Preview</h1>
                    <p className="page-subtitle">
                        Visualize email reports that ${orgData?.name || 'your organization'} will receive
                    </p>
                </div>

                ${this.renderTierSelector()}

                <div className="report-actions">
                    <button
                        className="btn btn-primary"
                        onClick=${this.handleSendTestEmail}
                        disabled=${sendingEmail || !snapshot}
                    >
                        ${sendingEmail ? 'Sending...' : 'Send Test Email'}
                    </button>
                    ${emailSent && html`
                        <span className="success-message">✓ Test email sent successfully</span>
                    `}
                </div>

                <div className="report-preview-section">
                    <h2>Email Preview: ${selectedTier} Tier</h2>
                    ${this.renderEmailPreview()}
                </div>

                <style>${`
                    .tier-selector {
                        background: #f8fafc;
                        padding: 20px;
                        border-radius: 8px;
                        margin-bottom: 30px;
                    }
                    .tier-selector label {
                        display: block;
                        font-weight: 600;
                        margin-bottom: 12px;
                        color: #1e293b;
                    }
                    .tier-buttons {
                        display: flex;
                        gap: 12px;
                        margin-bottom: 12px;
                    }
                    .tier-btn {
                        flex: 1;
                        padding: 12px 24px;
                        background: white;
                        border: 2px solid #cbd5e1;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                        transition: all 0.2s;
                    }
                    .tier-btn:hover:not(:disabled) {
                        border-color: #667eea;
                        background: #f0f4ff;
                    }
                    .tier-btn.active {
                        border-color: #667eea;
                        background: #667eea;
                        color: white;
                    }
                    .tier-btn:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                    .tier-btn .locked {
                        margin-left: 8px;
                    }
                    .tier-note {
                        font-size: 14px;
                        color: #64748b;
                        margin: 8px 0 0 0;
                    }
                    .report-actions {
                        display: flex;
                        gap: 16px;
                        align-items: center;
                        margin-bottom: 30px;
                    }
                    .success-message {
                        color: #10b981;
                        font-weight: 600;
                    }
                    .report-preview-section h2 {
                        margin-bottom: 20px;
                        color: #1e293b;
                    }
                    .email-preview-container {
                        background: white;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        padding: 40px;
                        max-width: 600px;
                        margin: 0 auto;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    .email-preview-frame {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    }
                    .email-preview-empty {
                        text-align: center;
                        padding: 60px 20px;
               ReportPreviewPage
                        font-size: 16px;
                    }
                `}</style>
            </div>
        `;
    }
}

export default ReportPreviewPage;
