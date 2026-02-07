/**
 * Score Guidance Page - Explains security, risk, and compliance scores
 * Path: /#/help/score-guidance
 * 
 * Purpose: Help users understand what different scores mean and how they're calculated
 * to avoid misinterpretation and guide remediation priorities.
 */

import { html } from 'https://cdn.jsdelivr.net/npm/lit-html@3/+esm';

class ScoreGuidancePage {
    constructor() {
        this.currentTab = 'overview';
    }

    render() {
        return html`
            <div class="page-wrapper">
                <div class="page-header d-print-none">
                    <div class="container-xl">
                        <div class="row align-items-center">
                            <div class="col">
                                <h2 class="page-title">Understanding Your Scores</h2>
                                <div class="text-muted">Learn what Security, Risk, and Compliance scores mean and how they're calculated</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="page-body">
                    <div class="container-xl">
                        <!-- Navigation Tabs -->
                        <div class="card">
                            <div class="card-body">
                                <div class="nav nav-tabs nav-fill" data-bs-toggle="tabs" role="tablist">
                                    <button class="nav-link ${this.currentTab === 'overview' ? 'active' : ''}" 
                                            @click=${() => this.setTab('overview')} role="tab">
                                        Overview
                                    </button>
                                    <button class="nav-link ${this.currentTab === 'security' ? 'active' : ''}" 
                                            @click=${() => this.setTab('security')} role="tab">
                                        Security Score
                                    </button>
                                    <button class="nav-link ${this.currentTab === 'risk' ? 'active' : ''}" 
                                            @click=${() => this.setTab('risk')} role="tab">
                                        Risk Score
                                    </button>
                                    <button class="nav-link ${this.currentTab === 'compliance' ? 'active' : ''}" 
                                            @click=${() => this.setTab('compliance')} role="tab">
                                        Compliance Score
                                    </button>
                                    <button class="nav-link ${this.currentTab === 'interpretation' ? 'active' : ''}" 
                                            @click=${() => this.setTab('interpretation')} role="tab">
                                        Interpretation Guide
                                    </button>
                                </div>
                            </div>
                            <div class="tab-content">
                                ${this.currentTab === 'overview' ? this.renderOverview() : ''}
                                ${this.currentTab === 'security' ? this.renderSecurityScore() : ''}
                                ${this.currentTab === 'risk' ? this.renderRiskScore() : ''}
                                ${this.currentTab === 'compliance' ? this.renderComplianceScore() : ''}
                                ${this.currentTab === 'interpretation' ? this.renderInterpretation() : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderOverview() {
        return html`
            <div class="card-body">
                <div class="row g-4">
                    <!-- Security Score Card -->
                    <div class="col-md-6 col-lg-4">
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex align-items-baseline">
                                    <div class="h1 mb-0 me-2">🛡️</div>
                                    <h3 class="card-title">Security Score</h3>
                                </div>
                                <p class="text-muted mt-2">
                                    Measures how many vulnerabilities and missing patches are present on your devices.
                                </p>
                                <div class="mt-3">
                                    <span class="badge bg-danger text-white">Lower is worse</span>
                                </div>
                                <p class="text-sm mt-2">
                                    <strong>Range:</strong> 0-100<br>
                                    <strong>Focus:</strong> Technical defects
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Risk Score Card -->
                    <div class="col-md-6 col-lg-4">
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex align-items-baseline">
                                    <div class="h1 mb-0 me-2">⚠️</div>
                                    <h3 class="card-title">Risk Score</h3>
                                </div>
                                <p class="text-muted mt-2">
                                    Estimates the business impact if vulnerabilities were exploited, considering exploitability and assets at risk.
                                </p>
                                <div class="mt-3">
                                    <span class="badge bg-warning text-white">Emphasizes impact</span>
                                </div>
                                <p class="text-sm mt-2">
                                    <strong>Range:</strong> 0-100<br>
                                    <strong>Focus:</strong> Business impact
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Compliance Score Card -->
                    <div class="col-md-6 col-lg-4">
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex align-items-baseline">
                                    <div class="h1 mb-0 me-2">✅</div>
                                    <h3 class="card-title">Compliance Score</h3>
                                </div>
                                <p class="text-muted mt-2">
                                    Measures alignment with security frameworks (CIS Controls, NIST CSF) and regulatory requirements.
                                </p>
                                <div class="mt-3">
                                    <span class="badge bg-info text-white">Framework alignment</span>
                                </div>
                                <p class="text-sm mt-2">
                                    <strong>Range:</strong> 0-100<br>
                                    <strong>Focus:</strong> Policy & standards
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mt-4">
                    <div class="card-body">
                        <h4>🔑 Key Insight</h4>
                        <p class="mb-0">
                            These three scores measure <strong>different aspects</strong> of your security posture:
                            <br><br>
                            <strong>Security</strong> = How many problems do you have?<br>
                            <strong>Risk</strong> = How serious are those problems?<br>
                            <strong>Compliance</strong> = Do you meet industry standards?
                        </p>
                    </div>
                </div>
            </div>
        `;
    }

    renderSecurityScore() {
        return html`
            <div class="card-body">
                <h4>Security Score Breakdown</h4>
                
                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">What It Measures</h5>
                    </div>
                    <div class="card-body">
                        <ul class="list-unstyled">
                            <li class="mb-3">
                                <span class="badge bg-danger me-2">🔴</span>
                                <strong>Critical Vulnerabilities</strong> - Remote code execution, authentication bypass
                            </li>
                            <li class="mb-3">
                                <span class="badge bg-warning me-2">🟠</span>
                                <strong>High Vulnerabilities</strong> - Privilege escalation, data exposure
                            </li>
                            <li class="mb-3">
                                <span class="badge bg-info me-2">🔵</span>
                                <strong>Medium Vulnerabilities</strong> - Configuration issues, missing patches
                            </li>
                            <li class="mb-3">
                                <span class="badge bg-success me-2">🟢</span>
                                <strong>Patch Compliance</strong> - Operating system and application updates
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">Calculation Formula</h5>
                    </div>
                    <div class="card-body">
                        <pre class="p-3 bg-light rounded"><code>Security Score = 100 - (Weight × Vulnerability Count)

Weights per severity level:
  Critical: 10 points
  High: 5 points
  Medium: 2 points
  Low: 1 point

Minimum: 0 | Maximum: 100</code></pre>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">Score Interpretation</h5>
                    </div>
                    <div class="card-body">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Range</th>
                                    <th>Status</th>
                                    <th>Meaning</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><span class="badge bg-success">90-100</span></td>
                                    <td>Excellent</td>
                                    <td>Very few vulnerabilities detected</td>
                                </tr>
                                <tr>
                                    <td><span class="badge bg-info">70-89</span></td>
                                    <td>Good</td>
                                    <td>Some vulnerabilities, mostly minor</td>
                                </tr>
                                <tr>
                                    <td><span class="badge bg-warning">50-69</span></td>
                                    <td>Fair</td>
                                    <td>Multiple vulnerabilities including high severity</td>
                                </tr>
                                <tr>
                                    <td><span class="badge bg-danger">0-49</span></td>
                                    <td>Poor</td>
                                    <td>Critical vulnerabilities present, immediate action required</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="alert alert-info mt-3">
                    <strong>💡 Example:</strong> A system with 2 critical vulnerabilities and 3 high vulnerabilities would have a security score of: 
                    <code>100 - (2×10 + 3×5) = 100 - 35 = 65</code>
                </div>
            </div>
        `;
    }

    renderRiskScore() {
        return html`
            <div class="card-body">
                <h4>Risk Score Breakdown</h4>
                
                <div class="alert alert-warning">
                    <strong>⚠️ Important:</strong> Risk is different from vulnerability count. A single high-impact vulnerability might result in a higher risk score than multiple low-impact ones.
                </div>

                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">What It Measures</h5>
                    </div>
                    <div class="card-body">
                        <h6>Risk considers three factors:</h6>
                        <ul class="list-unstyled">
                            <li class="mb-3">
                                <span class="badge bg-danger me-2">📊</span>
                                <strong>Vulnerability Severity</strong> - CVSS score and impact rating
                            </li>
                            <li class="mb-3">
                                <span class="badge bg-danger me-2">🎯</span>
                                <strong>Exploitability</strong> - How easy it is to exploit (using KEV and exploit availability)
                            </li>
                            <li class="mb-3">
                                <span class="badge bg-danger me-2">🏢</span>
                                <strong>Asset Criticality</strong> - What systems are affected (servers, workstations, IoT)
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">Calculation Formula</h5>
                    </div>
                    <div class="card-body">
                        <pre class="p-3 bg-light rounded"><code>Risk Score = 100 - (Σ Per-Vulnerability Risk)

Per-Vulnerability Risk = CVSS × Exploitability × Asset Weight

CVSS: 0-10 (severity of vulnerability)
Exploitability: 1.5× if exploit exists, 1.0× if not
Asset Weight: 1.0 for workstations, 1.5 for servers

Minimum: 0 | Maximum: 100</code></pre>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">Score Interpretation</h5>
                    </div>
                    <div class="card-body">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Range</th>
                                    <th>Status</th>
                                    <th>Business Impact</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><span class="badge bg-success">85-100</span></td>
                                    <td>Low Risk</td>
                                    <td>Minimal business impact if exploited</td>
                                </tr>
                                <tr>
                                    <td><span class="badge bg-info">60-84</span></td>
                                    <td>Moderate Risk</td>
                                    <td>Notable impact on operations or data</td>
                                </tr>
                                <tr>
                                    <td><span class="badge bg-warning">30-59</span></td>
                                    <td>High Risk</td>
                                    <td>Significant threat to business continuity</td>
                                </tr>
                                <tr>
                                    <td><span class="badge bg-danger">0-29</span></td>
                                    <td>Critical Risk</td>
                                    <td>Potential for major data loss or system compromise</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="alert alert-warning mt-3">
                    <strong>📌 Real-World Example:</strong>
                    <ul class="mb-0 mt-2">
                        <li><strong>Scenario A:</strong> 10 medium vulnerabilities on workstations → Security Score: 80, Risk Score: 75</li>
                        <li><strong>Scenario B:</strong> 1 critical vulnerability on your main database server with public exploit → Security Score: 90, Risk Score: 20</li>
                    </ul>
                    <p class="mt-2 mb-0"><em>Scenario B has HIGHER security score but LOWER risk score because the risk is more severe despite fewer total vulnerabilities.</em></p>
                </div>
            </div>
        `;
    }

    renderComplianceScore() {
        return html`
            <div class="card-body">
                <h4>Compliance Score Breakdown</h4>
                
                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">What It Measures</h5>
                    </div>
                    <div class="card-body">
                        <p>Compliance scores measure alignment with industry-recognized security frameworks:</p>
                        <ul class="list-unstyled">
                            <li class="mb-3">
                                <span class="badge bg-primary me-2">CIS</span>
                                <strong>CIS Controls v8</strong> - Prioritized set of 18 security controls from Center for Internet Security
                            </li>
                            <li class="mb-3">
                                <span class="badge bg-primary me-2">NIST</span>
                                <strong>NIST Cybersecurity Framework 2.0</strong> - Six functions: Govern, Identify, Protect, Detect, Respond, Recover
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">CIS Controls Scoring</h5>
                    </div>
                    <div class="card-body">
                        <h6>18 Controls grouped by Implementation Group:</h6>
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Group</th>
                                    <th>Focus</th>
                                    <th>Controls</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><strong>IG1</strong></td>
                                    <td>Essential, foundational controls</td>
                                    <td>6 controls (e.g., inventory, access control)</td>
                                </tr>
                                <tr>
                                    <td><strong>IG2</strong></td>
                                    <td>Advanced controls for mature orgs</td>
                                    <td>8 additional controls (e.g., logging, encryption)</td>
                                </tr>
                                <tr>
                                    <td><strong>IG3</strong></td>
                                    <td>Expert-level controls for high-security environments</td>
                                    <td>4 advanced controls (e.g., threat hunting, SIEM)</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="mt-3">
                            <h6>Score Calculation:</h6>
                            <pre class="p-2 bg-light rounded text-sm"><code>CIS Score = 100 - (Gap Count × 5)

For each control not fully implemented:
  -5 points from score (20 controls total)</code></pre>
                        </div>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">NIST CSF Scoring</h5>
                    </div>
                    <div class="card-body">
                        <h6>6 Functions with multiple subcategories:</h6>
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Function</th>
                                    <th>Purpose</th>
                                    <th>Subcategories</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><strong>Govern</strong></td>
                                    <td>Risk and strategy management</td>
                                    <td>4</td>
                                </tr>
                                <tr>
                                    <td><strong>Identify</strong></td>
                                    <td>Asset and threat discovery</td>
                                    <td>6</td>
                                </tr>
                                <tr>
                                    <td><strong>Protect</strong></td>
                                    <td>Access control and data security</td>
                                    <td>7</td>
                                </tr>
                                <tr>
                                    <td><strong>Detect</strong></td>
                                    <td>Continuous monitoring</td>
                                    <td>4</td>
                                </tr>
                                <tr>
                                    <td><strong>Respond</strong></td>
                                    <td>Incident response procedures</td>
                                    <td>3</td>
                                </tr>
                                <tr>
                                    <td><strong>Recover</strong></td>
                                    <td>Business continuity and recovery</td>
                                    <td>2</td>
                                </tr>
                            </tbody>
                        </table>

                        <div class="mt-3">
                            <h6>Score Calculation:</h6>
                            <pre class="p-2 bg-light rounded text-sm"><code>NIST Score = 100 - (Gap Count × 4)

For each subcategory gap:
  -4 points from score (26 subcategories total)</code></pre>
                        </div>
                    </div>
                </div>

                <div class="alert alert-info mt-3">
                    <strong>💡 Key Point:</strong> A low compliance score doesn't mean you're insecure - it means your controls don't match a specific framework. Many small businesses use informal security practices that work well for their risk profile but don't align with CIS/NIST.
                </div>
            </div>
        `;
    }

    renderInterpretation() {
        return html`
            <div class="card-body">
                <h4>Interpretation Guide & Scenarios</h4>

                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">Score Combinations & What They Mean</h5>
                    </div>
                    <div class="card-body">
                        <div class="space-y-3">
                            <!-- Scenario 1 -->
                            <div class="alert alert-success border-start border-success border-3">
                                <h6 class="mb-2">✅ All Scores High (80+)</h6>
                                <p class="mb-2"><strong>What it means:</strong> Healthy security posture with few vulnerabilities, low business risk, and strong framework alignment.</p>
                                <p class="text-sm text-muted mb-0"><strong>Action:</strong> Maintain current practices. Continue monitoring and regular updates.</p>
                            </div>

                            <!-- Scenario 2 -->
                            <div class="alert alert-warning border-start border-warning border-3">
                                <h6 class="mb-2">⚠️ High Security Score, Low Risk Score</h6>
                                <p class="mb-2"><strong>Example:</strong> Security: 85, Risk: 35, Compliance: 70</p>
                                <p class="mb-2"><strong>What it means:</strong> Few vulnerabilities overall, but what you have is critical and affects high-value systems (e.g., exploitable zero-day on your main server).</p>
                                <p class="text-sm text-muted mb-0"><strong>Action:</strong> <strong>URGENT</strong> - Prioritize the vulnerabilities causing high risk, even if total count is low.</p>
                            </div>

                            <!-- Scenario 3 -->
                            <div class="alert alert-info border-start border-info border-3">
                                <h6 class="mb-2">ℹ️ Low Security Score, High Risk Score</h6>
                                <p class="mb-2"><strong>Example:</strong> Security: 45, Risk: 75, Compliance: 60</p>
                                <p class="mb-2"><strong>What it means:</strong> Many vulnerabilities detected, but most are low/medium severity or on non-critical systems, so business impact is manageable.</p>
                                <p class="text-sm text-muted mb-0"><strong>Action:</strong> Plan systematic remediation. Focus on critical vulnerabilities first, then address volume through patches and updates.</p>
                            </div>

                            <!-- Scenario 4 -->
                            <div class="alert alert-danger border-start border-danger border-3">
                                <h6 class="mb-2">🚨 All Scores Low (Below 50)</h6>
                                <p class="mb-2"><strong>Example:</strong> Security: 35, Risk: 25, Compliance: 40</p>
                                <p class="mb-2"><strong>What it means:</strong> Critical security situation with many exploitable vulnerabilities on business-critical systems AND poor framework alignment.</p>
                                <p class="text-sm text-muted mb-0"><strong>Action:</strong> <strong>CRITICAL</strong> - Immediate security incident response. Prioritize critical vulnerabilities on main systems. Consider offline mode if compromise is suspected.</p>
                            </div>

                            <!-- Scenario 5 -->
                            <div class="alert border-start border-3" style="border-color: #6c757d;">
                                <h6 class="mb-2">🔶 High Security Score, Low Compliance Score</h6>
                                <p class="mb-2"><strong>Example:</strong> Security: 88, Risk: 80, Compliance: 35</p>
                                <p class="mb-2"><strong>What it means:</strong> Your security practices work well, but don't match formal frameworks. Common with startups or specialized tech companies using alternative security architectures.</p>
                                <p class="text-sm text-muted mb-0"><strong>Action:</strong> Document your actual practices. If compliance is required for customers/partners, plan framework alignment. Otherwise, maintain current practices if they're working.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">Remediation Priorities by Score Type</h5>
                    </div>
                    <div class="card-body">
                        <h6 class="mb-3">Which score should I focus on first?</h6>
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Situation</th>
                                    <th>Priority</th>
                                    <th>Why</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Risk score is very low</td>
                                    <td><span class="badge bg-danger">1st</span></td>
                                    <td>Urgent. Address exploitable vulnerabilities on critical systems immediately.</td>
                                </tr>
                                <tr>
                                    <td>Security score is low</td>
                                    <td><span class="badge bg-warning">2nd</span></td>
                                    <td>Important. Patch and update systems systematically. Reduces future risk.</td>
                                </tr>
                                <tr>
                                    <td>Compliance score is low</td>
                                    <td><span class="badge bg-info">3rd</span></td>
                                    <td>Important for regulated industries. May be deferred if security/risk are healthy.</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">Common Questions</h5>
                    </div>
                    <div class="card-body">
                        <div class="accordion" id="faqAccordion">
                            <div class="accordion-item">
                                <h2 class="accordion-header">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq1">
                                        Why does my security score drop suddenly?
                                    </button>
                                </h2>
                                <div id="faq1" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
                                    <div class="accordion-body">
                                        Usually because new vulnerabilities were discovered in a recent scan. This is <strong>good news</strong> - it means your security tool is working! Address the highest-priority items first.
                                    </div>
                                </div>
                            </div>
                            <div class="accordion-item">
                                <h2 class="accordion-header">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq2">
                                        Can I have a high security score with a low risk score?
                                    </button>
                                </h2>
                                <div id="faq2" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
                                    <div class="accordion-body">
                                        <strong>Yes!</strong> This happens when you have a few critical vulnerabilities affecting high-value systems. Focus on those few instead of worrying about the overall count.
                                    </div>
                                </div>
                            </div>
                            <div class="accordion-item">
                                <h2 class="accordion-header">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq3">
                                        What's a "good" score?
                                    </button>
                                </h2>
                                <div id="faq3" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
                                    <div class="accordion-body">
                                        It depends on your industry and risk tolerance:
                                        <ul class="mt-2 mb-0">
                                            <li><strong>Startups/SMBs:</strong> 70+ is generally acceptable</li>
                                            <li><strong>Mid-market:</strong> 75+ is recommended</li>
                                            <li><strong>Enterprise/Regulated:</strong> 85+ expected</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                            <div class="accordion-item">
                                <h2 class="accordion-header">
                                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#faq4">
                                        Should I match the NIST framework?
                                    </button>
                                </h2>
                                <div id="faq4" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
                                    <div class="accordion-body">
                                        Only if required:
                                        <ul class="mt-2 mb-0">
                                            <li><strong>Regulated industries</strong> (healthcare, finance, government) - YES, work toward alignment</li>
                                            <li><strong>Customer requirement</strong> (they mandate NIST compliance) - YES, plan alignment</li>
                                            <li><strong>General best practices</strong> - The framework is useful but not required for good security</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="alert alert-primary mt-3">
                    <strong>📊 Pro Tip:</strong> Don't optimize for scores. Optimize for actual security. Scores are dashboards to guide decisions, not the goal themselves. Focus on reducing <strong>risk first</strong>, then improving security and compliance.
                </div>
            </div>
        `;
    }

    setTab(tab) {
        this.currentTab = tab;
        this.updateView();
    }

    updateView() {
        // Re-render the component
        const container = document.getElementById('app');
        if (container) {
            const { render } = window.lit;
            render(this.render(), container);
        }
    }
}

export const scoreGuidancePage = new ScoreGuidancePage();
