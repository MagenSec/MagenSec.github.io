export function GettingStartedTab(html) {
    return html`
        <div class="row">
            <div class="col-lg-8">
                <h3 style="margin-bottom:4px;">Getting Started with MagenSec</h3>
                <p class="text-muted" style="margin-bottom:28px;">Everything you need to set up MagenSec and start monitoring your devices.</p>

                <!-- Personal Plan Onboarding -->
                <h4 class="d-flex align-items-center gap-2" style="margin-bottom:16px;">
                    <span style="font-size:20px;">👤</span> Personal Plan
                </h4>
                <div class="card mb-3">
                    <div class="card-body">
                        <p class="mb-3">The Personal plan is designed for individuals protecting up to <strong>5 devices</strong>. You can create your account and start scanning in minutes.</p>

                        <div class="d-flex gap-3 mb-3">
                            <div style="min-width:32px;height:32px;border-radius:50%;background:#0054a6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">1</div>
                            <div>
                                <strong>Install the MagenSec client</strong>
                                <p class="mb-0 text-muted" style="font-size:13px;">Install from the <a href="https://apps.microsoft.com/detail/xpfmw6btjzf89s" target="_blank" rel="noopener">official Microsoft Store listing</a> or run <code>winget install MagenSec --silent --accept-package-agreements</code> for scripted install.</p>
                            </div>
                        </div>
                        <div class="d-flex gap-3 mb-3">
                            <div style="min-width:32px;height:32px;border-radius:50%;background:#0054a6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">2</div>
                            <div>
                                <strong>Choose "Personal" in the license prompt</strong>
                                <p class="mb-0 text-muted" style="font-size:13px;">When the client starts, select the Personal license option.</p>
                            </div>
                        </div>
                        <div class="d-flex gap-3 mb-3">
                            <div style="min-width:32px;height:32px;border-radius:50%;background:#0054a6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">3</div>
                            <div>
                                <strong>Sign in with your Google account</strong>
                                <p class="mb-0 text-muted" style="font-size:13px;">Your Google account creates your MagenSec account and organization automatically. You get <strong>7 days free</strong> to try the platform.</p>
                            </div>
                        </div>
                        <div class="d-flex gap-3 mb-3">
                            <div style="min-width:32px;height:32px;border-radius:50%;background:#0054a6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">4</div>
                            <div>
                                <strong>Open the portal to see your results</strong>
                                <p class="mb-0 text-muted" style="font-size:13px;">After the first scan completes (typically 3\u20135 minutes), sign in to the portal with the same Google account. Your device and security data will be ready.</p>
                            </div>
                        </div>

                        <div class="alert alert-info mb-0" style="border-left:4px solid #4299e1; font-size:13px;">
                            <strong>Have a coupon code?</strong> Enter your MAGICode during setup to get additional free days beyond the standard 7-day trial.
                        </div>
                    </div>
                </div>

                <!-- Business / Education Onboarding -->
                <h4 class="d-flex align-items-center gap-2" style="margin-top:32px; margin-bottom:16px;">
                    <span style="font-size:20px;">🏢</span> Business & Education Plans
                </h4>
                <div class="card mb-3">
                    <div class="card-body">
                        <p class="mb-3">Business and Education organizations are set up by the MagenSec team. Here\u2019s how onboarding works:</p>

                        <div class="d-flex gap-3 mb-3">
                            <div style="min-width:32px;height:32px;border-radius:50%;background:#0054a6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">1</div>
                            <div>
                                <strong>Contact MagenSec for your license</strong>
                                <p class="mb-0 text-muted" style="font-size:13px;">The MagenSec product team creates your organization and provisions your license. You\u2019ll receive your license key by email.</p>
                            </div>
                        </div>
                        <div class="d-flex gap-3 mb-3">
                            <div style="min-width:32px;height:32px;border-radius:50%;background:#0054a6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">2</div>
                            <div>
                                <strong>Install the MagenSec client on your devices</strong>
                                <p class="mb-0 text-muted" style="font-size:13px;">Use the <a href="https://apps.microsoft.com/detail/xpfmw6btjzf89s" target="_blank" rel="noopener">Microsoft Store listing</a> for standard rollout, or use <code>winget install MagenSec --silent --accept-package-agreements</code> in your endpoint management workflow.</p>
                            </div>
                        </div>
                        <div class="d-flex gap-3 mb-3">
                            <div style="min-width:32px;height:32px;border-radius:50%;background:#0054a6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">3</div>
                            <div>
                                <strong>Enter your license key during setup</strong>
                                <p class="mb-0 text-muted" style="font-size:13px;">Each device is onboarded with the license key provided in your email. Devices register automatically with your organization once the key is entered.</p>
                            </div>
                        </div>
                        <div class="d-flex gap-3">
                            <div style="min-width:32px;height:32px;border-radius:50%;background:#0054a6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">4</div>
                            <div>
                                <strong>Sign in to the portal</strong>
                                <p class="mb-0 text-muted" style="font-size:13px;">Sign in with the Google account associated with your organization. Your dashboard will populate as devices complete their first scans.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- What You'll See -->
                <h4 style="margin-top:32px;">What You\u2019ll See After Your First Scan</h4>
                <p>Once your devices are scanned, the portal shows:</p>
                <ul>
                    <li><strong>Security Score</strong> \u2014 your overall vulnerability posture, graded A through D</li>
                    <li><strong>Compliance Score</strong> \u2014 how well your devices align with security frameworks</li>
                    <li><strong>Vulnerabilities</strong> \u2014 every known CVE found on your devices, sorted by severity</li>
                    <li><strong>Software Inventory</strong> \u2014 a complete list of installed applications and versions</li>
                    <li><strong>Recommended Actions</strong> \u2014 specific steps to improve your security posture</li>
                </ul>

                <div class="alert alert-success mt-3" style="border-left:4px solid #2fb344;">
                    <strong>Tip:</strong> Scans run automatically in the background. Just check back to see your latest scores and findings.
                </div>

                <!-- Plan Comparison -->
                <h4 style="margin-top:32px;">Plan Comparison</h4>
                <div class="table-responsive">
                    <table class="table table-bordered" style="font-size:13px;">
                        <thead>
                            <tr>
                                <th>Feature</th>
                                <th>Personal</th>
                                <th>Education</th>
                                <th>Business</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td>Devices</td><td>Up to 5</td><td>Up to 25</td><td>10\u2013500+</td></tr>
                            <tr><td>Vulnerability scanning</td><td>\u2705</td><td>\u2705</td><td>\u2705</td></tr>
                            <tr><td>Software inventory</td><td>\u2705</td><td>\u2705</td><td>\u2705</td></tr>
                            <tr><td>Antivirus management</td><td>\u2705</td><td>\u2705</td><td>\u2705</td></tr>
                            <tr><td>Security Score & Grade</td><td>\u2705</td><td>\u2705</td><td>\u2705</td></tr>
                            <tr><td>Daily snapshot report</td><td>\u2705</td><td>\u2705</td><td>\u2705</td></tr>
                            <tr><td>Weekly trend analysis</td><td>\u2014</td><td>\u2705</td><td>\u2705</td></tr>
                            <tr><td>Multi-user group management</td><td>\u2014</td><td>\u2705</td><td>\u2705</td></tr>
                            <tr><td>Officer MAGI (AI analyst)</td><td>\u2014</td><td>\u2014</td><td>\u2705</td></tr>
                            <tr><td>Mission Brief (AI reports)</td><td>\u2014</td><td>\u2014</td><td>\u2705</td></tr>
                            <tr><td>Compliance monitoring (CIS/NIST)</td><td>\u2014</td><td>\u2014</td><td>\u2705</td></tr>
                            <tr><td>Response actions</td><td>\u2014</td><td>\u2014</td><td>\u2705</td></tr>
                            <tr><td>Reports & Auditor Dashboard</td><td>\u2014</td><td>\u2014</td><td>\u2705</td></tr>
                            <tr><td>Audit workflows</td><td>\u2014</td><td>\u2014</td><td>\u2705</td></tr>
                            <tr><td>Team management & roles</td><td>\u2014</td><td>\u2014</td><td>\u2705</td></tr>
                            <tr><td>WhatsApp notifications</td><td>\u2014</td><td>\u2014</td><td>\u2705</td></tr>
                            <tr><td>License key management</td><td>\u2014</td><td>\u2014</td><td>\u2705</td></tr>
                        </tbody>
                    </table>
                </div>

                <p class="text-muted" style="font-size:13px;">Personal and Education are <strong>Protect-only</strong> plans. Business adds Prove (compliance evidence), MAGI AI, Audit, and more. See your plan details under <strong>Settings</strong>.</p>
            </div>
        </div>
    `;
}
