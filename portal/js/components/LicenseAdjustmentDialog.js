/**
 * License Adjustment Dialog Component
 * Site Admin only - Adjust seats and credits for a license
 */

const { html } = window;
const { useState, useEffect } = window.preactHooks;

export function LicenseAdjustmentDialog({ 
    license, 
    onClose, 
    onSuccess,
    api,
    showToast 
}) {
    const [seats, setSeats] = useState(license?.seats || 0);
    const [days, setDays] = useState(0);
    const [totalCredits, setTotalCredits] = useState(license?.totalCredits || 0);
    const [reason, setReason] = useState('');
    const [forceAdjust, setForceAdjust] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Initialize values
    useEffect(() => {
        if (license) {
            setSeats(license.seats || 0);
            setTotalCredits(license.totalCredits || 0);
            // Calculate initial days
            const initialDays = license.seats > 0 ? Math.floor(license.totalCredits / license.seats) : 0;
            setDays(initialDays);
        }
    }, [license]);

    // Auto-calculate days when seats change
    const handleSeatsChange = (newSeats) => {
        setSeats(newSeats);
        if (newSeats > 0) {
            const newDays = Math.floor(totalCredits / newSeats);
            setDays(newDays);
        }
    };

    // Auto-calculate credits when days change
    const handleDaysChange = (newDays) => {
        setDays(newDays);
        const newCredits = seats * newDays;
        setTotalCredits(newCredits);
    };

    // Check if reduction
    const isReduction = seats < (license?.seats || 0) || totalCredits < (license?.totalCredits || 0);

    const handleSubmit = async () => {
        if (seats <= 0) {
            showToast('Seats must be greater than 0', 'error');
            return;
        }

        if (totalCredits <= 0) {
            showToast('Total credits must be greater than 0', 'error');
            return;
        }

        if (!reason.trim()) {
            showToast('Reason is required for audit trail', 'error');
            return;
        }

        if (isReduction && !forceAdjust) {
            showToast('Check "Allow reduction" to decrease seats or credits', 'warning');
            return;
        }

        if (!showConfirm) {
            setShowConfirm(true);
            return;
        }

        setLoading(true);

        try {
            const res = await api.adjustLicense(license.licenseId || license.rowKey, {
                seats,
                totalCredits,
                forceAdjust,
                reason: reason.trim()
            });

            if (res.success) {
                showToast('License adjusted successfully', 'success');
                onSuccess();
                onClose();
            } else {
                showToast(res.message || res.error || 'Failed to adjust license', 'error');
            }
        } catch (error) {
            console.error('License adjustment error:', error);
            showToast('Failed to adjust license', 'error');
        } finally {
            setLoading(false);
            setShowConfirm(false);
        }
    };

    return html`
        <div class="modal modal-blur fade show" style="display: block;" tabIndex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Adjust License</h5>
                        <button type="button" class="btn-close" onClick=${onClose}></button>
                    </div>
                    <div class="modal-body">
                        ${!showConfirm ? html`
                            <div class="mb-3">
                                <div class="alert alert-info">
                                    <i class="ti ti-info-circle me-2"></i>
                                    <strong>Current values:</strong> ${license?.seats || 0} seats, ${license?.totalCredits || 0} credits (${license?.seats > 0 ? Math.floor(license.totalCredits / license.seats) : 0} days)
                                </div>
                            </div>

                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label">Seats</label>
                                    <input 
                                        type="number" 
                                        class="form-control"
                                        value=${seats}
                                        min="1"
                                        onInput=${(e) => handleSeatsChange(Number(e.target.value))}
                                        disabled=${loading}
                                    />
                                    <small class="form-hint">Number of concurrent devices</small>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Days</label>
                                    <input 
                                        type="number" 
                                        class="form-control"
                                        value=${days}
                                        min="1"
                                        onInput=${(e) => handleDaysChange(Number(e.target.value))}
                                        disabled=${loading}
                                    />
                                    <small class="form-hint">Duration in days (auto-calculates credits)</small>
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Total Credits</label>
                                <input 
                                    type="number" 
                                    class="form-control"
                                    value=${totalCredits}
                                    readonly
                                />
                                <small class="form-hint">Calculated: ${seats} seats × ${days} days = ${totalCredits} credits</small>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Reason <span class="text-danger">*</span></label>
                                <textarea 
                                    class="form-control"
                                    rows="2"
                                    placeholder="Enter reason for adjustment (required for audit trail)"
                                    value=${reason}
                                    onInput=${(e) => setReason(e.target.value)}
                                    disabled=${loading}
                                ></textarea>
                            </div>

                            ${isReduction && html`
                                <div class="mb-3">
                                    <label class="form-check">
                                        <input 
                                            type="checkbox" 
                                            class="form-check-input"
                                            checked=${forceAdjust}
                                            onChange=${(e) => setForceAdjust(e.target.checked)}
                                            disabled=${loading}
                                        />
                                        <span class="form-check-label">
                                            <strong>Allow reduction</strong> - I understand this will reduce seats or credits
                                        </span>
                                    </label>
                                </div>
                            `}

                            <div class="mb-0">
                                <div class="alert alert-warning">
                                    <h4 class="alert-title"><i class="ti ti-alert-triangle me-2"></i>Review Changes</h4>
                                    <ul class="mb-0">
                                        <li>Seats: <strong>${license?.seats || 0}</strong> → <strong>${seats}</strong> ${seats > (license?.seats || 0) ? '(+' + (seats - (license?.seats || 0)) + ')' : seats < (license?.seats || 0) ? '(' + (seats - (license?.seats || 0)) + ')' : '(no change)'}</li>
                                        <li>Credits: <strong>${license?.totalCredits || 0}</strong> → <strong>${totalCredits}</strong> ${totalCredits > (license?.totalCredits || 0) ? '(+' + (totalCredits - (license?.totalCredits || 0)) + ')' : totalCredits < (license?.totalCredits || 0) ? '(' + (totalCredits - (license?.totalCredits || 0)) + ')' : '(no change)'}</li>
                                        <li>Days: <strong>${license?.seats > 0 ? Math.floor(license.totalCredits / license.seats) : 0}</strong> → <strong>${days}</strong></li>
                                    </ul>
                                </div>
                            </div>
                        ` : html`
                            <div class="alert alert-danger">
                                <h4 class="alert-title"><i class="ti ti-alert-triangle me-2"></i>Confirm Adjustment</h4>
                                <p>Are you sure you want to adjust this license?</p>
                                <ul>
                                    <li>Seats: <strong>${license?.seats || 0}</strong> → <strong>${seats}</strong></li>
                                    <li>Total Credits: <strong>${license?.totalCredits || 0}</strong> → <strong>${totalCredits}</strong></li>
                                    <li>Reason: <strong>${reason}</strong></li>
                                </ul>
                                <p class="mb-0"><strong>This action will be logged in the audit trail.</strong></p>
                            </div>
                        `}
                    </div>
                    <div class="modal-footer">
                        ${!showConfirm ? html`
                            <button type="button" class="btn btn-secondary" onClick=${onClose} disabled=${loading}>
                                Cancel
                            </button>
                            <button 
                                type="button" 
                                class="btn btn-primary"
                                onClick=${handleSubmit}
                                disabled=${loading || seats <= 0 || totalCredits <= 0 || !reason.trim() || (isReduction && !forceAdjust)}
                            >
                                ${loading ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : ''}
                                Review & Confirm
                            </button>
                        ` : html`
                            <button 
                                type="button" 
                                class="btn btn-secondary" 
                                onClick=${() => setShowConfirm(false)}
                                disabled=${loading}
                            >
                                Back
                            </button>
                            <button 
                                type="button" 
                                class="btn btn-danger"
                                onClick=${handleSubmit}
                                disabled=${loading}
                            >
                                ${loading ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : ''}
                                Confirm Adjustment
                            </button>
                        `}
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-backdrop fade show"></div>
    `;
}
