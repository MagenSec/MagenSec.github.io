export function ScoresTab(html) {
    return html`
        <div class="row">
            <div class="col-lg-8">
                <h3 style="margin-bottom:4px;">Understanding Your Scores</h3>
                <p class="text-muted" style="margin-bottom:28px;">MagenSec uses several scores to give you a clear picture of your security posture at both the organization and device level.</p>

                <!-- Organization-Level Scores -->
                <h4 class="d-flex align-items-center gap-2" style="margin-bottom:16px;">
                    <span style="font-size:20px;">\ud83c\udfe2</span> Organization-Level Scores
                </h4>
                <p>These scores appear on your <strong>Home</strong> dashboard and reflect your entire organization\u2019s posture.</p>

                <!-- Security Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">\ud83d\udee1\ufe0f</span>
                            <h4 class="mb-0">Security Score</h4>
                        </div>
                        <p class="mb-2">Your primary measure of overall security health. This score (0\u2013100) reflects how well-protected your devices are against known vulnerabilities. It comes with a letter grade:</p>
                        <div class="table-responsive">
                            <table class="table table-bordered mb-2" style="font-size:13px;">
                                <thead><tr><th>Score</th><th>Grade</th><th>Label</th><th>What It Means</th></tr></thead>
                                <tbody>
                                    <tr><td style="color:#2fb344;font-weight:600;">80\u2013100</td><td><span class="badge bg-success-lt text-success">A</span></td><td>Excellent</td><td>Strong posture. Most vulnerabilities are patched. Keep it up.</td></tr>
                                    <tr><td style="color:#4299e1;font-weight:600;">60\u201379</td><td><span class="badge bg-info-lt text-info">B</span></td><td>Good</td><td>Solid baseline with some gaps to close.</td></tr>
                                    <tr><td style="color:#f59f00;font-weight:600;">40\u201359</td><td><span class="badge bg-warning-lt text-warning">C</span></td><td>Fair</td><td>Notable vulnerabilities present. Prioritize Critical and High items.</td></tr>
                                    <tr><td style="color:#d63939;font-weight:600;">0\u201339</td><td><span class="badge bg-danger-lt text-danger">D</span></td><td>Poor</td><td>Significant exposure. Take immediate action on the most severe issues.</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <p class="text-muted mb-0" style="font-size:13px;"><strong>How to improve:</strong> Install available updates, remove end-of-life software, and address Critical/High findings first. Your score updates after each scan.</p>
                    </div>
                </div>

                <!-- Compliance Score -->
                <div class="card mb-4">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">\ud83d\udcd0</span>
                            <h4 class="mb-0">Compliance Score</h4>
                        </div>
                        <p class="mb-2">Shows how closely your devices align with security frameworks like CIS Controls v8.1 and NIST CSF 2.0. Displayed as a percentage on the dashboard, with compliant and non-compliant device counts.</p>
                        <p class="text-muted mb-0" style="font-size:13px;"><strong>How to improve:</strong> Business plan users can open the Compliance page to see which framework areas are weakest. Focus on those first \u2014 common quick wins include enabling automatic updates, ensuring antivirus is active, and turning on system logging.</p>
                    </div>
                </div>

                <!-- Device-Level Scores -->
                <h4 class="d-flex align-items-center gap-2" style="margin-top:32px; margin-bottom:16px;">
                    <span style="font-size:20px;">\ud83d\udcf1</span> Device-Level Scores
                </h4>
                <p>When you click into a specific device, you\u2019ll see more detailed scores on its detail page. These give a per-device breakdown.</p>

                <!-- Device Security Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">\ud83d\udee1\ufe0f</span>
                            <h4 class="mb-0">Security Score (per device)</h4>
                        </div>
                        <p class="mb-2">The device\u2019s overall protection level (0\u2013100, higher is better). It\u2019s the inverse of the device\u2019s Risk Score: a device with a high Security Score has low risk, and vice versa.</p>
                        <div class="table-responsive">
                            <table class="table table-bordered mb-0" style="font-size:13px;">
                                <thead><tr><th>Score</th><th>Label</th><th>What It Means</th></tr></thead>
                                <tbody>
                                    <tr><td style="color:#2fb344;font-weight:600;">85+</td><td>Strong</td><td>Well-patched with minimal risk factors.</td></tr>
                                    <tr><td style="color:#4299e1;font-weight:600;">60\u201384</td><td>Watch</td><td>Some issues present. Review the device\u2019s risk factors.</td></tr>
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
                            <span style="font-size:22px;">\u26a0\ufe0f</span>
                            <h4 class="mb-0">Risk Score (per device)</h4>
                        </div>
                        <p class="mb-2">A composite measure of how much risk this specific device carries (0\u2013100, <strong>higher means more risk</strong>). It factors in:</p>
                        <ul class="mb-2">
                            <li><strong>CVE severity load</strong> \u2014 weighted by Critical (highest), High, Medium, and Low counts</li>
                            <li><strong>Known exploit penalty</strong> \u2014 extra weight for vulnerabilities with active real-world exploits</li>
                            <li><strong>CVE density</strong> \u2014 ratio of vulnerabilities to installed applications</li>
                            <li><strong>Risky applications</strong> \u2014 apps with known vulnerabilities or end-of-life status</li>
                            <li><strong>Telemetry health</strong> \u2014 devices that haven\u2019t checked in recently get a penalty</li>
                        </ul>
                        <div class="table-responsive">
                            <table class="table table-bordered mb-0" style="font-size:13px;">
                                <thead><tr><th>Score</th><th>Color</th><th>What It Means</th></tr></thead>
                                <tbody>
                                    <tr><td style="font-weight:600;">70+</td><td><span class="badge bg-danger text-white">Red</span></td><td>High risk. Multiple severe or exploited vulnerabilities.</td></tr>
                                    <tr><td style="font-weight:600;">40\u201369</td><td><span class="badge bg-warning text-white">Orange</span></td><td>Moderate risk. Issues present that need remediation.</td></tr>
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
                            <span style="font-size:22px;">\ud83d\udcd0</span>
                            <h4 class="mb-0">Compliance Score (per device)</h4>
                        </div>
                        <p class="mb-0">Estimated compliance readiness for this specific device, based on its Security Score adjusted for critical vulnerability count. The more critical vulnerabilities a device has, the more it impacts compliance.</p>
                    </div>
                </div>

                <!-- Device Posture Score -->
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:22px;">\ud83d\udcca</span>
                            <h4 class="mb-0">Posture Score (per device)</h4>
                        </div>
                        <p class="mb-0">A blended executive-level indicator that combines the device\u2019s Security Score and Compliance Score equally. Useful for a single at-a-glance measure of overall device health.</p>
                    </div>
                </div>

                <!-- How They Work Together -->
                <h4 style="margin-top:32px;">How the Scores Work Together</h4>
                <ul>
                    <li><strong>Organization Security Score</strong> tells you the big picture: <em>"How is my organization doing overall?"</em></li>
                    <li><strong>Device Risk Score</strong> tells you the specifics: <em>"Which devices need the most attention?"</em></li>
                    <li><strong>Compliance Score</strong> tells you about standards: <em>"Am I meeting framework requirements?"</em></li>
                </ul>
                <p>Start with the organization-level Security Score and Grade on Home. If it drops, drill into individual devices to find which ones are pulling the score down, then use the remediation recommendations to fix them.</p>

                <div class="alert alert-success mt-3" style="border-left:4px solid #2fb344;">
                    <strong>Tip:</strong> A sudden drop in your Security Score usually means new vulnerabilities were published that affect your software. Check the Security page for the latest findings and prioritize patching.
                </div>
            </div>
        </div>
    `;
}
