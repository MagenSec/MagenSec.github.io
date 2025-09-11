/**
 * MSCC Admin Dashboard Management System
 * Comprehensive security management and monitoring for managed service providers
 */

class AdminDashboardManager {
    constructor() {
        this.securityReportsManager = null;
        this.complianceManager = null;
        this.mitreAttackManager = null;
        this.executiveReportGenerator = null;
        this.managedEnvironments = new Map();
        this.alertSystem = new AlertSystem();
        this.refreshInterval = null;
        this.dashboardData = {};
        
        this.init();
    }
    
    async init() {
        try {
            // Initialize all managers
            this.securityReportsManager = new SecurityReportsManager();
            this.complianceManager = new ComplianceReportsManager();
            this.mitreAttackManager = new MitreAttackManager();
            this.executiveReportGenerator = new ExecutiveReportGenerator();
            
            // Load dashboard data
            await this.loadDashboardData();
            
            // Initialize UI components
            this.initializeCharts();
            this.loadManagedEnvironments();
            this.loadCriticalActions();
            this.loadLicenseCompliance();
            this.loadRecentActivity();
            
            // Setup auto-refresh
            this.setupAutoRefresh();
            
            // Check for alerts
            this.checkSecurityAlerts();
            
            console.log('Admin Dashboard initialized successfully');
        } catch (error) {
            console.error('Failed to initialize admin dashboard:', error);
            this.showError('Failed to initialize dashboard. Please refresh the page.');
        }
    }
    
    async loadDashboardData() {
        // Simulate loading data from multiple managed environments
        this.dashboardData = {
            environments: this.generateManagedEnvironments(),
            aggregateMetrics: await this.calculateAggregateMetrics(),
            securityTrends: await this.generateSecurityTrends(),
            criticalIssues: await this.identifyCriticalIssues(),
            complianceStatus: await this.aggregateComplianceStatus(),
            licenseStatus: await this.aggregateLicenseStatus(),
            threatIntelligence: await this.aggregateThreatIntelligence()
        };
    }
    
    generateManagedEnvironments() {
        const environments = [
            {
                id: 'env-001',
                name: 'Acme Corp HQ',
                type: 'Enterprise',
                industry: 'Manufacturing',
                endpoints: 45,
                securityScore: 78,
                complianceScore: 85,
                criticalIssues: 2,
                lastUpdated: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
                status: 'Active',
                contact: 'John Smith - IT Manager'
            },
            {
                id: 'env-002',
                name: 'TechStart Inc',
                type: 'SMB',
                industry: 'Technology',
                endpoints: 12,
                securityScore: 92,
                complianceScore: 78,
                criticalIssues: 0,
                lastUpdated: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
                status: 'Active',
                contact: 'Sarah Johnson - CTO'
            },
            {
                id: 'env-003',
                name: 'HealthFirst Clinic',
                type: 'Healthcare',
                industry: 'Healthcare',
                endpoints: 28,
                securityScore: 65,
                complianceScore: 95,
                criticalIssues: 4,
                lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
                status: 'Warning',
                contact: 'Dr. Mike Wilson - Administrator'
            },
            {
                id: 'env-004',
                name: 'RetailMax Store',
                type: 'Retail',
                industry: 'Retail',
                endpoints: 22,
                securityScore: 71,
                complianceScore: 88,
                criticalIssues: 1,
                lastUpdated: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
                status: 'Active',
                contact: 'Lisa Brown - Operations Manager'
            },
            {
                id: 'env-005',
                name: 'EduCenter University',
                type: 'Education',
                industry: 'Education',
                endpoints: 156,
                securityScore: 89,
                complianceScore: 82,
                criticalIssues: 1,
                lastUpdated: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
                status: 'Active',
                contact: 'Prof. David Lee - IT Director'
            }
        ];
        
        environments.forEach(env => {
            this.managedEnvironments.set(env.id, env);
        });
        
        return environments;
    }
    
    async calculateAggregateMetrics() {
        const environments = Array.from(this.managedEnvironments.values());
        
        const totalEndpoints = environments.reduce((sum, env) => sum + env.endpoints, 0);
        const totalCriticalIssues = environments.reduce((sum, env) => sum + env.criticalIssues, 0);
        
        // Calculate weighted average security score
        const weightedSecuritySum = environments.reduce((sum, env) => 
            sum + (env.securityScore * env.endpoints), 0);
        const avgSecurityScore = Math.round(weightedSecuritySum / totalEndpoints);
        
        // Calculate weighted average compliance score
        const weightedComplianceSum = environments.reduce((sum, env) => 
            sum + (env.complianceScore * env.endpoints), 0);
        const avgComplianceScore = Math.round(weightedComplianceSum / totalEndpoints);
        
        // Count active incidents
        const activeIncidents = environments.filter(env => env.status === 'Warning').length;
        
        return {
            overallSecurityScore: avgSecurityScore,
            totalCriticalVulns: totalCriticalIssues,
            managedEndpoints: totalEndpoints,
            activeIncidents: activeIncidents,
            complianceScore: avgComplianceScore,
            environmentCount: environments.length,
            executiveReadiness: this.calculateExecutiveReadiness(environments),
            threatLevel: this.calculateThreatLevel(environments)
        };
    }
    
    calculateExecutiveReadiness(environments) {
        // Executive readiness based on multiple factors
        let readinessScore = 0;
        const factors = {
            avgSecurityScore: 0.4,
            complianceAlignment: 0.3,
            incidentResponse: 0.2,
            reporting: 0.1
        };
        
        const avgSecurity = environments.reduce((sum, env) => sum + env.securityScore, 0) / environments.length;
        const avgCompliance = environments.reduce((sum, env) => sum + env.complianceScore, 0) / environments.length;
        const incidentRate = environments.filter(env => env.status !== 'Active').length / environments.length;
        
        readinessScore += (avgSecurity / 100) * factors.avgSecurityScore * 100;
        readinessScore += (avgCompliance / 100) * factors.complianceAlignment * 100;
        readinessScore += (1 - incidentRate) * factors.incidentResponse * 100;
        readinessScore += 0.9 * factors.reporting * 100; // Assume good reporting
        
        return Math.round(readinessScore);
    }
    
    calculateThreatLevel(environments) {
        const avgSecurity = environments.reduce((sum, env) => sum + env.securityScore, 0) / environments.length;
        const totalCritical = environments.reduce((sum, env) => sum + env.criticalIssues, 0);
        
        if (avgSecurity >= 85 && totalCritical <= 2) return 'Low';
        if (avgSecurity >= 75 && totalCritical <= 5) return 'Medium-Low';
        if (avgSecurity >= 65 && totalCritical <= 8) return 'Medium';
        if (avgSecurity >= 50 && totalCritical <= 12) return 'Medium-High';
        return 'High';
    }
    
    async generateSecurityTrends() {
        // Generate 30 days of security trend data
        const days = 30;
        const trends = {
            dates: [],
            securityScores: [],
            vulnerabilities: [],
            incidents: [],
            compliance: []
        };
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            trends.dates.push(date.toISOString().split('T')[0]);
            
            // Generate trending data with some variance
            const baseScore = 82;
            const variance = Math.sin(i / 5) * 5 + (Math.random() - 0.5) * 8;
            trends.securityScores.push(Math.max(60, Math.min(95, baseScore + variance)));
            
            trends.vulnerabilities.push(Math.floor(Math.random() * 8) + 2);
            trends.incidents.push(Math.floor(Math.random() * 3));
            trends.compliance.push(Math.floor(Math.random() * 10) + 85);
        }
        
        return trends;
    }
    
    async identifyCriticalIssues() {
        const issues = [];
        
        // Analyze each environment for critical issues
        this.managedEnvironments.forEach((env, id) => {
            if (env.criticalIssues > 0) {
                issues.push({
                    environmentId: id,
                    environmentName: env.name,
                    severity: env.criticalIssues > 3 ? 'Critical' : env.criticalIssues > 1 ? 'High' : 'Medium',
                    count: env.criticalIssues,
                    type: 'Vulnerability',
                    description: `${env.criticalIssues} critical vulnerabilities requiring immediate attention`,
                    timeframe: '24-48 hours',
                    contact: env.contact,
                    businessRisk: env.criticalIssues > 3 ? 'High - Immediate business risk' : 'Medium - Potential security exposure'
                });
            }
            
            if (env.securityScore < 70) {
                issues.push({
                    environmentId: id,
                    environmentName: env.name,
                    severity: 'High',
                    type: 'Security Posture',
                    description: `Security score below threshold (${env.securityScore}%)`,
                    timeframe: '1-2 weeks',
                    contact: env.contact,
                    businessRisk: 'Medium - Inadequate security controls'
                });
            }
            
            if (env.lastUpdated < new Date(Date.now() - 2 * 60 * 60 * 1000)) {
                issues.push({
                    environmentId: id,
                    environmentName: env.name,
                    severity: 'Medium',
                    type: 'Connectivity',
                    description: 'Environment not reporting current status',
                    timeframe: '4-8 hours',
                    contact: env.contact,
                    businessRisk: 'Low - Monitoring gap'
                });
            }
        });
        
        return issues.sort((a, b) => {
            const severityOrder = { 'Critical': 3, 'High': 2, 'Medium': 1, 'Low': 0 };
            return severityOrder[b.severity] - severityOrder[a.severity];
        });
    }
    
    async aggregateComplianceStatus() {
        const environments = Array.from(this.managedEnvironments.values());
        const frameworkStatus = {};
        
        // Common compliance frameworks
        const frameworks = ['SOC 2', 'ISO 27001', 'NIST CSF', 'CIS Controls', 'PCI DSS', 'GDPR', 'HIPAA'];
        
        frameworks.forEach(framework => {
            const applicable = environments.filter(env => this.isFrameworkApplicable(framework, env.industry));
            if (applicable.length > 0) {
                const avgScore = applicable.reduce((sum, env) => sum + env.complianceScore, 0) / applicable.length;
                const gaps = applicable.filter(env => env.complianceScore < 80).length;
                
                frameworkStatus[framework] = {
                    averageScore: Math.round(avgScore),
                    applicableEnvironments: applicable.length,
                    gapsCount: gaps,
                    status: avgScore >= 90 ? 'Excellent' : avgScore >= 80 ? 'Good' : avgScore >= 70 ? 'Fair' : 'Poor'
                };
            }
        });
        
        return frameworkStatus;
    }
    
    isFrameworkApplicable(framework, industry) {
        const applicability = {
            'SOC 2': ['Technology', 'Healthcare', 'Finance'],
            'ISO 27001': ['Technology', 'Manufacturing', 'Healthcare', 'Finance'],
            'NIST CSF': ['Technology', 'Manufacturing', 'Healthcare', 'Finance', 'Education'],
            'CIS Controls': ['Technology', 'Manufacturing', 'Healthcare', 'Finance', 'Education', 'Retail'],
            'PCI DSS': ['Retail', 'Finance'],
            'GDPR': ['Technology', 'Healthcare', 'Retail', 'Education'],
            'HIPAA': ['Healthcare']
        };
        
        return applicability[framework]?.includes(industry) || false;
    }
    
    async aggregateLicenseStatus() {
        const environments = Array.from(this.managedEnvironments.values());
        let totalViolations = 0;
        let totalLicenses = 0;
        let totalPotentialFines = 0;
        
        const licenseTypes = {
            'Microsoft Office': { violations: 3, total: 156, finePerViolation: 500 },
            'Windows Server': { violations: 1, total: 23, finePerViolation: 2000 },
            'Adobe Creative': { violations: 2, total: 34, finePerViolation: 300 },
            'Antivirus Software': { violations: 0, total: 263, finePerViolation: 100 },
            'Development Tools': { violations: 1, total: 45, finePerViolation: 800 }
        };
        
        Object.values(licenseTypes).forEach(license => {
            totalViolations += license.violations;
            totalLicenses += license.total;
            totalPotentialFines += license.violations * license.finePerViolation;
        });
        
        return {
            summary: {
                totalLicenses,
                violations: totalViolations,
                complianceRate: Math.round(((totalLicenses - totalViolations) / totalLicenses) * 100),
                totalPotentialFines,
                urgentActions: totalViolations > 5 ? totalViolations : 0
            },
            byType: licenseTypes,
            recommendations: this.generateLicenseRecommendations(licenseTypes)
        };
    }
    
    generateLicenseRecommendations(licenseTypes) {
        const recommendations = [];
        
        Object.entries(licenseTypes).forEach(([type, data]) => {
            if (data.violations > 0) {
                recommendations.push({
                    type,
                    violations: data.violations,
                    action: 'Purchase additional licenses or remove unauthorized installations',
                    priority: data.violations > 2 ? 'High' : 'Medium',
                    estimatedCost: data.violations * data.finePerViolation,
                    timeframe: data.violations > 2 ? '1-2 weeks' : '30-60 days'
                });
            }
        });
        
        return recommendations;
    }
    
    async aggregateThreatIntelligence() {
        // Simulate threat intelligence aggregation
        return {
            activeThreatGroups: ['APT28', 'Lazarus Group', 'APT40'],
            recentThreatIndicators: 47,
            blockedThreats: 1247,
            suspiciousActivity: 23,
            threatTrend: 'Increasing',
            lastUpdate: new Date()
        };
    }
    
    initializeCharts() {
        this.initSecurityTrendChart();
        this.initRiskDistributionChart();
    }
    
    initSecurityTrendChart() {
        const ctx = document.getElementById('securityTrendChart');
        if (!ctx) return;
        
        const trends = this.dashboardData.securityTrends;
        
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: trends.dates.map(date => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                datasets: [
                    {
                        label: 'Security Score',
                        data: trends.securityScores,
                        borderColor: '#206bc4',
                        backgroundColor: 'rgba(32, 107, 196, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Vulnerabilities',
                        data: trends.vulnerabilities,
                        borderColor: '#d63384',
                        backgroundColor: 'rgba(214, 51, 132, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Compliance %',
                        data: trends.compliance,
                        borderColor: '#20c997',
                        backgroundColor: 'rgba(32, 201, 151, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Score (%)'
                        },
                        min: 0,
                        max: 100
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Count'
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: false
                    }
                }
            }
        });
    }
    
    initRiskDistributionChart() {
        const ctx = document.getElementById('riskDistributionChart');
        if (!ctx) return;
        
        const environments = Array.from(this.managedEnvironments.values());
        const riskLevels = { 'Low': 0, 'Medium': 0, 'High': 0, 'Critical': 0 };
        
        environments.forEach(env => {
            if (env.securityScore >= 85) riskLevels['Low']++;
            else if (env.securityScore >= 70) riskLevels['Medium']++;
            else if (env.securityScore >= 50) riskLevels['High']++;
            else riskLevels['Critical']++;
        });
        
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(riskLevels),
                datasets: [{
                    data: Object.values(riskLevels),
                    backgroundColor: [
                        '#20c997', // Low - Green
                        '#fd7e14', // Medium - Orange
                        '#fd7e14', // High - Red-Orange
                        '#d63384'  // Critical - Red
                    ],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    title: {
                        display: false
                    }
                }
            }
        });
    }
    
    loadManagedEnvironments() {
        const tableBody = document.getElementById('environmentsTableBody');
        if (!tableBody) return;
        
        const environments = Array.from(this.managedEnvironments.values());
        
        tableBody.innerHTML = environments.map(env => `
            <tr>
                <td>
                    <div class="d-flex py-1 align-items-center">
                        <span class="avatar me-2" style="background-image: url('./static/avatars/environment-${env.id.slice(-1)}.jpg')"></span>
                        <div class="flex-fill">
                            <div class="font-weight-medium">${env.name}</div>
                            <div class="text-muted">${env.contact}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge badge-outline text-blue">${env.type}</span>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <span class="me-2">${env.securityScore}%</span>
                        <div class="progress" style="width: 60px;">
                            <div class="progress-bar bg-${this.getScoreColor(env.securityScore)}" 
                                 style="width: ${env.securityScore}%"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <span class="me-2">${env.complianceScore}%</span>
                        <div class="progress" style="width: 60px;">
                            <div class="progress-bar bg-${this.getScoreColor(env.complianceScore)}" 
                                 style="width: ${env.complianceScore}%"></div>
                        </div>
                    </div>
                </td>
                <td>
                    ${env.criticalIssues > 0 ? 
                        `<span class="badge bg-red">${env.criticalIssues} Critical</span>` : 
                        `<span class="badge bg-green">None</span>`
                    }
                </td>
                <td>
                    <div class="text-muted">${this.formatTimeAgo(env.lastUpdated)}</div>
                    <div class="small text-muted">${env.lastUpdated.toLocaleTimeString()}</div>
                </td>
                <td>
                    <div class="btn-list flex-nowrap">
                        <button class="btn btn-white btn-sm" onclick="viewEnvironmentDetails('${env.id}')">
                            View
                        </button>
                        <div class="dropdown">
                            <button class="btn btn-white btn-sm dropdown-toggle align-text-top" 
                                    data-bs-toggle="dropdown">Actions</button>
                            <div class="dropdown-menu dropdown-menu-end">
                                <a class="dropdown-item" href="#" onclick="generateEnvironmentReport('${env.id}')">
                                    Generate Report
                                </a>
                                <a class="dropdown-item" href="#" onclick="scheduleAssessment('${env.id}')">
                                    Schedule Assessment
                                </a>
                                <a class="dropdown-item" href="#" onclick="contactEnvironment('${env.id}')">
                                    Contact Admin
                                </a>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `).join('');
    }
    
    getScoreColor(score) {
        if (score >= 85) return 'green';
        if (score >= 70) return 'yellow';
        if (score >= 60) return 'orange';
        return 'red';
    }
    
    formatTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    }
    
    async loadCriticalActions() {
        const container = document.getElementById('criticalActionsList');
        if (!container) return;
        
        const criticalIssues = this.dashboardData.criticalIssues || [];
        
        if (criticalIssues.length === 0) {
            container.innerHTML = `
                <div class="action-item action-low">
                    <div class="d-flex align-items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon text-green me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>
                        <div>
                            <strong>No Critical Actions Required</strong>
                            <div class="text-muted">All environments are operating within acceptable parameters</div>
                        </div>
                    </div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = criticalIssues.slice(0, 5).map(issue => `
            <div class="action-item action-${issue.severity.toLowerCase()}">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-fill">
                        <div class="d-flex align-items-center mb-1">
                            <span class="risk-badge risk-${issue.severity.toLowerCase()} me-2">${issue.severity}</span>
                            <strong>${issue.environmentName}</strong>
                        </div>
                        <div class="mb-1">${issue.description}</div>
                        <div class="small text-muted">
                            <strong>Timeframe:</strong> ${issue.timeframe} | 
                            <strong>Contact:</strong> ${issue.contact}
                        </div>
                        <div class="small text-muted">${issue.businessRisk}</div>
                    </div>
                    <div class="btn-list flex-nowrap">
                        <button class="btn btn-sm btn-outline-primary" 
                                onclick="takeAction('${issue.environmentId}', '${issue.type}')">
                            Take Action
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    async loadLicenseCompliance() {
        const container = document.getElementById('licenseComplianceStatus');
        if (!container) return;
        
        const licenseStatus = this.dashboardData.licenseStatus || await this.aggregateLicenseStatus();
        const summary = licenseStatus.summary;
        
        container.innerHTML = `
            <div class="row mb-3">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <div class="d-flex align-items-center">
                                <div class="me-3">
                                    <span class="bg-green text-white avatar">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" /></svg>
                                    </span>
                                </div>
                                <div>
                                    <div class="font-weight-medium">Compliance Rate</div>
                                    <div class="text-muted">${summary.complianceRate}% compliant</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <div class="d-flex align-items-center">
                                <div class="me-3">
                                    <span class="bg-${summary.violations > 0 ? 'red' : 'green'} text-white avatar">
                                        ${summary.violations}
                                    </span>
                                </div>
                                <div>
                                    <div class="font-weight-medium">License Violations</div>
                                    <div class="text-muted">${summary.violations} violations found</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            ${summary.violations > 0 ? `
                <div class="alert alert-warning">
                    <div class="d-flex">
                        <div>
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 9v2m0 4v.01" /><path d="M5 19h14a2 2 0 0 0 1.414 -1.414l-7 -7a2 2 0 0 0 -2.828 0l-7 7a2 2 0 0 0 1.414 1.414z" /></svg>
                        </div>
                        <div>
                            <h4 class="alert-title">License Compliance Action Required</h4>
                            <div class="text-muted">
                                Potential fines: $${summary.totalPotentialFines.toLocaleString()}
                                <br>Review and resolve ${summary.violations} license violations to maintain compliance.
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>License Type</th>
                            <th>Total</th>
                            <th>Violations</th>
                            <th>Status</th>
                            <th>Potential Fine</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(licenseStatus.byType).map(([type, data]) => `
                            <tr>
                                <td>${type}</td>
                                <td>${data.total}</td>
                                <td>
                                    ${data.violations > 0 ? 
                                        `<span class="badge bg-red">${data.violations}</span>` :
                                        `<span class="badge bg-green">0</span>`
                                    }
                                </td>
                                <td>
                                    ${data.violations === 0 ? 
                                        '<span class="text-green">Compliant</span>' :
                                        '<span class="text-red">Non-compliant</span>'
                                    }
                                </td>
                                <td>$${(data.violations * data.finePerViolation).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    async loadRecentActivity() {
        const container = document.getElementById('recentActivityList');
        if (!container) return;
        
        // Generate recent activity items
        const activities = [
            {
                time: new Date(Date.now() - 15 * 60 * 1000),
                type: 'security',
                environment: 'TechStart Inc',
                message: 'Security scan completed successfully',
                severity: 'info'
            },
            {
                time: new Date(Date.now() - 30 * 60 * 1000),
                type: 'vulnerability',
                environment: 'HealthFirst Clinic',
                message: 'Critical vulnerability detected in Windows Server',
                severity: 'critical'
            },
            {
                time: new Date(Date.now() - 45 * 60 * 1000),
                type: 'compliance',
                environment: 'Acme Corp HQ',
                message: 'HIPAA compliance assessment completed',
                severity: 'success'
            },
            {
                time: new Date(Date.now() - 1 * 60 * 60 * 1000),
                type: 'license',
                environment: 'RetailMax Store',
                message: 'License violation resolved for Microsoft Office',
                severity: 'success'
            },
            {
                time: new Date(Date.now() - 2 * 60 * 60 * 1000),
                type: 'threat',
                environment: 'EduCenter University',
                message: 'Blocked 15 malicious emails in the last hour',
                severity: 'warning'
            }
        ];
        
        container.innerHTML = activities.map(activity => `
            <div class="row">
                <div class="col-auto">
                    <span class="avatar avatar-rounded avatar-sm bg-${this.getSeverityColor(activity.severity)}">
                        ${this.getActivityIcon(activity.type)}
                    </span>
                </div>
                <div class="col">
                    <div class="text-truncate">
                        <strong>${activity.environment}</strong> - ${activity.message}
                    </div>
                    <div class="text-muted">${this.formatTimeAgo(activity.time)}</div>
                </div>
            </div>
        `).join('');
    }
    
    getSeverityColor(severity) {
        const colors = {
            'critical': 'red',
            'warning': 'yellow',
            'success': 'green',
            'info': 'blue'
        };
        return colors[severity] || 'gray';
    }
    
    getActivityIcon(type) {
        const icons = {
            'security': '🛡️',
            'vulnerability': '⚠️',
            'compliance': '✅',
            'license': '📄',
            'threat': '🚨'
        };
        return icons[type] || '📋';
    }
    
    checkSecurityAlerts() {
        const criticalIssues = this.dashboardData.criticalIssues || [];
        const criticalCount = criticalIssues.filter(issue => issue.severity === 'Critical').length;
        
        if (criticalCount > 0) {
            this.showSecurityAlert(`${criticalCount} critical security issue${criticalCount > 1 ? 's' : ''} detected across managed environments.`);
        }
    }
    
    showSecurityAlert(message) {
        const alertBanner = document.getElementById('alertBanner');
        const alertMessage = document.getElementById('alertMessage');
        
        if (alertBanner && alertMessage) {
            alertMessage.textContent = message;
            alertBanner.style.display = 'block';
        }
    }
    
    setupAutoRefresh() {
        // Refresh dashboard every 5 minutes
        this.refreshInterval = setInterval(() => {
            this.refreshDashboard();
        }, 5 * 60 * 1000);
    }
    
    async refreshDashboard() {
        try {
            console.log('Refreshing dashboard...');
            
            // Update the refresh button to show loading state
            const refreshBtn = document.querySelector('button[onclick="refreshDashboard()"]');
            if (refreshBtn) {
                const originalHtml = refreshBtn.innerHTML;
                refreshBtn.innerHTML = `
                    <svg class="icon icon-tabler-loader" width="24" height="24">
                        <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                    Refreshing...
                `;
                refreshBtn.disabled = true;
                
                // Reload data
                await this.loadDashboardData();
                
                // Update UI components
                this.updateMetrics();
                this.loadManagedEnvironments();
                this.loadCriticalActions();
                this.loadLicenseCompliance();
                this.loadRecentActivity();
                this.checkSecurityAlerts();
                
                // Restore button
                setTimeout(() => {
                    refreshBtn.innerHTML = originalHtml;
                    refreshBtn.disabled = false;
                }, 1000);
            }
            
            console.log('Dashboard refreshed successfully');
        } catch (error) {
            console.error('Failed to refresh dashboard:', error);
            this.showError('Failed to refresh dashboard data');
        }
    }
    
    updateMetrics() {
        const metrics = this.dashboardData.aggregateMetrics;
        
        // Update metric displays
        this.updateElement('overallSecurityScore', metrics.overallSecurityScore);
        this.updateElement('criticalVulns', metrics.totalCriticalVulns);
        this.updateElement('managedEndpoints', metrics.managedEndpoints);
        this.updateElement('activeIncidents', metrics.activeIncidents);
    }
    
    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }
    
    showError(message) {
        // Simple error notification
        console.error(message);
        // In a real implementation, you would show a proper notification
    }
    
    // Public methods for UI interactions
    async generateExecutiveReport() {
        const modal = new bootstrap.Modal(document.getElementById('executiveReportModal'));
        modal.show();
    }
    
    async executeReportGeneration() {
        try {
            const reportType = document.getElementById('reportType').value;
            const reportPeriod = document.getElementById('reportPeriod').value;
            
            // Generate mock organization data
            const organizationData = {
                organization: {
                    name: 'Multi-Client Managed Security',
                    type: 'site-admin',
                    industry: 'Managed Security Services'
                },
                user: {
                    name: 'System Administrator'
                }
            };
            
            // Generate report data from dashboard
            const reportData = {
                securityPosture: {
                    overallScore: this.dashboardData.aggregateMetrics.overallSecurityScore,
                    trend: 'Improving'
                },
                vulnerabilities: {
                    critical: this.dashboardData.aggregateMetrics.totalCriticalVulns
                },
                compliance: {
                    overallScore: this.dashboardData.aggregateMetrics.complianceScore
                },
                incidents: {
                    open: this.dashboardData.aggregateMetrics.activeIncidents
                },
                actionableItems: this.dashboardData.criticalIssues.map(issue => ({
                    priority: issue.severity,
                    description: issue.description,
                    cost: Math.floor(Math.random() * 50000) + 10000
                })),
                licenseCompliance: this.dashboardData.licenseStatus
            };
            
            // Generate the executive report
            const report = await this.executiveReportGenerator.generateExecutiveReport(
                reportType, 
                organizationData, 
                reportData,
                { period: reportPeriod }
            );
            
            // For demo purposes, show the report as JSON
            console.log('Generated Executive Report:', report);
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('executiveReportModal'));
            modal.hide();
            
            // Show success message
            this.showSuccess('Executive report generated successfully!');
            
            // In a real implementation, you would:
            // 1. Generate a PDF or formatted document
            // 2. Email the report to stakeholders
            // 3. Save to a reports repository
            
        } catch (error) {
            console.error('Failed to generate executive report:', error);
            this.showError('Failed to generate executive report');
        }
    }
    
    showSuccess(message) {
        console.log('Success:', message);
        // In a real implementation, show a proper success notification
    }
}

// Global functions for UI interactions
function refreshDashboard() {
    if (window.adminDashboard) {
        window.adminDashboard.refreshDashboard();
    }
}

function generateExecutiveReport() {
    if (window.adminDashboard) {
        window.adminDashboard.generateExecutiveReport();
    }
}

function executeReportGeneration() {
    if (window.adminDashboard) {
        window.adminDashboard.executeReportGeneration();
    }
}

function refreshEnvironments() {
    if (window.adminDashboard) {
        window.adminDashboard.loadManagedEnvironments();
    }
}

function viewEnvironmentDetails(environmentId) {
    console.log('Viewing details for environment:', environmentId);
    // In a real implementation, open environment details modal or page
}

function generateEnvironmentReport(environmentId) {
    console.log('Generating report for environment:', environmentId);
    // In a real implementation, generate environment-specific report
}

function scheduleAssessment(environmentId) {
    console.log('Scheduling assessment for environment:', environmentId);
    // In a real implementation, open assessment scheduling interface
}

function contactEnvironment(environmentId) {
    console.log('Contacting environment administrator:', environmentId);
    // In a real implementation, open contact/communication interface
}

function takeAction(environmentId, issueType) {
    console.log('Taking action for environment:', environmentId, 'Issue type:', issueType);
    // In a real implementation, open action workflow or automation
}

// Alert System Class
class AlertSystem {
    constructor() {
        this.alerts = [];
        this.subscribers = [];
    }
    
    addAlert(alert) {
        this.alerts.push({
            id: Date.now(),
            timestamp: new Date(),
            ...alert
        });
        this.notifySubscribers(alert);
    }
    
    subscribe(callback) {
        this.subscribers.push(callback);
    }
    
    notifySubscribers(alert) {
        this.subscribers.forEach(callback => callback(alert));
    }
}

// Initialize admin dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
        window.adminDashboard = new AdminDashboardManager();
    } catch (error) {
        console.error('Failed to initialize admin dashboard:', error);
    }
});

// Export for external use
window.AdminDashboardManager = AdminDashboardManager;
