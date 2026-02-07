// DocumentationHub component using window.htm (HTM - Hyperscript Tagged Markup)
const { html } = window.htm;

function DocumentationHub({ currentTab = 'getting-started' }) {
    return html`
        <div class="page-wrapper">
            <div class="page-body">
                <div class="container-xl">
                    <h1>Documentation Hub</h1>
                    <p>Find guides, tutorials, and best practices for MagenSec.</p>
                    
                    <h2>Getting Started</h2>
                    <p>Learn the basics of MagenSec and how to set up your first scan.</p>
                    
                    <h2>Features</h2>
                    <p>Explore all the powerful features MagenSec offers for security assessment.</p>
                    
                    <h2>API Reference</h2>
                    <p>Integrate MagenSec with your existing tools and workflows.</p>
                </div>
            </div>
        </div>
    `;
}

export { DocumentationHub };
                background: #f0f7ff;
            }
            
            .formula-box {
                background: #f8f9fa;
                border-left: 4px solid #0054a6;
                padding: 16px;
                border-radius: 4px;
                margin: 16px 0;
                font-family: 'Monaco', 'Courier New', monospace;
                font-size: 13px;
                overflow-x: auto;
            }
            
            .example-card {
                background: white;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
            }
            
            .example-header {
                font-weight: 600;
                color: #333;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .metric-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #f0f0f0;
                align-items: center;
            }
            
            .metric-row:last-child {
                border-bottom: none;
            }
            
            .metric-label {
                color: #666;
                font-size: 13px;
            }
            
            .metric-value {
                font-weight: 600;
                color: #333;
            }
            
            .nav-tabs-custom {
                display: flex;
                gap: 8px;
                border-bottom: 2px solid #e0e0e0;
                margin-bottom: 24px;
                flex-wrap: wrap;
            }
            
            .tab-btn {
                padding: 12px 16px;
                background: none;
                border: none;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                color: #666;
                border-bottom: 3px solid transparent;
                margin-bottom: -2px;
                transition: all 0.2s;
            }
            
            .tab-btn:hover {
                color: #333;
            }
            
            .tab-btn.active {
                color: #0054a6;
                border-bottom-color: #0054a6;
            }
            
            .alert-box {
                padding: 12px 16px;
                border-radius: 4px;
                margin-bottom: 16px;
                border-left: 4px solid;
            }
            
            .alert-info {
                background: #f0f7ff;
                border-left-color: #0054a6;
                color: #003d8a;
            }
            
            .alert-warning {
                background: #fff7e6;
                border-left-color: #f59f00;
                color: #704a00;
            }
            
            .alert-success {
                background: #f0fdf4;
                border-left-color: #2fb344;
                color: #166534;
            }
            
            .comparison-table {
                width: 100%;
                border-collapse: collapse;
                margin: 16px 0;
            }
            
            .comparison-table th,
            .comparison-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #e0e0e0;
            }
            
            .comparison-table th {
                background: #f5f5f5;
                font-weight: 600;
                color: #333;
            }
            
            .comparison-table tbody tr:hover {
                background: #f9f9f9;
            }
            
            .step-card {
                background: #f9f9f9;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 12px;
                display: flex;
                gap: 16px;
            }
            
            .step-number {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 40px;
                height: 40px;
                background: #0054a6;
                color: white;
                border-radius: 50%;
                font-weight: bold;
                flex-shrink: 0;
            }
            
            .step-content {
                flex: 1;
            }
            
            .step-content h4 {
                margin: 0 0 8px 0;
                color: #333;
            }
            
            .step-content p {
                margin: 0;
                color: #666;
                font-size: 13px;
            }
            
            .faq-item {
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                margin-bottom: 12px;
                overflow: hidden;
            }
            
            .faq-question {
                padding: 12px 16px;
                background: #f9f9f9;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-weight: 500;
                color: #333;
                transition: background 0.2s;
            }
            
            .faq-question:hover {
                background: #f0f0f0;
            }
            
            .faq-arrow {
                transition: transform 0.2s;
                transform: rotate(0deg);
            }
            
            .faq-arrow.open {
                transform: rotate(180deg);
            }
            
            .faq-answer {
                padding: 12px 16px;
                background: white;
                color: #666;
                font-size: 13px;
                line-height: 1.6;
                max-height: 0;
                overflow: hidden;
                transition: max-height 0.3s ease-out;
            }
            
            .faq-answer.open {
                max-height: 500px;
            }
            
            .glossary-term {
                margin-bottom: 16px;
            }
            
            .glossary-term strong {
                display: block;
                color: #0054a6;
                margin-bottom: 4px;
            }
            
            .glossary-term p {
                margin: 0;
                color: #666;
                font-size: 13px;
                line-height: 1.6;
            }

            .widget-preview {
                background: #f9f9f9;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 12px;
                margin: 12px 0;
                font-size: 12px;
                font-family: monospace;
            }

            .best-practice-card {
                background: #f0fdf4;
                border: 1px solid #86efac;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 12px;
            }

            .best-practice-title {
                font-weight: 600;
                color: #166534;
                margin-bottom: 8px;
            }

            .best-practice-desc {
                color: #15803d;
                font-size: 13px;
                line-height: 1.6;
                margin: 0;
            }
        `;
    }

    render() {
        return html`
            <div class="page-wrapper">
                <div class="page-header d-print-none sticky-top bg-white">
                    <div class="container-xl">
                        <div class="row align-items-center">
                            <div class="col">
                                <h2 class="page-title">
                                    Documentation & Help Center
                                </h2>
                                <div class="text-muted">
                                    Everything you need to know about MagenSec security posture management.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="page-body">
                    <div class="container-xl">
                        <!-- Navigation Tabs -->
                        <div class="nav-tabs-custom">
                            <button class="tab-btn ${this.currentTab === 'getting-started' ? 'active' : ''}" 
                                    @click=${() => this.setTab('getting-started')}>
                                Getting Started
                            </button>
                            <button class="tab-btn ${this.currentTab === 'scoring' ? 'active' : ''}" 
                                    @click=${() => this.setTab('scoring')}>
                                Score Interpretation
                            </button>
                            <button class="tab-btn ${this.currentTab === 'dashboard' ? 'active' : ''}" 
                                    @click=${() => this.setTab('dashboard')}>
                                Understanding Dashboard
                            </button>
                            <button class="tab-btn ${this.currentTab === 'best-practices' ? 'active' : ''}" 
                                    @click=${() => this.setTab('best-practices')}>
                                Best Practices
                            </button>
                            <button class="tab-btn ${this.currentTab === 'faq' ? 'active' : ''}" 
                                    @click=${() => this.setTab('faq')}>
                                FAQ
                            </button>
                            <button class="tab-btn ${this.currentTab === 'glossary' ? 'active' : ''}" 
                                    @click=${() => this.setTab('glossary')}>
                                Glossary
                            </button>
                            <button class="tab-btn ${this.currentTab === 'api' ? 'active' : ''}" 
                                    @click=${() => this.setTab('api')}>
                                API Reference
                            </button>
                            <button class="tab-btn ${this.currentTab === 'security' ? 'active' : ''}" 
                                    @click=${() => this.setTab('security')}>
                                Security & Privacy
                            </button>
                        </div>

                        ${this.renderTabContent()}
                    </div>
                </div>
            </div>
        `;
    }

    renderTabContent() {
        switch(this.currentTab) {
            case 'getting-started':
                return this.renderGettingStarted();
            case 'scoring':
                return this.renderScoring();
            case 'dashboard':
                return this.renderDashboard();
            case 'best-practices':
                return this.renderBestPractices();
            case 'faq':
                return this.renderFAQ();
            case 'glossary':
                return this.renderGlossary();
            case 'api':
                return this.renderAPI();
            case 'security':
                return this.renderSecurity();
            default:
                return html`<p>Select a tab to view documentation</p>`;
        }
    }

    renderGettingStarted() {
        return html`
            <div class="row">
                <div class="col-md-12">
                    <h3>Getting Started with MagenSec</h3>
                    <p>
                        Welcome to MagenSec! This guide will help you get up and running in just a few minutes.
                    </p>

                    <h4 style="margin-top: 24px;">Step 1: Set Up Your First Organization</h4>
                    <div class="step-card">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <h4>Create an Organization</h4>
                            <p>
                                Go to your account settings and create your first organization. This will be the 
                                container for all your devices, licenses, and security data.
                            </p>
                        </div>
                    </div>

                    <h4 style="margin-top: 24px;">Step 2: Install the Client</h4>
                    <div class="step-card">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <h4>Download MagenSec Client</h4>
                            <p>
                                Download the MagenSec client from your organization dashboard. The installer 
                                supports Windows, macOS, and Linux. Run it on your devices to begin security scanning.
                            </p>
                        </div>
                    </div>

                    <h4 style="margin-top: 24px;">Step 3: Add Devices to Scan</h4>
                    <div class="step-card">
                        <div class="step-number">3</div>
                        <div class="step-content">
                            <h4>Device Registration</h4>
                            <p>
                                Once the client is installed, devices automatically register with your organization. 
                                You can see them appear in your Devices dashboard within seconds. Each device starts 
                                scanning for vulnerabilities and compliance issues immediately.
                            </p>
                        </div>
                    </div>

                    <h4 style="margin-top: 24px;">Step 4: View Your Dashboard</h4>
                    <div class="step-card">
                        <div class="step-number">4</div>
                        <div class="step-content">
                            <h4>Monitor Your Security Posture</h4>
                            <p>
                                Your dashboard shows a real-time overview of your organization's security status. 
                                You'll see your Security, Risk, and Compliance scores along with key vulnerabilities 
                                and actionable recommendations.
                            </p>
                        </div>
                    </div>

                    <div class="alert-box alert-success">
                        <strong>First Scan Takes 3-5 Minutes:</strong> Your devices will complete their first 
                        comprehensive scan. Subsequent scans run hourly for continuous monitoring.
                    </div>

                    <h4 style="margin-top: 24px;">What You'll See After First Scan</h4>
                    <ul>
                        <li><strong>Vulnerabilities:</strong> All known CVEs on your devices, sorted by severity</li>
                        <li><strong>Installed Applications:</strong> Complete software inventory with versions</li>
                        <li><strong>Compliance Gaps:</strong> Which security frameworks your systems don't meet</li>
                        <li><strong>Recommendations:</strong> Specific actions to improve your security posture</li>
                        <li><strong>Risk Assessment:</strong> Which vulnerabilities are exploitable in your environment</li>
                    </ul>

                    <h4 style="margin-top: 24px;">Next Steps</h4>
                    <ol>
                        <li>Review your <strong>Security Score</strong> (Section 2: Score Interpretation)</li>
                        <li>Understand your <strong>Dashboard</strong> (Section 3: Understanding Dashboard)</li>
                        <li>Implement <strong>Best Practices</strong> (Section 4: Best Practices)</li>
                        <li>Set up <strong>Automated Patching</strong> to improve continuously</li>
                    </ol>
                </div>
            </div>
        `;
    }

    renderScoring() {
        return html`
            <div class="row">
                <div class="col-md-12">
                    <h3>Understanding MagenSec Scores</h3>
                    <p>
                        MagenSec calculates three different scores to give you a comprehensive view of your security posture. 
                        Each score measures different aspects of your organization's security and compliance status.
                    </p>

                    <div class="row mt-4">
                        <!-- Security Score Card -->
                        <div class="col-md-4 mb-3">
                            <div class="card">
                                <div class="card-body">
                                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                                        <div class="doc-badge good">82</div>
                                        <div>
                                            <h4 style="margin: 0;">Security Score</h4>
                                            <small class="text-muted">Patch Coverage</small>
                                        </div>
                                    </div>
                                    <p class="text-muted" style="margin: 0; font-size: 13px;">
                                        Measures how well your software is patched and updated. Higher is better.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Risk Score Card -->
                        <div class="col-md-4 mb-3">
                            <div class="card">
                                <div class="card-body">
                                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                                        <div class="doc-badge excellent">91</div>
                                        <div>
                                            <h4 style="margin: 0;">Risk Score</h4>
                                            <small class="text-muted">Exploitability</small>
                                        </div>
                                    </div>
                                    <p class="text-muted" style="margin: 0; font-size: 13px;">
                                        Reflects actual risk based on exploitable vulnerabilities. Higher is safer.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Compliance Score Card -->
                        <div class="col-md-4 mb-3">
                            <div class="card">
                                <div class="card-body">
                                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                                        <div class="doc-badge fair">65</div>
                                        <div>
                                            <h4 style="margin: 0;">Compliance Score</h4>
                                            <small class="text-muted">Framework Alignment</small>
                                        </div>
                                    </div>
                                    <p class="text-muted" style="margin: 0; font-size: 13px;">
                                        Measures alignment with CIS, NIST, and other security frameworks.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="alert-box alert-info">
                        <strong>Key Insight:</strong> A device can have a low Security score (many unpatched vulnerabilities) 
                        but a high Risk score (none are actively exploitable). These scores tell different stories about your security.
                    </div>

                    <h4>Why Three Different Scores?</h4>
                    <table class="comparison-table">
                        <thead>
                            <tr>
                                <th>Score Type</th>
                                <th>What It Measures</th>
                                <th>Key Question</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>Security Score</strong></td>
                                <td>How many vulnerabilities exist and how outdated is the software</td>
                                <td>How well are we patched?</td>
                            </tr>
                            <tr>
                                <td><strong>Risk Score</strong></td>
                                <td>Which vulnerabilities are actually exploitable in your environment</td>
                                <td>What's the actual threat level?</td>
                            </tr>
                            <tr>
                                <td><strong>Compliance Score</strong></td>
                                <td>How well you follow industry-standard security frameworks</td>
                                <td>Are we meeting standards & regulations?</td>
                            </tr>
                        </tbody>
                    </table>

                    <h4 style="margin-top: 24px;">Security Score in Detail</h4>
                    <p><strong>Formula:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">Security Score = (Patched Devices / Total Devices) × 100</code></p>
                    <p>
                        Measures what percentage of your devices are fully patched and up-to-date. 
                        <strong>Range: 0-100</strong> (90+ is excellent, below 50 needs urgent attention).
                    </p>

                    <h4 style="margin-top: 24px;">Risk Score in Detail</h4>
                    <p>
                        <strong>Formula:</strong> Risk Score accounts for CVSS severity, exploit availability, and device exposure. 
                        <strong>Range: 0-100</strong> (90+ means low exploitable risk, below 50 means high real-world threat).
                    </p>
                    <p style="color: #666; font-size: 13px;">
                        Unlike Security Score which counts all vulnerabilities equally, Risk Score weights them by:
                    </p>
                    <ul>
                        <li>CVSS severity (critical ≫ low)</li>
                        <li>Active exploit availability (exploited in the wild = higher weight)</li>
                        <li>Device exposure (internet-facing = higher risk)</li>
                        <li>Asset criticality (servers ≫ workstations)</li>
                    </ul>

                    <h4 style="margin-top: 24px;">Compliance Score in Detail</h4>
                    <p>
                        Measures how well your systems align with <strong>CIS Critical Controls</strong>, 
                        <strong>NIST Cybersecurity Framework</strong>, <strong>DISA STIG</strong>, and <strong>ISO 27001</strong>.
                    </p>
                    <p style="color: #666; font-size: 13px;">
                        Evaluates five key domains:
                    </p>
                    <ul>
                        <li>Identity & Access Management (MFA, password policies, audit logs)</li>
                        <li>Data Protection (encryption at rest, encryption in transit)</li>
                        <li>System Hardening (firewall, default credentials, security baselines)</li>
                        <li>Monitoring & Detection (logging, threat detection, incident response)</li>
                        <li>Change Management (approval process, testing, documentation)</li>
                    </ul>

                    <h4 style="margin-top: 24px;">Real-World Example</h4>
                    <div class="example-card">
                        <div class="example-header">
                            Scenario: Many Unpatched Systems, But Low Risk
                        </div>
                        <div class="metric-row">
                            <span class="metric-label">Situation:</span>
                            <span class="metric-value">50 unpatched Windows servers, but vulnerabilities are low CVSS (< 5.0) with no known exploits</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-label">Security Score:</span>
                            <span class="metric-value" style="color: #d63939;">35 (Many unpatched devices)</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-label">Risk Score:</span>
                            <span class="metric-value" style="color: #2fb344;">87 (Low actual threat)</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-label">Interpretation:</span>
                            <span class="metric-value" style="color: #666; font-size: 12px;">
                                Patch behind schedule, but current threats are minimal. Focus on compliance improvements rather than emergency patching.
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderDashboard() {
        return html`
            <div class="row">
                <div class="col-md-12">
                    <h3>Understanding Your Dashboard</h3>
                    <p>
                        The dashboard is your command center for security monitoring. Here's what each section tells you.
                    </p>

                    <h4 style="margin-top: 24px;">Top Section: Your Key Metrics</h4>
                    <p style="color: #666; font-size: 13px;">
                        The first row shows your three main scores and device status at a glance.
                    </p>

                    <div class="widget-preview">
                        ┌─────────────────────────────────────────┐
                        │ Security Score: 82  │ Risk Score: 91  │ Compliance: 65
                        │ 145 Devices Online  │ 3 Offline       │ 12 Pending Patches
                        └─────────────────────────────────────────┘
                    </div>

                    <p style="color: #666; font-size: 13px; margin-top: 12px;">
                        <strong>What to do:</strong> If Risk Score is low (< 50), prioritize exploitable vulnerabilities. 
                        If Compliance is low, review framework gaps.
                    </p>

                    <h4 style="margin-top: 24px;">Vulnerability Summary</h4>
                    <p>
                        Shows vulnerabilities grouped by severity: Critical (red), High (orange), Medium (yellow), Low (green).
                    </p>

                    <div class="widget-preview">
                        ┌─────────────────────────────────────────┐
                        │ Critical: 3     High: 12     Medium: 45
                        │ Focus on Critical and High first
                        └─────────────────────────────────────────┘
                    </div>

                    <div class="alert-box alert-info">
                        <strong>Pro Tip:</strong> Critical vulnerabilities don't always mean highest risk. 
                        Check Risk Score to see which ones are actually exploitable in your environment.
                    </div>

                    <h4 style="margin-top: 24px;">Compliance Frameworks</h4>
                    <p>
                        Your alignment with industry security standards. Each framework shows your score and key gaps.
                    </p>

                    <ul>
                        <li><strong>CIS Critical Controls:</strong> 18 essential security controls</li>
                        <li><strong>NIST Cybersecurity Framework:</strong> Identify → Protect → Detect → Respond → Recover</li>
                        <li><strong>DISA STIG:</strong> Government security standards for hardening</li>
                        <li><strong>ISO 27001:</strong> International information security management</li>
                    </ul>

                    <h4 style="margin-top: 24px;">Device Status</h4>
                    <p>
                        Shows your device fleet health. Devices can be:
                    </p>

                    <ul>
                        <li>
                            <strong>🟢 Online:</strong> Device checked in within last 5 minutes. Active scanning in progress.
                        </li>
                        <li>
                            <strong>🟡 Stale:</strong> Last check-in 6-24 hours ago. Device may be offline or in sleep mode.
                        </li>
                        <li>
                            <strong>🔴 Offline:</strong> No contact in 24+ hours. Device may have been shut down or uninstalled.
                        </li>
                    </ul>

                    <h4 style="margin-top: 24px;">Recommendations Section</h4>
                    <p>
                        Prioritized action items to improve your security posture. Ordered by impact (most critical first).
                    </p>

                    <div class="example-card">
                        <div class="example-header">
                            Recommendation Example
                        </div>
                        <div style="color: #666; font-size: 13px; line-height: 1.6;">
                            <strong>Apply Critical Patches (CVE-2025-1234)</strong><br>
                            <span style="color: #999;">Affects: 8 devices</span><br>
                            <span style="color: #999;">Risk: CVSS 9.8 (Critical), actively exploited</span><br>
                            <span style="color: #999;">Action: Update Windows on prod-server-01 through prod-server-08</span>
                        </div>
                    </div>

                    <h4 style="margin-top: 24px;">Trends & History</h4>
                    <p>
                        Charts showing how your scores have changed over the past 7-30 days. 
                        Use this to see if you're improving or falling behind.
                    </p>

                    <ul>
                        <li><strong>Improving trend:</strong> Keep your current practices, they're working</li>
                        <li><strong>Declining trend:</strong> Investigate recent changes, new devices, or staffing gaps</li>
                        <li><strong>Flat trend:</strong> Make process improvements or increase patching frequency</li>
                    </ul>

                    <h4 style="margin-top: 24px;">Where to Investigate Further</h4>
                    <ul>
                        <li>
                            <strong>Devices page:</strong> See all devices, their scores, and scan history. 
                            Click a device to see detailed scan results.
                        </li>
                        <li>
                            <strong>Vulnerabilities page:</strong> Browse all CVEs, which devices are affected, 
                            and patch availability.
                        </li>
                        <li>
                            <strong>Assets page:</strong> Software inventory. See what's installed, versions, 
                            and which apps are outdated.
                        </li>
                        <li>
                            <strong>Compliance page:</strong> Deep dive into framework gaps. See specific controls 
                            failing and remediation steps.
                        </li>
                    </ul>
                </div>
            </div>
        `;
    }

    renderBestPractices() {
        return html`
            <div class="row">
                <div class="col-md-12">
                    <h3>Security Best Practices</h3>
                    <p>
                        Improve your security posture using proven strategies. These practices are based on 
                        CIS, NIST, and industry standards.
                    </p>

                    <h4 style="margin-top: 24px;">1. Patch Management Strategy</h4>
                    
                    <div class="best-practice-card">
                        <div class="best-practice-title">Critical Patches: 24-Hour SLA</div>
                        <p class="best-practice-desc">
                            Apply patches for Critical (CVSS 9.0+) and exploited vulnerabilities within 24 hours. 
                            This significantly reduces your risk window.
                        </p>
                    </div>

                    <div class="best-practice-card">
                        <div class="best-practice-title">High Priority: 5-Day SLA</div>
                        <p class="best-practice-desc">
                            High-severity patches (CVSS 7.0-8.9) should be applied within 5 business days. 
                            Prioritize production servers first.
                        </p>
                    </div>

                    <div class="best-practice-card">
                        <div class="best-practice-title">Enable Automatic Updates</div>
                        <p class="best-practice-desc">
                            Configure Windows Update, macOS Software Update, and Linux package managers to 
                            automatically install patches. Manual patching creates gaps.
                        </p>
                    </div>

                    <h4 style="margin-top: 24px;">2. Vulnerability Prioritization</h4>
                    
                    <p style="color: #666;">
                        Not all vulnerabilities are equal. Use this matrix to prioritize:
                    </p>

                    <table class="comparison-table">
                        <thead>
                            <tr>
                                <th>CVSS Score</th>
                                <th>Active Exploit?</th>
                                <th>Priority</th>
                                <th>Timeline</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>9.0+ (Critical)</td>
                                <td>Yes (In the wild)</td>
                                <td style="color: #d63939;">🔴 URGENT</td>
                                <td>24 hours</td>
                            </tr>
                            <tr>
                                <td>9.0+ (Critical)</td>
                                <td>No (PoC only)</td>
                                <td style="color: #f59f00;">🟠 HIGH</td>
                                <td>3 days</td>
                            </tr>
                            <tr>
                                <td>7.0-8.9 (High)</td>
                                <td>Yes</td>
                                <td style="color: #f59f00;">🟠 HIGH</td>
                                <td>5 days</td>
                            </tr>
                            <tr>
                                <td>7.0-8.9 (High)</td>
                                <td>No</td>
                                <td style="color: #f59f00;">🟠 MEDIUM</td>
                                <td>10 days</td>
                            </tr>
                            <tr>
                                <td>4.0-6.9 (Medium)</td>
                                <td>Any</td>
                                <td style="color: #fbbf24;">🟡 LOW</td>
                                <td>30 days</td>
                            </tr>
                            <tr>
                                <td>&lt;4.0 (Low)</td>
                                <td>Any</td>
                                <td style="color: #2fb344;">🟢 LOW</td>
                                <td>90 days</td>
                            </tr>
                        </tbody>
                    </table>

                    <h4 style="margin-top: 24px;">3. Identity & Access Management</h4>
                    
                    <div class="best-practice-card">
                        <div class="best-practice-title">Enforce Multi-Factor Authentication (MFA)</div>
                        <p class="best-practice-desc">
                            Require MFA on all accounts, especially administrators. Blocks 99% of credential-based attacks.
                        </p>
                    </div>

                    <div class="best-practice-card">
                        <div class="best-practice-title">Strong Password Policies</div>
                        <p class="best-practice-desc">
                            Minimum 14 characters, complexity requirements, no reuse of past 12 passwords. 
                            Use a password manager for long-term compliance.
                        </p>
                    </div>

                    <div class="best-practice-card">
                        <div class="best-practice-title">Principle of Least Privilege</div>
                        <p class="best-practice-desc">
                            Give users only the permissions they need. Remove unnecessary admin rights. 
                            Audit quarterly for orphaned access.
                        </p>
                    </div>

                    <h4 style="margin-top: 24px;">4. Compliance Framework Alignment</h4>
                    
                    <p style="color: #666;">
                        Use your Compliance Score to guide framework improvements:
                    </p>

                    <ul>
                        <li>
                            <strong>CIS Controls:</strong> Start with the Critical Controls (1-6) before advanced controls (7-18). 
                            Focus on Asset Management, Access Control, and Software Updates first.
                        </li>
                        <li>
                            <strong>NIST Framework:</strong> Begin with Identify and Protect functions. Document your current 
                            maturity level, then plan improvements.
                        </li>
                        <li>
                            <strong>ISO 27001:</strong> If pursuing certification, start with information classification and 
                            risk assessment before technical controls.
                        </li>
                    </ul>

                    <h4 style="margin-top: 24px;">5. Continuous Monitoring</h4>
                    
                    <div class="best-practice-card">
                        <div class="best-practice-title">Daily Dashboard Review</div>
                        <p class="best-practice-desc">
                            Check scores daily for changes. Automated alerting for critical vulnerability drops 
                            or device failures.
                        </p>
                    </div>

                    <div class="best-practice-card">
                        <div class="best-practice-title">Weekly Trend Analysis</div>
                        <p class="best-practice-desc">
                            Are your scores improving? Investigate sudden changes. Celebrate improvements, 
                            debug declines.
                        </p>
                    </div>

                    <div class="best-practice-card">
                        <div class="best-practice-title">Monthly Executive Review</div>
                        <p class="best-practice-desc">
                            Share compliance reports with leadership. Demonstrate ROI of security investments. 
                            Plan next month's focus areas.
                        </p>
                    </div>

                    <h4 style="margin-top: 24px;">6. Incident Response Readiness</h4>
                    
                    <ul>
                        <li>
                            <strong>Document your process:</strong> Who responds? Who is notified? What are escalation steps?
                        </li>
                        <li>
                            <strong>Test quarterly:</strong> Run tabletop exercises (simulate breach, walk through response)
                        </li>
                        <li>
                            <strong>Gather evidence:</strong> Enable logging on all systems. Maintain audit trails for at least 90 days.
                        </li>
                    </ul>
                </div>
            </div>
        `;
    }

    renderFAQ() {
        return html`
            <div class="row">
                <div class="col-md-12">
                    <h3>Frequently Asked Questions</h3>
                    <p>
                        Can't find an answer? Contact our support team at support@magensec.io
                    </p>

                    ${this.renderFaqItem(
                        'Why is my Security Score low if Risk Score is high?',
                        'Security Score counts all vulnerabilities equally, while Risk Score weights by exploitability. You might have many unpatched vulnerabilities that aren\'t actively exploitable in your environment (low CVSS, no known exploits). Focus on Risk Score for actual threat assessment.'
                    )}

                    ${this.renderFaqItem(
                        'How often are devices scanned?',
                        'Devices scan every 1-4 hours depending on your configuration. Initial scan takes 3-5 minutes. Scans are lightweight and run in the background without affecting performance.'
                    )}

                    ${this.renderFaqItem(
                        'Can I exclude devices from scanning?',
                        'Yes. You can mark devices as "non-production" or "monitoring-only" to exclude them from scoring calculations. This is useful for test environments.'
                    )}

                    ${this.renderFaqItem(
                        'What if a device goes offline?',
                        'Devices show as "Offline" after 24 hours without contact. They remain in your inventory. When they come back online, scanning resumes automatically. No data is lost.'
                    )}

                    ${this.renderFaqItem(
                        'How do I improve my Compliance Score?',
                        'Start with your weakest framework function (shown on the Compliance page). Implement the recommended controls. Common first steps: enable MFA, configure logging, implement firewall rules.'
                    )}

                    ${this.renderFaqItem(
                        'Can I benchmark against other organizations?',
                        'Yes (Enterprise plan). You\'ll see how your scores compare to organizations in your industry and size. Use this to set realistic improvement targets.'
                    )}

                    ${this.renderFaqItem(
                        'How do I export reports?',
                        'Navigate to Reports, select your date range, and download PDF or CSV. Executive summaries are also available for sharing with leadership.'
                    )}

                    ${this.renderFaqItem(
                        'What does "Stale" mean for a device?',
                        '"Stale" means the device hasn\'t checked in within the last 5 minutes (usually 6-24 hours). The device may be offline, in sleep mode, or experiencing network issues. You\'ll still see the most recent scan data.'
                    )}

                    ${this.renderFaqItem(
                        'Can I set custom alert thresholds?',
                        'Yes. Configure alerts for score drops, new critical vulnerabilities, or compliance failures. Alerts can be sent to email, Slack, or webhooks.'
                    )}

                    ${this.renderFaqItem(
                        'Is my data encrypted?',
                        'Yes. All data in transit is encrypted with TLS 1.3. Data at rest is encrypted with AES-256. See the Security & Privacy section for compliance details.'
                    )}

                    ${this.renderFaqItem(
                        'How long is scan history retained?',
                        'We retain 90 days of detailed scan history. Trend data (scores, counts) is maintained for 2 years. Contact support for longer retention options.'
                    )}

                    ${this.renderFaqItem(
                        'Can I integrate with my SIEM?',
                        'Yes. We provide webhooks and API access. See the API Reference section for integration documentation.'
                    )}
                </div>
            </div>
        `;
    }

    renderFaqItem(question, answer) {
        const id = `faq-${question.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
        return html`
            <div class="faq-item" id="${id}">
                <div class="faq-question" @click=${(e) => this.toggleFaq(e)}>
                    <span>${question}</span>
                    <span class="faq-arrow">⌄</span>
                </div>
                <div class="faq-answer">
                    <p>${answer}</p>
                </div>
            </div>
        `;
    }

    toggleFaq(e) {
        const question = e.currentTarget;
        const answer = question.nextElementSibling;
        question.classList.toggle('active');
        answer.classList.toggle('open');
    }

    renderGlossary() {
        return html`
            <div class="row">
                <div class="col-md-12">
                    <h3>Security Glossary</h3>
                    <p>
                        Common security terms explained in plain language.
                    </p>

                    <div class="glossary-term">
                        <strong>CVE (Common Vulnerabilities and Exposures)</strong>
                        <p>A standardized identifier for publicly disclosed vulnerabilities. Example: CVE-2025-1234. Each CVE has a unique record with details about the vulnerability, affected software, and fix availability.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>CVSS (Common Vulnerability Scoring System)</strong>
                        <p>A numerical score (0-10) measuring vulnerability severity. 0-3.9 = Low, 4.0-6.9 = Medium, 7.0-8.9 = High, 9.0-10.0 = Critical. Helps prioritize patching efforts.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>CIS (Center for Internet Security)</strong>
                        <p>Organization that publishes the CIS Critical Controls—18 essential security practices for protecting IT systems. Widely adopted in government and enterprise.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>NIST (National Institute of Standards and Technology)</strong>
                        <p>U.S. government agency that publishes the NIST Cybersecurity Framework. Provides guidance on managing cybersecurity risk. Framework has 5 functions: Identify, Protect, Detect, Respond, Recover.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>DISA STIG (Defense Information Systems Agency Security Technical Implementation Guides)</strong>
                        <p>Detailed checklists for securing government IT systems. Applicable to DoD contractors and federal agencies. Extremely strict security requirements.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>ISO 27001</strong>
                        <p>International standard for information security management. Provides a framework for managing information risks. Required for many compliance programs and vendor contracts.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>Zero-Day</strong>
                        <p>A vulnerability unknown to vendors. No patch exists yet. Typically exploited before vendors even know about it. Extremely dangerous.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>Exploit</strong>
                        <p>Code or technique that takes advantage of a vulnerability to compromise a system. An "active exploit" means it's being used in real attacks.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>Patch</strong>
                        <p>A software update that fixes a vulnerability. Patches are released by vendors (Microsoft, Adobe, Apple, etc.). Critical patches should be applied immediately.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>End-of-Life (EOL)</strong>
                        <p>When a software version stops receiving security patches. Example: Windows 7 reached EOL in 2020. EOL software is extremely risky.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>Privileged Account</strong>
                        <p>Admin or root account with elevated permissions. Attackers target these accounts because they can access sensitive data and make system changes. Require MFA for all privileged accounts.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>MFA (Multi-Factor Authentication)</strong>
                        <p>Requiring more than one proof of identity to log in. Example: password + authenticator app. Blocks 99% of account compromise attacks.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>Encryption</strong>
                        <p>Converting data into unreadable form using a cryptographic key. "At rest" = stored encrypted. "In transit" = encrypted while being transmitted. Both are critical.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>Audit Log</strong>
                        <p>Record of activities on a system (login attempts, file changes, permission grants, etc.). Required for compliance. Enables investigation of security incidents.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>Incident Response</strong>
                        <p>The process of handling a security breach. Includes detection, containment, eradication, recovery, and lessons learned. Should be documented and tested quarterly.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>Risk</strong>
                        <p>The combination of threat, vulnerability, and impact. Risk = Threat × Vulnerability. A critical vulnerability with no threat or exposure = low risk.</p>
                    </div>

                    <div class="glossary-term">
                        <strong>Compliance</strong>
                        <p>Meeting requirements of laws, regulations, or standards (HIPAA, PCI DSS, SOC 2, etc.). Compliance and security are related but different. You can be compliant but insecure, or secure but non-compliant.</p>
                    </div>
                </div>
            </div>
        `;
    }

    renderAPI() {
        return html`
            <div class="row">
                <div class="col-md-12">
                    <h3>API Reference</h3>
                    <p>
                        Integrate MagenSec with your systems programmatically. Our REST API provides full access to your security data.
                    </p>

                    <div class="alert-box alert-info">
                        <strong>API Documentation:</strong> Full API docs are available at 
                        <code style="background: #e3f2fd; padding: 2px 6px; border-radius: 3px;">/api/docs</code>
                        See endpoint definitions, authentication, rate limits, and code examples.
                    </div>

                    <h4 style="margin-top: 24px;">Authentication</h4>
                    <p>
                        Use Bearer token authentication. Include your API key in the Authorization header:
                    </p>
                    <div class="formula-box">
                        Authorization: Bearer YOUR_API_KEY
                    </div>

                    <h4 style="margin-top: 24px;">Key Endpoints</h4>

                    <div class="example-card">
                        <div class="example-header">GET /api/v1/orgs/{orgId}/devices</div>
                        <p style="margin: 8px 0 0 0; color: #666; font-size: 12px;">
                            List all devices in an organization. Includes device status, last scan time, and current scores.
                        </p>
                    </div>

                    <div class="example-card">
                        <div class="example-header">GET /api/v1/orgs/{orgId}/vulnerabilities</div>
                        <p style="margin: 8px 0 0 0; color: #666; font-size: 12px;">
                            Get all CVEs across your organization. Filter by severity, device, or date range.
                        </p>
                    </div>

                    <div class="example-card">
                        <div class="example-header">GET /api/v1/orgs/{orgId}/compliance</div>
                        <p style="margin: 8px 0 0 0; color: #666; font-size: 12px;">
                            Fetch compliance scores and framework gaps. Includes recommendations for each gap.
                        </p>
                    </div>

                    <div class="example-card">
                        <div class="example-header">POST /api/v1/webhooks</div>
                        <p style="margin: 8px 0 0 0; color: #666; font-size: 12px;">
                            Set up webhooks for real-time alerts. Notified when critical vulnerabilities are discovered.
                        </p>
                    </div>

                    <h4 style="margin-top: 24px;">Common Integrations</h4>

                    <ul>
                        <li>
                            <strong>SIEM (Splunk, ELK):</strong> Stream security events via webhooks or syslog. 
                            Correlate with other security data.
                        </li>
                        <li>
                            <strong>Slack/Teams:</strong> Get alerts when critical vulnerabilities are discovered. 
                            Post daily score summaries to channels.
                        </li>
                        <li>
                            <strong>Ticketing (Jira, ServiceNow):</strong> Auto-create tickets for critical issues. 
                            Update tickets as devices are patched.
                        </li>
                        <li>
                            <strong>Cloud Platforms (AWS, Azure):</strong> Track compliance status across hybrid environments. 
                            Correlate cloud resources with MagenSec findings.
                        </li>
                    </ul>

                    <h4 style="margin-top: 24px;">Rate Limits</h4>
                    <p style="color: #666; font-size: 13px;">
                        API requests are limited to 100 requests per minute per API key. Bulk operations can request higher limits.
                    </p>

                    <h4 style="margin-top: 24px;">Support</h4>
                    <p>
                        For API questions or integration help, contact our API team at 
                        <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">api-support@magensec.io</code>
                    </p>
                </div>
            </div>
        `;
    }

    renderSecurity() {
        return html`
            <div class="row">
                <div class="col-md-12">
                    <h3>Security & Privacy</h3>
                    <p>
                        We take security seriously. Here's how we protect your data.
                    </p>

                    <h4 style="margin-top: 24px;">Data Encryption</h4>
                    
                    <div class="best-practice-card">
                        <div class="best-practice-title">Encryption in Transit</div>
                        <p class="best-practice-desc">
                            All data sent between your devices and our cloud uses TLS 1.3 encryption. 
                            No unencrypted traffic is allowed.
                        </p>
                    </div>

                    <div class="best-practice-card">
                        <div class="best-practice-title">Encryption at Rest</div>
                        <p class="best-practice-desc">
                            All data stored in our database is encrypted with AES-256. Database keys are 
                            rotated regularly and stored in secure vaults.
                        </p>
                    </div>

                    <h4 style="margin-top: 24px;">Data Retention</h4>
                    <table class="comparison-table">
                        <thead>
                            <tr>
                                <th>Data Type</th>
                                <th>Retention Period</th>
                                <th>Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Scan Results</td>
                                <td>90 days</td>
                                <td>Compliance, trending, investigation</td>
                            </tr>
                            <tr>
                                <td>Trend Data (Scores)</td>
                                <td>2 years</td>
                                <td>Long-term analysis, audit trails</td>
                            </tr>
                            <tr>
                                <td>Audit Logs</td>
                                <td>1 year</td>
                                <td>Compliance, forensics</td>
                            </tr>
                            <tr>
                                <td>Device Configuration</td>
                                <td>Until deleted</td>
                                <td>Device history, reference</td>
                            </tr>
                        </tbody>
                    </table>

                    <h4 style="margin-top: 24px;">Access Controls</h4>
                    <ul>
                        <li>
                            <strong>Role-Based Access Control (RBAC):</strong> Users only see data they're authorized to access. 
                            Admins configure permissions per organization.
                        </li>
                        <li>
                            <strong>Multi-Factor Authentication:</strong> All accounts support MFA. Administrators should require it.
                        </li>
                        <li>
                            <strong>Audit Logging:</strong> All user actions are logged. See who accessed what data and when.
                        </li>
                        <li>
                            <strong>IP Whitelisting:</strong> Enterprise customers can restrict API access to specific IP addresses.
                        </li>
                    </ul>

                    <h4 style="margin-top: 24px;">Compliance Certifications</h4>
                    <ul>
                        <li><strong>SOC 2 Type II:</strong> Annual audit of security, availability, and confidentiality controls</li>
                        <li><strong>ISO 27001:</strong> Information security management certification</li>
                        <li><strong>GDPR:</strong> EU data protection compliance. Data is processed and stored in EU data centers.</li>
                        <li><strong>HIPAA:</strong> Healthcare data protection (Business Associate Agreement available)</li>
                        <li><strong>PCI DSS:</strong> Payment card data protection (Level 1 compliance)</li>
                    </ul>

                    <h4 style="margin-top: 24px;">Vulnerability Disclosure</h4>
                    <p>
                        Found a security vulnerability in MagenSec? Please report it responsibly to 
                        <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">security@magensec.io</code>
                        instead of public disclosure. We take security reports seriously and will respond within 24 hours.
                    </p>

                    <div class="alert-box alert-success">
                        <strong>Bug Bounty:</strong> We offer rewards for responsible vulnerability disclosures. 
                        Contact security@magensec.io for details.
                    </div>

                    <h4 style="margin-top: 24px;">Privacy Policy</h4>
                    <p>
                        We don't sell your data. Period. Full privacy policy available at 
                        <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">magensec.io/privacy</code>
                    </p>

                    <h4 style="margin-top: 24px;">Incident Response</h4>
                    <p>
                        If a security incident occurs, affected users are notified within 24 hours. 
                        We'll provide details about the incident and steps to mitigate impact.
                    </p>

                    <h4 style="margin-top: 24px;">Questions?</h4>
                    <p>
                        For security-related questions, contact 
                        <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">security@magensec.io</code>
                    </p>
                </div>
            </div>
        `;
    }

    setTab(tab) {
        this.currentTab = tab;
        // Scroll to top of content
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

customElements.define('documentation-hub', DocumentationHub);
