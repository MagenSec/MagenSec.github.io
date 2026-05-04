import { rewindContext } from '@rewindContext';

const { html } = window;

function readField(source, camelName, pascalName) {
    return source?.[camelName] ?? source?.[pascalName];
}

function asList(value) {
    return Array.isArray(value) ? value.filter(Boolean).map(item => String(item)) : [];
}

function formatPageName(pageName) {
    return String(pageName || 'page').replace(/[-_]/g, ' ');
}

function getEvidenceStatus(evidence) {
    const status = String(readField(evidence, 'status', 'Status') || '').toLowerCase();
    const isComplete = readField(evidence, 'isComplete', 'IsComplete') === true;
    if (status) return status;
    return isComplete ? 'complete' : 'partial';
}

export function EvidenceBanner({ evidence, pageName }) {
    if (!evidence || !rewindContext.isActive?.()) return null;

    const status = getEvidenceStatus(evidence);
    const isBlocked = status === 'blocked';
    const isComplete = status === 'complete' || readField(evidence, 'isComplete', 'IsComplete') === true;
    const missing = asList(readField(evidence, 'missingRequiredAtoms', 'MissingRequiredAtoms'));
    const required = asList(readField(evidence, 'requiredAtoms', 'RequiredAtoms'));
    const empty = asList(readField(evidence, 'emptyAtoms', 'EmptyAtoms'));
    const dateLabel = rewindContext.getDateLabel?.() || rewindContext.getDate?.() || 'selected date';
    const pageLabel = formatPageName(pageName);

    const alertClass = isBlocked
        ? 'alert-danger'
        : isComplete
            ? 'alert-success'
            : 'alert-warning';
    const badgeClass = isBlocked
        ? 'bg-danger text-white'
        : isComplete
            ? 'bg-success text-white'
            : 'bg-warning text-white';
    const title = isBlocked
        ? 'Evidence blocked'
        : isComplete
            ? 'Evidence complete'
            : 'Evidence incomplete';
    const message = isBlocked
        ? `Historical ${pageLabel} proof is blocked for ${dateLabel} until required atoms are cooked.`
        : isComplete
            ? `Historical ${pageLabel} proof is backed by the required atoms for ${dateLabel}.`
            : `Historical ${pageLabel} proof is partial for ${dateLabel}; totals may be limited to available atoms.`;

    return html`
        <div class=${`alert ${alertClass} border-0 shadow-sm mb-3`} role="status" aria-live="polite">
            <div class="d-flex flex-column flex-lg-row align-items-lg-center gap-2">
                <div class="d-flex align-items-start gap-2 flex-grow-1">
                    <span class=${`badge ${badgeClass} mt-1`}>${isComplete ? 'Complete' : isBlocked ? 'Blocked' : 'Partial'}</span>
                    <div>
                        <div class="fw-semibold">${title}</div>
                        <div class="small">${message}</div>
                    </div>
                </div>
                <div class="d-flex flex-wrap gap-1 justify-content-lg-end">
                    ${missing.map(atom => html`<span class="badge bg-danger-lt text-danger">Missing: ${atom}</span>`)}
                    ${!missing.length && required.length ? html`<span class="badge bg-secondary-lt text-secondary">${required.length} required atom${required.length === 1 ? '' : 's'}</span>` : null}
                    ${empty.length ? html`<span class="badge bg-azure-lt text-azure">${empty.length} empty atom${empty.length === 1 ? '' : 's'}</span>` : null}
                </div>
            </div>
        </div>
    `;
}

