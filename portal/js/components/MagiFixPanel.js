/**
 * MagiFixPanel — Inline AI remediation guidance with vote feedback.
 *
 * Appears as an expandable card within vulnerability/alert rows.
 * Calls the chat endpoint with Action="fix" to fetch or generate
 * cached remediation guidance.
 *
 * Props:
 *   appName  {string} — Application name
 *   vendor   {string} — Vendor name
 *   version  {string} — Installed version
 *   os       {string} — Target OS (default "windows")
 *   onClose  {function} — Close handler
 */

import { api } from '@api';
import { orgContext } from '@orgContext';

const { html, Component } = window;

function normalizeMagiGuidance(text, { appName, version, cveId } = {}) {
    if (!text) return '';

    const product = [appName, version].filter(Boolean).join(' ').trim() || 'the affected application';
    const cveLabel = cveId || 'this CVE';

    return text
        .replace(/run vulnerability scanner\s*:\s*use a vulnerability scanning tool to ensure .*?(\.|\n|$)/ig,
            `Re-check in MagenSec: after the customer applies the approved change for ${product}, confirm ${cveLabel} drops out of active findings in MagenSec, verify the version has moved forward in Inventory, and use Time Warp to confirm the exposure trend improves.$1`)
        .replace(/use a vulnerability scanning tool to ensure .*?(\.|\n|$)/ig,
            `Use MagenSec itself to verify the result: refresh signals, confirm the vulnerable version is no longer present in Inventory, and confirm ${cveLabel} is no longer an active exposure.$1`)
        .replace(/run a scan to verify .*?(\.|\n|$)/ig,
            `Refresh MagenSec signals and review the affected app and device views to verify the mitigation took effect.$1`);
}

function renderMarkdown(text) {
    if (!text) return '';
    let parsed = window.marked ? window.marked.parse(text) : text.replace(/\n/g, '<br>');
    return window.DOMPurify ? window.DOMPurify.sanitize(parsed) : parsed;
}

export class MagiFixPanel extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: false,
            response: null,
            cacheId: null,
            error: null,
            voted: null, // 'up' | 'down' | null
            copied: false,
        };
    }

    componentDidMount() {
        this.fetchFix();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.appName !== this.props.appName ||
            prevProps.version !== this.props.version ||
            prevProps.vendor !== this.props.vendor ||
            prevProps.cveId !== this.props.cveId) {
            this.fetchFix();
        }
    }

    async fetchFix() {
        const org = orgContext.getCurrentOrg();
        if (!org) return;

        const { appName, vendor, version, os, cveId } = this.props;

        this.setState({ loading: true, error: null, response: null, cacheId: null, voted: null, copied: false });

        try {
            const targetPrompt = cveId
                ? `We are MagenSec. For ${cveId} affecting ${appName} ${version}, provide customer-controlled remediation guidance that reflects MagenSec's value: visibility, prioritization, compensating controls, patch/change-window planning, compliance and posture guidance, and verification inside MagenSec after the change. Do not tell the user to run a vulnerability scanner or imply MagenSec auto-patches endpoints. Focus on immediate risk, safe mitigation options, the concrete vendor patch/update path, and how to confirm improvement in MagenSec and Time Warp.`
                : `We are MagenSec. For vulnerabilities in ${appName} ${version}, provide customer-controlled remediation guidance that reflects MagenSec's value: visibility, prioritization, compensating controls, patch/change-window planning, compliance/posture guidance, and verification inside MagenSec after the change. Do not tell the user to run a vulnerability scanner or imply MagenSec auto-patches endpoints.`;

            const resp = await api.askAIAnalyst(org.orgId, {
                Action: 'fix',
                Question: targetPrompt,
                FixAppName: appName || 'unknown',
                FixVendor: vendor || 'unknown',
                FixVersion: version || 'unknown',
                FixCveId: cveId || null,
                FixOs: os || 'windows',
            });

            const data = resp?.data || resp?.Data;
            if (data?.answer || data?.Answer) {
                const answer = data.answer || data.Answer;
                const citations = data.citations || data.Citations || [];
                const cacheId = citations.find(c => c.startsWith('cache:'))?.replace('cache:', '') || null;

                this.setState({
                    loading: false,
                    response: normalizeMagiGuidance(answer, { appName, version, cveId }),
                    cacheId,
                });
            } else {
                this.setState({ loading: false, error: resp?.message || 'No response received' });
            }
        } catch (err) {
            this.setState({ loading: false, error: err.message });
        }
    }

    async submitVote(action) {
        if (!this.state.cacheId || this.state.voted) return;

        const org = orgContext.getCurrentOrg();
        if (!org) return;

        try {
            await api.askAIAnalyst(org.orgId, {
                Action: action,
                CacheId: this.state.cacheId,
            });
            this.setState({ voted: action === 'upvote' ? 'up' : 'down' });
        } catch { /* silent fail */ }
    }

    async copyResponse() {
        if (!this.state.response) return;

        try {
            await navigator.clipboard.writeText(this.state.response);
            this.setState({ copied: true });
            window.setTimeout(() => this.setState({ copied: false }), 1600);
        } catch {
            this.setState({ copied: false });
        }
    }

    render() {
        const { appName, vendor, version, cveId, onClose } = this.props;
        const { loading, response, error, voted, cacheId, copied } = this.state;
        const appLabel = appName || 'Unknown Application';
        const versionLabel = version ? `Version ${version}` : 'Version not reported';
        const cveLabel = cveId ? String(cveId).toUpperCase() : null;

        return html`
            <div class="magi-fix-popout card mt-2">
                <div class="magi-fix-popout__header">
                    <div class="d-flex align-items-start gap-3">
                        <div class="magi-fix-popout__icon">
                            <i class="ti ti-brain"></i>
                        </div>
                        <div class="flex-fill min-w-0">
                            <div class="d-flex flex-wrap align-items-center gap-2">
                                <span class="magi-fix-popout__eyebrow">AI remediation guidance</span>
                                <span class="badge bg-warning text-white">Review before rollout</span>
                            </div>
                            <div class="magi-fix-popout__title">MAGI Fix Guidance</div>
                            <div class="magi-fix-popout__meta mt-2">
                                <span class="magi-fix-popout__chip">${appLabel}</span>
                                ${vendor ? html`<span class="magi-fix-popout__chip">${vendor}</span>` : null}
                                <span class="magi-fix-popout__chip magi-fix-popout__chip--strong">${versionLabel}</span>
                                ${cveLabel ? html`<span class="magi-fix-popout__chip magi-fix-popout__chip--cve">${cveLabel}</span>` : null}
                            </div>
                        </div>
                        ${onClose ? html`
                            <button class="btn btn-sm magi-fix-popout__close" aria-label="Close MAGI guidance" onClick=${onClose}>
                                <i class="ti ti-x"></i>
                            </button>
                        ` : null}
                    </div>
                </div>

                <div class="card-body p-3">
                    <div class="magi-fix-popout__hint">
                        <i class="ti ti-shield-check"></i>
                        <div>
                            <div class="fw-semibold">Recommended approach${cveLabel ? ` for ${cveLabel}` : ''}</div>
                            <div class="small">Validate these steps on a pilot device or test ring before rolling them out broadly.</div>
                        </div>
                    </div>

                    ${loading ? html`
                        <div class="magi-fix-popout__loading mt-3" role="status" aria-live="polite">
                            <div class="spinner-border text-primary" style="width: 1.1rem; height: 1.1rem;"></div>
                            <div>
                                <div class="fw-semibold">Preparing fix guidance…</div>
                                <div class="text-muted small">MAGI is reviewing safer remediation steps for this software.</div>
                            </div>
                        </div>
                        <div class="magi-fix-popout__skeleton mt-3" aria-hidden="true">
                            <span style="width: 92%"></span>
                            <span style="width: 88%"></span>
                            <span style="width: 76%"></span>
                            <span style="width: 85%"></span>
                        </div>
                    ` : error ? html`
                        <div class="alert alert-warning d-flex align-items-start gap-2 mt-3 mb-0">
                            <i class="ti ti-alert-triangle mt-1"></i>
                            <div class="flex-fill">
                                <div class="fw-semibold">MAGI could not prepare guidance</div>
                                <div class="small">${error}</div>
                            </div>
                            <button class="btn btn-sm btn-warning text-white" onClick=${() => this.fetchFix()}>
                                Retry
                            </button>
                        </div>
                    ` : response ? html`
                        <div class="magi-fix-popout__toolbar mt-3">
                            <span class="small text-muted">Action plan for ${appLabel}</span>
                            <div class="btn-list">
                                <button class="btn btn-sm btn-outline-secondary" onClick=${() => this.copyResponse()}>
                                    <i class="ti ${copied ? 'ti-check' : 'ti-copy'} me-1"></i>
                                    ${copied ? 'Copied' : 'Copy'}
                                </button>
                                <button class="btn btn-sm btn-outline-primary" onClick=${() => this.fetchFix()}>
                                    <i class="ti ti-refresh me-1"></i>
                                    Refresh
                                </button>
                            </div>
                        </div>

                        <div class="magi-fix-popout__content markdown-body small" dangerouslySetInnerHTML=${{ __html: renderMarkdown(response) }}></div>

                        ${cacheId ? html`
                            <div class="magi-fix-popout__footer">
                                <span class="small text-muted">Was this guidance helpful?</span>
                                <button
                                    class="btn btn-sm ${voted === 'up' ? 'btn-success' : 'btn-outline-success'}"
                                    disabled=${!!voted}
                                    onClick=${() => this.submitVote('upvote')}
                                >
                                    <i class="ti ti-thumb-up me-1"></i>Yes
                                </button>
                                <button
                                    class="btn btn-sm ${voted === 'down' ? 'btn-danger' : 'btn-outline-danger'}"
                                    disabled=${!!voted}
                                    onClick=${() => this.submitVote('downvote')}
                                >
                                    <i class="ti ti-thumb-down me-1"></i>No
                                </button>
                                ${voted ? html`<span class="badge bg-success-lt text-success">Thanks for the feedback</span>` : null}
                            </div>
                        ` : null}
                    ` : null}
                </div>
            </div>
        `;
    }
}

export default MagiFixPanel;
