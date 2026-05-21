export function ScoresTab(html) {
    return html`
        <div class="row">
            <div class="col-lg-8">
                <h3 style="margin-bottom:4px;">Understanding Your Scores</h3>
                <p class="text-muted" style="margin-bottom:16px;">MagenSec scores summarize what the platform sees across your devices, vulnerabilities, compliance posture, fixes, and device coverage. They are designed to help you understand what changed and where to focus next.</p>

                <div class="alert alert-primary mb-4" style="border:none; background:linear-gradient(135deg,rgba(0,84,166,.07),rgba(0,84,166,.02));">
                    <div class="d-flex align-items-center gap-2">
                        <span style="font-size:20px;">🤖</span>
                        <div>
                            <strong>Evidence-Based Scoring</strong>
                            <div class="text-muted" style="font-size:13px;">MagenSec combines vulnerability severity, exploit signals, patch progress, compliance alignment, and device coverage. As your environment changes, your scores change with it.</div>
                        </div>
                    </div>
                </div>

                <!-- Cyber Hygiene Score — LEAD METRIC -->
                <div class="card mb-4 border-primary" style="background:linear-gradient(135deg,rgba(0,84,166,.04),rgba(0,84,166,.01));">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">🛡️</span>
                            <h4 class="mb-0">Cyber Hygiene Score</h4>
                            <span class="badge bg-primary text-white ms-1" style="font-size:11px;">KEY METRIC</span>
                        </div>
                        <p class="mb-2">Your top-level security health number (0–100). It summarizes threats, compliance, remediation progress, and device coverage. Use it as the single number to watch when checking whether your organization is improving or drifting toward risk.</p>
                        <div class="table-responsive mb-3">
                            <table class="table table-bordered mb-0" style="font-size:13px;">
                                <thead><tr><th>Score</th><th>Grade</th><th>Insurance Readiness</th><th>What it means</th></tr></thead>
                                <tbody>
                                    <tr><td style="color:#2fb344;font-weight:600;">90–100</td><td><span class="badge bg-success text-white">A</span></td><td>Preferred</td><td>Strong controls across all four dimensions. Excellent insurance candidacy.</td></tr>
                                    <tr><td style="color:#4299e1;font-weight:600;">80–89</td><td><span class="badge bg-info text-white">B</span></td><td>Standard</td><td>Good hygiene with minor gaps. Qualifies for standard insurance in most cases.</td></tr>
                                    <tr><td style="color:#f59f00;font-weight:600;">70–79</td><td><span class="badge bg-warning text-white">C</span></td><td>Conditional</td><td>Moderate risk. Insurers may require a remediation plan or apply exclusions.</td></tr>
                                    <tr><td style="color:#d63939;font-weight:600;">60–69</td><td><span class="badge bg-danger text-white">D</span></td><td>At Risk</td><td>Elevated risk. Coverage may be declined or heavily loaded. Immediate focus needed.</td></tr>
                                    <tr><td style="color:#6b7280;font-weight:600;">0–59</td><td><span class="badge bg-secondary text-white">F</span></td><td>At Risk</td><td>Critical gaps across multiple dimensions. Start with the most urgent recommendations.</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="alert alert-primary mb-0" style="border:none;background:rgba(0,84,166,.07);">
                            <strong>📊 Key viewpoint scores</strong> — MagenSec breaks the Hygiene Score into dimension scores. Use them to understand <em>why</em> your Hygiene Score changed and which area to focus on first.
                        </div>
                    </div>
                </div>

                <!-- The four dimension scores -->
                <h4 class="d-flex align-items-center gap-2" style="margin-bottom:16px;">
                    <span style="font-size:20px;">🔍</span> The Four Dimension Scores
                </h4>
                <p>MagenSec groups your posture into four dimensions. Each captures a different aspect of your security health. When your Hygiene Score changes, check which dimension moved.</p>

                <!-- Security Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">☣️</span>
                            <h4 class="mb-0">Threat Exposure Score</h4>
                        </div>
                        <p class="mb-2">How exposed your devices are to known vulnerabilities. MagenSec evaluates the full context of each vulnerability — severity, real-world exploitability, how long it has remained unpatched, and whether it appears in the CISA Known Exploited Vulnerabilities catalog. The longer a serious vulnerability sits unresolved, the more the score reflects the growing risk.</p>
                        <div class="table-responsive">
                            <table class="table table-bordered mb-2" style="font-size:13px;">
                                <thead><tr><th>Score</th><th>Grade</th><th>Viewpoint action</th></tr></thead>
                                <tbody>
                                    <tr><td style="color:#2fb344;font-weight:600;">80–100</td><td><span class="badge bg-success-lt text-success">A</span></td><td>Excellent. Keep patching Critical/High items as they appear.</td></tr>
                                    <tr><td style="color:#4299e1;font-weight:600;">60–79</td><td><span class="badge bg-info-lt text-info">B</span></td><td>Good. Identify any older High-severity findings and schedule them.</td></tr>
                                    <tr><td style="color:#f59f00;font-weight:600;">40–59</td><td><span class="badge bg-warning-lt text-warning">C</span></td><td>Notable exposure. Open the Security page, sort by severity, start from the top.</td></tr>
                                    <tr><td style="color:#d63939;font-weight:600;">0–39</td><td><span class="badge bg-danger-lt text-danger">D/F</span></td><td>Significant exposure. Focus immediately on Critical findings and any KEV-listed apps.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Compliance Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">📐</span>
                            <h4 class="mb-0">Compliance Alignment Score</h4>
                        </div>
                        <p class="mb-2">How closely your controls and configurations align with CIS Controls v8.1 and NIST CSF 2.0. MagenSec maps your security posture against these frameworks and evaluates gaps by their real-world impact — a high-priority control gap carries more significance than a low-priority one.</p>
                        <p class="text-muted mb-0" style="font-size:13px;"><strong>Viewpoint action:</strong> Open the Compliance page to see which framework areas have the most gaps. Common quick wins include enabling automatic updates, ensuring antivirus is active on all devices, and turning on system event logging. Business plan users get full gap-by-gap remediation guidance.</p>
                    </div>
                </div>

                <!-- Audit / Remediation Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">⏱️</span>
                            <h4 class="mb-0">Remediation Velocity Score</h4>
                        </div>
                        <p class="mb-2">How quickly your team acts on identified vulnerabilities. Organizations that consistently address findings promptly score higher than those with sporadic patching. This dimension rewards operational discipline and consistent follow-through.</p>
                        <p class="text-muted mb-0" style="font-size:13px;"><strong>Viewpoint action:</strong> Review your recent findings and decide on a patch target with your team. Even a simple rule like "Critical findings within 7 days, High within 14" can improve this dimension over time.</p>
                    </div>
                </div>

                <!-- Risk Posture / Coverage Score -->
                <div class="card mb-4">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">📡</span>
                            <h4 class="mb-0">Fleet Coverage Score</h4>
                        </div>
                        <p class="mb-2">Whether your enrolled devices are actively checking in. MagenSec can only assess devices it can see, so devices that stop reporting create monitoring blind spots. Short gaps are common, but extended silence affects this score.</p>
                        <p class="text-muted mb-0" style="font-size:13px;"><strong>Viewpoint action:</strong> Check the Devices page for devices that have not checked in recently. Common causes include the device being powered off, retired, disconnected from the network, or the MagenSec client not running.</p>
                    </div>
                </div>

                <!-- Organization-Level Scores -->
                <h4 class="d-flex align-items-center gap-2" style="margin-top:32px; margin-bottom:16px;">
                    <span style="font-size:20px;">🏢</span> Other Organisation-Level Scores
                </h4>

                <!-- Security Score (legacy display) -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">🛡️</span>
                            <h4 class="mb-0">Security Score</h4>
                            <span class="badge bg-secondary-lt text-secondary ms-1" style="font-size:11px;">component of Hygiene</span>
                        </div>
                        <p class="mb-0">Your organization’s vulnerability exposure (0–100, higher is better). This is the Threat Exposure dimension shown separately in the dashboard summary row. It uses the same A–B–C–D–F grading system. The Cyber Hygiene Score incorporates this along with the other dimensions to give the complete picture.</p>
                    </div>
                </div>

                <!-- Compliance Score (standalone) -->
                <div class="card mb-4">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">📋</span>
                            <h4 class="mb-0">Compliance Score</h4>
                            <span class="badge bg-secondary-lt text-secondary ms-1" style="font-size:11px;">component of Hygiene</span>
                        </div>
                        <p class="mb-0">Shown as a percentage on the Compliance page with CIS and NIST gap breakdowns. This score feeds directly into the Cyber Hygiene Score's Compliance Alignment dimension.</p>
                    </div>
                </div>

                <!-- Device-Level Scores -->
                <h4 class="d-flex align-items-center gap-2" style="margin-top:32px; margin-bottom:16px;">
                    <span style="font-size:20px;">📱</span> Device-Level Scores
                </h4>
                <p>Click into any device to see per-device scores. These help you identify which specific devices are pulling your organisation's score down.</p>

                <!-- Device Security Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">🛡️</span>
                            <h4 class="mb-0">Security Score (per device)</h4>
                        </div>
                        <p class="mb-2">The device's overall protection level (0–100, higher is better). It's the inverse of the device's Risk Score: a device with a high Security Score has low risk.</p>
                        <div class="table-responsive">
                            <table class="table table-bordered mb-0" style="font-size:13px;">
                                <thead><tr><th>Score</th><th>Label</th><th>What It Means</th></tr></thead>
                                <tbody>
                                    <tr><td style="color:#2fb344;font-weight:600;">85+</td><td>Strong</td><td>Well-patched with minimal risk factors.</td></tr>
                                    <tr><td style="color:#4299e1;font-weight:600;">60–84</td><td>Watch</td><td>Some issues present. Review the device's risk factors.</td></tr>
                                    <tr><td style="color:#d63939;font-weight:600;">Below 60</td><td>Critical</td><td>Significant vulnerabilities. Immediate attention needed.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Device Risk Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">⚠️</span>
                            <h4 class="mb-0">Risk Score (per device)</h4>
                        </div>
                        <p class="mb-2">How much risk this specific device carries (0–100, <strong>higher means more risk</strong>). It reflects vulnerability severity, exploit indicators, software health, and reporting status.</p>
                        <div class="table-responsive">
                            <table class="table table-bordered mb-0" style="font-size:13px;">
                                <thead><tr><th>Score</th><th>Color</th><th>What It Means</th></tr></thead>
                                <tbody>
                                    <tr><td style="font-weight:600;">70+</td><td><span class="badge bg-danger text-white">Red</span></td><td>High risk. Multiple severe or exploited vulnerabilities.</td></tr>
                                    <tr><td style="font-weight:600;">40–69</td><td><span class="badge bg-warning text-white">Orange</span></td><td>Moderate risk. Issues present that need remediation.</td></tr>
                                    <tr><td style="font-weight:600;">Below 40</td><td><span class="badge bg-success text-white">Green</span></td><td>Low risk. Device is well-maintained.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Device Compliance Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">📐</span>
                            <h4 class="mb-0">Compliance Score (per device)</h4>
                        </div>
                        <p class="mb-0">An estimate of compliance readiness for this specific device. It reflects the device’s overall security health and the severity of open issues.</p>
                    </div>
                </div>

                <!-- Device Posture Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">📊</span>
                            <h4 class="mb-0">Posture Score (per device)</h4>
                        </div>
                        <p class="mb-0">A blended executive-level indicator based on the device’s security and compliance assessments. Useful as a single at-a-glance measure of overall device health.</p>
                    </div>
                </div>

                <!-- How They Work Together -->
                <h4 style="margin-top:32px;">How the Scores Work Together</h4>
                <ul>
                    <li><strong>Cyber Hygiene Score</strong> is the headline: <em>"How is my organisation doing overall? Are we insurance-ready?"</em></li>
                    <li><strong>Threat Exposure / Security Score</strong> answers: <em>"How many vulnerabilities are we sitting on right now?"</em></li>
                    <li><strong>Compliance Alignment Score</strong> answers: <em>"Are we meeting the control frameworks our insurer cares about?"</em></li>
                    <li><strong>Remediation Velocity Score</strong> answers: <em>"Are we actually fixing things fast enough?"</em></li>
                    <li><strong>Fleet Coverage Score</strong> answers: <em>"Are all our devices actively monitored or are there blind spots?"</em></li>
                    <li><strong>Device Risk Score</strong> answers: <em>"Which specific devices need the most attention right now?"</em></li>
                </ul>
                <p>Start with the Cyber Hygiene Score and Grade on the Home dashboard. If the score is lower than you would like, review the dimension cards to see which area needs the most attention.</p>

                <div class="alert alert-success mt-3" style="border-left:4px solid #2fb344;">
                    <strong>Tip:</strong> A sudden drop in your Cyber Hygiene Score usually means new vulnerabilities were published affecting your software, or a device went offline. Check your daily brief and the recommended actions for the likely cause.
                </div>
            </div>
        </div>
    `;
}
