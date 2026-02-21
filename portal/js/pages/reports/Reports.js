/**
 * Reports Hub
 * Central hub for all security, compliance, and operational reports.
 * Live reports link to existing pages; coming-soon cards are clearly marked.
 */

const { html, Component } = window;

const REPORTS = [
  {
    id: 'executive',
    title: 'Executive Report',
    description: 'High-level security posture summary for leadership — key risks, scores, and recommendations.',
    href: null,
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="15" y2="16" /></svg>`
  },
  {
    id: 'security',
    title: 'Security Report',
    description: 'Detailed threat analysis, CVE exposure, risk scores, and vulnerability breakdown by severity.',
    href: null,
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /></svg>`
  },
  {
    id: 'compliance',
    title: 'Compliance Report',
    description: 'Framework scores across CIS, NIST, CERT-In, and ISO 27001 with gap analysis and controls coverage.',
    href: '#!/posture-ai',
    viewHref: '#!/compliance',
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 15m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M13 17.5v4.5l2 -1.5 2 1.5v-4.5" /><path d="M10 19h-5a2 2 0 0 1 -2 -2v-10c0 -1.1 .9 -2 2 -2h14a2 2 0 0 1 2 2v3.5" /></svg>`
  },
  {
    id: 'audit',
    title: 'Audit Report',
    description: 'Activity timeline, member actions, device lifecycle events, and system audit log.',
    href: '#!/audit',
    viewHref: '#!/auditor',
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="M9 12l2 2l4 -4" /></svg>`
  },
  {
    id: 'assets',
    title: 'Asset Inventory',
    description: 'Full device list with health status, OS version, configuration, and online/offline state.',
    href: '#!/devices',
    viewHref: '#!/devices',
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>`
  },
  {
    id: 'software',
    title: 'Software Inventory',
    description: 'Installed applications across all managed devices — vendor, version, and risk score.',
    href: '#!/inventory',
    viewHref: '#!/inventory',
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M10 3l-2 2l2 2" /><path d="M14 3l2 2l-2 2" /></svg>`
  },
  {
    id: 'vulnerabilities',
    title: 'Vulnerability Report',
    description: 'CVEs by severity (Critical/High/Medium/Low), exploit status, EPSS scores, and remediation state.',
    href: null,
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>`
  },
  {
    id: 'patch',
    title: 'Patch Report',
    description: 'Patch coverage by device, missing critical updates, remediation timelines, and compliance impact.',
    href: null,
    icon: html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3l9 4.5v9l-9 4.5l-9 -4.5v-9z" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M3 7.5l9 4.5l9 -4.5" /></svg>`
  }
];

const DownloadIcon = () => html`
  <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
    <polyline points="7 11 12 16 17 11" />
    <line x1="12" y1="4" x2="12" y2="16" />
  </svg>
`;

export class ReportsPage extends Component {
  render() {
    const liveCount = REPORTS.filter(r => r.href).length;

    return html`
      <div class="page-header d-print-none">
        <div class="container-xl">
          <div class="row g-2 align-items-center">
            <div class="col">
              <h2 class="page-title">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" /><path d="M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" /><path d="M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" /><path d="M4 20h14" /></svg>
                Reports
              </h2>
              <div class="page-subtitle text-muted">
                Security, compliance, and operational reports
                <span class="badge bg-success-lt text-success ms-2">${liveCount} available</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="page-body">
        <div class="container-xl">
          <div class="row row-cols-1 row-cols-md-2 g-4">
            ${REPORTS.map(r => html`
              <div class="col">
                <div class="card h-100 ${r.href ? '' : 'opacity-75'}">
                  <div class="card-body">
                    <div class="d-flex align-items-start justify-content-between mb-2">
                      <div class="d-flex align-items-center gap-2">
                        <span class="avatar avatar-sm bg-${r.href ? 'primary' : 'secondary'}-lt text-${r.href ? 'primary' : 'muted'}">
                          ${r.icon}
                        </span>
                        <h3 class="card-title mb-0">${r.title}</h3>
                      </div>
                      ${!r.href ? html`<span class="badge bg-secondary text-white">Coming Soon</span>` : ''}
                    </div>

                    <p class="text-muted mb-3">${r.description}</p>

                    ${r.href ? html`
                      <div class="d-flex gap-2 flex-wrap">
                        <a href="${r.viewHref || r.href}" class="btn btn-sm btn-primary">
                          <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="14" height="14" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="2" /><path d="M22 12c-2.667 4.667 -6 7 -10 7s-7.333 -2.333 -10 -7c2.667 -4.667 6 -7 10 -7s7.333 2.333 10 7" /></svg>
                          View ${r.title}
                        </a>
                        <button class="btn btn-sm btn-outline-secondary" disabled title="CSV export — coming soon">
                          <${DownloadIcon} />
                          Download CSV
                        </button>
                      </div>
                    ` : html`
                      <button class="btn btn-sm btn-outline-secondary" disabled>
                        Not yet available
                      </button>
                    `}
                  </div>
                </div>
              </div>
            `)}
          </div>
        </div>
      </div>
    `;
  }
}

export default ReportsPage;
