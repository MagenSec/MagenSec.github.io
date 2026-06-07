export function SecurityTab(html) {
    return html`
        <div class="row">
            <div class="col-lg-8">
                <h3 style="margin-bottom:4px;">Security & Privacy</h3>
                <p class="text-muted" style="margin-bottom:24px;">What MagenSec collects for security monitoring, what it does not collect, and what administrators should disclose before deployment.</p>

                <!-- Security Data Collected -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udccb</span> Security Data MagenSec Collects
                        </h4>
                        <p class="mb-2">MagenSec collects endpoint security metadata needed to show posture, risk, compliance evidence, and operational health. Depending on plan and enabled features, this can include:</p>
                        <ul class="mb-0">
                            <li><strong>Account and license data:</strong> sign-in email, organization/team membership, role, device enrollment, and license-key metadata.</li>
                            <li><strong>Device identity and health:</strong> device identifiers, hostname or machine name, OS/build, client version, heartbeat status, scan status, and update status.</li>
                            <li><strong>Software and vulnerability data:</strong> installed software names, vendors, versions, install source, install path or path hash, CVEs, remediation state, and portable-app observations.</li>
                            <li><strong>Security posture data:</strong> Defender and protection state, firewall/RDP/BitLocker/Secure Boot/TPM indicators, Windows update/KB state, certificate inventory, open-port evidence, and local-user/admin posture.</li>
                            <li><strong>Network security context:</strong> IP addresses, gateways, DNS suffixes, network prefixes, public egress hints, adapter fingerprints, and proxy/connection indicators.</li>
                            <li><strong>Operational evidence:</strong> command acknowledgements, telemetry upload health, audit events, reports, and evidence snapshots used to explain what changed over time.</li>
                        </ul>
                    </div>
                </div>

                <!-- Data Protection -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udd10</span> Data Protection
                        </h4>
                        <ul class="mb-0">
                            <li><strong>Encrypted transport:</strong> communication between your devices, browser, and MagenSec uses HTTPS/TLS.</li>
                            <li><strong>Encrypted storage:</strong> customer security data is encrypted when stored by the service.</li>
                            <li><strong>Limited purpose:</strong> collected data is used for security monitoring, vulnerability analysis, compliance reporting, licensing, support, and service reliability.</li>
                            <li><strong>Masked where practical:</strong> account names and per-user install scopes are masked or represented by stable hashes where the product does not need the full raw value.</li>
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
                            <li>Application content, document contents, or general productivity activity</li>
                            <li>Keystrokes or screen content</li>
                            <li>Passwords, session cookies, browser tokens, or private keys</li>
                        </ul>
                    </div>
                </div>

                <!-- Administrator Responsibilities -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udee1\ufe0f</span> Administrator Responsibilities
                        </h4>
                        <ul class="mb-0">
                            <li>Deploy MagenSec only on devices you own or are authorized to administer.</li>
                            <li>Tell monitored users that endpoint security, software, device identity, network, and local-admin posture data may be collected for security operations.</li>
                            <li>Obtain any notices, consents, works-council approvals, or customer permissions required by your laws, contracts, or internal policies.</li>
                            <li>Grant portal access only to team members who need to view security evidence for your organization.</li>
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
                            <li><strong>Sign-in</strong> \u2014 MagenSec uses Google and Microsoft OAuth where available. Your password is never stored by MagenSec.</li>
                            <li><strong>Organization isolation</strong> \u2014 each organization\u2019s data is completely separate. Team members only see data for the organizations they belong to.</li>
                            <li><strong>Role-based access</strong> \u2014 Business plans support Co-Admin (read/write) and Auditor (read-only) roles for team members.</li>
                            <li><strong>Activity trail</strong> \u2014 important organization and device actions appear in the Command Log, so you can review who did what and when.</li>
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
                            <li>Enrolled devices receive the new key automatically the next time they check in</li>
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
                        <p class="mb-0">Your security data is retained for the duration of your active subscription and for operational/legal periods needed for billing, audit trails, abuse prevention, and support. If you remove a device or close your organization, associated data is deleted in accordance with our data retention policy. You can request deletion review at any time by contacting support.</p>
                    </div>
                </div>

                <!-- Vulnerability Disclosure -->
                <div class="card mb-3">
                    <div class="card-body">
                        <h4 class="d-flex align-items-center gap-2 mb-2">
                            <span style="font-size:20px;">\ud83d\udc1b</span> Vulnerability Disclosure
                        </h4>
                        <p class="mb-2">If you discover a security vulnerability in MagenSec, please report it responsibly:</p>
                        <p class="mb-0"><strong>Email:</strong> security@magensec.app</p>
                        <p class="text-muted mb-0" style="font-size:13px;margin-top:4px;">We take all reports seriously and will respond promptly. Please avoid public disclosure until we\u2019ve had a chance to investigate and release a fix.</p>
                    </div>
                </div>

                <div class="alert alert-info mt-3" style="border-left:4px solid #4299e1;">
                    <strong>Questions about your data?</strong> Contact us at <strong>support@magensec.app</strong> \u2014 we\u2019re happy to explain our practices in more detail.
                </div>
            </div>
        </div>
    `;
}
