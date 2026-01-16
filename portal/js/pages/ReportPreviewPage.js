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

            const { snapshot, org, defaultTier } = response.data;

            this.setState({
                loading: false,
                snapshot,
                orgData: org,
                selectedTier: this.state.selectedTier || defaultTier,
                isSiteAdmin
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
        const { snapshot, orgData, selectedTier } = this.state;

        if (!snapshot) {
            return html`<div className="email-preview-empty">No snapshot data available</div>`;
        }

        const score = snapshot.risk?.orgScore || 0;
        const grade = snapshot.risk?.grade || 'F';
        const critical = snapshot.findings?.bySeverity?.Critical || 0;
        const high = snapshot.findings?.bySeverity?.High || 0;

        const gradeColor = {
            'A': '#10b981',
            'B': '#3b82f6',
            'C': '#f59e0b',
            'D': '#f97316'
        }[grade] || '#ef4444';

        // Common header
        const header = `
            <div style="background: linear-gradient(135deg, ${gradeColor}15, ${gradeColor}05); border-left: 4px solid ${gradeColor}; padding: 20px; margin-bottom: 30px; border-radius: 4px;">
                <div style="font-size: 48px; font-weight: 700; color: ${gradeColor};">${score}</div>
                <div style="font-size: 20px; color: #1e293b; margin-top: 8px;">Grade <strong>${grade}</strong></div>
            </div>
        `;

        let content = '';

        if (selectedTier === 'Basic') {
            content = `
                ${header}
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                    <div style="background: #fee2e2; padding: 16px; border-radius: 4px; text-align: center;">
                        <div style="font-size: 24px; font-weight: 700; color: #dc2626;">${critical}</div>
                        <div style="font-size: 12px; color: #991b1b; margin-top: 4px;">Critical</div>
                    </div>
                    <div style="background: #fef3c7; padding: 16px; border-radius: 4px; text-align: center;">
                        <div style="font-size: 24px; font-weight: 700; color: #d97706;">${high}</div>
                        <div style="font-size: 12px; color: #92400e; margin-top: 4px;">High</div>
                    </div>
                </div>
            `;
        } else if (selectedTier === 'Professional') {
            const domains = snapshot.risk?.domainScores || {};
            const actions = snapshot.actions?.prioritized?.slice(0, 10) || [];

            const domainBars = Object.entries(domains).map(([name, score]) => `
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-size: 13px; font-weight: 600;">${name}</span>
                        <span style="font-size: 13px; color: ${score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#dc2626'};">${score}/100</span>
                    </div>
                    <div style="background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: ${score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#dc2626'}; width: ${score}%; height: 100%;"></div>
                    </div>
                </div>
            `).join('');

            const actionList = actions.map((action, i) => `
                <li style="margin-bottom: 12px;">
                    <strong>${action.title}</strong>
                    <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
                        Priority: ${action.priority} | Effort: ${action.effort} | Risk Reduction: ${action.riskReduction}%
                    </div>
                </li>
            `).join('');

            content = `
                ${header}
                <h3 style="margin-top: 30px;">Domain Scores</h3>
                ${domainBars}
                <h3 style="margin-top: 30px;">Top 10 Actions</h3>
                <ol style="padding-left: 20px;">
                    ${actionList}
                </ol>
            `;
        } else if (selectedTier === 'Premium') {
            const deviceRisks = snapshot.risk?.topDeviceRisks?.slice(0, 5) || [];
            const complianceScore = snapshot.compliance?.score || 0;

            const deviceTable = deviceRisks.map((device, i) => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px; font-weight: 600;">${i + 1}</td>
                    <td style="padding: 12px;">${device.deviceName || device.deviceId}</td>
                    <td style="padding: 12px; text-align: center;">
                        <span style="color: ${device.score >= 80 ? '#10b981' : device.score >= 60 ? '#f59e0b' : '#dc2626'};">
                            ${device.score}
                        </span>
                    </td>
                    <td style="padding: 12px; text-align: center; color: #dc2626;">${device.critical}</td>
                    <td style="padding: 12px; text-align: center; color: #d97706;">${device.high}</td>
                </tr>
            `).join('');

            content = `
                ${header}
                <div style="background: #f1f5f9; padding: 20px; border-radius: 4px; margin-bottom: 30px;">
                    <h3 style="margin: 0 0 8px 0;">Compliance Score</h3>
                    <div style="font-size: 32px; font-weight: 700; color: ${complianceScore >= 80 ? '#10b981' : complianceScore >= 60 ? '#f59e0b' : '#dc2626'};">
                        ${complianceScore}/100
                    </div>
                </div>
                <h3>Top At-Risk Devices</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1;">
                            <th style="padding: 12px; text-align: left;">Rank</th>
                            <th style="padding: 12px; text-align: left;">Device</th>
                            <th style="padding: 12px; text-align: center;">Score</th>
                            <th style="padding: 12px; text-align: center;">Critical</th>
                            <th style="padding: 12px; text-align: center;">High</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${deviceTable}
                    </tbody>
                </table>
            `;
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
