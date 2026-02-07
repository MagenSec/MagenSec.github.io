export function SecurityTab(html) {
    return html`
        <div class="row">
            <div class="col-md-12">
                <h3>Security & Privacy</h3>
                <p>We take security seriously. Here's how we protect your data.</p>

                <h4 style="margin-top: 24px;">Data Encryption</h4>
                <div class="best-practice-card">
                    <div class="best-practice-title">Encryption in Transit</div>
                    <p class="best-practice-desc">All data sent between your devices and our cloud uses TLS 1.3 encryption. No unencrypted traffic is allowed.</p>
                </div>

                <div class="best-practice-card">
                    <div class="best-practice-title">Encryption at Rest</div>
                    <p class="best-practice-desc">All data stored in our database is encrypted with AES-256. Database keys are rotated regularly and stored in secure vaults.</p>
                </div>

                <h4 style="margin-top: 24px;">Access Controls</h4>
                <ul>
                    <li><strong>Role-Based Access Control (RBAC):</strong> Users only see data they're authorized to access.</li>
                    <li><strong>Multi-Factor Authentication:</strong> All accounts support MFA. Administrators should require it.</li>
                    <li><strong>Audit Logging:</strong> All user actions are logged. See who accessed what data and when.</li>
                    <li><strong>IP Whitelisting:</strong> Enterprise customers can restrict API access to specific IP addresses.</li>
                </ul>

                <h4 style="margin-top: 24px;">Compliance Certifications</h4>
                <ul>
                    <li><strong>SOC 2 Type II:</strong> Annual audit of security, availability, and confidentiality controls</li>
                    <li><strong>ISO 27001:</strong> Information security management certification</li>
                    <li><strong>GDPR:</strong> EU data protection compliance. Data is processed and stored in EU data centers.</li>
                    <li><strong>HIPAA:</strong> Healthcare data protection (Business Associate Agreement available)</li>
                    <li><strong>PCI DSS:</strong> Payment card data protection (Level 1 compliance)</li>
                </ul>

                <h4 style="margin-top: 24px;">Vulnerability Disclosure</h4>
                <p>Found a security vulnerability in MagenSec? Please report it responsibly to <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">security@magensec.io</code> instead of public disclosure.</p>

                <div class="alert-box alert-success">
                    <strong>Bug Bounty:</strong> We offer rewards for responsible vulnerability disclosures. Contact security@magensec.io for details.
                </div>
            </div>
        </div>
    `;
}
