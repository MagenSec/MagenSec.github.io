export function GettingStartedTab(html) {
    return html`
        <div class="row">
            <div class="col-lg-8">
                <h3 style="margin-bottom:4px;">Getting Started with MagenSec</h3>
                <p class="text-muted" style="margin-bottom:28px;">Set up your account, connect your devices, and know what to check first.</p>

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
                                <p class="mb-0 text-muted" style="font-size:13px;">Install from the <a href="https://apps.microsoft.com/detail/xpfmw6btjzf89s" target="_blank" rel="noopener">official Microsoft Store listing</a>. Advanced users can also install with <code>winget install MagenSec --silent --accept-package-agreements</code>.</p>
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
                                <p class="mb-0 text-muted" style="font-size:13px;">Your Google sign-in creates your MagenSec account automatically. You get <strong>7 days free</strong> to try the platform.</p>
                            </div>
                        </div>
                        <div class="d-flex gap-3 mb-3">
                            <div style="min-width:32px;height:32px;border-radius:50%;background:#0054a6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">4</div>
                            <div>
                                <strong>Open the portal to see your results</strong>
                                <p class="mb-0 text-muted" style="font-size:13px;">After the first scan completes, sign in to the portal with the same Google account. Most devices appear within a few minutes.</p>
                            </div>
                        </div>

                        <div class="alert alert-info mb-0" style="border-left:4px solid #4299e1; font-size:13px;">
                            <strong>Have a coupon code?</strong> Enter your MAGICode during setup to extend your trial.
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
                                <p class="mb-0 text-muted" style="font-size:13px;">Use the <a href="https://apps.microsoft.com/detail/xpfmw6btjzf89s" target="_blank" rel="noopener">Microsoft Store listing</a> for standard rollout. IT teams can use <code>winget install MagenSec --silent --accept-package-agreements</code> in their device management workflow.</p>
                            </div>
                        </div>
                        <div class="d-flex gap-3 mb-3">
                            <div style="min-width:32px;height:32px;border-radius:50%;background:#0054a6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">3</div>
                            <div>
                                <strong>Enter your license key during setup</strong>
                                <p class="mb-0 text-muted" style="font-size:13px;">Each device uses the license key provided in your email. After the key is accepted, the device joins your organization automatically.</p>
                            </div>
                        </div>
                        <div class="d-flex gap-3">
                            <div style="min-width:32px;height:32px;border-radius:50%;background:#0054a6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">4</div>
                            <div>
                                <strong>Sign in to the portal</strong>
                                <p class="mb-0 text-muted" style="font-size:13px;">Sign in with the Google account associated with your organization. Your dashboard fills in as devices complete their first scans.</p>
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
                    <li><strong>Risks</strong> — known issues found on your devices, sorted by severity</li>
                    <li><strong>Software Inventory</strong> \u2014 a complete list of installed applications and versions</li>
                    <li><strong>Recommended Actions</strong> \u2014 specific steps to improve your security posture</li>
                </ul>

                <div class="alert alert-success mt-3" style="border-left:4px solid #2fb344;">
                    <strong>Tip:</strong> Scans run automatically in the background. If a new device does not appear, make sure it is online, signed in, and using the correct license or Google account.
                </div>

                <!-- What MagenSec Does -->
                <h4 style="margin-top:32px;">What MagenSec Does</h4>
                <p>MagenSec helps you understand device security, prioritize fixes, and prepare evidence for stakeholders. Here's what each capability does for you:</p>

                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udd0d</span> <strong>Vulnerability Detection</strong></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Checks your installed software for known vulnerabilities (CVEs). Findings are prioritized so you can focus on the issues most likely to matter first.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udce6</span> <strong>Software Inventory</strong></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Shows the applications installed across your devices, including names, versions, and vendors. It also highlights unsupported or outdated software that may need attention.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udee1\ufe0f</span> <strong>Antivirus Monitoring</strong></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Tracks whether antivirus protection is installed, active, and up to date. MagenSec alerts you when a protection gap needs review.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83e\udd16</span> <strong>Evidence-Based Security Scoring</strong></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">MagenSec gives you organization and device scores that change as your risks, fixes, and device coverage change. See the <strong>Understanding Scores</strong> tab for details.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udcdd</span> <strong>Intelligence Reports</strong></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Receive daily summaries and weekly trend reports by email so you can stay current without logging in every day.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83e\udd16</span> <strong>Officer MAGI \u2014 AI Security Officer</strong> <span class="badge bg-blue-lt text-blue" style="font-size:10px;">Business</span></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Ask questions in plain language, such as \u201cWhat are my most critical vulnerabilities?\u201d or \u201cWhich devices need attention?\u201d, and get answers based on your MagenSec findings.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udcca</span> <strong>Mission Brief \u2014 Evidence Reports</strong> <span class="badge bg-blue-lt text-blue" style="font-size:10px;">Business</span></h5>
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
                        <p class="mb-0 text-muted" style="font-size:13px;">Request fresh scans, inventory refreshes, update checks, or device diagnostics. Actions run when the device next checks in and show progress in the portal.</p>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-body" style="padding:14px 18px;">
                        <h5 class="d-flex align-items-center gap-2 mb-1" style="font-size:14px;"><span style="font-size:16px;">\ud83d\udd0e</span> <strong>Auditor Dashboard & Evidence</strong> <span class="badge bg-blue-lt text-blue" style="font-size:10px;">Business</span></h5>
                        <p class="mb-0 text-muted" style="font-size:13px;">Purpose-built for compliance reviews. Includes readiness checklists, fleet evidence summaries, progress comparisons, and a report library.</p>
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
