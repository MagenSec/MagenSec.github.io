export function ScoresTab(html) {
    return html`
        <div class="row">
            <div class="col-lg-8">
                <h3 style="margin-bottom:4px;">Understanding Your Scores</h3>
                <p class="text-muted" style="margin-bottom:28px;">MagenSec uses several scores to give you a clear picture of your security posture. One score leads — the Cyber Hygiene Score — and others give you specific viewpoints to act on.</p>

                <!-- Cyber Hygiene Score — LEAD METRIC -->
                <div class="card mb-4 border-primary" style="background:linear-gradient(135deg,rgba(0,84,166,.04),rgba(0,84,166,.01));">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">🛡️</span>
                            <h4 class="mb-0">Cyber Hygiene Score</h4>
                            <span class="badge bg-primary text-white ms-1" style="font-size:11px;">KEY METRIC</span>
                        </div>
                        <p class="mb-2">Your top-level security health number (0–100). Computed daily by MAGI — your AI Security Officer — across four security dimensions. This is the single number to watch: it tells you whether your organisation is trending toward resilience or risk, and whether you're positioned well for cyber insurance.</p>
                        <div class="table-responsive mb-3">
                            <table class="table table-bordered mb-0" style="font-size:13px;">
                                <thead><tr><th>Score</th><th>Grade</th><th>Insurance Readiness</th><th>What MAGI sees</th></tr></thead>
                                <tbody>
                                    <tr><td style="color:#2fb344;font-weight:600;">90–100</td><td><span class="badge bg-success text-white">A</span></td><td>Preferred</td><td>Strong controls across all four dimensions. Excellent insurance candidacy.</td></tr>
                                    <tr><td style="color:#4299e1;font-weight:600;">80–89</td><td><span class="badge bg-info text-white">B</span></td><td>Standard</td><td>Good hygiene with minor gaps. Qualifies for standard insurance in most cases.</td></tr>
                                    <tr><td style="color:#f59f00;font-weight:600;">70–79</td><td><span class="badge bg-warning text-white">C</span></td><td>Conditional</td><td>Moderate risk. Insurers may require a remediation plan or apply exclusions.</td></tr>
                                    <tr><td style="color:#d63939;font-weight:600;">60–69</td><td><span class="badge bg-danger text-white">D</span></td><td>At Risk</td><td>Elevated risk. Coverage may be declined or heavily loaded. Immediate focus needed.</td></tr>
                                    <tr><td style="color:#6b7280;font-weight:600;">0–59</td><td><span class="badge bg-secondary text-white">F</span></td><td>At Risk</td><td>Critical gaps across multiple dimensions. MAGI will produce a prioritised action plan.</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="alert alert-primary mb-0" style="border:none;background:rgba(0,84,166,.07);">
                            <strong>📊 Key viewpoint scores</strong> — below the Cyber Hygiene Score on the Home dashboard are four dimension scores. Each is a specific lens: use them to diagnose <em>why</em> your Hygiene Score is what it is and which area to focus on first.
                        </div>
                    </div>
                </div>

                <!-- The four dimension scores -->
                <h4 class="d-flex align-items-center gap-2" style="margin-bottom:16px;">
                    <span style="font-size:20px;">🔍</span> The Four Dimension Scores
                </h4>
                <p>These scores power the Cyber Hygiene Score. They are also shown individually so you can see which dimension needs work. When your Hygiene Score drops, check which dimension drove the change.</p>

                <!-- Security Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">☣️</span>
                            <h4 class="mb-0">Threat Exposure Score</h4>
                        </div>
                        <p class="mb-2">How exposed your devices are to known vulnerabilities. MAGI considers both <strong>severity</strong> (Critical/High/Medium/Low) and <strong>age</strong> — vulnerabilities that have been sitting unpatched for months carry progressively more weight than fresh ones. CISA KEV-listed exploits receive the highest urgency treatment.</p>
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
                        <p class="mb-2">How closely your controls and configurations align with CIS Controls v8.1 and NIST CSF 2.0. MAGI counts gaps but also weighs their priority — a high-priority control gap has more impact than a low-priority one.</p>
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
                        <p class="mb-2">How quickly your team acts on identified vulnerabilities. Derived from your actual patching history. Organisations that consistently patch within days outperform those that address issues sporadically over months — and MAGI reflects this distinction clearly in the Hygiene Score.</p>
                        <p class="text-muted mb-0" style="font-size:13px;"><strong>Viewpoint action:</strong> Check the Audit page for average time-to-remediate. If it's high, establish a patch SLA with your team. Even a simple rule like "Critical findings within 7 days, High within 14" will improve this dimension significantly within weeks.</p>
                    </div>
                </div>

                <!-- Risk Posture / Coverage Score -->
                <div class="card mb-4">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">📡</span>
                            <h4 class="mb-0">Fleet Coverage Score</h4>
                        </div>
                        <p class="mb-2">Whether all your enrolled devices are actively reporting telemetry. A device that has stopped reporting is a potential monitoring blind spot — MAGI cannot detect threats on devices that go dark, and the score reflects that gap honestly.</p>
                        <p class="text-muted mb-0" style="font-size:13px;"><strong>Viewpoint action:</strong> Check the Devices page for any Stale or Offline devices. Investigate why they've stopped reporting — common causes include the MagenSec service being stopped, a device being decommissioned, or a network firewall block. Resolving one offline device can improve this dimension immediately.</p>
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
                        <p class="mb-0">Your organisation's raw vulnerability exposure (0–100, higher is better). This is the Threat Exposure dimension shown separately in the dashboard summary row. It uses the same A–B–C–D–F grading system. The Cyber Hygiene Score incorporates this along with the three other dimensions to give the complete picture.</p>
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
                        <p class="mb-2">A composite measure of how much risk this specific device carries (0–100, <strong>higher means more risk</strong>). It factors in:</p>
                        <ul class="mb-2">
                            <li><strong>CVE severity load</strong> — weighted by Critical (highest), High, Medium, and Low counts</li>
                            <li><strong>Known exploit penalty</strong> — extra weight for vulnerabilities with active real-world exploits</li>
                            <li><strong>CVE density</strong> — ratio of vulnerabilities to installed applications</li>
                            <li><strong>Risky applications</strong> — apps with known vulnerabilities or end-of-life status</li>
                            <li><strong>Telemetry health</strong> — devices that haven't checked in recently get a penalty</li>
                        </ul>
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
                        <p class="mb-0">Estimated compliance readiness for this specific device, based on its Security Score adjusted for critical vulnerability count. The more critical vulnerabilities a device has, the more it impacts compliance.</p>
                    </div>
                </div>

                <!-- Device Posture Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">📊</span>
                            <h4 class="mb-0">Posture Score (per device)</h4>
                        </div>
                        <p class="mb-0">A blended executive-level indicator that combines the device's Security Score and Compliance Score equally. Useful for a single at-a-glance measure of overall device health.</p>
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
                <p>Start with the Cyber Hygiene Score and Grade on the Home dashboard. If it's lower than you want, look at which dimension score is lowest and use that page to investigate and act.</p>

                <div class="alert alert-success mt-3" style="border-left:4px solid #2fb344;">
                    <strong>Tip:</strong> A sudden drop in your Cyber Hygiene Score usually means new vulnerabilities were published affecting your software, or a device went offline. Check MAGI's daily brief for the specific explanation — it will tell you exactly what drove the change.
                </div>
            </div>
        </div>
    `;
}
