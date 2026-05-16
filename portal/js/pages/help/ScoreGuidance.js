/**
 * Score Guidance Page — explains the Trust Intelligence scoring system to
 * customers without revealing the formula.
 *
 * Path: /#!/help/score-guidance
 *
 * Editorial rules (binding):
 * - NEVER print weights, multipliers, gap-deduction values, or any expression
 *   a competitor could copy. Use phrasing like "reflects", "considers",
 *   "calibrated to", "weighed alongside".
 * - Always explain WHAT a score is for and HOW to interpret it, not how it
 *   is computed.
 * - Mention the floor: scores never read zero. Even very poor posture floors
 *   so customers see a present-but-failing system, not a broken one.
 * - Voice is calm, direct, and senior — same as Officer MAGI.
 */

const { html } = window;

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
                                <h2 class="page-title">Understanding Your Trust Score</h2>
                                <div class="text-muted">
                                    A calm, plain-language explanation of what each score means and how to use it.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="page-body">
                    <div class="container-xl">
                        <div class="card">
                            <div class="card-body">
                                <div class="nav nav-tabs nav-fill" data-bs-toggle="tabs" role="tablist">
                                    ${this.renderTabButton('overview',       'Overview')}
                                    ${this.renderTabButton('trust',          'Trust Score')}
                                    ${this.renderTabButton('hygiene',        'Hygiene')}
                                    ${this.renderTabButton('risk',           'Risk')}
                                    ${this.renderTabButton('compliance',     'Compliance')}
                                    ${this.renderTabButton('interpretation', 'Interpretation Guide')}
                                </div>
                            </div>
                            <div class="tab-content">
                                ${this.currentTab === 'overview'       ? this.renderOverview()       : ''}
                                ${this.currentTab === 'trust'          ? this.renderTrustScore()     : ''}
                                ${this.currentTab === 'hygiene'        ? this.renderHygieneScore()   : ''}
                                ${this.currentTab === 'risk'           ? this.renderRiskScore()      : ''}
                                ${this.currentTab === 'compliance'     ? this.renderComplianceScore(): ''}
                                ${this.currentTab === 'interpretation' ? this.renderInterpretation() : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderTabButton(key, label) {
        return html`
            <button class="nav-link ${this.currentTab === key ? 'active' : ''}"
                    onclick=${() => this.setTab(key)} role="tab">
                ${label}
            </button>
        `;
    }

    // -----------------------------------------------------------------------
    // Overview — three components + the composite Trust Score.
    // -----------------------------------------------------------------------
    renderOverview() {
        return html`
            <div class="card-body">
                <div class="row g-4">
                    <!-- Trust Score (the headline) -->
                    <div class="col-md-12">
                        <div class="card border-primary">
                            <div class="card-body">
                                <div class="d-flex align-items-baseline gap-2">
                                    <h3 class="card-title mb-0">Trust Score <span class="badge bg-primary text-white ms-2">Headline</span></h3>
                                </div>
                                <p class="text-muted mt-2 mb-0">
                                    The single number you share with stakeholders. It is a calibrated composite
                                    that blends Hygiene, Risk, and Compliance into one read on how trustworthy
                                    your security posture is today. Range 0–100, letter grade A–F.
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Hygiene -->
                    <div class="col-md-6 col-lg-4">
                        <div class="card h-100">
                            <div class="card-body">
                                <h3 class="card-title mb-2">Hygiene</h3>
                                <p class="text-muted small mb-2">Are basics in order?</p>
                                <p class="mb-3">
                                    Reflects the volume and severity of unpatched vulnerabilities and
                                    missing patches across your fleet. Higher is healthier.
                                </p>
                                <span class="badge bg-secondary-lt text-secondary">Range 0–100</span>
                            </div>
                        </div>
                    </div>

                    <!-- Risk -->
                    <div class="col-md-6 col-lg-4">
                        <div class="card h-100">
                            <div class="card-body">
                                <h3 class="card-title mb-2">Risk</h3>
                                <p class="text-muted small mb-2">How serious is what is open?</p>
                                <p class="mb-3">
                                    Weighs severity, exploit availability, and asset importance to estimate
                                    the business impact if open issues were exploited. Higher means lower risk.
                                </p>
                                <span class="badge bg-secondary-lt text-secondary">Range 0–100</span>
                            </div>
                        </div>
                    </div>

                    <!-- Compliance -->
                    <div class="col-md-6 col-lg-4">
                        <div class="card h-100">
                            <div class="card-body">
                                <h3 class="card-title mb-2">Compliance</h3>
                                <p class="text-muted small mb-2">Are framework controls satisfied?</p>
                                <p class="mb-3">
                                    Reflects how many controls in the framework you have chosen
                                    (CIS Controls, NIST CSF, etc.) are currently satisfied. Higher is better.
                                </p>
                                <span class="badge bg-secondary-lt text-secondary">Range 0–100</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mt-4 border-warning">
                    <div class="card-body">
                        <h4 class="mb-2">Why scores never read zero</h4>
                        <p class="mb-0">
                            Trust Scores are floored to a small positive value — even systems with
                            major gaps retain a baseline. A failing posture reads “critical”
                            with a low non-zero number, not “0”, so you can see and measure
                            improvement as you remediate. Brand-new orgs without enough telemetry yet
                            display “—” with the note “Building baseline”.
                        </p>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-body">
                        <h4 class="mb-2">How to read these together</h4>
                        <ul class="mb-0">
                            <li><strong>Hygiene</strong> answers “how many things are open?”</li>
                            <li><strong>Risk</strong> answers “how bad would it be if those things were exploited?”</li>
                            <li><strong>Compliance</strong> answers “does the operation match the standard we hold ourselves to?”</li>
                            <li><strong>Trust Score</strong> answers “what is the one number for the board?”</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    // -----------------------------------------------------------------------
    // Trust Score (composite) — narrative only, no formula.
    // -----------------------------------------------------------------------
    renderTrustScore() {
        return html`
            <div class="card-body">
                <h4>Trust Score — the composite</h4>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">What it is</h5></div>
                    <div class="card-body">
                        <p class="mb-0">
                            A single calibrated composite that blends Hygiene, Risk, and Compliance into
                            one read on the trustworthiness of your security posture. It is the headline
                            number on the Hub and inside the Daily Report.
                        </p>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">What it considers</h5></div>
                    <div class="card-body">
                        <ul class="mb-0">
                            <li>The current state of <strong>Hygiene</strong>, <strong>Risk</strong>, and <strong>Compliance</strong>.</li>
                            <li>Whether any <em>critical</em> condition is present (which dampens the composite even if other components look healthy).</li>
                            <li>Telemetry freshness — stale or missing data tempers the headline number rather than pretending things are fine.</li>
                        </ul>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">Score ranges</h5></div>
                    <div class="card-body">
                        ${this.renderRangeTable([
                            { range: '90–100', grade: 'A', status: 'Trust is strong',  meaning: 'Posture is solid across the board. Maintain.' },
                            { range: '80–89',  grade: 'B', status: 'Trust is solid',   meaning: 'Healthy with a few small gaps to keep an eye on.' },
                            { range: '70–79',  grade: 'C', status: 'Trust is uneven',  meaning: 'Material gaps in at least one component; needs owners.' },
                            { range: '60–69',  grade: 'D', status: 'Trust is fragile', meaning: 'Several material gaps. Plan a focused remediation week.' },
                            { range: 'Below 60',      grade: 'F', status: 'Trust at risk',    meaning: 'Critical attention needed. Open the work queue and start.' }
                        ])}
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">Trajectory</h5></div>
                    <div class="card-body">
                        <p class="mb-2">Beside the score you will see a small trajectory glyph:</p>
                        <ul class="mb-0">
                            <li><strong>Climbing</strong> — improving meaningfully over the last window.</li>
                            <li><strong>Plateau</strong> — broadly stable.</li>
                            <li><strong>Slipping</strong> — declining; new issues are outpacing remediation.</li>
                            <li><strong>Recovering</strong> — turning up after a recent dip.</li>
                            <li><strong>Building trajectory</strong> — not enough history yet to call a direction.</li>
                        </ul>
                    </div>
                </div>

                <div class="alert alert-info mt-3 mb-0">
                    <strong>Important.</strong> Do not optimize for the headline number alone. Use it
                    to spot when something has changed, then open the component breakdown
                    (Hygiene, Risk, Compliance) to find what to do about it.
                </div>
            </div>
        `;
    }

    // -----------------------------------------------------------------------
    // Hygiene
    // -----------------------------------------------------------------------
    renderHygieneScore() {
        return html`
            <div class="card-body">
                <h4>Hygiene</h4>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">What it measures</h5></div>
                    <div class="card-body">
                        <p>Reflects the volume and severity of unpatched vulnerabilities and missing
                        patches across your fleet. Considers, among other things:</p>
                        <ul class="mb-0">
                            <li>Critical, high, medium, and low severity vulnerabilities currently open.</li>
                            <li>Operating system and application patch level on each device.</li>
                            <li>Devices that have stopped reporting and may be unmonitored.</li>
                        </ul>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">Score ranges</h5></div>
                    <div class="card-body">
                        ${this.renderRangeTable([
                            { range: '90–100', grade: '', status: 'Excellent', meaning: 'Very few open issues; routine maintenance only.' },
                            { range: '70–89',  grade: '', status: 'Good',      meaning: 'Some open issues, mostly minor.' },
                            { range: '50–69',  grade: '', status: 'Fair',      meaning: 'Multiple issues including some that warrant attention.' },
                            { range: 'Below 50',      grade: '', status: 'Poor',      meaning: 'Material backlog of unpatched issues; plan focused work.' }
                        ])}
                    </div>
                </div>

                <div class="alert alert-info mt-3 mb-0">
                    Hygiene drops fastest when critical CVEs accumulate or when devices stop
                    reporting. The fastest way to recover is to triage criticals first and
                    re-check ghosted devices.
                </div>
            </div>
        `;
    }

    // -----------------------------------------------------------------------
    // Risk
    // -----------------------------------------------------------------------
    renderRiskScore() {
        return html`
            <div class="card-body">
                <h4>Risk</h4>

                <div class="alert alert-warning">
                    <strong>Risk is not vulnerability count.</strong> One serious issue on a high-value
                    asset can drive Risk down further than many minor issues elsewhere.
                </div>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">What it considers</h5></div>
                    <div class="card-body">
                        <ul class="mb-0">
                            <li><strong>Severity</strong> — how serious the underlying vulnerability is.</li>
                            <li><strong>Exploitability</strong> — whether public exploits or active campaigns exist.</li>
                            <li><strong>Asset importance</strong> — whether the affected device runs sensitive workloads.</li>
                        </ul>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">Score ranges</h5></div>
                    <div class="card-body">
                        ${this.renderRangeTable([
                            { range: '85–100', grade: '', status: 'Low risk',      meaning: 'Minimal expected business impact if open issues were exploited.' },
                            { range: '60–84',  grade: '', status: 'Moderate risk', meaning: 'Notable potential impact on operations or data.' },
                            { range: '30–59',  grade: '', status: 'High risk',     meaning: 'Significant threat to business continuity; act this week.' },
                            { range: 'Below 30',      grade: '', status: 'Critical risk', meaning: 'Potential for major data loss or system compromise; act now.' }
                        ])}
                    </div>
                </div>

                <div class="alert alert-warning mt-3 mb-0">
                    <strong>Why two systems with similar Hygiene can have very different Risk:</strong>
                    one may have a few medium issues on workstations, the other may have a single
                    critical issue with a public exploit on its main database server. Risk surfaces
                    that difference; Hygiene does not.
                </div>
            </div>
        `;
    }

    // -----------------------------------------------------------------------
    // Compliance
    // -----------------------------------------------------------------------
    renderComplianceScore() {
        return html`
            <div class="card-body">
                <h4>Compliance</h4>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">What it measures</h5></div>
                    <div class="card-body">
                        <p>
                            Reflects how many controls in the framework you have chosen are currently
                            satisfied. We currently support:
                        </p>
                        <ul class="mb-0">
                            <li><strong>CIS Controls v8</strong> — 18 prioritized controls organized into Implementation Groups (IG1, IG2, IG3).</li>
                            <li><strong>NIST CSF 2.0</strong> — Six functions: Govern, Identify, Protect, Detect, Respond, Recover.</li>
                        </ul>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">Score ranges</h5></div>
                    <div class="card-body">
                        ${this.renderRangeTable([
                            { range: '90–100', grade: '', status: 'Aligned',        meaning: 'Almost all controls satisfied. Maintain.' },
                            { range: '70–89',  grade: '', status: 'Mostly aligned', meaning: 'A handful of gaps; assign owners.' },
                            { range: '50–69',  grade: '', status: 'Partial',        meaning: 'Several control families need work.' },
                            { range: 'Below 50',      grade: '', status: 'Misaligned',     meaning: 'The chosen framework is largely unsatisfied; plan a focused alignment effort.' }
                        ])}
                    </div>
                </div>

                <div class="alert alert-info mt-3 mb-0">
                    <strong>Important.</strong> A low Compliance score does not necessarily mean you
                    are insecure — it means your operations do not match the framework you have
                    chosen. Many small organizations operate securely with informal practices that
                    do not map cleanly onto CIS or NIST. Compliance matters most when customers,
                    insurers, or regulators require it.
                </div>
            </div>
        `;
    }

    // -----------------------------------------------------------------------
    // Interpretation guide — kept; formulas removed; numbers are illustrative.
    // -----------------------------------------------------------------------
    renderInterpretation() {
        return html`
            <div class="card-body">
                <h4>Interpretation Guide & Scenarios</h4>

                <div class="card mt-3">
                    <div class="card-header">
                        <h5 class="card-title">Score combinations — what they mean</h5>
                    </div>
                    <div class="card-body">
                        <div class="d-flex flex-column gap-3">

                            <div class="alert alert-success border-start border-success border-3 mb-0">
                                <h6 class="mb-2">All scores high (80+)</h6>
                                <p class="mb-2"><strong>Reading:</strong> Healthy posture across the board.</p>
                                <p class="text-sm text-muted mb-0"><strong>Action:</strong> Maintain. Keep the report current and watch trajectory.</p>
                            </div>

                            <div class="alert alert-warning border-start border-warning border-3 mb-0">
                                <h6 class="mb-2">Hygiene high, Risk low</h6>
                                <p class="mb-2"><em>Example:</em> Hygiene 85, Risk 35, Compliance 70.</p>
                                <p class="mb-2"><strong>Reading:</strong> Few open issues overall, but what is open is severe and on important assets.</p>
                                <p class="text-sm text-muted mb-0"><strong>Action:</strong> Focus on the small number of high-impact items. Triage criticals before patching everything else.</p>
                            </div>

                            <div class="alert alert-info border-start border-info border-3 mb-0">
                                <h6 class="mb-2">Hygiene low, Risk high</h6>
                                <p class="mb-2"><em>Example:</em> Hygiene 45, Risk 75, Compliance 60.</p>
                                <p class="mb-2"><strong>Reading:</strong> Many open issues, but they are mostly low or medium severity on non-critical systems.</p>
                                <p class="text-sm text-muted mb-0"><strong>Action:</strong> Plan systematic remediation. Use patch automation; escalate anything that touches important assets.</p>
                            </div>

                            <div class="alert alert-danger border-start border-danger border-3 mb-0">
                                <h6 class="mb-2">All scores low (below 50)</h6>
                                <p class="mb-2"><em>Example:</em> Hygiene 35, Risk 25, Compliance 40.</p>
                                <p class="mb-2"><strong>Reading:</strong> Critical situation across multiple dimensions.</p>
                                <p class="text-sm text-muted mb-0"><strong>Action:</strong> Open the work queue. Address criticals on important assets first; consider isolating anything you suspect is compromised.</p>
                            </div>

                            <div class="alert border-start border-3 mb-0" style="border-color: #6c757d;">
                                <h6 class="mb-2">High Hygiene + Risk, Low Compliance</h6>
                                <p class="mb-2"><em>Example:</em> Hygiene 88, Risk 80, Compliance 35.</p>
                                <p class="mb-2"><strong>Reading:</strong> Operations are working but do not match the chosen framework.</p>
                                <p class="text-sm text-muted mb-0"><strong>Action:</strong> Document actual practices. Pursue framework alignment only if customers, insurers, or regulators require it.</p>
                            </div>

                        </div>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">Where to focus first</h5></div>
                    <div class="card-body">
                        <table class="table table-sm">
                            <thead>
                                <tr><th>Situation</th><th>Priority</th><th>Why</th></tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Risk is very low</td>
                                    <td><span class="badge bg-danger text-white">First</span></td>
                                    <td>Urgent. The damage if exploited would be material.</td>
                                </tr>
                                <tr>
                                    <td>Hygiene is low</td>
                                    <td><span class="badge bg-warning text-white">Second</span></td>
                                    <td>Reduces future Risk and shortens the work queue.</td>
                                </tr>
                                <tr>
                                    <td>Compliance is low</td>
                                    <td><span class="badge bg-info text-white">Third</span></td>
                                    <td>Important when externally required; can be planned.</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card mt-3">
                    <div class="card-header"><h5 class="card-title">Common questions</h5></div>
                    <div class="card-body">
                        <div class="accordion" id="faqAccordion">
                            ${this.renderFaq('faq1', 'Why did my Trust Score drop suddenly?',
                                html`Usually because newly disclosed CVEs landed in your fleet on the latest scan. That is good news — the system noticed. Open the work queue and start with criticals.`)}
                            ${this.renderFaq('faq2', 'Why does the score read 5 instead of 0?',
                                html`Trust Scores are floored to a small positive value so a failing posture reads “critical” rather than “broken”. This lets you measure improvement as you remediate. Brand-new orgs without enough telemetry display “—” with “Building baseline” instead.`)}
                            ${this.renderFaq('faq3', 'Can I have a high Hygiene score with a low Risk score?',
                                html`Yes. Hygiene measures how many things are open; Risk measures how bad those things are if exploited. A small number of severe issues on important assets will drive Risk down even if Hygiene looks healthy.`)}
                            ${this.renderFaq('faq4', 'What is a "good" Trust Score?',
                                html`Industry context matters. As a rule of thumb: small businesses 70+, mid-market 75+, regulated or enterprise 85+. The trajectory matters more than the exact number — sustained improvement is the right signal.`)}
                            ${this.renderFaq('faq5', 'Should I align to NIST or CIS?',
                                html`Only if customers, insurers, or regulators require it, or if you want a structured improvement plan. Frameworks are useful scaffolding; they are not required for good security.`)}
                        </div>
                    </div>
                </div>

                <div class="alert alert-primary mt-3 mb-0">
                    <strong>Pro tip.</strong> Optimize for actual security, not for the score.
                    Use scores to spot change and focus attention. The Daily Report is the
                    artefact you share — the score is just the first line of it.
                </div>
            </div>
        `;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    renderRangeTable(rows) {
        return html`
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Range</th>
                        ${rows.some(r => r.grade) ? html`<th>Grade</th>` : ''}
                        <th>Status</th>
                        <th>Meaning</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => html`
                        <tr>
                            <td><span class="badge bg-secondary-lt text-secondary">${r.range}</span></td>
                            ${r.grade !== undefined && r.grade !== '' ? html`<td><strong>${r.grade}</strong></td>` : (rows.some(x => x.grade) ? html`<td></td>` : '')}
                            <td>${r.status}</td>
                            <td>${r.meaning}</td>
                        </tr>
                    `)}
                </tbody>
            </table>
        `;
    }

    renderFaq(id, question, answer) {
        return html`
            <div class="accordion-item">
                <h2 class="accordion-header">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${id}">
                        ${question}
                    </button>
                </h2>
                <div id="${id}" class="accordion-collapse collapse" data-bs-parent="#faqAccordion">
                    <div class="accordion-body">${answer}</div>
                </div>
            </div>
        `;
    }

    setTab(tab) {
        this.currentTab = tab;
        this.updateView();
    }

    updateView() {
        const container = document.getElementById('app');
        if (container) {
            const { render } = window;
            render(this.render(), container);
        }
    }
}

export const scoreGuidancePage = new ScoreGuidancePage();
