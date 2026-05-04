export function BestPracticesTab(html) {
    return html`
        <div class="row">
            <div class="col-lg-8">
                <h3 style="margin-bottom:4px;">Security Best Practices</h3>
                <p class="text-muted" style="margin-bottom:24px;">Practical steps to improve and maintain a strong security posture.</p>

                <!-- 1. Keep Software Updated -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udd04</span> Keep Software Updated
                        </h4>
                        <p>Unpatched software is the number-one cause of security issues. Enable automatic updates on your operating system and applications whenever possible.</p>
                        <ul>
                            <li><strong>Critical vulnerabilities with active exploits</strong> \u2014 patch within 24 hours. These are being used in real attacks right now.</li>
                            <li><strong>Critical vulnerabilities (no known exploit)</strong> \u2014 patch within 3 days.</li>
                            <li><strong>High-severity vulnerabilities</strong> \u2014 patch within 5 days.</li>
                            <li><strong>Everything else</strong> \u2014 include in your regular update cycle.</li>
                        </ul>
                        <p class="text-muted mb-0" style="font-size:13px;">Check the <strong>Security</strong> page for the most urgent items. Vulnerabilities marked "Known Exploit" should be your top priority.</p>
                    </div>
                </div>

                <!-- 2. Remove End-of-Life Software -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\uddd1\ufe0f</span> Remove End-of-Life Software
                        </h4>
                        <p>Software that no longer receives security patches (end-of-life) is a persistent risk that can\u2019t be patched away. If you can\u2019t upgrade to a supported version, consider removing it or isolating the device.</p>
                        <p class="text-muted mb-0" style="font-size:13px;">Click into any device on the <strong>Devices</strong> page, then check the Inventory tab to spot unsupported software versions.</p>
                    </div>
                </div>

                <!-- 3. Use Strong Authentication -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udd10</span> Use Strong Authentication
                        </h4>
                        <p>Enable multi-factor authentication (MFA) on all accounts \u2014 especially administrator accounts. MFA blocks the vast majority of credential-based attacks.</p>
                        <ul>
                            <li>Prefer authenticator apps or hardware keys over SMS codes</li>
                            <li>Require MFA for all team members in your organization</li>
                            <li>Use unique, strong passwords for every account</li>
                        </ul>
                    </div>
                </div>

                <!-- 4. Monitor Scores Daily -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udcc8</span> Monitor Your Scores Daily
                        </h4>
                        <p>Check your Home dashboard at least once a day. Score changes often indicate new vulnerabilities or configuration drift. The sooner you catch a drop, the easier it is to fix.</p>
                        <ul>
                            <li>Enable daily report emails in <strong>Settings \u2192 Reports</strong> to get updates without logging in</li>
                            <li>Business plan users can also enable weekly trend analysis for a broader view</li>
                            <li>A sudden grade drop (e.g., A to C) usually means a new Critical CVE was published</li>
                        </ul>
                    </div>
                </div>

                <!-- 5. Prioritize by Exploitability -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83c\udfaf</span> Prioritize by Exploitability
                        </h4>
                        <p>Not every vulnerability is equally dangerous. A Critical-severity CVE with an active exploit is far more urgent than one with no known exploit. MagenSec flags vulnerabilities with the "Known Exploit" indicator when they appear in the CISA Known Exploited Vulnerabilities catalog.</p>
                        <p class="mb-0">On any device\u2019s Risks tab, the EPSS (Exploit Prediction Scoring System) score shows how likely each vulnerability is to be exploited \u2014 higher EPSS means higher real-world risk.</p>
                    </div>
                </div>

                <!-- 6. Keep Devices Reporting -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udce1</span> Keep Devices Reporting
                        </h4>
                        <p>Devices that go Degraded or Offline can\u2019t be scanned and may have undetected issues. Periodically check the <strong>Devices</strong> page for:</p>
                        <ul>
                            <li>Devices marked Degraded (heartbeat 30 minutes \u2013 24 hours old) or Offline</li>
                            <li>Devices with significantly lower scores than the rest of your fleet</li>
                            <li>Unexpected new devices that may need review</li>
                        </ul>
                        <p class="text-muted mb-0" style="font-size:13px;">The Telemetry Health indicator on the dashboard shows the percentage of devices actively reporting.</p>
                    </div>
                </div>

                <!-- 7. Use AI Features -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83e\udd16</span> Leverage AI Features (Business)
                        </h4>
                        <p>If your Business plan includes Officer MAGI and Mission Brief, use them regularly:</p>
                        <ul>
                            <li><strong>Officer MAGI</strong> \u2014 ask questions in plain language to get data-driven answers about your security posture</li>
                            <li><strong>Mission Brief</strong> \u2014 generate concise evidence reports covering security posture, compliance, or inventory</li>
                        </ul>
                        <p class="text-muted mb-0" style="font-size:13px;">These features are especially useful for quick status checks, trend analysis, and preparing reports for non-technical stakeholders.</p>
                    </div>
                </div>

                <!-- 8. Review Team Access -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udc65</span> Review Team Access (Business)
                        </h4>
                        <p>If you\u2019re on a Business plan with team members, periodically review who has access and at what level:</p>
                        <ul>
                            <li><strong>Co-Admin</strong> \u2014 can manage devices, licenses, and view all telemetry</li>
                            <li><strong>Auditor</strong> \u2014 view-only access to telemetry and device lists</li>
                        </ul>
                        <p class="text-muted mb-0" style="font-size:13px;">Remove access for anyone who no longer needs it. Check team members in <strong>Settings \u2192 Team</strong>.</p>
                    </div>
                </div>

                <div class="alert alert-info mt-3" style="border-left:4px solid #4299e1;">
                    <strong>Consistency matters:</strong> Security is a continuous process. Checking scores, patching promptly, and reviewing devices regularly compounds into a significantly stronger posture over time.
                </div>
            </div>
        </div>
    `;
}
