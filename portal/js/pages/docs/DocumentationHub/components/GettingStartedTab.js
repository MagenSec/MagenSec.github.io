export function GettingStartedTab(html) {
    return html`
        <div class="row">
            <div class="col-md-12">
                <h3>Getting Started with MagenSec</h3>
                <p>Welcome to MagenSec! This guide will help you get up and running in just a few minutes.</p>

                <h4 style="margin-top: 24px;">Step 1: Set Up Your First Organization</h4>
                <div class="step-card">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h4>Create an Organization</h4>
                        <p>Go to your account settings and create your first organization. This will be the container for all your devices, licenses, and security data.</p>
                    </div>
                </div>

                <h4 style="margin-top: 24px;">Step 2: Install the Client</h4>
                <div class="step-card">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h4>Download MagenSec Client</h4>
                        <p>Download the MagenSec client from your organization dashboard. The installer supports Windows, macOS, and Linux. Run it on your devices to begin security scanning.</p>
                    </div>
                </div>

                <h4 style="margin-top: 24px;">Step 3: Add Devices to Scan</h4>
                <div class="step-card">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h4>Device Registration</h4>
                        <p>Once the client is installed, devices automatically register with your organization. You can see them appear in your Devices dashboard within seconds.</p>
                    </div>
                </div>

                <h4 style="margin-top: 24px;">Step 4: View Your Dashboard</h4>
                <div class="step-card">
                    <div class="step-number">4</div>
                    <div class="step-content">
                        <h4>Monitor Your Security Posture</h4>
                        <p>Your dashboard shows a real-time overview of your organization's security status. You'll see your Security, Risk, and Compliance scores along with key vulnerabilities and actionable recommendations.</p>
                    </div>
                </div>

                <div class="alert-box alert-success">
                    <strong>First Scan Takes 3-5 Minutes:</strong> Your devices will complete their first comprehensive scan. Subsequent scans run hourly for continuous monitoring.
                </div>

                <h4 style="margin-top: 24px;">What You'll See After First Scan</h4>
                <ul>
                    <li><strong>Vulnerabilities:</strong> All known CVEs on your devices, sorted by severity</li>
                    <li><strong>Installed Applications:</strong> Complete software inventory with versions</li>
                    <li><strong>Compliance Gaps:</strong> Which security frameworks your systems don't meet</li>
                    <li><strong>Recommendations:</strong> Specific actions to improve your security posture</li>
                    <li><strong>Risk Assessment:</strong> Which vulnerabilities are exploitable in your environment</li>
                </ul>

                <h4 style="margin-top: 24px;">Next Steps</h4>
                <ol>
                    <li>Review your <strong>Security Score</strong> (Section 2: Score Interpretation)</li>
                    <li>Understand your <strong>Dashboard</strong> (Section 3: Understanding Dashboard)</li>
                    <li>Implement <strong>Best Practices</strong> (Section 4: Best Practices)</li>
                    <li>Set up <strong>Automated Patching</strong> to improve continuously</li>
                </ol>
            </div>
        </div>
    `;
}
