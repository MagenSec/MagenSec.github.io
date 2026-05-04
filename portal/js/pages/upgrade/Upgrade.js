/**
 * Upgrade page with tier-aware messaging based on org add-ons.
 */
const { html, Component } = window;

const PERSONAL_PLAN = {
    key: 'Personal',
    label: 'Personal',
    icon: 'ti-user',
    color: 'purple',
    description: 'Personal protection for individual users',
    addOns: ['Security', 'Vulnerability', 'SoftwareInventory', 'Assets'],
};

const EDUCATION_PLAN = {
    key: 'Education',
    label: 'Education',
    icon: 'ti-school',
    color: 'green',
    description: 'Education-focused protection and reporting',
    addOns: ['Security', 'Vulnerability', 'SoftwareInventory', 'Assets', 'ExecutiveReports'],
};

const PLANS = [
    {
        key: 'Business',
        label: 'Business Foundation',
        icon: 'ti-building',
        color: 'blue',
        addOns: ['Security', 'Vulnerability', 'SoftwareInventory', 'Assets', 'ExecutiveReports'],
    },
    {
        key: 'BusinessPlus',
        label: 'Business Premium',
        icon: 'ti-building-skyscraper',
        color: 'indigo',
        addOns: ['Security', 'Vulnerability', 'SoftwareInventory', 'Assets', 'ExecutiveReports', 'ThreatIntel', 'Compliance', 'Audit', 'LicenseManagement', 'MAGI'],
    },
    {
        key: 'BusinessUltimate',
        label: 'Business Ultimate',
        icon: 'ti-crown',
        color: 'yellow',
        addOns: ['Security', 'Vulnerability', 'SoftwareInventory', 'Assets', 'ExecutiveReports', 'ThreatIntel', 'Compliance', 'Audit', 'LicenseManagement', 'MAGI', 'PeerBenchmark', 'HygieneCoach', 'Rewind', 'InsuranceReadiness', 'CompliancePlus', 'SupplyChainIntel', 'AttackChain'],
    },
];

const FEATURE_CATALOG = {
    Assets: { label: 'Asset Inventory', icon: 'ti-devices', accentColor: 'blue', headline: 'See your devices and endpoints clearly', description: 'Track managed assets across your environment.', planKey: 'Business' },
    ThreatIntel: { label: 'Threat Intelligence', icon: 'ti-shield-bolt', accentColor: 'orange', headline: 'Enrich your posture with live threat signals', description: 'Prioritize CVEs by live exploit activity and threat context.', planKey: 'BusinessPlus' },
    Compliance: { label: 'Framework Alignment', icon: 'ti-certificate', accentColor: 'blue', headline: 'Map controls to major frameworks', description: 'Track alignment across CIS, NIST, ISO and export audit evidence.', planKey: 'BusinessPlus' },
    Audit: { label: 'Auditor Dashboard', icon: 'ti-clipboard-check', accentColor: 'green', headline: 'Give auditors read-only evidence access', description: 'Built for faster, cleaner audits with scoped visibility.', planKey: 'BusinessPlus' },
    LicenseManagement: { label: 'Software License Management', icon: 'ti-license', accentColor: 'yellow', headline: 'Track license usage and drift', description: 'Detect entitlement mismatch and upcoming expirations.', planKey: 'BusinessPlus', comingSoon: true },
    MAGI: { label: 'Officer MAGI', icon: 'ti-message-chatbot', accentColor: 'purple', headline: 'AI security analyst for your team', description: 'Get mission briefings and guided remediation from your telemetry.', planKey: 'BusinessPlus' },
    PeerBenchmark: { label: 'Industry Benchmark', icon: 'ti-chart-dots-3', accentColor: 'orange', headline: 'See where you stand vs peers', description: 'Compare security outcomes with anonymized industry cohorts.', planKey: 'BusinessUltimate' },
    HygieneCoach: { label: 'Hygiene Coach', icon: 'ti-heart-rate-monitor', accentColor: 'teal', headline: 'Daily prioritized hygiene actions', description: 'Focus teams on the highest-impact fixes first.', planKey: 'BusinessUltimate' },
    Rewind: { label: 'Time Warp', icon: 'ti-clock-rewind', accentColor: 'violet', headline: 'Inspect historical security state', description: 'Replay posture and risk at past points in time.', planKey: 'BusinessUltimate' },
    InsuranceReadiness: { label: 'Insurance Attestation', icon: 'ti-shield-lock', accentColor: 'cyan', headline: 'Prepare for cyber insurance review', description: 'Generate underwriter-ready control and evidence dossiers.', planKey: 'BusinessUltimate' },
    CompliancePlus: { label: 'Compliance Plus', icon: 'ti-certificate-2', accentColor: 'indigo', headline: 'Advanced compliance operations', description: 'Custom frameworks, SLA workflows, and continuous monitoring.', planKey: 'BusinessUltimate' },
    SupplyChainIntel: { label: 'Supply Chain Risk', icon: 'ti-building-factory', accentColor: 'red', headline: 'Track third-party software exposure', description: 'Surface vendor and dependency risk before it becomes incident risk.', planKey: 'BusinessUltimate' },
    AttackChain: { label: 'Attack Paths', icon: 'ti-route', accentColor: 'red', headline: 'Model lateral attack movement', description: 'Visualize and break the most dangerous compromise paths.', planKey: 'BusinessUltimate' },
};

function getPackages(catalog, currentOrg = null) {
    const source = Array.isArray(catalog?.packages) && catalog.packages.length > 0 ? catalog.packages : PLANS;
    const palette = {
        Personal: { icon: 'ti-user', color: 'purple' },
        Education: { icon: 'ti-school', color: 'green' },
        Business: { icon: 'ti-building', color: 'blue' },
        BusinessPlus: { icon: 'ti-building-skyscraper', color: 'indigo' },
        BusinessUltimate: { icon: 'ti-crown', color: 'yellow' },
    };

    const packages = source.map((plan) => ({
        key: plan.key,
        label: plan.key === 'Business' ? 'Business Foundation' : (plan.label || plan.key),
        icon: palette[plan.key]?.icon || 'ti-building',
        color: palette[plan.key]?.color || 'blue',
        description: plan.description || '',
        addOns: Array.isArray(plan.includedAddOns) ? plan.includedAddOns : (Array.isArray(plan.addOns) ? plan.addOns : []),
    }));

    const orgType = String(currentOrg?.type || currentOrg?.orgType || currentOrg?.licenseType || '').toLowerCase();
    if (orgType === 'personal' && !packages.some((p) => p.key === 'Personal')) {
        packages.unshift({ ...PERSONAL_PLAN });
    }
    if (orgType === 'education' && !packages.some((p) => p.key === 'Education')) {
        packages.unshift({ ...EDUCATION_PLAN });
    }

    return packages;
}

function getCatalogFeature(catalog, key) {
    const addOns = Array.isArray(catalog?.addOns) ? catalog.addOns : [];
    return addOns.find((a) => a.key === key) || null;
}

function normalizeFeatureLabel(key, label) {
    const raw = String(label || key || '').trim();
    if (key === 'Assets' || /hardware inventory/i.test(raw)) return 'Asset Inventory';
    return raw;
}

function detectCurrentPlanKey(org, plans = PLANS) {
    const normalizePlanKey = (value) => {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return null;
        if (raw === 'personal' || raw === 'individual') return 'Personal';
        if (raw === 'education' || raw === 'schoollab' || raw === 'school lab') return 'Education';
        if (raw === 'business' || raw === 'startup' || raw === 'businessfoundation' || raw === 'business foundation') return 'Business';
        if (raw === 'growth' || raw === 'businessplus' || raw === 'businesspremium' || raw === 'business premium') return 'BusinessPlus';
        if (raw === 'scale' || raw === 'businessultimate' || raw === 'business ultimate') return 'BusinessUltimate';
        return null;
    };

    const explicitPlanKey = normalizePlanKey(org?.packageKey || org?.planKey || org?.licenseTier);
    if (explicitPlanKey && plans.some((p) => p.key === explicitPlanKey)) {
        return explicitPlanKey;
    }

    const orgType = String(org?.type || org?.orgType || org?.licenseType || '').toLowerCase();
    if (orgType === 'personal') return 'Personal';
    if (orgType === 'education') return 'Education';

    const addOns = Array.isArray(org?.addOns) ? org.addOns : [];
    const has = (key) => addOns.some((a) => String(a).toLowerCase() === String(key).toLowerCase());
    const ordered = ['Business', 'BusinessPlus', 'BusinessUltimate'];

    let resolved = 'Business';
    for (const key of ordered) {
        const plan = plans.find((p) => p.key === key);
        if (!plan) continue;
        const extraAddOns = (plan.addOns || []).filter((a) => !['Security', 'Vulnerability', 'SoftwareInventory', 'Assets', 'ExecutiveReports'].includes(a));
        if (extraAddOns.some(has)) resolved = key;
    }
    return resolved;
}

function planByKey(key, plans = PLANS) {
    return plans.find((p) => p.key === key) || plans[0] || null;
}

function planRank(key) {
    const order = ['Personal', 'Education', 'Business', 'BusinessPlus', 'BusinessUltimate'];
    return Math.max(0, order.indexOf(key));
}

class Upgrade extends Component {
    constructor(props) {
        super(props);
        this.state = {
            catalog: null,
            catalogLoaded: false,
            resolvedLicense: null,
            resolvedOrgId: null
        };
    }

    async componentDidMount() {
        this.orgChangedHandler = () => {
            this.loadResolvedLicense();
        };
        window.addEventListener('orgChanged', this.orgChangedHandler);

        try {
            const resp = window.api?.getLicenseCatalog
                ? await window.api.getLicenseCatalog()
                : await window.api.get('/api/v1/catalog/licenses');

            if (resp?.success && resp.data) {
                this.setState({ catalog: resp.data, catalogLoaded: true });
            } else {
                this.setState({ catalogLoaded: true });
            }
        } catch {
            this.setState({ catalogLoaded: true });
        }

        await this.loadResolvedLicense();
    }

    componentWillUnmount() {
        if (this.orgChangedHandler) {
            window.removeEventListener('orgChanged', this.orgChangedHandler);
        }
    }

    loadResolvedLicense = async () => {
        const currentOrg = window.orgContext?.getCurrentOrg?.();
        if (!currentOrg?.orgId || !window.api?.getLicenses) {
            this.setState({ resolvedLicense: null, resolvedOrgId: currentOrg?.orgId || null });
            return;
        }

        try {
            const resp = await window.api.getLicenses(currentOrg.orgId);
            const licenses = Array.isArray(resp?.data) ? resp.data : [];
            const active = licenses.find((lic) => lic.isActive && !lic.isDisabled) || licenses[0] || null;
            const resolvedLicense = active ? {
                packageKey: active.packageKey || null,
                licenseTier: active.licenseTier || null,
                licenseType: active.licenseType || null,
                addOns: Array.isArray(active.addOns) ? active.addOns : []
            } : null;

            if (resolvedLicense && window.orgContext?.currentOrg?.orgId === currentOrg.orgId) {
                const mergedOrg = {
                    ...window.orgContext.currentOrg,
                    licenseType: resolvedLicense.licenseType || window.orgContext.currentOrg.licenseType,
                    licenseTier: resolvedLicense.packageKey || resolvedLicense.licenseTier || window.orgContext.currentOrg.licenseTier,
                    packageKey: resolvedLicense.packageKey || window.orgContext.currentOrg.packageKey,
                    planKey: resolvedLicense.packageKey || resolvedLicense.licenseTier || window.orgContext.currentOrg.planKey,
                    addOns: resolvedLicense.addOns?.length ? resolvedLicense.addOns : window.orgContext.currentOrg.addOns
                };

                window.orgContext.currentOrg = mergedOrg;
                if (Array.isArray(window.orgContext.availableOrgs)) {
                    window.orgContext.availableOrgs = window.orgContext.availableOrgs.map((org) =>
                        org.orgId === currentOrg.orgId ? { ...org, ...mergedOrg } : org
                    );
                }
            }

            this.setState({
                resolvedLicense,
                resolvedOrgId: currentOrg.orgId
            });
        } catch {
            this.setState({ resolvedLicense: null, resolvedOrgId: currentOrg.orgId });
        }
    };

    goBack = (e) => {
        e.preventDefault();
        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        const page = window.page || window.Page;
        if (page) page.redirect('/dashboard');
    };

    render({ feature }) {
        const { catalog, catalogLoaded, resolvedLicense, resolvedOrgId } = this.state;
        const currentOrg = window.orgContext?.getCurrentOrg?.();

        if (currentOrg?.orgId && currentOrg.orgId !== resolvedOrgId && window.requestAnimationFrame) {
            window.requestAnimationFrame(() => this.loadResolvedLicense());
        }

        const effectiveOrg = currentOrg ? {
            ...currentOrg,
            licenseType: resolvedLicense?.licenseType || currentOrg.licenseType,
            licenseTier: resolvedLicense?.licenseTier || currentOrg.licenseTier,
            packageKey: resolvedLicense?.packageKey || currentOrg.packageKey,
            planKey: resolvedLicense?.packageKey || resolvedLicense?.licenseTier || currentOrg.planKey || currentOrg.packageKey,
            addOns: Array.isArray(resolvedLicense?.addOns) && resolvedLicense.addOns.length > 0
                ? resolvedLicense.addOns
                : (Array.isArray(currentOrg.addOns) ? currentOrg.addOns : [])
        } : currentOrg;

        const plans = getPackages(catalog, effectiveOrg);

        const currentPlanKey = detectCurrentPlanKey(effectiveOrg, plans);
        const recommendedPlanKey = {
            Personal: 'Business',
            Education: 'BusinessPlus',
            Business: 'BusinessPlus',
            BusinessPlus: 'BusinessUltimate',
            BusinessUltimate: 'BusinessUltimate'
        }[currentPlanKey] || 'BusinessPlus';

        const baseInfo = FEATURE_CATALOG[feature] || {
            label: currentPlanKey === 'Personal' ? 'Upgrade from Personal' : 'Upgrade your security program',
            icon: currentPlanKey === 'BusinessUltimate' ? 'ti-crown' : 'ti-rocket',
            accentColor: currentPlanKey === 'BusinessPlus' ? 'yellow' : (currentPlanKey === 'Personal' ? 'blue' : 'blue'),
            headline: currentPlanKey === 'Personal'
                ? 'Recommended next step: Business Foundation'
                : currentPlanKey === 'BusinessPlus'
                    ? 'Unlock Time Warp, benchmarks, and executive-grade readiness'
                    : currentPlanKey === 'BusinessUltimate'
                        ? 'You are already on the highest standard tier'
                        : 'Move beyond the foundation with compliance, audit, and Officer MAGI',
            description: currentPlanKey === 'Personal'
                ? 'You are viewing the upgrade page without a specific feature request, so we are recommending the next best tier for broader protection and growth.'
                : currentPlanKey === 'BusinessPlus'
                    ? 'Step up to the highest tier for historical analysis, peer benchmarks, and insurance-ready evidence.'
                    : currentPlanKey === 'BusinessUltimate'
                        ? 'Your organization already has the highest standard package. Contact us if you want enterprise expansion options.'
                        : 'Expand from the core foundation into guided compliance, auditor workflows, and AI-assisted security operations.',
            planKey: recommendedPlanKey,
        };

        const catalogFeature = getCatalogFeature(catalog, feature);
        const dynamicPlanKey = feature
            ? (plans.find((p) => (p.addOns || []).includes(feature))?.key || baseInfo.planKey)
            : baseInfo.planKey;
        const info = {
            ...baseInfo,
            label: normalizeFeatureLabel(feature, catalogFeature?.label || baseInfo.label),
            headline: catalogFeature?.description || baseInfo.headline,
            description: catalogFeature?.description || baseInfo.description || 'This feature is not included in your current plan.',
            planKey: dynamicPlanKey,
        };
        const currentPlan = planByKey(currentPlanKey, plans);
        const requiredPlan = planByKey(info.planKey, plans);
        const alreadyIncluded = planRank(currentPlanKey) >= planRank(info.planKey);

        const subject = `Upgrade inquiry - ${requiredPlan?.label || 'Business Premium'} - ${info.label}`;
        const body = `Hi MagenSec team,\n\nPlease help us upgrade from ${currentPlan?.label || 'our current plan'} to ${requiredPlan?.label || 'Business Premium'} for ${info.label}.\n\nThanks.`;

        const inheritedPlanKey = requiredPlan?.key === 'BusinessUltimate'
            ? 'BusinessPlus'
            : (requiredPlan?.key === 'BusinessPlus' ? 'Business' : null);
        const inheritedPlan = inheritedPlanKey ? planByKey(inheritedPlanKey, plans) : null;
        const comparePlans = currentPlanKey === 'Personal'
            ? plans.filter((plan) => ['Business', 'BusinessPlus', 'BusinessUltimate'].includes(plan.key))
            : plans;
        const currentPlanAddOns = currentPlan?.addOns || [];
        const sameTierFeatures = (requiredPlan?.addOns || [])
            .filter((key) => key !== feature)
            .filter((key) => !(inheritedPlan?.addOns || []).includes(key))
            .filter((key) => !currentPlanAddOns.includes(key))
            .map((key) => [key, {
                ...(FEATURE_CATALOG[key] || {}),
                label: normalizeFeatureLabel(key, getCatalogFeature(catalog, key)?.label || FEATURE_CATALOG[key]?.label || key),
                headline: FEATURE_CATALOG[key]?.headline || getCatalogFeature(catalog, key)?.description || 'Included in this plan'
            }])
            .filter(([_, value]) => value && !value.comingSoon)
            .slice(0, 4);

        return html`
            <div class="page-body">
                <div class="container-xl">
                    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                        <span class="text-muted small">Your plan:</span>
                        <span class="badge bg-${currentPlan?.color || 'secondary'}-lt text-${currentPlan?.color || 'secondary'}">${currentPlan?.label || 'Unknown'}</span>
                        <span class="text-muted small">${feature ? 'Required:' : 'Recommended:'}</span>
                        <span class="badge bg-${requiredPlan?.color || info.accentColor} text-white">${requiredPlan?.label || 'Business Premium'}</span>
                        ${alreadyIncluded ? html`<span class="badge bg-success-lt text-success">Included</span>` : ''}
                        ${catalogLoaded ? html`<span class="badge bg-success-lt text-success">Live catalog</span>` : html`<span class="badge bg-secondary-lt text-secondary">Fallback catalog</span>`}
                    </div>

                    <div class="card mb-4 border-0 shadow-sm overflow-hidden">
                        <div class="card-body p-0">
                            <div class="row g-0">
                                <div class="col-auto d-flex align-items-center justify-content-center bg-${info.accentColor}-lt px-5" style="min-width: 140px; min-height: 220px;">
                                    <i class="ti ${info.icon} text-${info.accentColor}" style="font-size: 4.5rem; opacity: 0.85;"></i>
                                </div>
                                <div class="col p-4 p-md-5">
                                    <div class="d-flex align-items-center gap-2 mb-1">
                                        <span class="badge bg-${requiredPlan?.color || info.accentColor} text-white">${requiredPlan?.label || 'Business Premium'}</span>
                                        ${info.comingSoon ? html`<span class="badge bg-azure-lt text-azure">Coming Soon</span>` : ''}
                                    </div>
                                    <h2 class="mb-1">${info.label}</h2>
                                    <p class="text-muted fs-5 mb-0">${info.headline}</p>
                                    <p class="mt-3 text-secondary" style="max-width: 620px;">${info.description}</p>
                                    <div class="d-flex gap-2 mt-4 flex-wrap">
                                        ${alreadyIncluded
                                            ? html`<a href="#" class="btn btn-outline-secondary" onclick=${this.goBack}><i class="ti ti-arrow-left me-1"></i>Go Back</a>`
                                            : html`
                                                <a href=${'mailto:hello@magensec.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body)} class="btn btn-${info.accentColor}">
                                                    <i class="ti ti-mail me-1"></i>${info.comingSoon ? 'Get Early Access' : 'Contact Sales'}
                                                </a>
                                                <a href="#" class="btn btn-outline-secondary" onclick=${this.goBack}><i class="ti ti-arrow-left me-1"></i>Go Back</a>
                                            `}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    ${sameTierFeatures.length > 0 ? html`
                        <div class="mb-4">
                            <h3 class="mb-3 text-muted" style="font-size: 0.85rem; letter-spacing: 0.08em; text-transform: uppercase;">
                                ${requiredPlan?.key === 'BusinessPlus'
                                    ? 'What Business Premium adds'
                                    : (requiredPlan?.key === 'BusinessUltimate'
                                        ? 'What Business Ultimate adds'
                                        : 'What Business Foundation adds')}
                            </h3>
                            <div class="row g-3">
                                ${sameTierFeatures.map(([_, f]) => html`
                                    <div class="col-sm-6 col-lg-3">
                                        <div class="card card-sm border-0 shadow-sm h-100">
                                            <div class="card-body d-flex align-items-center gap-3">
                                                <span class="avatar avatar-md bg-${f.accentColor || 'blue'}-lt flex-shrink-0">
                                                    <i class="ti ${f.icon || 'ti-stars'} text-${f.accentColor || 'blue'}"></i>
                                                </span>
                                                <div>
                                                    <div class="fw-medium">${f.label}</div>
                                                    <div class="text-muted small">${f.headline}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `)}
                            </div>
                        </div>
                    ` : ''}

                    <div class="card border-0 shadow-sm">
                        <div class="card-header"><h3 class="card-title">Compare plans</h3></div>
                        <div class="card-body">
                            <div class="row g-3">
                                ${comparePlans.map((plan) => {
                                    const isCurrent = plan.key === currentPlanKey;
                                    const highlighted = plan.key === info.planKey;
                                    const previousPlanKey = plan.key === 'BusinessUltimate'
                                        ? 'BusinessPlus'
                                        : (plan.key === 'BusinessPlus' ? 'Business' : null);
                                    const previousPlan = previousPlanKey ? planByKey(previousPlanKey, plans) : null;
                                    const inheritedLabel = plan.key === 'BusinessPlus'
                                        ? 'All in Business Foundation'
                                        : (plan.key === 'BusinessUltimate' ? 'All in Business Premium' : null);
                                    const comparisonBase = currentPlanKey === 'Personal' && plan.key === 'Business'
                                        ? []
                                        : (previousPlan?.addOns || []);
                                    const uniqueKeys = (plan.addOns || []).filter((key) => !comparisonBase.includes(key));
                                    const uniqueFeatures = uniqueKeys
                                        .map((key) => ({
                                            ...(FEATURE_CATALOG[key] || {}),
                                            label: normalizeFeatureLabel(key, getCatalogFeature(catalog, key)?.label || FEATURE_CATALOG[key]?.label || key),
                                        }))
                                        .filter((f) => !!f.label && !f.comingSoon);

                                    return html`
                                        <div class="col-md-4">
                                            <div class="card ${isCurrent || highlighted ? 'border-' + plan.color : 'border-0'} shadow-sm h-100">
                                                <div class="card-header d-flex align-items-center gap-2">
                                                    <i class="ti ${plan.icon} text-${plan.color}"></i>
                                                    <h4 class="card-title mb-0">${plan.label}</h4>
                                                    ${isCurrent ? html`<span class="badge bg-${plan.color}-lt text-${plan.color} ms-auto">Current</span>` : ''}
                                                </div>
                                                <div class="card-body">
                                                    ${inheritedLabel ? html`
                                                        <div class="small text-muted mb-3 d-flex align-items-center gap-2">
                                                            <i class="ti ti-stack-2 text-${plan.color}"></i>
                                                            <span>${inheritedLabel}</span>
                                                        </div>
                                                    ` : ''}
                                                    <ul class="list-unstyled mb-0 small">
                                                        ${uniqueFeatures.slice(0, 6).map((f) => html`<li class="d-flex align-items-center gap-2 mb-2"><i class="ti ti-check text-success"></i><span>${f.label}</span></li>`)}
                                                        ${uniqueFeatures.length > 6 ? html`<li class="text-muted">+${uniqueFeatures.length - 6} more unique features</li>` : ''}
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

export { Upgrade };
