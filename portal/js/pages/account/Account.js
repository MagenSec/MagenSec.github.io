// Account page — User profile, contact info, default org, and WhatsApp settings
const { html, Component } = window;

// Phone number persisted in localStorage as a cache for the "add phone" toast skip logic
const PHONE_CACHE_KEY = (email) => `magensec_phone_${String(email || '').trim().toLowerCase()}`;

class AccountPage extends Component {
    constructor() {
        super();
        this.state = {
            // Loading / error
            loading: true,
            loadError: null,
            billingLoading: false,
            // Profile data (from API)
            user: null,
            orgs: [],
            billingNotice: null,
            billingPayments: [],
            billingError: null,
            // Editable fields
            name: '',
            phone: '',
            whatsAppEnabled: false,
            defaultOrgId: '',
            // Save state
            saving: false,
            saved: false,
            saveError: ''
        };
    }

    async componentDidMount() {
        try {
            const response = await api.get('/api/v1/users/me');
            if (!response.success || !response.data) {
                this.setState({ loading: false, loadError: response.message || 'Failed to load profile.' });
                return;
            }
            const { user, orgs } = response.data;
            const profilePhone = (user.phoneNumber || '').trim();
            if (profilePhone && user.email) {
                localStorage.setItem(PHONE_CACHE_KEY(user.email), profilePhone);
            }
            this.setState({
                loading: false,
                user,
                orgs: orgs || [],
                name: user.displayName || user.name || '',
                phone: user.phoneNumber || '',
                whatsAppEnabled: user.whatsAppEnabled || false,
                defaultOrgId: user.defaultOrgId || (orgs && orgs.length > 0 ? orgs[0].orgId : '')
            });
            this.loadBillingNotice();
        } catch (err) {
            console.error('[Account] Load failed:', err);
            this.setState({ loading: false, loadError: 'Could not connect to server.' });
        }
    }

    async loadBillingNotice() {
        try {
            this.setState({ billingLoading: true, billingError: null });
            const currentOrg = orgContext.getCurrentOrg?.();
            const currentOrgId = currentOrg?.orgId || this.state.defaultOrgId || null;
            if (!currentOrgId) {
                this.setState({ billingLoading: false, billingError: 'No organization selected.' });
                return;
            }

            const paymentsResponse = await api.get(`/api/v1/orgs/${currentOrgId}/payments`);
            if (paymentsResponse?.success === false) {
                this.setState({ billingLoading: false, billingError: paymentsResponse?.message || 'Billing details unavailable.' });
                return;
            }

            const payments = Array.isArray(paymentsResponse?.data)
                ? [...paymentsResponse.data]
                : [];

            payments.sort((a, b) => {
                const left = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
                const right = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
                return right - left;
            });

            const pendingRenewal = payments.find(p =>
                String(p?.paymentType || '').toLowerCase() === 'renewal' &&
                String(p?.status || '').toLowerCase() === 'pending');

            const remainingCredits = Number(currentOrg?.remainingCredits ?? 0);
            const totalSeats = Number(currentOrg?.totalSeats ?? 0);
            const daysRemaining = remainingCredits > 0 && totalSeats > 0
                ? Math.floor(remainingCredits / totalSeats)
                : null;

            const shouldShowNotice = !!pendingRenewal || remainingCredits <= 0;
            const billingNotice = shouldShowNotice ? {
                visible: true,
                severity: remainingCredits <= 0 ? 'critical' : 'warning',
                title: remainingCredits <= 0 ? 'License expired - renewal pending' : 'License renewal pending',
                message: 'Renewal invoice is generated and emailed. Complete payment to restore or retain full access.',
                invoiceId: pendingRenewal?.invoiceId || null,
                paymentRequestId: pendingRenewal?.paymentRequestId || null,
                daysRemaining
            } : null;

            this.setState({
                billingLoading: false,
                billingNotice,
                billingPayments: payments,
                billingError: null
            });
        } catch (err) {
            console.error('[Account] Billing notice load failed:', err);
            this.setState({ billingLoading: false, billingError: 'Could not load billing details.' });
        }
    }

    async saveProfile() {
        const { user, name, phone, whatsAppEnabled, defaultOrgId } = this.state;
        if (!user) return;

        const trimmedPhone = phone.trim();
        const trimmedName  = name.trim();

        // E.164 validation if phone provided
        if (trimmedPhone && !/^\+[1-9]\d{7,14}$/.test(trimmedPhone)) {
            this.setState({ saveError: 'Phone number must be in E.164 format (e.g. +12125551234).' });
            return;
        }
        if (!trimmedName) {
            this.setState({ saveError: 'Name cannot be empty.' });
            return;
        }

        this.setState({ saving: true, saveError: '', saved: false });
        try {
            const response = await api.put('/api/v1/users/me/profile', {
                name: trimmedName,
                phoneNumber: trimmedPhone || null,
                whatsAppEnabled: whatsAppEnabled && !!trimmedPhone,
                defaultOrgId: defaultOrgId || null
            });

            if (!response.success) {
                this.setState({ saving: false, saveError: response.message || 'Save failed.' });
                return;
            }

            // Update localStorage phone cache so the "add phone" toast doesn't re-appear
            if (trimmedPhone) {
                localStorage.setItem(PHONE_CACHE_KEY(user.email), trimmedPhone);
                sessionStorage.setItem('phone_toast_shown', '1');
            } else {
                localStorage.removeItem(PHONE_CACHE_KEY(user.email));
            }

            // Update orgContext's localStorage key so it picks up the new default on next load
            if (defaultOrgId) {
                localStorage.setItem('selectedOrgId', defaultOrgId);
            }

            this.setState({ saving: false, saved: true, whatsAppEnabled: whatsAppEnabled && !!trimmedPhone });
            setTimeout(() => this.setState({ saved: false }), 3000);
            window.toast?.success('Profile updated successfully.');
        } catch (err) {
            console.error('[Account] Save failed:', err);
            this.setState({ saving: false, saveError: 'Could not save. Please try again.' });
        }
    }

    render() {
        const { loading, loadError, user, orgs, name, phone, whatsAppEnabled, defaultOrgId,
            saving, saved, saveError, billingLoading, billingNotice, billingPayments, billingError } = this.state;

        if (loading) {
            return html`
                <div class="container-xl">
                    <div class="card"><div class="card-body text-center py-5">
                        <div class="spinner-border text-primary" role="status"></div>
                        <p class="text-muted mt-3">Loading profile…</p>
                    </div></div>
                </div>`;
        }

        if (loadError || !user) {
            return html`
                <div class="container-xl">
                    <div class="alert alert-danger">${loadError || 'Not logged in.'}</div>
                </div>`;
        }

        const currentRole = orgContext.currentOrg?.role;
        const roleLabel   = currentRole || user.userType || 'EndUser';
        const roleDisplay = roleLabel === 'ReadWrite' ? 'Co-Admin'
                  : roleLabel === 'ReadOnly'  ? 'Auditor'
                  : roleLabel;
        const roleBadge   = roleLabel === 'SiteAdmin'  ? 'bg-danger text-white'
                          : roleLabel === 'Owner'       ? 'bg-primary text-white'
                          : roleLabel === 'ReadWrite'   ? 'bg-azure text-white'
                          : 'bg-blue-lt text-blue';

        const allOrgOptions = orgs;

        return html`
            <div class="container-xl">
                <div class="page-header d-print-none mb-3">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="page-title">Account</h2>
                            <div class="text-muted mt-1">Manage your profile, notifications, and default organization</div>
                        </div>
                    </div>
                </div>

                <div class="row row-cards">

                    <!-- Left column: Profile + Editable form -->
                    <div class="col-md-6">

                        <!-- Profile overview (read-only) -->
                        <div class="card mb-3">
                            <div class="card-header">
                                <h3 class="card-title">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2 text-muted" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                        <circle cx="12" cy="7" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
                                    </svg>
                                    Profile
                                </h3>
                            </div>
                            <div class="card-body p-0">
                                <table class="table table-borderless table-vcenter mb-0">
                                    <tbody>
                                        <tr>
                                            <td class="text-muted w-40">Email</td>
                                            <td>${user.email || '—'}</td>
                                        </tr>
                                        <tr>
                                            <td class="text-muted">Role</td>
                                            <td><span class="badge ${roleBadge}">${roleDisplay}</span></td>
                                        </tr>
                                        <tr>
                                            <td class="text-muted">Org ID</td>
                                            <td><code class="text-muted small">${user.orgId || orgContext.currentOrg?.orgId || '—'}</code></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Editable profile fields -->
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2 text-muted" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                        <path d="M4 20h4l10.5-10.5a1.5 1.5 0 0 0-4-4L4 16v4"/>
                                        <line x1="13.5" y1="6.5" x2="17.5" y2="10.5"/>
                                    </svg>
                                    Edit Profile
                                </h3>
                            </div>
                            <div class="card-body">

                                <!-- Name -->
                                <div class="mb-3">
                                    <label class="form-label" for="account-name">Display name</label>
                                    <input
                                        id="account-name"
                                        type="text"
                                        class="form-control"
                                        placeholder="Your full name"
                                        value="${name}"
                                        onInput=${(e) => this.setState({ name: e.target.value, saved: false, saveError: '' })}
                                    />
                                </div>

                                <!-- Phone -->
                                <div class="mb-3">
                                    <label class="form-label" for="account-phone">
                                        Phone number
                                        <span class="text-muted small fw-normal ms-1">(E.164, e.g. +12125551234)</span>
                                    </label>
                                    <input
                                        id="account-phone"
                                        type="tel"
                                        class="form-control"
                                        placeholder="+91 98765 43210"
                                        value="${phone}"
                                        onInput=${(e) => this.setState({ phone: e.target.value, saved: false, saveError: '' })}
                                        onKeyDown=${(e) => e.key === 'Enter' && this.saveProfile()}
                                    />
                                </div>

                                <!-- WhatsApp toggle -->
                                <div class="mb-3">
                                    <label class="form-check form-switch">
                                        <input
                                            class="form-check-input"
                                            type="checkbox"
                                            checked=${whatsAppEnabled}
                                            onChange=${(e) => this.setState({ whatsAppEnabled: e.target.checked, saved: false })}
                                            disabled=${!phone.trim()}
                                        />
                                        <span class="form-check-label">
                                            Enable WhatsApp notifications &amp; AI access
                                        </span>
                                    </label>
                                    <div class="text-muted small mt-1">
                                        Allows Officer MAGI to message you on WhatsApp and auto-authenticate
                                        using your registered number. Requires a Business organization.
                                    </div>
                                </div>

                                <!-- Default org -->
                                <div class="mb-3">
                                    <label class="form-label" for="account-default-org">Default organization</label>
                                    <select
                                        id="account-default-org"
                                        class="form-select"
                                        onChange=${(e) => this.setState({ defaultOrgId: e.target.value, saved: false })}
                                    >
                                        ${allOrgOptions.length === 0
                                            ? html`<option value="">No organizations available</option>`
                                            : allOrgOptions.map(o => html`
                                                <option value="${o.orgId}" selected=${o.orgId === defaultOrgId}>
                                                    ${o.name || o.orgId}${o.type === 'Personal' ? ' (Personal)' : ''}
                                                </option>`)}
                                    </select>
                                    <div class="text-muted small mt-1">
                                        The organization loaded by default when you sign in.
                                    </div>
                                </div>

                                ${saveError ? html`<div class="alert alert-danger py-2 mb-3">${saveError}</div>` : null}

                                <button
                                    class="btn ${saved ? 'btn-success' : 'btn-primary'} w-100"
                                    onclick=${() => this.saveProfile()}
                                    disabled=${saving}
                                >
                                    ${saving
                                        ? html`<span class="spinner-border spinner-border-sm me-1"></span>Saving…`
                                        : saved
                                            ? html`<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10-10"/></svg>Saved`
                                            : 'Save Changes'}
                                </button>

                            </div>
                        </div>
                    </div>

                    <!-- Right column: Organizations list -->
                    <div class="col-md-6">
                        <div class="card mb-3">
                            <div class="card-header">
                                <h3 class="card-title">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2 text-muted" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                        <rect x="3" y="7" width="18" height="13" rx="2"/>
                                        <path d="M16 3v4"/>
                                        <path d="M8 3v4"/>
                                        <path d="M3 11h18"/>
                                    </svg>
                                    Billing & Renewal
                                </h3>
                            </div>
                            <div class="card-body">
                                ${billingLoading ? html`
                                    <div class="d-flex align-items-center gap-2 text-muted">
                                        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                        <span>Loading billing details...</span>
                                    </div>
                                ` : html`
                                    ${billingNotice?.visible ? html`
                                    <div class="alert ${billingNotice.severity === 'critical' ? 'alert-danger' : billingNotice.severity === 'warning' ? 'alert-warning' : 'alert-info'} py-2 mb-3" role="alert">
                                        <div class="fw-semibold">${billingNotice.title || 'Renewal notice'}</div>
                                        <div class="small">${billingNotice.message || 'Renewal invoice is generated and emailed.'}</div>
                                    </div>

                                    <table class="table table-sm table-borderless mb-0">
                                        <tbody>
                                            <tr>
                                                <td class="text-muted w-40">Invoice ID</td>
                                                <td><code class="small" style="word-break: break-all; overflow-wrap: anywhere;">${billingNotice.invoiceId || 'Pending assignment'}</code></td>
                                            </tr>
                                            <tr>
                                                <td class="text-muted">Payment Request</td>
                                                <td><code class="small" style="word-break: break-all; overflow-wrap: anywhere;">${billingNotice.paymentRequestId || 'Pending'}</code></td>
                                            </tr>
                                            <tr>
                                                <td class="text-muted">Status</td>
                                                <td>${typeof billingNotice.daysRemaining === 'number' ? (billingNotice.daysRemaining <= 0 ? 'Expired' : `${billingNotice.daysRemaining} day(s) remaining`) : 'Pending renewal'}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    ` : null}

                                    ${billingPayments.length > 0 ? html`
                                        ${billingNotice?.visible ? html`<hr class="my-3" />` : null}
                                        <div class="fw-semibold mb-2">Generated Invoices</div>
                                        <div class="table-responsive d-none d-xl-block">
                                            <table class="table table-sm table-vcenter">
                                                <thead>
                                                    <tr>
                                                        <th>Invoice</th>
                                                        <th>Status</th>
                                                        <th>Amount</th>
                                                        <th>Created</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${billingPayments.slice(0, 8).map(p => html`
                                                        <tr>
                                                            <td>
                                                                <div class="fw-semibold"><code class="small" style="word-break: break-all; overflow-wrap: anywhere;">${p.invoiceId || 'Pending'}</code></div>
                                                                <div class="text-muted small"><code class="small" style="word-break: break-all; overflow-wrap: anywhere;">${p.paymentRequestId || '-'}</code></div>
                                                            </td>
                                                            <td>
                                                                <span class=${`badge ${String(p.status || '').toLowerCase() === 'succeeded' ? 'bg-success text-white' : String(p.status || '').toLowerCase() === 'pending' ? 'bg-warning text-white' : 'bg-secondary text-white'}`}>
                                                                    ${p.status || 'Unknown'}
                                                                </span>
                                                            </td>
                                                            <td>${typeof p.amount === 'number' ? `${p.currency || 'USD'} ${p.amount.toFixed(2)}` : '-'}</td>
                                                            <td>${p.createdAt ? new Date(p.createdAt).toLocaleString() : '-'}</td>
                                                        </tr>
                                                    `)}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div class="d-xl-none">
                                            ${billingPayments.slice(0, 8).map(p => html`
                                                <div class="card mb-2">
                                                    <div class="card-body p-3">
                                                        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                                                            <div class="text-muted small">Invoice</div>
                                                            <span class=${`badge ${String(p.status || '').toLowerCase() === 'succeeded' ? 'bg-success text-white' : String(p.status || '').toLowerCase() === 'pending' ? 'bg-warning text-white' : 'bg-secondary text-white'}`}>
                                                                ${p.status || 'Unknown'}
                                                            </span>
                                                        </div>
                                                        <div class="mb-2">
                                                            <code class="small" style="word-break: break-all; overflow-wrap: anywhere;">${p.invoiceId || 'Pending'}</code>
                                                        </div>
                                                        <div class="text-muted small mb-1">Payment Request</div>
                                                        <div class="mb-2">
                                                            <code class="small" style="word-break: break-all; overflow-wrap: anywhere;">${p.paymentRequestId || '-'}</code>
                                                        </div>
                                                        <div class="d-flex justify-content-between small mt-2">
                                                            <span class="text-muted">Amount</span>
                                                            <span>${typeof p.amount === 'number' ? `${p.currency || 'USD'} ${p.amount.toFixed(2)}` : '-'}</span>
                                                        </div>
                                                        <div class="d-flex justify-content-between small mt-1">
                                                            <span class="text-muted">Created</span>
                                                            <span>${p.createdAt ? new Date(p.createdAt).toLocaleString() : '-'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            `)}
                                        </div>
                                    ` : html`
                                        <div class="text-muted small">
                                            ${billingError || 'No generated invoices for the current organization.'}
                                        </div>
                                    `}
                                `}
                            </div>
                        </div>

                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2 text-muted" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                        <rect x="3" y="7" width="18" height="13" rx="2"/>
                                        <path d="M8 7v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                        <line x1="12" y1="12" x2="12" y2="12.01"/>
                                        <line x1="12" y1="16" x2="12" y2="16.01"/>
                                    </svg>
                                    Organizations
                                    <span class="badge bg-secondary ms-2">${orgs.length}</span>
                                </h3>
                            </div>
                            ${orgs.length === 0 ? html`
                                <div class="card-body">
                                    <div class="empty">
                                        <p class="empty-title">No organizations</p>
                                        <p class="empty-subtitle text-muted">You are not a member of any organization.</p>
                                    </div>
                                </div>
                            ` : html`
                                <div class="list-group list-group-flush">
                                    ${orgs.map(org => {
                                        const isCurrent = orgContext.currentOrg?.orgId === org.orgId;
                                        const isDefault = org.orgId === defaultOrgId;
                                        return html`
                                            <div class="list-group-item" key=${org.orgId}>
                                                <div class="row align-items-center">
                                                    <div class="col">
                                                        <div class="d-flex align-items-center gap-2 flex-wrap">
                                                            <strong>${org.name || org.orgId}</strong>
                                                            ${isCurrent ? html`<span class="badge bg-green text-white">Active</span>` : null}
                                                            ${isDefault ? html`<span class="badge bg-blue-lt text-blue">Default</span>` : null}
                                                            ${org.type === 'Personal' ? html`<span class="badge bg-secondary">Personal</span>` : null}
                                                        </div>
                                                        <div class="text-muted small mt-1">
                                                            ${org.orgId}${org.role ? html` · ${org.role}` : null}
                                                        </div>
                                                    </div>
                                                    <div class="col-auto d-flex gap-1">
                                                        ${!isDefault ? html`
                                                            <button
                                                                class="btn btn-sm btn-ghost-secondary"
                                                                title="Set as default"
                                                                onclick=${() => this.setState({ defaultOrgId: org.orgId, saved: false })}
                                                            >Default</button>
                                                        ` : null}
                                                        ${!isCurrent ? html`
                                                            <button
                                                                class="btn btn-sm btn-outline-primary"
                                                                onclick=${() => { orgContext.selectOrg?.(org.orgId); window.location.hash = '#!/dashboard'; }}
                                                            >Switch</button>
                                                        ` : null}
                                                    </div>
                                                </div>
                                            </div>`;
                                    })}
                                </div>
                            `}
                        </div>
                    </div>

                </div>
            </div>`;
    }
}

export { AccountPage };
