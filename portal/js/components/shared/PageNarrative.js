import { orgContext } from '@orgContext';
import { rewindContext } from '@rewindContext';

const { html } = window;

const STORY_STEPS = [
    { id: 'security', label: 'Security', title: 'Current safety, fleet coverage, vulnerabilities, patches, and actions.' },
    { id: 'compliance', label: 'Compliance', title: 'Controls, frameworks, gaps, and evidence completeness.' },
    { id: 'audit', label: 'Audit', title: 'Traceability, exports, reports, and read-only proof.' },
    { id: 'hygiene', label: 'Hygiene', title: 'Behavior over time: cadence, recurrence, MTTR, and drift.' },
    { id: 'insurance', label: 'Insurance', title: 'Today\'s proof state for readiness and attestation.' }
];

const NARRATIVES = {
    security: {
        kicker: 'Protect / Daily safety',
        title: 'Security command',
        question: 'Are we secure today?',
        answer: 'Device health, active exposures, patch status, and fix-first actions show what needs attention now.',
        source: 'Dashboard bundle, alert summary, patch posture, and fleet evidence',
        actionLabel: 'Open actions',
        actionHref: '#!/alerts',
        focus: ['security'],
        tone: 'security'
    },
    devices: {
        kicker: 'Protect / Fleet coverage',
        title: 'Device fleet',
        question: 'Which devices can we trust right now?',
        answer: 'Connectivity and visibility states explain coverage before vulnerabilities, patches, or reports are trusted.',
        source: 'Devices API with backend health classification',
        actionLabel: 'Review exposures',
        actionHref: '#!/vulnerabilities',
        focus: ['security', 'hygiene']
    },
    'device-detail': {
        kicker: 'Protect / Device evidence',
        title: 'Device detail',
        question: 'What proof exists for this endpoint?',
        answer: 'The page ties one device to inventory, telemetry, alerts, and commands so fixes have a named target.',
        source: 'Device facts, inventory, alerts, and command status',
        actionLabel: 'Back to fleet',
        actionHref: '#!/devices',
        focus: ['security', 'audit']
    },
    alerts: {
        kicker: 'Protect / Required actions',
        title: 'Action items',
        question: 'Which open issues should be closed first?',
        answer: 'Open alert instances are prioritized by severity, SLA pressure, affected scope, and proof impact.',
        source: 'Alert summary and alert timeline',
        actionLabel: 'View audit trail',
        actionHref: '#!/audit',
        focus: ['security', 'audit', 'hygiene'],
        tone: 'warning'
    },
    vulnerabilities: {
        kicker: 'Protect / Exposure map',
        title: 'Vulnerability risk',
        question: 'Which software risks threaten the fleet?',
        answer: 'Unique CVEs, affected apps, and device exposures are grouped so remediation targets stay explicit.',
        source: 'Vulnerability projection, CVE intelligence, and device facts',
        actionLabel: 'Check patches',
        actionHref: '#!/patch-posture',
        focus: ['security', 'hygiene']
    },
    cves: {
        kicker: 'Protect / CVE detail',
        title: 'CVE evidence',
        question: 'Where does this CVE matter in our environment?',
        answer: 'The CVE view connects threat intelligence to affected applications and devices before action.',
        source: 'CVE intelligence, KEV/EPSS signals, and local exposure facts',
        actionLabel: 'Back to risks',
        actionHref: '#!/vulnerabilities',
        focus: ['security']
    },
    'patch-posture': {
        kicker: 'Protect / Patch evidence',
        title: 'Patch status',
        question: 'Which updates reduce risk and proof gaps fastest?',
        answer: 'Missing update rollups show affected hosts, severity, exploit status, and patch evidence freshness.',
        source: 'Patch posture API, Microsoft update intelligence, and device facts',
        actionLabel: 'Open devices',
        actionHref: '#!/devices',
        focus: ['security', 'hygiene']
    },
    inventory: {
        kicker: 'Protect / Asset evidence',
        title: 'Application inventory',
        question: 'What software footprint are we defending?',
        answer: 'Inventory confidence anchors vulnerability matching, supply-chain review, and audit evidence.',
        source: 'Inventory projection and software telemetry',
        actionLabel: 'Open apps',
        actionHref: '#!/apps',
        focus: ['security', 'audit']
    },
    apps: {
        kicker: 'Protect / Software footprint',
        title: 'Your apps',
        question: 'Which applications create exposure or drift?',
        answer: 'Installed software, version evidence, and vulnerability links explain what to patch or review.',
        source: 'Inventory, AppVersionIntel, and vulnerability projections',
        actionLabel: 'View changelog',
        actionHref: '#!/changelog',
        focus: ['security', 'hygiene']
    },
    changelog: {
        kicker: 'Protect / Software change',
        title: 'Software changelog',
        question: 'How is the software estate changing?',
        answer: 'Install, uninstall, and update events show whether inventory hygiene is improving or drifting.',
        source: 'Inventory changelog and cloud assimilation markers',
        actionLabel: 'Review apps',
        actionHref: '#!/apps',
        focus: ['hygiene', 'audit']
    },
    compliance: {
        kicker: 'Prove / Control readiness',
        title: 'Compliance readiness',
        question: 'Are controls passing and provable?',
        answer: 'Framework alignment turns security evidence into control gaps, affected scope, and audit-ready proof.',
        source: 'Compliance dossier, framework catalog, and trend evidence',
        actionLabel: 'Open reports',
        actionHref: '#!/reports',
        focus: ['compliance', 'audit'],
        tone: 'compliance'
    },
    posture: {
        kicker: 'Prove / Hygiene trend',
        title: 'Posture trends',
        question: 'Are we improving over time?',
        answer: 'Dossier history exposes behavior: patch cadence, recurring gaps, remediation movement, and drift.',
        source: 'Posture dossier history and trend evidence',
        actionLabel: 'Open readiness',
        actionHref: '#!/dashboard',
        focus: ['hygiene', 'compliance']
    },
    'posture-ai': {
        kicker: 'Audit / Mission brief',
        title: 'Mission briefing',
        question: 'What changed, why does it matter, and what should we say?',
        answer: 'MAGI summarizes evidence movement into stakeholder-ready narrative without replacing source proof.',
        source: 'AI report payloads and underlying evidence dossiers',
        actionLabel: 'Open reports',
        actionHref: '#!/reports',
        focus: ['audit', 'hygiene']
    },
    'mission-brief': {
        kicker: 'Audit / Mission brief',
        title: 'Mission briefing',
        question: 'What changed, why does it matter, and what should we say?',
        answer: 'MAGI summarizes evidence movement into stakeholder-ready narrative without replacing source proof.',
        source: 'AI report payloads and underlying evidence dossiers',
        actionLabel: 'Open reports',
        actionHref: '#!/reports',
        focus: ['audit', 'hygiene']
    },
    audit: {
        kicker: 'Audit / Command log',
        title: 'Audit trail',
        question: 'Can we show who did what and when?',
        answer: 'Timeline and analytics connect user actions, system jobs, and evidence movement into a defensible trail.',
        source: 'Audit log and audit analytics',
        actionLabel: 'Open reports',
        actionHref: '#!/reports',
        focus: ['audit', 'hygiene'],
        tone: 'audit'
    },
    auditor: {
        kicker: 'Audit / Read-only proof',
        title: 'Auditor dashboard',
        question: 'Can an auditor verify evidence without changing state?',
        answer: 'Read-only proof views separate observation from mutation while keeping reports and gaps explainable.',
        source: 'Audit, compliance, posture, and report evidence',
        actionLabel: 'Open command log',
        actionHref: '#!/audit',
        focus: ['audit', 'compliance']
    },
    reports: {
        kicker: 'Audit / Evidence delivery',
        title: 'Reports and delivery',
        question: 'What proof can we hand to stakeholders?',
        answer: 'Generated reports translate security and compliance evidence into shareable audit and insurance artifacts.',
        source: 'Generated report cache and report delivery status',
        actionLabel: 'Preview report',
        actionHref: '#!/reports/preview',
        focus: ['audit', 'insurance']
    },
    'reports/preview': {
        kicker: 'Audit / Report preview',
        title: 'Report preview',
        question: 'Does the stakeholder proof render correctly?',
        answer: 'Preview validates the generated daily or weekly report before print, PDF, or email delivery.',
        source: 'Generated report HTML and report cache',
        actionLabel: 'Back to reports',
        actionHref: '#!/reports',
        focus: ['audit', 'insurance']
    },
    'attack-chain': {
        kicker: 'Protect / Attack paths',
        title: 'Attack chain',
        question: 'How could an attacker move from exposure to business impact?',
        answer: 'Graph context links vulnerabilities, devices, and dependencies into paths that can be broken.',
        source: 'Attack graph, vulnerabilities, and fleet evidence',
        actionLabel: 'Open exposures',
        actionHref: '#!/vulnerabilities',
        focus: ['security', 'insurance']
    },
    analyst: {
        kicker: 'MAGI / Reasoning layer',
        title: 'Officer MAGI',
        question: 'What should we do next and why?',
        answer: 'MAGI connects evidence to recommendations, but source pages remain the authority for proof and action.',
        source: 'Selected portal evidence and MAGI prompt context',
        actionLabel: 'Open readiness',
        actionHref: '#!/dashboard',
        focus: ['security', 'compliance', 'audit', 'hygiene', 'insurance'],
        tone: 'magi'
    },
    'ai-reports': {
        kicker: 'MAGI / Report intelligence',
        title: 'AI reports',
        question: 'Which generated narratives need review or delivery?',
        answer: 'AI report surfaces help operators inspect narrative quality while keeping generated proof traceable.',
        source: 'AI report jobs and generated artifacts',
        actionLabel: 'Open reports',
        actionHref: '#!/reports',
        focus: ['audit', 'insurance']
    },
    'add-on/hygiene-coach': {
        kicker: 'Hygiene / Coaching',
        title: 'Hygiene coach',
        question: 'Which repeated behaviors should improve next?',
        answer: 'Coaching turns recurring security work into measurable habits, streaks, and projected gains.',
        source: 'Hygiene trends, actions, and recurring gap evidence',
        actionLabel: 'Open posture trends',
        actionHref: '#!/posture',
        focus: ['hygiene']
    },
    'add-on/insurance-readiness': {
        kicker: 'Insure / Attestation',
        title: 'Insurance attestation',
        question: 'What can we attest to today?',
        answer: 'Attestation packages today\'s proof state into underwriter-facing evidence and caveats.',
        source: 'Insurance readiness model and proof dossiers',
        actionLabel: 'Open reports',
        actionHref: '#!/reports',
        focus: ['insurance', 'audit']
    },
    'add-on/compliance-plus': {
        kicker: 'Prove / Advanced controls',
        title: 'Compliance Plus',
        question: 'Which deeper controls need proof?',
        answer: 'Advanced compliance views expand control evidence beyond the base readiness dossier.',
        source: 'Compliance add-on evidence and framework detail',
        actionLabel: 'Open compliance',
        actionHref: '#!/compliance',
        focus: ['compliance', 'audit']
    },
    'add-on/peer-benchmark': {
        kicker: 'Hygiene / Benchmark',
        title: 'Peer benchmark',
        question: 'How does our behavior compare with peers?',
        answer: 'Benchmarks add cohort context to hygiene and readiness without replacing internal proof.',
        source: 'Peer cohorts, hygiene scores, and org dossiers',
        actionLabel: 'Open hygiene trends',
        actionHref: '#!/posture',
        focus: ['hygiene', 'insurance']
    },
    'add-on/supply-chain-intel': {
        kicker: 'Insure / Supply chain',
        title: 'Supply chain risk',
        question: 'Which third-party software increases business risk?',
        answer: 'Supplier and package context turns software inventory into business exposure evidence.',
        source: 'Inventory, supplier intelligence, and vulnerability context',
        actionLabel: 'Open apps',
        actionHref: '#!/apps',
        focus: ['security', 'insurance']
    },
    'siteadmin/business': {
        kicker: 'Site Admin / Economics',
        title: 'Business command center',
        question: 'Is the platform economically healthy and operationally efficient?',
        answer: 'Settled revenue, Azure actuals, cost trends, and signal volume explain margin and operating pressure.',
        source: 'Business dossiers, Azure Cost API actuals, and cache performance',
        actionLabel: 'Open activity',
        actionHref: '#!/siteadmin/activity',
        focus: ['hygiene', 'insurance'],
        tone: 'business'
    },
    'siteadmin/manage': {
        kicker: 'Site Admin / Control plane',
        title: 'Manage',
        question: 'Can we manage customers, accounts, MAGI codes, and platform switches without losing traceability?',
        answer: 'Operational changes belong here; evidence and business outcomes remain visible on activity and business pages.',
        source: 'Admin org, account, license, invoice, and platform settings APIs',
        actionLabel: 'Open activity',
        actionHref: '#!/siteadmin/activity',
        focus: ['audit', 'hygiene'],
        tone: 'admin'
    },
    'siteadmin/activity': {
        kicker: 'Site Admin / Operations',
        title: 'Activity',
        question: 'Is the platform processing evidence on time?',
        answer: 'Cron, API, device, and ingestion activity show freshness, backlogs, failures, and throughput.',
        source: 'Cron status, API audit, device activity, and operational logs',
        actionLabel: 'Open business',
        actionHref: '#!/siteadmin/business',
        focus: ['audit', 'hygiene'],
        tone: 'admin'
    },
    'siteadmin/preview': {
        kicker: 'Site Admin / Report QA',
        title: 'Preview',
        question: 'Do generated communications match the evidence and brand?',
        answer: 'Preview lets operators inspect generated report HTML and delivery variants before customer use.',
        source: 'Generated report cache and preview APIs',
        actionLabel: 'Open reports',
        actionHref: '#!/reports',
        focus: ['audit', 'insurance'],
        tone: 'admin'
    },
    'siteadmin/review': {
        kicker: 'Site Admin / Vulnerability review',
        title: 'App vulnerability review',
        question: 'Which app intelligence rows need deterministic curation?',
        answer: 'Manual review keeps CPE matching deterministic while AdminHub handles offline/local AI assistance.',
        source: 'AppVersionIntel, curated CPE mapping, and review queue state',
        actionLabel: 'Open activity',
        actionHref: '#!/siteadmin/activity',
        focus: ['security', 'audit'],
        tone: 'admin'
    },
    'siteadmin/ai-responses': {
        kicker: 'Site Admin / MAGI quality',
        title: 'AI responses',
        question: 'Are MAGI answers clear, useful, and grounded?',
        answer: 'Response review separates answer quality from source evidence so prompts can improve safely.',
        source: 'AI response logs, ratings, and prompt metadata',
        actionLabel: 'Open MAGI',
        actionHref: '#!/analyst',
        focus: ['audit', 'hygiene'],
        tone: 'admin'
    },
    review: {
        kicker: 'Site Admin / Feature catalog',
        title: 'Feature catalog',
        question: 'Which surfaces are shipped, wired, or under review?',
        answer: 'The catalog tracks navigation placement and readiness so portal wiring remains explicit.',
        source: 'Static feature catalog and route map',
        actionLabel: 'Open dashboard',
        actionHref: '#!/dashboard',
        focus: ['audit'],
        tone: 'admin'
    },
    account: {
        kicker: 'Settings / Identity',
        title: 'Account',
        question: 'Is the user and organization context correct?',
        answer: 'Account settings explain who is signed in, which org is active, and which contacts receive security notices.',
        source: 'User profile, org context, and notification preferences',
        actionLabel: 'Open settings',
        actionHref: '#!/settings',
        focus: ['audit']
    },
    settings: {
        kicker: 'Settings / Policy',
        title: 'Settings',
        question: 'Are platform preferences aligned with how the org operates?',
        answer: 'Settings alter notification, report, team, and license behavior; read-only mode blocks mutating changes.',
        source: 'Org settings, team, license, and report preference APIs',
        actionLabel: 'Open account',
        actionHref: '#!/account',
        focus: ['audit', 'hygiene']
    },
    'getting-started': {
        kicker: 'Setup / First proof',
        title: 'Getting started',
        question: 'What evidence is needed before MagenSec can tell the story?',
        answer: 'Onboarding connects an org, license, and first devices so security evidence can start flowing.',
        source: 'Account, license, and device registration state',
        actionLabel: 'Open security',
        actionHref: '#!/security',
        focus: ['security']
    },
    upgrade: {
        kicker: 'Plan / Capability',
        title: 'Upgrade',
        question: 'Which capability unlocks the next part of the story?',
        answer: 'Add-ons map to proof, audit, hygiene, and insurance outcomes rather than isolated features.',
        source: 'License package and add-on catalog',
        actionLabel: 'Open account',
        actionHref: '#!/account',
        focus: ['compliance', 'audit', 'hygiene', 'insurance']
    },
    'documentation-hub': {
        kicker: 'Help / Reference',
        title: 'Documentation',
        question: 'How should a user understand scores, evidence, and actions?',
        answer: 'Help content supports the portal story without becoming the primary way to explain the page.',
        source: 'Portal documentation content',
        actionLabel: 'Open security',
        actionHref: '#!/security',
        focus: ['security', 'compliance', 'audit']
    }
};

function getNarrative(page) {
    return NARRATIVES[page] || null;
}

function getModeBadges() {
    const badges = [];
    if (rewindContext.isActive?.()) {
        badges.push({ label: `Time Warp: ${rewindContext.getDateLabel?.() || 'selected date'}`, className: 'bg-warning-lt text-warning', title: 'This page is showing historical evidence for the selected date.' });
    }

    if (orgContext.isReadOnly?.() && !orgContext.isSiteAdmin?.()) {
        badges.push({ label: 'Read-only', className: 'bg-secondary-lt text-secondary', title: 'Auditor mode blocks actions that change state.' });
    }

    const org = orgContext.getCurrentOrg?.();
    if (org?.type) {
        badges.push({ label: `${org.type} org`, className: 'bg-azure-lt text-azure', title: 'Current organization type controls available features and navigation.' });
    }

    return badges;
}

export function PageNarrative({ page }) {
    const meta = getNarrative(page);
    if (!meta) return null;

    const focus = new Set(meta.focus || []);
    const modeBadges = getModeBadges();
    const tone = meta.tone || 'default';

    return html`
        <section class=${`portal-narrative portal-narrative-${tone}`} aria-label="Page story and evidence context">
            <div class="portal-narrative-main">
                <div class="portal-narrative-copy">
                    <div class="portal-narrative-kicker">${meta.kicker}</div>
                    <div class="portal-narrative-title">${meta.title}</div>
                    <div class="portal-narrative-question">${meta.question}</div>
                    <div class="portal-narrative-answer">${meta.answer}</div>
                </div>
                <div class="portal-narrative-side">
                    <div class="portal-narrative-source" title="Evidence source for this page">
                        <i class="ti ti-database-search"></i>
                        <span>${meta.source}</span>
                    </div>
                    <div class="portal-narrative-badges">
                        ${modeBadges.map((badge) => html`
                            <span class=${`badge ${badge.className}`} title=${badge.title}>${badge.label}</span>
                        `)}
                    </div>
                    ${meta.actionHref ? html`
                        <a class="btn btn-sm btn-outline-primary portal-narrative-action" href=${meta.actionHref} title=${`Next action: ${meta.actionLabel}`}>
                            <i class="ti ti-arrow-right"></i>
                            ${meta.actionLabel}
                        </a>
                    ` : null}
                </div>
            </div>
            <div class="portal-story-chain" aria-label="MagenSec story chain">
                ${STORY_STEPS.map((step, index) => {
                    const isActive = focus.has(step.id);
                    return html`
                        <span class=${`portal-story-step ${isActive ? 'is-active' : ''}`} title=${step.title}>
                            <span class="portal-story-index">${index + 1}</span>
                            ${step.label}
                        </span>
                    `;
                })}
            </div>
        </section>
    `;
}
