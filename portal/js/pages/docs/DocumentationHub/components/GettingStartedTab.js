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
                    <li><strong>Hygiene Score</strong> — your overall security hygiene posture, graded A through D</li>
                    <li><strong>Compliance Score</strong> — how well your devices align with security frameworks</li>
                    <li><strong>Risks</strong> — every known risk found on your devices, sorted by severity</li>
                    <li><strong>Software Inventory</strong> \u2014 a complete list of installed applications and versions</li>
                    <li><strong>Recommended Actions</strong> \u2014 specific steps to improve your security posture</li>
                </ul>

                <div class="alert alert-success mt-3" style="border-left:4px solid #2fb344;">
                    <strong>Tip:</strong> Scans run automatically in the background. Just check back to see your latest scores and findings.
                </div>

                <!-- What MagenSec Does -->
                <h4 style="margin-top:32px;">What MagenSec Does</h4>
                <p>MagenSec is a complete security posture platform powered by MAGI \u2014 your AI Security Officer. Here's what each capability does for you:</p>

                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udd0d</span> <strong>Vulnerability Detection</strong></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Continuously scans every device for known vulnerabilities (CVEs) by matching installed software against the National Vulnerability Database. Findings are ranked by MAGI\u2019s AI engine based on severity, exploit activity, and real-world risk.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udce6</span> <strong>Software Inventory</strong></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Maintains a live inventory of every application installed across your devices \u2014 names, versions, vendors, and installation dates. Automatically flags end-of-life software that no longer receives security patches.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udee1\ufe0f</span> <strong>Antivirus Monitoring</strong></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Tracks the status of antivirus products on every device \u2014 whether they\u2019re installed, active, and have current definitions. Alerts you when protection gaps are detected.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83e\udd16</span> <strong>AI Security Scoring</strong></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">MAGI generates multi-dimensional security scores for your entire organization and individual devices. Scores adapt over time as MAGI learns your risk profile, giving you a clear picture of your posture and insurance readiness. See the <strong>Understanding Scores</strong> tab for details.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udcdd</span> <strong>Intelligence Reports</strong></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Receive daily security intelligence summaries by email, with weekly trend reports tracking how your posture evolves. Reports are generated by MAGI\u2019s analysis engine and delivered directly to your inbox.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83e\udd16</span> <strong>Officer MAGI \u2014 AI Security Analyst</strong> <span class="badge bg-blue-lt text-blue" style="font-size:10px;">Business</span></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Ask questions about your security posture in plain language \u2014 \u201cWhat are my most critical vulnerabilities?\u201d or \u201cWhich devices need attention?\u201d \u2014 and get answers backed by your real data. Reachable through the portal and WhatsApp.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udcca</span> <strong>Mission Brief \u2014 AI Reports</strong> <span class="badge bg-blue-lt text-blue" style="font-size:10px;">Business</span></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Generate detailed security posture, compliance, or inventory reports on demand. Reports can be emailed as PDFs and used for audit preparation, board presentations, or stakeholder updates.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udcd0</span> <strong>Compliance Monitoring</strong> <span class="badge bg-blue-lt text-blue" style="font-size:10px;">Business</span></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Measure your alignment with CIS Controls v8.1 and NIST CSF 2.0 frameworks. See control-by-control breakdowns, gap descriptions, and prioritized remediation guidance.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\u26a1</span> <strong>Response Actions</strong> <span class="badge bg-blue-lt text-blue" style="font-size:10px;">Business</span></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Take remote actions on devices \u2014 trigger security probes, vulnerability scans, inventory refreshes, log collection, and update checks. Actions execute at the device\u2019s next check-in with real-time progress tracking.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udd0e</span> <strong>Auditor Dashboard & Evidence</strong> <span class="badge bg-blue-lt text-blue" style="font-size:10px;">Business</span></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Purpose-built for compliance audits. Includes readiness checklists, fleet evidence summaries, delta comparisons to show improvement over time, and AI-generated report library.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udc65</span> <strong>Team Management & Notifications</strong> <span class="badge bg-blue-lt text-blue" style="font-size:10px;">Business</span></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Invite team members with role-based access (Co-Admin or Auditor). Configure granular email and WhatsApp notifications for device events, license events, and security findings.</p>
                    </div>
                </div>

                <p class="text-muted" style="font-size:13px;">Features marked <span class="badge bg-blue-lt text-blue" style="font-size:10px;">Business</span> are available on the Business plan. See your plan details under <strong>Settings</strong>.</p>
            </div>
        </div>
    `;
}
