export function FAQTab(html) {
    const faqs = [
        {
            q: 'How do I create a Personal account?',
            a: 'Install the MagenSec client on your Windows device, choose "Personal" in the license prompt, and sign in with your Google account. Your account and organization are created automatically. You get 7 days free to try the platform. If you have a coupon code (MAGICode), enter it during setup for additional free days.',
        },
        {
            q: 'How do Business and Education accounts get created?',
            a: 'Business and Education organizations are provisioned by the MagenSec product team. You\u2019ll receive a license key by email. Install the MagenSec client on your devices and enter the license key during setup to onboard them to your organization.',
        },
        {
            q: 'How often are my devices scanned?',
            a: 'Devices are scanned automatically on a regular interval. The first scan after installation takes about 3\u20135 minutes. Subsequent scans run in the background without affecting device performance.',
        },
        {
            q: 'What\u2019s the difference between the Security Score and the Risk Score?',
            a: 'The Security Score (shown on the Home dashboard) is an organization-wide measure \u2014 higher is better, with a letter grade A through F. The Risk Score is a per-device measure shown on each device\u2019s detail page \u2014 higher means MORE risk. They\u2019re complementary perspectives: the Security Score tells you how your organization is doing overall, while Risk Scores pinpoint which specific devices need attention.',
        },
        {
            q: 'What does it mean when a device shows as "Degraded" or "Offline"?',
            a: '"Degraded" or "Offline" means the device has not checked in recently. It may be asleep, powered off, retired, disconnected from the network, or missing the MagenSec client. When the device comes back online, scanning resumes automatically.',
        },
        {
            q: 'What are the "Known Exploit" indicators on vulnerabilities?',
            a: 'These mark vulnerabilities being actively exploited by attackers in the real world, tracked by sources like the CISA Known Exploited Vulnerabilities (KEV) catalog. They should be your highest priority to fix \u2014 they directly impact your device\u2019s Risk Score.',
        },
        {
            q: 'What is EPSS?',
            a: 'EPSS (Exploit Prediction Scoring System) is a probability score from 0 to 1 that estimates how likely a vulnerability is to be exploited in the next 30 days. Higher EPSS means higher real-world risk. You\u2019ll see it on the device Risks tab next to each CVE.',
        },
        {
            q: 'How do I add more devices?',
            a: 'Install the MagenSec client on any additional device. For Personal accounts, sign in with the same Google account. For Business/Education, enter your organization\u2019s license key. The device will appear on the Devices page within minutes. Personal plans support up to 5 devices.',
        },
        {
            q: 'What additional features does the Business plan include?',
            a: 'The Business plan adds Officer MAGI, Mission Brief reports, compliance monitoring against CIS Controls v8.1 and NIST CSF 2.0, remote response actions, the Auditor Dashboard with evidence packages, team management with role-based access, WhatsApp notifications, and license key management. See the Getting Started tab for a description of each feature.',
        },
        {
            q: 'What is Officer MAGI?',
            a: 'Officer MAGI is MagenSec\u2019s AI Security Officer, available on the Business plan. It answers questions using your MagenSec findings and reviewed security guidance, helping you understand which vulnerabilities, devices, and actions need attention. MAGI can also be reached via WhatsApp if configured in Settings.',
        },
        {
            q: 'What compliance frameworks are supported?',
            a: 'Currently CIS Controls v8.1 and NIST CSF 2.0 are live. CERT-In and ISO 27001 are planned for future releases. You can choose your preferred framework in Settings under the Reports tab.',
        },
        {
            q: 'Can I export or download reports?',
            a: 'Yes (Business plan). Mission Brief generates reports that can be emailed as PDFs. The Auditor Dashboard provides downloadable evidence packages. The Reports hub links to live report data and will include additional downloadable formats in future updates.',
        },
        {
            q: 'What are credits and how do they work?',
            a: 'Credits represent your usage allowance. You can see your remaining credits, projected days left, and expiration date in Settings under the General tab. Credits are consumed based on your seat count (number of devices). When credits run out, your subscription needs renewal.',
        },
        {
            q: 'Can I add team members?',
            a: 'Yes (Business plan). Go to Settings \u2192 Team, enter an email address, and assign a role: Co-Admin (can manage devices, licenses, and view security data) or Auditor (view-only access). Team members sign in with their own Google account.',
        },
        {
            q: 'What is a license key rotation?',
            a: 'Rotating a license key generates a new key and invalidates the old one. Enrolled devices receive the new key automatically the next time they check in. Use this if you suspect a key has been shared too broadly or compromised. You can rotate keys in Settings \u2192 Licenses (Business plan).',
        },
        {
            q: 'Is my data secure?',
            a: 'MagenSec encrypts data in transit and at rest and limits collection to security, licensing, compliance, support, and service reliability needs. Some security metadata can identify a device, user, network, or software path, so administrators should review the Security & Privacy tab before deployment. MagenSec does not collect personal files, browsing history, email content, keystrokes, or screen content.',
        },
        {
            q: 'How do I change my notification settings?',
            a: 'Go to Settings. The Reports tab lets you toggle daily and weekly reports. Business plans also get the Email Notifications tab with granular controls for device events, license events, security alerts, and more. WhatsApp notifications can be configured there too.',
        },
    ];

    return html`
        <div class="row">
            <div class="col-lg-8">
                <h3 style="margin-bottom:4px;">Frequently Asked Questions</h3>
                <p class="text-muted" style="margin-bottom:24px;">Answers to common questions about using MagenSec.</p>

                ${faqs.map((faq, i) => html`
                    <div class="card mb-2" key=${i}>
                        <div class="card-body" style="padding:14px 18px;">
                            <h5 class="mb-1" style="font-size:14px;font-weight:600;">${faq.q}</h5>
                            <p class="mb-0 text-muted" style="font-size:13px;">${faq.a}</p>
                        </div>
                    </div>
                `)}

                <div class="alert alert-info mt-4" style="border-left:4px solid #4299e1;">
                    <strong>Still have questions?</strong> Contact our support team at <strong>support@magensec.app</strong>.
                </div>
            </div>
        </div>
    `;
}
