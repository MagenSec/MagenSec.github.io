export function BestPracticesTab(html) {
    return html`
        <div class="row">
            <div class="col-md-12">
                <h3>Security Best Practices</h3>
                <p>Improve your security posture using proven strategies. These practices are based on CIS, NIST, and industry standards.</p>

                <h4 style="margin-top: 24px;">1. Patch Management Strategy</h4>
                <div class="best-practice-card">
                    <div class="best-practice-title">Critical Patches: 24-Hour SLA</div>
                    <p class="best-practice-desc">Apply patches for Critical (CVSS 9.0+) and exploited vulnerabilities within 24 hours. This significantly reduces your risk window.</p>
                </div>

                <div class="best-practice-card">
                    <div class="best-practice-title">High Priority: 5-Day SLA</div>
                    <p class="best-practice-desc">High-severity patches (CVSS 7.0-8.9) should be applied within 5 business days. Prioritize production servers first.</p>
                </div>

                <div class="best-practice-card">
                    <div class="best-practice-title">Enable Automatic Updates</div>
                    <p class="best-practice-desc">Configure Windows Update, macOS Software Update, and Linux package managers to automatically install patches. Manual patching creates gaps.</p>
                </div>

                <h4 style="margin-top: 24px;">2. Vulnerability Prioritization</h4>
                <p style="color: #666;">Not all vulnerabilities are equal. Use this matrix to prioritize:</p>

                <table class="comparison-table">
                    <thead>
                        <tr>
                            <th>CVSS Score</th>
                            <th>Active Exploit?</th>
                            <th>Priority</th>
                            <th>Timeline</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>9.0+ (Critical)</td>
                            <td>Yes (In the wild)</td>
                            <td style="color: #d63939;">🔴 URGENT</td>
                            <td>24 hours</td>
                        </tr>
                        <tr>
                            <td>9.0+ (Critical)</td>
                            <td>No (PoC only)</td>
                            <td style="color: #f59f00;">🟠 HIGH</td>
                            <td>3 days</td>
                        </tr>
                        <tr>
                            <td>7.0-8.9 (High)</td>
                            <td>Yes</td>
                            <td style="color: #f59f00;">🟠 HIGH</td>
                            <td>5 days</td>
                        </tr>
                    </tbody>
                </table>

                <h4 style="margin-top: 24px;">3. Identity & Access Management</h4>
                <div class="best-practice-card">
                    <div class="best-practice-title">Enforce Multi-Factor Authentication (MFA)</div>
                    <p class="best-practice-desc">Require MFA on all accounts, especially administrators. Blocks 99% of credential-based attacks.</p>
                </div>

                <div class="best-practice-card">
                    <div class="best-practice-title">Continuous Monitoring</div>
                    <p class="best-practice-desc">Check scores daily for changes. Automated alerting for critical vulnerability drops or device failures.</p>
                </div>
            </div>
        </div>
    `;
}
