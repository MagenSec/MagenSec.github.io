export function PortalGuideTab(html) {
    const sections = [
        {
            title: 'Home (Dashboard)',
            icon: '\ud83c\udfe0',
            desc: 'Your command center. The Home dashboard shows your organization\u2019s Security Score with letter grade (A\u2013D), a Security Posture Summary with device coverage and scan status, Compliance Score, threat counts by severity, top actions to take, and recent device activity. Business organizations see the full dashboard with three tabs: Overview, Detailed Analysis, and Findings. Personal organizations are taken directly to the Security page.',
            tips: [
                'Check your Security Score grade daily \u2014 drops usually mean new vulnerabilities were published',
                'Review the "Top Actions" section for the highest-impact steps you can take right now',
                'The Telemetry Health indicator shows how many devices are actively reporting'
            ],
            tier: 'All plans (Business gets full dashboard; Personal sees Security page)',
        },
        {
            title: 'Security',
            icon: '\ud83d\udd12',
            desc: 'A deep-dive into your organization\u2019s threats and vulnerabilities. The Security page shows your posture snapshot with compliance framework alignment (CIS Controls v8.1, NIST CSF 2.0), risk score progression over time, actionable remediation priorities, and gap analysis. You can toggle between frameworks and view historical trends.',
            tips: [
                'Use severity filters to focus on Critical and High issues first',
                'Check the risk trend chart to see if your posture is improving or declining over time',
                'The remediation actions list is ordered by priority \u2014 start from the top'
            ],
            tier: 'All plans',
        },
        {
            title: 'Devices',
            icon: '\ud83d\udcbb',
            desc: 'Browse every device registered in your organization. Switch between tile view (visual cards with health indicators) and table view (compact list). Each device shows its name, OS, connection status (Online, Degraded, Offline), risk indicators, and last heartbeat time. You can search by device name, filter by CVE severity or connection status, and sort by risk level.',
            tips: [
                'Look for devices marked Degraded or Offline \u2014 they may need attention',
                'Click any device to open its detail page with full specs, vulnerabilities, installed software, and performance data',
                'Use the Security view for threat-focused information or IT view for asset inventory'
            ],
            tier: 'All plans',
        },
        {
            title: 'Device Detail',
            icon: '\ud83d\udcf1',
            desc: 'When you click a device, you\u2019ll see its full profile with seven tabs. The landing page shows Security Score, Risk Score, Compliance Score, Posture Score, and Network Exposure at a glance, plus a prioritized action plan. Tabs include Risk Assessment (CVE breakdown and timeline), Specs (hardware and OS details), Performance (CPU, memory, disk and network charts), Telemetry (heartbeat and connection data), Risks (searchable CVE table with severity, EPSS scores, and remediation steps), Timeline (chronological event log), and Inventory (installed applications grouped by vendor).',
            tips: [
                'The Risk Assessment tab shows both active and mitigated CVEs \u2014 toggle mitigated CVEs to see your progress',
                'Performance charts can zoom to 6-hour, 24-hour, or 7-day windows',
                'In the Inventory tab, look for end-of-life or risky applications that should be removed'
            ],
            tier: 'All plans',
        },
        {
            title: 'Response',
            icon: '\u26a1',
            desc: 'Take remote actions on your devices. Response lets you queue operations that execute on the device at its next heartbeat. Available actions include Probe (collect a security posture snapshot), Scan (full vulnerability and malware scan), Inventory (refresh the installed applications list), Logs (securely collect encrypted diagnostic logs), and Updates (check for OS and application patches). You can track each action\u2019s status as it moves from Queued to Delivered to Completed.',
            tips: [
                'Use Probe to get a fresh security snapshot from a specific device on demand',
                'Action results appear in the portal once the device completes the task \u2014 check back after a few minutes',
                'The action history shows everything that\u2019s been run, with status and timestamps'
            ],
            tier: 'Business only',
        },
        {
            title: 'Officer MAGI',
            icon: '\ud83e\udd16',
            desc: 'Your AI security analyst. Ask questions in plain language about your organization\u2019s security posture, vulnerabilities, devices, or scores \u2014 and get answers backed by your real data. Officer MAGI can generate charts, link to specific devices or CVEs, and provide tailored remediation recommendations. You can also reach MAGI via WhatsApp if enabled in Settings.',
            tips: [
                'Try asking "What are my most critical vulnerabilities right now?"',
                'Ask "Which devices are at highest risk?" to get a prioritized list',
                'MAGI can compare your current posture to last week \u2014 ask about trends'
            ],
            tier: 'Business only',
        },
        {
            title: 'Mission Brief',
            icon: '\ud83d\udccb',
            desc: 'AI-generated security posture reports. Choose from Security Posture, Compliance, or Inventory report types. Select a date for historical lookups and a compliance framework (CIS, NIST, or both). Reports are generated on demand and can be emailed as PDFs to your organization owner and team members.',
            tips: [
                'Use Mission Brief for quick executive-level status summaries',
                'Generate historical reports to compare your posture over different time periods',
                'Email reports directly to stakeholders for audit preparation'
            ],
            tier: 'Business only',
        },
        {
            title: 'Compliance',
            icon: '\ud83d\udcd0',
            desc: 'See how your organization aligns with security frameworks. Currently supported: CIS Controls v8.1 and NIST CSF 2.0 (with CERT-In and ISO 27001 planned). The Compliance page shows your score, a control-by-control breakdown with pass/fail status, gap descriptions, and remediation guidance for each control area.',
            tips: [
                'Start with the weakest control area \u2014 small improvements there have the biggest score impact',
                'Use the framework selector to focus on the standard most relevant to your industry',
                'You can ask Officer MAGI questions about specific compliance gaps'
            ],
            tier: 'Business only',
        },
        {
            title: 'Reports',
            icon: '\ud83d\udcca',
            desc: 'A hub for generating and accessing reports. Available reports include Compliance Report (framework scores and gap analysis), Audit Report (activity timeline and evidence exports), Asset Inventory (device list with health and OS versions), and Software Inventory (applications across devices with risk scores). Additional report types including Executive, Security, Vulnerability, and Patch reports are coming soon.',
            tips: [
                'Live reports link directly to the relevant portal page for real-time data',
                'Coming Soon reports will be available in a future update'
            ],
            tier: 'Business only',
        },
        {
            title: 'Auditor Dashboard',
            icon: '\ud83d\udd0d',
            desc: 'Built for compliance audits and security reviews. The Auditor Dashboard has four tabs: Readiness (a checklist of audit prerequisites with pass/partial/missing status), Fleet Evidence (device summary and posture cards), Delta Comparison (compare your posture between two dates to show progress), and AI Reports (library of generated posture reports). Use it to assemble evidence packages for auditors.',
            tips: [
                'The Readiness tab shows exactly what evidence is complete before an audit',
                'Use Delta Comparison to demonstrate improvement over a specific period',
                'Download or email evidence bundles directly from the dashboard'
            ],
            tier: 'Business only',
        },
        {
            title: 'Settings',
            icon: '\u2699\ufe0f',
            desc: 'Manage your organization. The General tab shows your organization ID, owner, status, seat count, credits remaining with a projected expiration date, and credit history. The Reports tab lets you toggle daily and weekly report delivery and choose your compliance framework preference (CIS, NIST, or both). Business plans also get Licenses (view and rotate license keys), Team (add members as Co-Admin or Auditor), and Email Notifications (granular event toggles for device lifecycle, license events, security alerts, and periodic reports, plus WhatsApp configuration).',
            tips: [
                'Check your credits and projected expiration to avoid service interruptions',
                'Enable daily reports to stay informed without logging in every day',
                'Review team members periodically and remove access for anyone who no longer needs it'
            ],
            tier: 'All plans (Team, Licenses, and Email Notifications are Business only)',
        },
        {
            title: 'Command Log',
            icon: '\ud83d\udcdc',
            desc: 'A full audit timeline of everything that\u2019s happened in your organization. The Command Log has four tabs: Analytics (event volume charts, top users, and top devices), Timeline (chronological list of all events with infinite scroll), User Activity (per-user breakdown), and Device Activity (per-device breakdown). Every action is logged \u2014 configuration changes, response actions, scans, report generation, team changes, and more.',
            tips: [
                'Use it to investigate unexpected changes or verify that actions completed successfully',
                'Filter by event type, user, device, or date range to find specific activity',
                'The Analytics tab gives a quick overview of who\u2019s doing what'
            ],
            tier: 'All plans',
        },
        {
            title: 'Account',
            icon: '\ud83d\udc64',
            desc: 'Manage your personal profile. Update your display name, phone number, and WhatsApp notification preferences. Choose which organization to see by default if you belong to more than one. Your email is set from your Google sign-in and cannot be changed here.',
            tips: [
                'Add your phone number to enable WhatsApp notifications (Business organizations)',
                'Set your default organization if you have access to multiple'
            ],
            tier: 'All plans',
        },
    ];

    return html`
        <div class="row">
            <div class="col-lg-10">
                <h3 style="margin-bottom:4px;">Portal Guide</h3>
                <p class="text-muted" style="margin-bottom:24px;">A tour of every feature in the MagenSec portal and how to use it.</p>

                ${sections.map(s => html`
                    <div class="card mb-3">
                        <div class="card-body">
                            <div class="d-flex align-items-center gap-2 mb-2">
                                <span style="font-size:20px;">${s.icon}</span>
                                <h4 class="mb-0">${s.title}</h4>
                                <span class="badge bg-blue-lt" style="font-size:11px; margin-left:auto;">${s.tier}</span>
                            </div>
                            <p class="mb-2">${s.desc}</p>
                            ${s.tips.length > 0 && html`
                                <div style="background:var(--db-subtle-bg, rgba(0,0,0,0.03)); padding:10px 14px; border-radius:6px; font-size:13px;">
                                    <strong>Tips:</strong>
                                    <ul class="mb-0 mt-1" style="padding-left:18px;">
                                        ${s.tips.map(tip => html`<li>${tip}</li>`)}
                                    </ul>
                                </div>
                            `}
                        </div>
                    </div>
                `)}
            </div>
        </div>
    `;
}
