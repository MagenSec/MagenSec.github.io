/**
 * CVE Details Modal - Displays comprehensive vulnerability information
 * Features:
 * - Severity and CVSS/EPSS scores
 * - Exploit availability (KEV status)
 * - Threat intelligence from multiple sources
 * - Affected devices and applications
 * - Remediation guidance
 */

import { loadCveDetailsData, CveDetailsContent, getSeverityBadgeClass, formatScore } from './CveDetailsShared.js';

const { html } = window;
const { useState, useEffect } = window.preactHooks;

export function CveDetailsModal({ cveId, orgId, isOpen, onClose }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [cveData, setCveData] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedRemediationApp, setSelectedRemediationApp] = useState('');

    useEffect(() => {
        if (isOpen && cveId && orgId) {
            loadCveDetails();
        }
    }, [isOpen, cveId, orgId]);

    const loadCveDetails = async () => {
        setLoading(true);
        setError(null);
        try {
            const mappedData = await loadCveDetailsData(orgId, cveId);
            setCveData(mappedData);
        } catch (err) {
            setError(err.message || 'Error loading CVE details');
            console.error('[CveDetailsModal] Error loading CVE:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return html`
        <div class="modal ${isOpen ? 'show d-block' : ''} cve-details-modal-backdrop" style=${isOpen ? 'background-color: rgba(2,6,23,0.68)' : 'display: none'}>
            <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable cve-details-modal-dialog">
                <div class="modal-content cve-details-modal">
                    <!-- Header -->
                    <div class="modal-header cve-details-modal__header border-bottom-0">
                        <div class="min-w-0">
                            <div class="text-uppercase small fw-semibold opacity-75 mb-1">Officer MAGI vulnerability brief</div>
                            <h4 class="modal-title mb-1">${cveId}</h4>
                            ${cveData && html`
                                <div class="small d-flex flex-wrap align-items-center gap-2 cve-details-modal__meta">
                                    <span class="badge ${getSeverityBadgeClass(cveData.severity)}">${cveData.severity}</span>
                                    ${cveData.cvssScore ? html`
                                        <span>CVSS ${formatScore(cveData.cvssScore)}</span>
                                    ` : ''}
                                    ${cveData.hasExploit ? html`
                                        <span class="badge bg-danger text-white">
                                            <i class="ti ti-alert-circle me-1"></i>
                                            Known exploit available
                                        </span>
                                    ` : ''}
                                </div>
                            `}
                        </div>
                        <button 
                            type="button" 
                            class="btn-close btn-close-white" 
                            aria-label="Close" 
                            onClick=${onClose}
                        ></button>
                    </div>

                    <!-- Body -->
                    <div class="modal-body">
                        <${CveDetailsContent}
                            cveData=${cveData}
                            loading=${loading}
                            error=${error}
                            activeTab=${activeTab}
                            onTabChange=${setActiveTab}
                            selectedRemediationApp=${selectedRemediationApp}
                            onSelectRemediationApp=${setSelectedRemediationApp}
                            onNavigate=${onClose}
                        />
                    </div>

                    <!-- Footer -->
                    <div class="modal-footer border-top">
                        <a href=${`https://nvd.nist.gov/vuln/detail/${cveId}`} target="_blank" rel="noopener" class="btn btn-link btn-sm">
                            <i class="ti ti-external-link me-1"></i>
                            NVD Details
                        </a>
                        ${cveData && cveData.affectedApplications && cveData.affectedApplications.length > 0 && html`
                            <a href=${`#!/inventory?filter=${encodeURIComponent(cveData.affectedApplications.map(a => `app:${a.appName}`).join('|'))}`} class="btn btn-primary btn-sm">
                                <i class="ti ti-list-check me-1"></i>
                                View in Inventory
                            </a>
                        `}
                        <button type="button" class="btn btn-secondary btn-sm" onClick=${onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}
