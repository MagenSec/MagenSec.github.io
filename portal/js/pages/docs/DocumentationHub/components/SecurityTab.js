export function SecurityTab(html) {
    return html`
        <div class="row">
            <div class="col-lg-8">
                <h3 style="margin-bottom:4px;">Security & Privacy</h3>
                <p class="text-muted" style="margin-bottom:24px;">How MagenSec protects your data and keeps your information safe.</p>

                <!-- Data Protection -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udd10</span> Data Protection
                        </h4>
                        <ul class="mb-0">
                            <li><strong>Encryption in transit</strong> \u2014 all communication between your devices and MagenSec uses TLS 1.3 encryption.</li>
                            <li><strong>Encryption at rest</strong> \u2014 your data is stored using AES-256 encryption with regularly rotated keys.</li>
                            <li><strong>Minimal data collection</strong> \u2014 MagenSec collects only security metadata needed for posture assessment. This includes OS version, installed applications, security configurations, and hardware identifiers.</li>
                        </ul>
                    </div>
                </div>

                <!-- What We Don't Collect -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udeab</span> What MagenSec Does NOT Collect
                        </h4>
                        <p class="mb-2">MagenSec is designed to assess security posture, not monitor your personal activity. We do <strong>not</strong> access or collect:</p>
                        <ul class="mb-0">
                            <li>Personal files, documents, or photos</li>
                            <li>Browsing history or web activity</li>
                            <li>Email content or messages</li>
                            <li>Application data or usage patterns</li>
                            <li>Keystrokes or screen content</li>
                        </ul>
                    </div>
                </div>

                <!-- Authentication -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udc64</span> Authentication & Access
                        </h4>
                        <ul class="mb-0">
                            <li><strong>Sign-in</strong> \u2014 MagenSec uses Google OAuth for authentication. Your password is never stored by MagenSec.</li>
                            <li><strong>Organization isolation</strong> \u2014 each organization\u2019s data is completely separate. Team members only see data for the organizations they belong to.</li>
                            <li><strong>Role-based access</strong> \u2014 Business plans support Co-Admin (read/write) and Auditor (read-only) roles for team members.</li>
                            <li><strong>Audit trail</strong> \u2014 all actions are logged in the Command Log, so you can see who did what and when.</li>
                        </ul>
                    </div>
                </div>

                <!-- License Security -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udd11</span> License Key Security
                        </h4>
                        <p class="mb-2">For Business and Education plans that use license keys:</p>
                        <ul class="mb-0">
                            <li>License keys are masked in the portal UI by default (click to reveal)</li>
                            <li>Keys can be rotated at any time in Settings \u2192 Licenses \u2014 the old key is immediately invalidated</li>
                            <li>Devices automatically receive the new key at their next heartbeat</li>
                            <li>Rotate your key immediately if you suspect it has been compromised</li>
                        </ul>
                    </div>
                </div>

                <!-- Data Retention -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\uddc4\ufe0f</span> Data Retention
                        </h4>
                        <p class="mb-0">Your security data is retained for the duration of your active subscription. If you remove a device or close your organization, associated data is deleted in accordance with our data retention policy. You can request full data deletion at any time by contacting support.</p>
                    </div>
                </div>

                <!-- Vulnerability Disclosure -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udc1b</span> Vulnerability Disclosure
                        </h4>
                        <p class="mb-2">If you discover a security vulnerability in MagenSec, please report it responsibly:</p>
                        <p class="mb-0"><strong>Email:</strong> security@magensec.io</p>
                        <p class="text-muted mb-0" style="font-size:13px;margin-top:4px;">We take all reports seriously and will respond promptly. Please avoid public disclosure until we\u2019ve had a chance to investigate and release a fix.</p>
                    </div>
                </div>

                <div class="alert alert-info mt-3" style="border-left:4px solid #4299e1;">
                    <strong>Questions about your data?</strong> Contact us at <strong>support@magensec.io</strong> \u2014 we\u2019re happy to explain our practices in more detail.
                </div>
            </div>
        </div>
    `;
}
