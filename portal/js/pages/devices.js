/**
 * Devices Page - Preact + HTM with Tabler
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { orgContext } from '../orgContext.js';
import { config } from '../config.js';
import { getInstallerConfig, clearManifestCache, getCacheStatus } from '../utils/manifestCache.js';

export class DevicesPage extends window.Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            devices: [],
            error: null,
            installers: config.INSTALLERS, // Fallback to hardcoded config
            refreshingManifest: false,
            showDownloadModal: false,
            downloadTarget: null, // { name, url, size, arch }
            manifestError: null
        };
        this.orgUnsubscribe = null;
    }

    componentDidMount() {
        // Subscribe to org changes to reload devices when user switches orgs
        this.orgUnsubscribe = orgContext.onChange(() => {
            this.loadDevices();
        });
        
        // Load installer config from manifest cache
        this.loadInstallerConfig();
        
        this.loadDevices();
    }

    async loadInstallerConfig() {
        try {
            const manifestConfig = await getInstallerConfig();
            if (manifestConfig) {
                this.setState({ installers: manifestConfig, manifestError: null });
                console.log('[Devices] Loaded installer config from manifest cache:', manifestConfig);
            } else {
                this.setState({ manifestError: 'Failed to load installer manifest. Please try again later or contact support.' });
            }
        } catch (error) {
            console.error('[Devices] Failed to load manifest config, using fallback:', error);
            this.setState({ manifestError: 'Failed to load installer manifest due to network or server error.' });
        }
    }

    async reloadPageData() {
        try {
            this.setState({ refreshingManifest: true });
            
            // Clear manifest cache and reload from remote
            const manifestConfig = await getInstallerConfig(true);
            if (manifestConfig) {
                this.setState({ installers: manifestConfig });
            }
            
            // Reload device list
            await this.loadDevices();
            
            // Show success toast
            this.showToast('Page reloaded successfully', 'success');
        } catch (error) {
            console.error('[Devices] Failed to reload page data:', error);
            this.showToast('Failed to reload page data', 'danger');
        } finally {
            this.setState({ refreshingManifest: false });
        }
    }

    showToast(message, type = 'info') {
        // Use Tabler toast (simple alert for now)
        // TODO: Implement proper Tabler toast notification
        alert(message);
    }

    openDownloadModal(arch) {
        const installer = arch === 'x64' ? this.state.installers.X64 : this.state.installers.ARM64;
        this.setState({
            showDownloadModal: true,
            downloadTarget: {
                name: installer.DISPLAY_NAME,
                url: installer.DOWNLOAD_URL,
                size: installer.FILE_SIZE_MB,
                arch: installer.ARCHITECTURE,
                warning: installer.WARNING
            }
        });
    }

    closeDownloadModal() {
        this.setState({
            showDownloadModal: false,
            downloadTarget: null
        });
    }

    confirmDownload() {
        if (this.state.downloadTarget) {
            // Create a hidden anchor element to trigger download
            const a = document.createElement('a');
            a.href = this.state.downloadTarget.url;
            a.download = '';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.closeDownloadModal();
        }
    }

    componentWillUnmount() {
        // Unsubscribe from org changes
        if (this.orgUnsubscribe) {
            this.orgUnsubscribe();
        }
    }

    async loadDevices() {
        try {
            this.setState({ loading: true, error: null });

            // Get current org from context
            const currentOrg = orgContext.getCurrentOrg();
            if (!currentOrg || !currentOrg.orgId) {
                this.setState({ 
                    devices: [], 
                    loading: false,
                    error: 'No organization selected'
                });
                return;
            }

            // Call real API
            const response = await api.getDevices(currentOrg.orgId);
            
            // Transform API response to expected format
            const devices = (response.data?.devices || []).map(device => {
                // Mask license key - only show last 8 characters
                let maskedKey = null;
                if (device.licenseKey) {
                    const key = device.licenseKey;
                    maskedKey = key.length > 8 ? `****-****-${key.slice(-8)}` : key;
                }
                
                return {
                    id: device.deviceId,
                    name: device.deviceName || device.deviceId,
                    state: device.state || 'Unknown',
                    lastHeartbeat: device.lastHeartbeat,
                    firstHeartbeat: device.firstHeartbeat,
                    clientVersion: device.clientVersion,
                    licenseKey: maskedKey,
                    // Calculate inactiveMinutes client-side
                    inactiveMinutes: device.lastHeartbeat ? Math.floor((Date.now() - new Date(device.lastHeartbeat).getTime()) / 60000) : null
                };
            });
            
            this.setState({ devices, loading: false });
        } catch (error) {
            console.error('[DevicesPage] Error loading devices:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    formatLastSeen(lastHeartbeat) {
        if (!lastHeartbeat) {
            return 'Never';
        }

        const now = new Date();
        const then = new Date(lastHeartbeat);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }

    isVersionOutdated(deviceVersion) {
        if (!deviceVersion) return false;
        
        // Use cached installer version (or fallback to config)
        const latestVersion = this.state.installers.ENGINE.VERSION || config.INSTALLERS.ENGINE.VERSION;
        
        // Parse versions (format: major.minor.build)
        const parseVersion = (v) => {
            const parts = v.split('.').map(Number);
            return {
                major: parts[0] || 0,
                minor: parts[1] || 0,
                build: parts[2] || 0
            };
        };
        
        const device = parseVersion(deviceVersion);
        const latest = parseVersion(latestVersion);
        
        // Compare major.minor.build
        if (device.major < latest.major) return true;
        if (device.major === latest.major && device.minor < latest.minor) return true;
        if (device.major === latest.major && device.minor === latest.minor && device.build < latest.build) return true;
        
        return false;
    }

    isDeviceInactive(device) {
        // No heartbeat = offline
        if (!device.lastHeartbeat) {
            return true;
        }
        // Use calculated inactiveMinutes
        if (device.inactiveMinutes !== null && device.inactiveMinutes !== undefined) {
            const state = device.state?.toLowerCase();
            // Active devices: Expected heartbeat every 5 minutes, flag as offline if >30 minutes
            if (state === 'active' && device.inactiveMinutes > 30) {
                return true;
            }
            // Disabled devices: Expected heartbeat every 60 minutes, flag as offline if >120 minutes
            if (state === 'disabled' && device.inactiveMinutes > 120) {
                return true;
            }
        }
        return false;
    }

    getStateBadgeClass(state) {
        switch (state?.toLowerCase()) {
            case 'active':
                return 'bg-success';
            case 'disabled':
                return 'bg-warning';
            case 'blocked':
                return 'bg-danger';
            case 'deleted':
                return 'bg-secondary';
            default:
                return 'bg-secondary';
        }
    }

    render() {
        const { html } = window;
        const { loading, devices, error, manifestError } = this.state;

        return html`
            ${manifestError ? html`<div class="alert alert-danger mt-2">${manifestError}</div>` : null}
            <!-- Installer Download Tiles -->
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3 class="mb-0">Client Installers</h3>
                                <button 
                                    class="btn btn-sm btn-outline-primary ${this.state.refreshingManifest ? 'disabled' : ''}" 
                                    onclick=${() => this.reloadPageData()}
                                    disabled=${this.state.refreshingManifest}>
                                    ${this.state.refreshingManifest ? 
                                        window.html`<span class="spinner-border spinner-border-sm me-2"></span>Reloading...` : 
                                        window.html`<svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                            <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
                                            <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
                                        </svg>
                                        Reload`
                                    }
                                </button>
                            </div>
                            <div class="row row-cards mb-3">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body">
                                            <div class="row align-items-center">
                                                <div class="col-auto">
                                                    <span class="avatar avatar-lg bg-primary-lt">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <rect x="4" y="4" width="6" height="6" rx="1" />
                                                            <rect x="14" y="4" width="6" height="6" rx="1" />
                                                            <rect x="4" y="14" width="6" height="6" rx="1" />
                                                            <rect x="14" y="14" width="6" height="6" rx="1" />
                                                        </svg>
                                                    </span>
                                                </div>
                                                <div class="col">
                                                    <h3 class="card-title mb-1">${this.state.installers.X64.DISPLAY_NAME}</h3>
                                                    <div class="text-muted small">${this.state.installers.X64.DESCRIPTION}</div>
                                                    <div class="mt-2">
                                                        <span class="badge bg-blue-lt me-2">v${this.state.installers.X64.VERSION}</span>
                                                        <span class="badge bg-secondary-lt">${this.state.installers.X64.FILE_SIZE_MB} MB</span>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <button class="btn btn-primary" onclick=${() => this.openDownloadModal('x64')}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                                                            <polyline points="7 11 12 16 17 11" />
                                                            <line x1="12" y1="4" x2="12" y2="16" />
                                                        </svg>
                                                        Download
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-body">
                                            <div class="row align-items-center">
                                                <div class="col-auto">
                                                    <span class="avatar avatar-lg bg-cyan-lt">
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <rect x="4" y="4" width="6" height="6" rx="1" />
                                                            <rect x="14" y="4" width="6" height="6" rx="1" />
                                                            <rect x="4" y="14" width="6" height="6" rx="1" />
                                                            <rect x="14" y="14" width="6" height="6" rx="1" />
                                                        </svg>
                                                    </span>
                                                </div>
                                                <div class="col">
                                                    <h3 class="card-title mb-1">${this.state.installers.ARM64.DISPLAY_NAME}</h3>
                                                    <div class="text-muted small">${this.state.installers.ARM64.DESCRIPTION}</div>
                                                    <div class="mt-2">
                                                        <span class="badge bg-blue-lt me-2">v${this.state.installers.ARM64.VERSION}</span>
                                                        <span class="badge bg-secondary-lt">${this.state.installers.ARM64.FILE_SIZE_MB} MB</span>
                                                    </div>
                                                </div>
                                                <div class="col-auto">
                                                    <button class="btn btn-primary" onclick=${() => this.openDownloadModal('arm64')}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                                                            <polyline points="7 11 12 16 17 11" />
                                                            <line x1="12" y1="4" x2="12" y2="16" />
                                                        </svg>
                                                        Download
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Devices List -->
                            ${loading ? html`
                                <div class="card">
                                    <div class="card-body">
                                        <div class="text-center py-5">
                                            <div class="spinner-border text-primary" role="status"></div>
                                            <div class="mt-3 text-muted">Loading devices...</div>
                                        </div>
                                    </div>
                                </div>
                            ` : error ? html`
                                <div class="card">
                                    <div class="empty">
                                        <div class="empty-icon">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg text-danger" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                        </div>
                                        <p class="empty-title">Error loading devices</p>
                                        <p class="empty-subtitle text-muted">${error}</p>
                                        <div class="empty-action">
                                            <button onclick=${() => this.loadDevices()} class="btn btn-primary">
                                                Try Again
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ` : devices.length === 0 ? html`
                                <div class="card">
                                    <div class="empty">
                                        <div class="empty-icon">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-lg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                                        </div>
                                        <p class="empty-title">No devices found</p>
                                        <p class="empty-subtitle text-muted">
                                            Get started by adding your first device to begin monitoring
                                        </p>
                                        <div class="empty-action">
                                            <button class="btn btn-primary">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                                Add Device
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ` : html`
                                <div class="card">
                                    <div class="table-responsive">
                                        <table class="table table-vcenter card-table">
                                            <thead>
                                                <tr>
                                                    <th>Device</th>
                                                    <th>License Status</th>
                                                    <th>Connection Status</th>
                                                    <th class="w-1"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${devices.map(device => html`
                                                    <tr>
                                                        <td>
                                                            <div class="d-flex py-1 align-items-center">
                                                                <span class="avatar me-2">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>
                                                                </span>
                                                                <div class="flex-fill">
                                                                    <div class="font-weight-medium">${device.name}</div>
                                                                    <div class="text-muted small">${device.id}</div>
                                                                    ${device.clientVersion ? html`
                                                                        <div class="text-muted small">Version: ${device.clientVersion}</div>
                                                                    ` : ''}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span class="badge ${this.getStateBadgeClass(device.state)} text-white">
                                                                ${device.state}
                                                            </span>
                                                            ${device.clientVersion && this.isVersionOutdated(device.clientVersion) ? html`
                                                                <span class="badge bg-warning-lt ms-1" title="Update available: v${config.INSTALLERS.ENGINE.VERSION}">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                                        <circle cx="12" cy="12" r="9" />
                                                                        <line x1="12" y1="8" x2="12" y2="12" />
                                                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                                                    </svg>
                                                                    Update Available
                                                                </span>
                                                            ` : ''}
                                                        </td>
                                                        <td>
                                                            <div class="text-muted">${this.formatLastSeen(device.lastHeartbeat)}</div>
                                                            ${device.firstHeartbeat ? html`
                                                                <div class="text-muted small">First seen: ${this.formatLastSeen(device.firstHeartbeat)}</div>
                                                            ` : ''}
                                                            ${this.isDeviceInactive(device) ? html`
                                                                <span class="badge bg-danger-lt mt-1">Offline</span>
                                                            ` : html`
                                                                <span class="badge bg-success-lt mt-1">Online</span>
                                                            `}
                                                        </td>
                                                        <td>
                                                            <div class="dropdown">
                                                                <button class="btn btn-sm btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
                                                                    Actions
                                                                </button>
                                                                <div class="dropdown-menu dropdown-menu-end">
                                                                    <a class="dropdown-item" href="#">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 7h-3a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-3" /><path d="M9 15h3l8.5 -8.5a1.5 1.5 0 0 0 -3 -3l-8.5 8.5v3" /><line x1="16" y1="5" x2="19" y2="8" /></svg>
                                                                        View Details
                                                                    </a>
                                                                    <div class="dropdown-divider"></div>
                                                                    <a class="dropdown-item text-danger" href="#">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon dropdown-item-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="4" y1="7" x2="20" y2="7" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>
                                                                        Delete Device
                                                                    </a>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                `)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            `}

                <!-- Download Warning Modal -->
                ${this.state.showDownloadModal && this.state.downloadTarget ? window.html`
                    <div class="modal modal-blur fade show" style="display: block; z-index: 1055;" tabindex="-1">
                        <div class="modal-dialog modal-dialog-centered" role="document">
                            <div class="modal-content" style="z-index: 1056;">
                                <div class="modal-header">
                                    <h5 class="modal-title">Download ${this.state.downloadTarget.name}</h5>
                                    <button type="button" class="btn-close" onclick=${(e) => { e.preventDefault(); this.closeDownloadModal(); }}></button>
                                </div>
                                <div class="modal-body">
                                    <div class="alert alert-warning mb-3">
                                        <div class="d-flex">
                                            <div>
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                                    <path d="M12 9v2m0 4v.01" />
                                                    <path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h4 class="alert-title">Security Notice</h4>
                                                <div class="text-muted">${this.state.downloadTarget.warning}</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <strong>File:</strong> ${this.state.downloadTarget.name}<br/>
                                        <strong>Size:</strong> ${this.state.downloadTarget.size} MB<br/>
                                        <strong>Architecture:</strong> ${this.state.downloadTarget.arch}
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-link link-secondary" onclick=${(e) => { e.preventDefault(); this.closeDownloadModal(); }}>
                                        Cancel
                                    </button>
                                    <button type="button" class="btn btn-primary" onclick=${(e) => { e.preventDefault(); this.confirmDownload(); }}>
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                                            <polyline points="7 11 12 16 17 11" />
                                            <line x1="12" y1="4" x2="12" y2="16" />
                                        </svg>
                                        Continue Download
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-backdrop fade show" style="z-index: 1054;"></div>
                ` : ''}
        `;
    }
}
