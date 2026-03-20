import { AddOnPage } from './AddOnPage.js';

const { html } = window;

const STREAK_BADGES = [
    { label: 'First Step',       weeksNeeded: 1,  icon: 'ti-shield',   color: 'success', desc: '1 week active'   },
    { label: 'Consistent',       weeksNeeded: 4,  icon: 'ti-award',    color: 'info',    desc: '4-week run'      },
    { label: 'Committed',        weeksNeeded: 12, icon: 'ti-trophy',   color: 'warning', desc: '3-month streak'  },
    { label: 'Champion',         weeksNeeded: 26, icon: 'ti-star',     color: 'danger',  desc: '6-month streak'  },
];

function renderHygieneCoach(data) {
    const homeworkItems = Array.isArray(data.homeworkItems) ? data.homeworkItems : [];
    const projectedScoreGain = homeworkItems.reduce((sum, item) => sum + Number(item.impactScore || 0), 0).toFixed(1);
    const currentStreak = data.currentStreak ?? 0;

    return html`
        <div class="row g-3 mb-4">
            <div class="col-md-8">
                <div class="card h-100">
                    <div class="card-header">
                        <div class="card-title">This Week's Focus</div>
                        ${data.weekStarting ? html`
                            <div class="card-options text-muted small">
                                Week of ${new Date(data.weekStarting).toLocaleDateString()}
                            </div>
                        ` : null}
                    </div>
                    <div class="card-body">
                        <p class="text-muted mb-2">${data.coachMessage || 'Your AI coach will post fresh weekly homework after the next snapshot run.'}</p>
                        <div class="text-muted small">Trend: <span class="fw-medium text-body">${data.hygieneScoreTrend || 'Stable'}</span></div>
                    </div>
                </div>
            </div>
            <div class="col-md-2">
                <div class="card text-center h-100">
                    <div class="card-body d-flex flex-column justify-content-center">
                        <div class="subheader">Projected Gain</div>
                        <div class="h1 mb-0 text-success">+${projectedScoreGain}</div>
                        <div class="text-muted small">if all actions completed</div>
                    </div>
                </div>
            </div>
            <div class="col-md-2">
                <div class="card text-center h-100">
                    <div class="card-body d-flex flex-column justify-content-center">
                        <div class="subheader">Current Streak</div>
                        <div class="h1 mb-0">${currentStreak}</div>
                        <div class="text-muted small">${data.streakMilestoneReached ? '🎉 Milestone!' : 'weeks active'}</div>
                    </div>
                </div>
            </div>
        </div>

        ${homeworkItems.length > 0 ? html`
            <div class="card mb-3">
                <div class="card-header"><div class="card-title">Recommended Actions</div></div>
                <div class="list-group list-group-flush">
                    ${homeworkItems.map((action, i) => html`
                        <div class="list-group-item d-flex align-items-start">
                            <span class="badge bg-primary text-white me-3 mt-1">${i + 1}</span>
                            <div>
                                <div class="fw-medium">${action.actionTitle || 'Priority action'}</div>
                                <div class="text-muted small">${action.guidanceText || 'Recommended by your weekly hygiene plan.'}</div>
                                <div class="text-muted small mt-1">
                                    Impact +${Number(action.impactScore || 0).toFixed(1)} · ${action.estimatedDaysToComplete ?? 0} day${action.estimatedDaysToComplete === 1 ? '' : 's'} · ${action.actionCategory || 'General'}
                                </div>
                            </div>
                            ${action.priority === 1 ? html`<span class="badge bg-danger text-white ms-auto">Priority</span>` : null}
                        </div>
                    `)}
                </div>
            </div>
        ` : null}

        <!-- Streak achievement badges -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">Achievement Badges</div>
                ${data.streakMilestoneReached ? html`
                    <div class="card-options">
                        <span class="badge bg-warning text-white">
                            <i class="ti ti-sparkles me-1"></i> Milestone reached this week!
                        </span>
                    </div>
                ` : null}
            </div>
            <div class="card-body">
                <div class="row g-3 text-center">
                    ${STREAK_BADGES.map(badge => {
                        const earned = currentStreak >= badge.weeksNeeded;
                        return html`
                            <div class="col-md-3 col-6">
                                <div class="${earned ? '' : 'opacity-50'}">
                                    <span class="avatar avatar-lg bg-${earned ? badge.color : 'secondary'}-lt text-${earned ? badge.color : 'secondary'} rounded-circle mb-2"
                                          style="font-size:1.5rem">
                                        <i class="ti ${badge.icon}"></i>
                                    </span>
                                    <div class="fw-medium small">${badge.label}</div>
                                    <div class="text-muted" style="font-size:0.75rem">${badge.desc}</div>
                                    ${earned
                                        ? html`<span class="badge bg-${badge.color} text-white mt-1">Earned</span>`
                                        : html`<span class="badge bg-secondary-lt text-secondary mt-1">${badge.weeksNeeded} wks needed</span>`}
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </div>
        </div>
    `;
}

export function HygieneCoachPage() {
    const isEnabled = window.orgContext?.hasHygieneCoach?.() ?? false;
    return html`<${AddOnPage}
        addOnKey="HygieneCoach"
        title="Hygiene Coach"
        endpoint="/api/v1/orgs/{orgId}/add-ons/hygiene-coach"
        responseDataKey="hygieneCoach"
        isEnabled=${isEnabled}
        upgradeDesc="Get weekly AI-generated security hygiene plans personalized to your org's risk profile. Available on BusinessUltimate."
        upgradeIcon="ti-heart-rate-monitor"
        renderContent=${renderHygieneCoach}
    />`;
}
