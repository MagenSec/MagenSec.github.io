// ScoreGuide component using window.htm (HTM - Hyperscript Tagged Markup)
const { html } = window.htm;

class ScoreGuide extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.currentTab = 'overview';
    }

    connectedCallback() {
        this.render();
    }

    get styles() {
        return html`
        <style>
            :host {
                display: block;
            }
            
            .score-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 60px;
                height: 60px;
                border-radius: 8px;
                font-size: 24px;
                font-weight: bold;
                color: white;
            }
            
            .score-badge.excellent { background: linear-gradient(135deg, #2fb344 0%, #1e7e34 100%); }
            .score-badge.good { background: linear-gradient(135deg, #51cf66 0%, #2fb344 100%); }
            .score-badge.fair { background: linear-gradient(135deg, #f59f00 0%, #d97706 100%); }
            .score-badge.poor { background: linear-gradient(135deg, #d63939 0%, #b91c1c 100%); }
            .score-badge.critical { background: linear-gradient(135deg, #a61e4d 0%, #731a3f 100%); }
            
            .score-scale {
                display: flex;
                gap: 12px;
                margin: 20px 0;
                flex-wrap: wrap;
            }
            
            .scale-item {
                flex: 1;
                min-width: 120px;
                padding: 16px;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                text-align: center;
            }
            
            .scale-item.highlight {
                border: 2px solid #0054a6;
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
        </style>
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
                                    Score Interpretation Guide
                                </h2>
                                <div class="text-muted">
                                    Learn how Security, Risk, and Compliance scores are calculated and what they mean for your organization.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="page-body">
                    <div class="container-xl">
                        <!-- Navigation Tabs -->
                        <div class="nav-tabs-custom">
                            <button class="tab-btn ${this.currentTab === 'overview' ? 'active' : ''}" 
                                    @click=${() => this.setTab('overview')}>
                                Overview
                            </button>
                            <button class="tab-btn ${this.currentTab === 'security' ? 'active' : ''}" 
                                    @click=${() => this.setTab('security')}>
                                Security Score
                            </button>
                            <button class="tab-btn ${this.currentTab === 'risk' ? 'active' : ''}" 
                                    @click=${() => this.setTab('risk')}>
                                Risk Score
                            </button>
                            <button class="tab-btn ${this.currentTab === 'compliance' ? 'active' : ''}" 
                                    @click=${() => this.setTab('compliance')}>
                                Compliance Score
                            </button>
                            <button class="tab-btn ${this.currentTab === 'examples' ? 'active' : ''}" 
                                    @click=${() => this.setTab('examples')}>
                                Real-World Examples
                            </button>
                        </div>

                        <!-- Overview Tab -->
                        ${this.currentTab === 'overview' ? html`
                            <div class="row">
                                <div class="col-md-12">
                                    <h3>Understanding Your Scores</h3>
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
                                                        <div class="score-badge good">82</div>
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
                                                        <div class="score-badge excellent">91</div>
                                                        <div>
                                                            <h4 style="margin: 0;">Risk Score</h4>
                                                            <small class="text-muted">Exploitability</small>
                                                        </div>
                                                    </div>
                                                    <p class="text-muted" style="margin: 0; font-size: 13px;">
                                                        Reflects actual risk based on exploitable vulnerabilities. Lower risk = higher score.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Compliance Score Card -->
                                        <div class="col-md-4 mb-3">
                                            <div class="card">
                                                <div class="card-body">
                                                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                                                        <div class="score-badge fair">65</div>
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
                                        but a high Risk score (none are actively exploitable). Conversely, it might have a good Compliance score 
                                        (follows frameworks) but poor Security score (outdated software).
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
                                </div>
                            </div>
                        ` : ''}

                        <!-- Security Score Tab -->
                        ${this.currentTab === 'security' ? html`
                            <div class="row">
                                <div class="col-md-12">
                                    <h3>Security Score</h3>
                                    <p>
                                        The Security Score measures your patch level and software update status. It reflects how well you're 
                                        protecting against <em>known</em> vulnerabilities through updates and patches.
                                    </p>

                                    <h4>Score Range & Interpretation</h4>
                                    <div class="score-scale">
                                        <div class="scale-item">
                                            <div class="score-badge excellent">90-100</div>
                                            <strong>Excellent</strong><br>
                                            <small class="text-muted">Fully patched & current</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge good">75-89</div>
                                            <strong>Good</strong><br>
                                            <small class="text-muted">Minor patches pending</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge fair">50-74</div>
                                            <strong>Fair</strong><br>
                                            <small class="text-muted">Multiple patches needed</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge poor">25-49</div>
                                            <strong>Poor</strong><br>
                                            <small class="text-muted">Significant patching required</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge critical">0-24</div>
                                            <strong>Critical</strong><br>
                                            <small class="text-muted">Urgent action needed</small>
                                        </div>
                                    </div>

                                    <h4>How It's Calculated</h4>
                                    <div class="formula-box">
                                        Security Score = (Patched Devices / Total Devices) × 100
                                    </div>

                                    <p>
                                        This is the simplest metric: <strong>what percentage of your devices are up-to-date?</strong>
                                    </p>

                                    <h4>What Affects Your Security Score?</h4>
                                    <ul>
                                        <li><strong>OS Updates</strong> - Windows, macOS, Linux patch levels</li>
                                        <li><strong>Application Updates</strong> - Software patch status (Chrome, Firefox, Adobe, etc.)</li>
                                        <li><strong>Firmware Updates</strong> - BIOS, driver updates</li>
                                        <li><strong>Browser Updates</strong> - Critical for security</li>
                                        <li><strong>Age of Unpatched Systems</strong> - How long devices have been unpatched</li>
                                    </ul>

                                    <h4>Action Items</h4>
                                    <ul>
                                        <li>
                                            <strong>Low Score (Below 70):</strong> Enable automatic updates, establish patch management 
                                            SLAs (e.g., critical patches within 24 hours)
                                        </li>
                                        <li>
                                            <strong>Medium Score (70-85):</strong> Identify stragglers, test patches before broad rollout
                                        </li>
                                        <li>
                                            <strong>High Score (Above 85):</strong> Maintain patch cadence, monitor for new CVEs
                                        </li>
                                    </ul>

                                    <div class="alert-box alert-warning">
                                        <strong>Note:</strong> Security Score doesn't consider severity—a single critical zero-day 
                                        can affect the score equally as a minor update. Use <strong>Risk Score</strong> to prioritize.
                                    </div>
                                </div>
                            </div>
                        ` : ''}

                        <!-- Risk Score Tab -->
                        ${this.currentTab === 'risk' ? html`
                            <div class="row">
                                <div class="col-md-12">
                                    <h3>Risk Score</h3>
                                    <p>
                                        The Risk Score measures <em>exploitable</em> vulnerabilities in your environment. Unlike Security Score, 
                                        it accounts for severity, exploitability, and relevance to your specific devices.
                                    </p>

                                    <h4>Score Range & Interpretation</h4>
                                    <div class="score-scale">
                                        <div class="scale-item">
                                            <div class="score-badge excellent">90-100</div>
                                            <strong>Excellent</strong><br>
                                            <small class="text-muted">Very low exploitable risk</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge good">75-89</div>
                                            <strong>Good</strong><br>
                                            <small class="text-muted">Minor exploitable issues</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge fair">50-74</div>
                                            <strong>Fair</strong><br>
                                            <small class="text-muted">Moderate exploitable risk</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge poor">25-49</div>
                                            <strong>Poor</strong><br>
                                            <small class="text-muted">Significant exploitable risk</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge critical">0-24</div>
                                            <strong>Critical</strong><br>
                                            <small class="text-muted">High chance of active exploitation</small>
                                        </div>
                                    </div>

                                    <h4>How It's Calculated</h4>
                                    <div class="formula-box">
                                        Risk Score = 100 - (Weighted Exploitable Vulnerabilities / Total Devices)
                                        <br><br>
                                        Weighted Vulnerability = CVSS Score × Exploitability Rating × 
                                        Asset Criticality
                                    </div>

                                    <p>
                                        Risk Score is more sophisticated because it considers:
                                    </p>

                                    <h4>Factors That Lower Risk Score</h4>
                                    <ul>
                                        <li>
                                            <strong>CVSS Severity</strong> - Critical vulnerabilities have much higher weight than 
                                            low-severity issues
                                        </li>
                                        <li>
                                            <strong>Active Exploit Availability</strong> - Vulnerabilities with published exploits 
                                            have higher weight
                                        </li>
                                        <li>
                                            <strong>Device Type</strong> - Vulnerabilities on exposed servers carry more weight than 
                                            on internal workstations
                                        </li>
                                        <li>
                                            <strong>Network Exposure</strong> - Internet-facing systems have higher risk from 
                                            remote exploits
                                        </li>
                                        <li>
                                            <strong>Likelihood of Exploitation</strong> - Vulnerability factors (network access required, 
                                            user interaction, etc.)
                                        </li>
                                    </ul>

                                    <h4>Risk vs Security Score Example</h4>
                                    <div class="example-card">
                                        <div class="example-header">
                                            Scenario: Many Old Updates
                                        </div>
                                        <div class="metric-row">
                                            <span class="metric-label">Situation:</span>
                                            <span class="metric-value">100 unpatched devices, but vulnerabilities are low CVSS & no exploits</span>
                                        </div>
                                        <div class="metric-row">
                                            <span class="metric-label">Security Score:</span>
                                            <span class="metric-value" style="color: #d63939;">45 (Many unpatched devices)</span>
                                        </div>
                                        <div class="metric-row">
                                            <span class="metric-label">Risk Score:</span>
                                            <span class="metric-value" style="color: #2fb344;">88 (Low actual threat)</span>
                                        </div>
                                    </div>

                                    <h4>Action Items</h4>
                                    <ul>
                                        <li>
                                            <strong>Low Risk Score (Below 70):</strong> Prioritize high CVSS vulnerabilities, 
                                            focus on devices with active exploits
                                        </li>
                                        <li>
                                            <strong>Medium Risk Score (70-85):</strong> Address exploitable vulnerabilities on 
                                            critical assets first
                                        </li>
                                        <li>
                                            <strong>High Risk Score (Above 85):</strong> Continue monitoring threat landscape, 
                                            trend is positive
                                        </li>
                                    </ul>

                                    <div class="alert-box alert-info">
                                        <strong>Why This Matters:</strong> Not all vulnerabilities are created equal. A single 
                                        critical 0-day exploit is riskier than 100 low-severity issues. Risk Score reflects reality.
                                    </div>
                                </div>
                            </div>
                        ` : ''}

                        <!-- Compliance Score Tab -->
                        ${this.currentTab === 'compliance' ? html`
                            <div class="row">
                                <div class="col-md-12">
                                    <h3>Compliance Score</h3>
                                    <p>
                                        The Compliance Score measures how well your infrastructure aligns with industry-standard 
                                        security frameworks like CIS, NIST CSF, and DISA STIG. It's independent of vulnerabilities—
                                        it's about <em>following best practices</em>.
                                    </p>

                                    <h4>Score Range & Interpretation</h4>
                                    <div class="score-scale">
                                        <div class="scale-item">
                                            <div class="score-badge excellent">90-100</div>
                                            <strong>Excellent</strong><br>
                                            <small class="text-muted">Strong framework alignment</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge good">75-89</div>
                                            <strong>Good</strong><br>
                                            <small class="text-muted">Most controls implemented</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge fair">50-74</div>
                                            <strong>Fair</strong><br>
                                            <small class="text-muted">Some gaps in controls</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge poor">25-49</div>
                                            <strong>Poor</strong><br>
                                            <small class="text-muted">Significant control gaps</small>
                                        </div>
                                        <div class="scale-item">
                                            <div class="score-badge critical">0-24</div>
                                            <strong>Critical</strong><br>
                                            <small class="text-muted">Major framework misalignment</small>
                                        </div>
                                    </div>

                                    <h4>What's Measured</h4>
                                    <p>
                                        Compliance Score evaluates controls across five security domains:
                                    </p>

                                    <div class="example-card">
                                        <div class="example-header">1. Identity & Access Management</div>
                                        <ul style="margin: 0; padding-left: 20px;">
                                            <li>Multi-factor authentication enabled</li>
                                            <li>Password complexity requirements</li>
                                            <li>Access logs and audit trails</li>
                                            <li>Privileged account management</li>
                                        </ul>
                                    </div>

                                    <div class="example-card">
                                        <div class="example-header">2. Data Protection</div>
                                        <ul style="margin: 0; padding-left: 20px;">
                                            <li>Data encryption at rest</li>
                                            <li>Data encryption in transit (HTTPS/TLS)</li>
                                            <li>Data classification and handling</li>
                                            <li>Backup and disaster recovery</li>
                                        </ul>
                                    </div>

                                    <div class="example-card">
                                        <div class="example-header">3. System Hardening</div>
                                        <ul style="margin: 0; padding-left: 20px;">
                                            <li>Firewall enabled and configured</li>
                                            <li>Unnecessary services disabled</li>
                                            <li>Default credentials changed</li>
                                            <li>Security baselines applied</li>
                                        </ul>
                                    </div>

                                    <div class="example-card">
                                        <div class="example-header">4. Monitoring & Detection</div>
                                        <ul style="margin: 0; padding-left: 20px;">
                                            <li>Logging enabled on systems</li>
                                            <li>Real-time monitoring for threats</li>
                                            <li>Incident response procedures</li>
                                            <li>Regular security assessments</li>
                                        </ul>
                                    </div>

                                    <div class="example-card">
                                        <div class="example-header">5. Change Management</div>
                                        <ul style="margin: 0; padding-left: 20px;">
                                            <li>Change approval process</li>
                                            <li>Testing before deployment</li>
                                            <li>Configuration documentation</li>
                                            <li>Rollback procedures</li>
                                        </ul>
                                    </div>

                                    <h4>Frameworks Aligned With</h4>
                                    <ul>
                                        <li><strong>CIS Critical Security Controls</strong> - 18 essential controls</li>
                                        <li><strong>NIST Cybersecurity Framework</strong> - Identify, Protect, Detect, Respond, Recover</li>
                                        <li><strong>DISA STIG Benchmarks</strong> - Government security standards</li>
                                        <li><strong>ISO 27001</strong> - International information security</li>
                                    </ul>

                                    <h4>Compliance vs Security vs Risk</h4>
                                    <div class="example-card">
                                        <div class="example-header">
                                            Real Example: Fully Patched But Non-Compliant
                                        </div>
                                        <div class="metric-row">
                                            <span class="metric-label">Situation:</span>
                                            <span class="metric-value">All servers fully patched, but firewall logs disabled</span>
                                        </div>
                                        <div class="metric-row">
                                            <span class="metric-label">Security Score:</span>
                                            <span class="metric-value" style="color: #2fb344;">95 (All patches applied)</span>
                                        </div>
                                        <div class="metric-row">
                                            <span class="metric-label">Risk Score:</span>
                                            <span class="metric-value" style="color: #2fb344;">92 (Low exploitable vulns)</span>
                                        </div>
                                        <div class="metric-row">
                                            <span class="metric-label">Compliance Score:</span>
                                            <span class="metric-value" style="color: #d63939;">45 (Audit logging failing)</span>
                                        </div>
                                    </div>

                                    <div class="alert-box alert-info">
                                        <strong>Why This Matters:</strong> Compliance Score identifies systemic gaps that don't show 
                                        up as vulnerabilities. A system can be patched but misconfigured, creating security debt 
                                        before vulnerabilities appear.
                                    </div>

                                    <h4>Action Items</h4>
                                    <ul>
                                        <li>
                                            <strong>Low Compliance Score:</strong> Review specific control failures in your dashboard, 
                                            prioritize framework alignment
                                        </li>
                                        <li>
                                            <strong>Medium Compliance Score:</strong> Address remaining gaps, plan implementation 
                                            roadmap for critical controls
                                        </li>
                                        <li>
                                            <strong>High Compliance Score:</strong> Maintain control effectiveness, schedule 
                                            annual recertification
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        ` : ''}

                        <!-- Examples Tab -->
                        ${this.currentTab === 'examples' ? html`
                            <div class="row">
                                <div class="col-md-12">
                                    <h3>Real-World Examples</h3>
                                    <p>
                                        These examples show how the three scores work differently across common scenarios.
                                    </p>

                                    <h4>Example 1: Startup with Limited Resources</h4>
                                    <div class="example-card">
                                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px;">
                                            <div style="text-align: center;">
                                                <div class="score-badge poor">38</div>
                                                <strong>Security</strong><br>
                                                <small>Lots of backlog</small>
                                            </div>
                                            <div style="text-align: center;">
                                                <div class="score-badge fair">62</div>
                                                <strong>Risk</strong><br>
                                                <small>Some critical issues</small>
                                            </div>
                                            <div style="text-align: center;">
                                                <div class="score-badge fair">55</div>
                                                <strong>Compliance</strong><br>
                                                <small>Basic controls missing</small>
                                            </div>
                                        </div>
                                        <p style="margin: 0; font-size: 13px; color: #666;">
                                            <strong>Situation:</strong> 50 unpatched devices, MFA not implemented, 2 critical CVEs active<br>
                                            <strong>Interpretation:</strong> This startup is behind on fundamentals. They should prioritize 
                                            patching and MFA before scaling.<br>
                                            <strong>Immediate Actions:</strong> 1) Enable auto-updates, 2) Deploy MFA, 3) Address critical CVEs
                                        </p>
                                    </div>

                                    <h4>Example 2: Enterprise with Strong Infrastructure</h4>
                                    <div class="example-card">
                                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px;">
                                            <div style="text-align: center;">
                                                <div class="score-badge good">87</div>
                                                <strong>Security</strong><br>
                                                <small>Well maintained</small>
                                            </div>
                                            <div style="text-align: center;">
                                                <div class="score-badge excellent">94</div>
                                                <strong>Risk</strong><br>
                                                <small>Minimal exposure</small>
                                            </div>
                                            <div style="text-align: center;">
                                                <div class="score-badge excellent">92</div>
                                                <strong>Compliance</strong><br>
                                                <small>Audit-ready</small>
                                            </div>
                                        </div>
                                        <p style="margin: 0; font-size: 13px; color: #666;">
                                            <strong>Situation:</strong> 2,000 devices, 98% patched, all controls implemented, 
                                            quarterly assessments<br>
                                            <strong>Interpretation:</strong> Enterprise is operating well. Minor gaps don't pose 
                                            significant risk.<br>
                                            <strong>Focus Areas:</strong> Maintain patch cadence, prepare for SOC 2 audit, 
                                            continuous improvement
                                        </p>
                                    </div>

                                    <h4>Example 3: Transitioning Legacy System</h4>
                                    <div class="example-card">
                                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px;">
                                            <div style="text-align: center;">
                                                <div class="score-badge fair">71</div>
                                                <strong>Security</strong><br>
                                                <small>Mostly patched</small>
                                            </div>
                                            <div style="text-align: center;">
                                                <div class="score-badge excellent">88</div>
                                                <strong>Risk</strong><br>
                                                <small>Well mitigated</small>
                                            </div>
                                            <div style="text-align: center;">
                                                <div class="score-badge poor">42</div>
                                                <strong>Compliance</strong><br>
                                                <small>Old architecture</small>
                                            </div>
                                        </div>
                                        <p style="margin: 0; font-size: 13px; color: #666;">
                                            <strong>Situation:</strong> Legacy Windows 2008 servers (extended support patches only), 
                                            being replaced mid-2025<br>
                                            <strong>Interpretation:</strong> Security and Risk are good because end-of-life systems 
                                            have mitigations. Compliance is low because old architecture doesn't meet modern standards.<br>
                                            <strong>Strategy:</strong> Accelerate migration, don't invest in legacy compliance work
                                        </p>
                                    </div>

                                    <h4>Example 4: Post-Incident Remediation</h4>
                                    <div class="example-card">
                                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px;">
                                            <div style="text-align: center;">
                                                <div class="score-badge excellent">92</div>
                                                <strong>Security</strong><br>
                                                <small>Emergency patches</small>
                                            </div>
                                            <div style="text-align: center;">
                                                <div class="score-badge good">76</div>
                                                <strong>Risk</strong><br>
                                                <small>Known vulnerabilities</small>
                                            </div>
                                            <div style="text-align: center;">
                                                <div class="score-badge fair">68</div>
                                                <strong>Compliance</strong><br>
                                                <small>Process changes pending</small>
                                            </div>
                                        </div>
                                        <p style="margin: 0; font-size: 13px; color: #666;">
                                            <strong>Situation:</strong> After security incident, emergency patches applied, 
                                            but incident response procedures not fully documented<br>
                                            <strong>Interpretation:</strong> Security Score is high (patches done), Risk Score is 
                                            lower (incident vector still pending full fix), Compliance is low 
                                            (detection/response gaps identified)<br>
                                            <strong>Recovery Path:</strong> 1) Complete root cause remediation, 2) Document incident 
                                            response, 3) Implement detection improvements
                                        </p>
                                    </div>

                                    <h4>Key Takeaways</h4>
                                    <ul>
                                        <li>
                                            <strong>Different scores tell different stories:</strong> Never rely on just one score
                                        </li>
                                        <li>
                                            <strong>Context matters:</strong> Understand your business priorities—sometimes Compliance 
                                            matters most (regulated industries), sometimes Risk (high-threat environments)
                                        </li>
                                        <li>
                                            <strong>Trends over time:</strong> Watch how scores change month-to-month. Declining scores 
                                            need investigation.
                                        </li>
                                        <li>
                                            <strong>Benchmark against peers:</strong> Your industry has typical score ranges. 
                                            Know how you compare.
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        ` : ''}
                    </div>
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

customElements.define('score-guide', ScoreGuide);
