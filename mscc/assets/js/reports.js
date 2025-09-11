/**
 * MSCC Security Reports Module
 * Professional-grade security reporting and compliance analysis
 */

class SecurityReportsManager {
    constructor() {
        this.apiBase = null;
        this.user = null;
        this.organization = null;
        this.currentOrg = 'current';
        this.charts = {};
        this.reportData = {};
        this.complianceFrameworks = {};
        this.mitreMatrix = {};
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
        this.lastDataFetch = null;
    }
    
    async init() {
        try {
            // Resolve API base
            this.apiBase = await window.apiResolver.resolveApiBase();
            
            // Check authentication
            if (!await this.checkAuth()) {
                window.location.href = 'login.html';
                return;
            }
            
            // Initialize compliance frameworks
            this.initializeComplianceFrameworks();
            this.initializeMitreMatrix();
            
            // Load user data and reports
            await this.loadUserData();
            await this.loadReportData();
            this.initializeCharts();
            this.loadActionableItems();
            
            // Set up auto-refresh
            this.setupAutoRefresh();
            
            console.log('SecurityReportsManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize SecurityReportsManager:', error);
            this.showError('Failed to load security reports. Please refresh the page.');
        }
    }
    
    async checkAuth() {
        const token = localStorage.getItem('mscc_session_token');
        if (!token) return false;
        
        // Check for development session
        if (token.startsWith('dev_')) {
            const devSession = localStorage.getItem('mscc_dev_session');
            if (devSession) {
                this.user = JSON.parse(devSession);
                this.organization = this.user.organization;
                return true;
            }
            return false;
        }
        
        // TODO: Implement real authentication check
        return false;
    }
    
    async loadUserData() {
        // Update UI with user info
        document.getElementById('userName').textContent = this.user.name;
        document.getElementById('userRole').textContent = this.organization.name;
        document.getElementById('userAvatar').style.backgroundImage = `url(${this.user.picture})`;
        
        // Update page content based on role
        const reportsSummary = document.getElementById('reportsSummary');
        switch(this.organization.type) {
            case 'individual':
                reportsSummary.textContent = 'Your personal security reports and compliance status';
                break;
            case 'business':
                reportsSummary.textContent = `Security reports and compliance for ${this.organization.name}`;
                document.querySelectorAll('.business-only').forEach(el => el.style.display = 'block');
                break;
            case 'site-admin':
                reportsSummary.textContent = 'Global security reports and multi-organization compliance';
                document.getElementById('adminNav').style.display = 'block';
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
                document.querySelectorAll('.business-only').forEach(el => el.style.display = 'block');
                break;
        }
        
        // Load organizations for admin
        if (this.organization.type === 'site-admin') {
            await this.loadOrganizations();
        }
    }
    
    async loadOrganizations() {
        try {
            // In a real implementation, this would fetch from the API
            const organizations = [
                { id: 'all', name: 'All Organizations', deviceCount: 1247, userCount: 89 },
                { id: 'acme-corp', name: 'Acme Corporation', deviceCount: 156, userCount: 12 },
                { id: 'tech-solutions', name: 'Tech Solutions Inc', deviceCount: 243, userCount: 18 },
                { id: 'healthcare-plus', name: 'Healthcare Plus', deviceCount: 89, userCount: 7 },
                { id: 'legal-advisors', name: 'Legal Advisors LLC', deviceCount: 45, userCount: 5 }
            ];
            
            const orgFilter = document.getElementById('orgFilter');
            orgFilter.innerHTML = organizations.map(org => 
                `<option value="${org.id}">${org.name} ${org.id !== 'all' ? `(${org.deviceCount} devices)` : ''}</option>`
            ).join('');
            
            this.organizations = organizations;
        } catch (error) {
            console.error('Failed to load organizations:', error);
        }
    }
    
    async loadReportData() {
        try {
            // Check cache first
            if (this.isDataFresh()) {
                return;
            }
            
            // Generate comprehensive security report data
            this.reportData = await this.generateReportData();
            
            // Update UI elements
            this.updateSecurityMetrics();
            this.updateComplianceOverview();
            this.updateLicenseCompliance();
            this.updateConfigurationRisks();
            this.updateThreatLandscape();
            this.updateActionableItems();
            this.updateLastUpdated();
            
            this.lastDataFetch = Date.now();
            
        } catch (error) {
            console.error('Failed to load report data:', error);
            this.showError('Failed to load security data. Some information may be outdated.');
        }
    }
    
    isDataFresh() {
        return this.lastDataFetch && (Date.now() - this.lastDataFetch) < this.cacheExpiry;
    }
    
    async generateReportData() {
        const isIndividual = this.organization.type === 'individual';
        const isAdmin = this.organization.type === 'site-admin';
        const baseMultiplier = this.getBaseMultiplier();
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return {
            securityPosture: await this.calculateSecurityPosture(baseMultiplier),
            vulnerabilities: await this.getVulnerabilityData(baseMultiplier),
            compliance: await this.getComplianceData(),
            licenseCompliance: await this.getLicenseComplianceData(baseMultiplier),
            mitreTTPs: await this.getMitreData(baseMultiplier),
            incidents: await this.getIncidentData(baseMultiplier),
            configurationRisks: await this.getConfigurationRisks(baseMultiplier),
            actionableItems: await this.generateActionableItems(baseMultiplier),
            threatLandscape: await this.getThreatLandscapeData(baseMultiplier),
            riskScore: await this.calculateRiskScore(),
            benchmarks: await this.getBenchmarkData()
        };
    }
    
    getBaseMultiplier() {
        switch(this.organization.type) {
            case 'individual': return 1;
            case 'business': return 5;
            case 'site-admin': return this.currentOrg === 'all' ? 50 : 5;
            default: return 1;
        }
    }
    
    async calculateSecurityPosture(multiplier) {
        // Calculate security posture based on multiple factors
        const vulnScore = this.calculateVulnerabilityScore(multiplier);
        const complianceScore = this.calculateComplianceScore();
        const configScore = this.calculateConfigurationScore();
        const incidentScore = this.calculateIncidentScore(multiplier);
        
        const overallScore = Math.round((vulnScore * 0.4 + complianceScore * 0.3 + configScore * 0.2 + incidentScore * 0.1));
        
        return {
            overallScore,
            lastUpdated: new Date(Date.now() - Math.random() * 2 * 60 * 60 * 1000),
            breakdown: {
                vulnerabilities: vulnScore,
                compliance: complianceScore,
                configuration: configScore,
                incidents: incidentScore
            }
        };
    }
    
    calculateVulnerabilityScore(multiplier) {
        const critical = Math.floor(Math.random() * 5 * multiplier);
        const high = Math.floor(Math.random() * 15 * multiplier);
        const medium = Math.floor(Math.random() * 30 * multiplier);
        
        // Higher vulnerability counts lower the score
        let score = 100;
        score -= critical * 15; // Critical vulnerabilities heavily impact score
        score -= high * 3;      // High vulnerabilities moderately impact score
        score -= medium * 1;    // Medium vulnerabilities slightly impact score
        
        return Math.max(20, Math.min(100, score));
    }
    
    calculateComplianceScore() {
        // Average compliance across frameworks
        return Math.floor(Math.random() * 25) + 70;
    }
    
    calculateConfigurationScore() {
        // Configuration security score
        return Math.floor(Math.random() * 30) + 65;
    }
    
    calculateIncidentScore(multiplier) {
        const openIncidents = Math.floor(Math.random() * 5 * multiplier);
        return Math.max(60, 100 - (openIncidents * 10));
    }
    
    async getVulnerabilityData(multiplier) {
        const critical = Math.floor(Math.random() * 5 * multiplier);
        const high = Math.floor(Math.random() * 15 * multiplier);
        const medium = Math.floor(Math.random() * 30 * multiplier);
        const low = Math.floor(Math.random() * 50 * multiplier);
        
        return {
            critical,
            high,
            medium,
            low,
            total: critical + high + medium + low,
            trending: {
                critical: Math.floor(Math.random() * 6) - 3, // -3 to +3
                high: Math.floor(Math.random() * 10) - 5,
                medium: Math.floor(Math.random() * 20) - 10,
                low: Math.floor(Math.random() * 30) - 15
            },
            cisaKev: Math.floor(Math.random() * Math.min(critical + high, 10)), // CISA KEV vulnerabilities
            categories: this.generateVulnerabilityCategories(critical, high, medium, low)
        };
    }
    
    generateVulnerabilityCategories(critical, high, medium, low) {
        const categories = [
            { name: 'Remote Code Execution', count: Math.floor((critical + high) * 0.3) },
            { name: 'Privilege Escalation', count: Math.floor((critical + high) * 0.25) },
            { name: 'SQL Injection', count: Math.floor((high + medium) * 0.2) },
            { name: 'Cross-Site Scripting', count: Math.floor((medium + low) * 0.15) },
            { name: 'Authentication Bypass', count: Math.floor((critical + high) * 0.1) },
            { name: 'Information Disclosure', count: Math.floor((medium + low) * 0.3) },
            { name: 'Denial of Service', count: Math.floor((medium + low) * 0.2) }
        ];
        
        return categories.filter(cat => cat.count > 0);
    }
    
    async getComplianceData() {
        const frameworks = [
            { 
                name: 'CIS Controls v8', 
                id: 'cis-v8',
                score: Math.floor(Math.random() * 20) + 75, 
                total: 20,
                description: 'Center for Internet Security Controls',
                category: 'Security Framework'
            },
            { 
                name: 'NIST Cybersecurity Framework', 
                id: 'nist-csf',
                score: Math.floor(Math.random() * 25) + 70, 
                total: 23,
                description: 'NIST Cybersecurity Framework 2.0',
                category: 'Security Framework'
            },
            { 
                name: 'ISO 27001:2022', 
                id: 'iso-27001',
                score: Math.floor(Math.random() * 15) + 80, 
                total: 114,
                description: 'Information Security Management',
                category: 'International Standard'
            },
            { 
                name: 'SOC 2 Type II', 
                id: 'soc2',
                score: Math.floor(Math.random() * 20) + 75, 
                total: 64,
                description: 'Service Organization Control 2',
                category: 'Audit Standard'
            },
            { 
                name: 'GDPR', 
                id: 'gdpr',
                score: Math.floor(Math.random() * 15) + 85, 
                total: 99,
                description: 'General Data Protection Regulation',
                category: 'Privacy Regulation'
            },
            { 
                name: 'HIPAA', 
                id: 'hipaa',
                score: Math.floor(Math.random() * 18) + 78, 
                total: 164,
                description: 'Health Insurance Portability and Accountability Act',
                category: 'Healthcare Regulation'
            },
            { 
                name: 'PCI DSS', 
                id: 'pci-dss',
                score: Math.floor(Math.random() * 22) + 73, 
                total: 12,
                description: 'Payment Card Industry Data Security Standard',
                category: 'Industry Standard'
            }
        ];
        
        // Filter frameworks based on organization type
        let applicableFrameworks = frameworks;
        if (this.organization.type === 'individual') {
            applicableFrameworks = frameworks.filter(f => ['cis-v8', 'nist-csf', 'gdpr'].includes(f.id));
        }
        
        return {
            frameworks: applicableFrameworks,
            overallScore: Math.floor(applicableFrameworks.reduce((sum, f) => sum + (f.score / f.total * 100), 0) / applicableFrameworks.length),
            trending: Math.floor(Math.random() * 10) - 5 // -5 to +5 percentage points
        };
    }
    
    async getLicenseComplianceData(multiplier) {
        const softwareProducts = [
            { name: 'Microsoft Office 365', category: 'Productivity', riskLevel: 'High' },
            { name: 'Adobe Creative Suite', category: 'Design', riskLevel: 'High' },
            { name: 'Autodesk AutoCAD', category: 'Engineering', riskLevel: 'High' },
            { name: 'Oracle Database', category: 'Database', riskLevel: 'Critical' },
            { name: 'VMware vSphere', category: 'Virtualization', riskLevel: 'High' },
            { name: 'Salesforce CRM', category: 'CRM', riskLevel: 'Medium' },
            { name: 'Slack Business', category: 'Communication', riskLevel: 'Low' },
            { name: 'Zoom Pro', category: 'Communication', riskLevel: 'Low' },
            { name: 'Dropbox Business', category: 'Storage', riskLevel: 'Medium' },
            { name: 'Norton Antivirus', category: 'Security', riskLevel: 'Medium' },
            { name: 'Splunk Enterprise', category: 'Analytics', riskLevel: 'High' },
            { name: 'Jira Software', category: 'Development', riskLevel: 'Low' }
        ];
        
        const licenses = [];
        const numProducts = Math.min(Math.floor(Math.random() * 8) + 3, softwareProducts.length);
        
        for (let i = 0; i < numProducts; i++) {
            const product = softwareProducts[i];
            const installed = Math.floor(Math.random() * 50 * multiplier) + 1;
            const licensed = Math.floor(installed * (0.8 + Math.random() * 0.4));
            const status = installed > licensed ? 'violation' : 
                          installed > licensed * 0.9 ? 'warning' : 'compliant';
            
            licenses.push({
                product: product.name,
                category: product.category,
                installed,
                licensed,
                status,
                risk: installed > licensed ? product.riskLevel : 'Low',
                potentialFine: installed > licensed ? this.calculateLicenseFine(product.name, installed - licensed) : 0,
                lastAudit: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000) // Within 90 days
            });
        }
        
        return {
            licenses,
            summary: {
                total: licenses.length,
                violations: licenses.filter(l => l.status === 'violation').length,
                warnings: licenses.filter(l => l.status === 'warning').length,
                compliant: licenses.filter(l => l.status === 'compliant').length,
                totalPotentialFines: licenses.reduce((sum, l) => sum + l.potentialFine, 0)
            }
        };
    }
    
    calculateLicenseFine(productName, overageCount) {
        const fineRates = {
            'Microsoft Office 365': 150,
            'Adobe Creative Suite': 600,
            'Oracle Database': 15000,
            'VMware vSphere': 3000,
            'Autodesk AutoCAD': 2000
        };
        
        const rate = fineRates[productName] || 100;
        return overageCount * rate;
    }
    
    async getMitreData(multiplier) {
        const tactics = [
            { id: 'TA0001', name: 'Initial Access', techniques: [] },
            { id: 'TA0002', name: 'Execution', techniques: [] },
            { id: 'TA0003', name: 'Persistence', techniques: [] },
            { id: 'TA0004', name: 'Privilege Escalation', techniques: [] },
            { id: 'TA0005', name: 'Defense Evasion', techniques: [] },
            { id: 'TA0006', name: 'Credential Access', techniques: [] },
            { id: 'TA0007', name: 'Discovery', techniques: [] },
            { id: 'TA0008', name: 'Lateral Movement', techniques: [] },
            { id: 'TA0009', name: 'Collection', techniques: [] },
            { id: 'TA0011', name: 'Command and Control', techniques: [] },
            { id: 'TA0010', name: 'Exfiltration', techniques: [] },
            { id: 'TA0040', name: 'Impact', techniques: [] }
        ];
        
        const detectedTactics = [];
        const numTactics = Math.min(Math.floor(Math.random() * 8) + 2, tactics.length);
        
        for (let i = 0; i < numTactics; i++) {
            const tactic = tactics[Math.floor(Math.random() * tactics.length)];
            if (!detectedTactics.find(t => t.id === tactic.id)) {
                const techniques = Math.floor(Math.random() * 5) + 1;
                const severity = ['Low', 'Medium', 'High', 'Critical'][Math.floor(Math.random() * 4)];
                
                detectedTactics.push({
                    ...tactic,
                    techniques,
                    severity,
                    detectionCount: Math.floor(Math.random() * 20 * multiplier) + 1,
                    lastDetected: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
                });
            }
        }
        
        return {
            tactics: detectedTactics,
            totalTechniques: detectedTactics.reduce((sum, t) => sum + t.techniques, 0),
            coveragePercentage: Math.round((detectedTactics.length / tactics.length) * 100)
        };
    }
    
    async getIncidentData(multiplier) {
        return {
            resolved: Math.floor(Math.random() * 20 * multiplier) + 5,
            open: Math.floor(Math.random() * 5 * multiplier),
            critical: Math.floor(Math.random() * 2 * multiplier),
            avgResolutionTime: Math.floor(Math.random() * 24) + 2, // Hours
            mttr: Math.floor(Math.random() * 8) + 4, // Mean time to resolution in hours
            categories: [
                { name: 'Malware', count: Math.floor(Math.random() * 10 * multiplier) },
                { name: 'Phishing', count: Math.floor(Math.random() * 15 * multiplier) },
                { name: 'Data Breach', count: Math.floor(Math.random() * 3 * multiplier) },
                { name: 'Insider Threat', count: Math.floor(Math.random() * 2 * multiplier) },
                { name: 'DDoS', count: Math.floor(Math.random() * 5 * multiplier) }
            ].filter(cat => cat.count > 0)
        };
    }
    
    async getConfigurationRisks(multiplier) {
        const allRisks = [
            {
                title: 'RDP Ports Open to Internet',
                description: 'Remote Desktop Protocol (RDP) ports 3389 are exposed to the internet, creating high-risk attack vectors.',
                severity: 'Critical',
                category: 'Network Security',
                cvssScore: 9.8,
                devices: Math.floor(Math.random() * 3 * multiplier) + 1,
                recommendation: 'Close RDP ports or implement VPN access with multi-factor authentication.',
                estimatedCost: 2500,
                timeline: '24 hours'
            },
            {
                title: 'Outdated SSL/TLS Configurations',
                description: 'Web servers are using deprecated SSL/TLS versions that are vulnerable to attacks.',
                severity: 'High',
                category: 'Web Security',
                cvssScore: 7.5,
                devices: Math.floor(Math.random() * 5 * multiplier) + 2,
                recommendation: 'Update to TLS 1.2 or higher and disable legacy protocols.',
                estimatedCost: 1500,
                timeline: '48 hours'
            },
            {
                title: 'Default Administrative Accounts',
                description: 'Systems are using default administrator accounts with weak or default passwords.',
                severity: 'High',
                category: 'Access Control',
                cvssScore: 8.1,
                devices: Math.floor(Math.random() * 4 * multiplier) + 1,
                recommendation: 'Change default passwords and implement strong password policies.',
                estimatedCost: 500,
                timeline: '4 hours'
            },
            {
                title: 'Unnecessary Services Running',
                description: 'Systems have unnecessary services running that increase attack surface.',
                severity: 'Medium',
                category: 'System Hardening',
                cvssScore: 5.3,
                devices: Math.floor(Math.random() * 8 * multiplier) + 3,
                recommendation: 'Disable unnecessary services and implement service hardening.',
                estimatedCost: 1000,
                timeline: '1 week'
            },
            {
                title: 'Weak Firewall Configurations',
                description: 'Firewall rules are too permissive and allow unnecessary network access.',
                severity: 'Medium',
                category: 'Network Security',
                cvssScore: 6.1,
                devices: Math.floor(Math.random() * 6 * multiplier) + 2,
                recommendation: 'Implement least-privilege firewall rules and network segmentation.',
                estimatedCost: 3000,
                timeline: '2 weeks'
            },
            {
                title: 'Unencrypted Data Storage',
                description: 'Sensitive data is stored without encryption on local systems.',
                severity: 'High',
                category: 'Data Protection',
                cvssScore: 7.8,
                devices: Math.floor(Math.random() * 3 * multiplier) + 1,
                recommendation: 'Implement full disk encryption and encrypt sensitive data at rest.',
                estimatedCost: 2000,
                timeline: '1 week'
            }
        ];
        
        // Return random subset of risks
        const numRisks = Math.floor(Math.random() * 4) + 2;
        return allRisks.slice(0, numRisks).filter(risk => risk.devices > 0);
    }
    
    async generateActionableItems(multiplier) {
        const vulnerabilities = await this.getVulnerabilityData(multiplier);
        const licenses = await this.getLicenseComplianceData(multiplier);
        const configs = await this.getConfigurationRisks(multiplier);
        
        const items = [];
        
        // Critical vulnerability items
        if (vulnerabilities.critical > 0) {
            items.push({
                priority: 'Critical',
                title: 'Patch Critical Vulnerabilities',
                description: `${vulnerabilities.critical} critical vulnerabilities require immediate patching`,
                action: 'Deploy security patches within 24 hours',
                timeframe: '24 hours',
                impact: 'Prevents potential system compromise',
                cost: vulnerabilities.critical * 500,
                assignee: 'IT Security Team'
            });
        }
        
        // License violation items
        const violations = licenses.summary.violations;
        if (violations > 0) {
            items.push({
                priority: 'High',
                title: 'Address License Violations',
                description: `${violations} software license violations detected that could result in legal action`,
                action: 'Purchase additional licenses or remove unauthorized software',
                timeframe: '1 week',
                impact: 'Avoids potential legal penalties',
                cost: licenses.summary.totalPotentialFines * 0.1, // 10% of potential fines as remedy cost
                assignee: 'Procurement Team'
            });
        }
        
        // Configuration risk items
        const criticalConfigs = configs.filter(c => c.severity === 'Critical');
        if (criticalConfigs.length > 0) {
            criticalConfigs.forEach(config => {
                items.push({
                    priority: 'High',
                    title: `Resolve ${config.title}`,
                    description: config.description,
                    action: config.recommendation,
                    timeframe: config.timeline,
                    impact: 'Reduces attack surface significantly',
                    cost: config.estimatedCost,
                    assignee: 'Infrastructure Team'
                });
            });
        }
        
        // General improvement items
        items.push(
            {
                priority: 'Medium',
                title: 'Update Security Policies',
                description: 'Security policies are outdated and need review for compliance',
                action: 'Review and update security policies',
                timeframe: '2 weeks',
                impact: 'Improves compliance posture',
                cost: 5000,
                assignee: 'Security Officer'
            },
            {
                priority: 'Medium',
                title: 'Implement User Training',
                description: 'Security awareness training needed to reduce human risk factors',
                action: 'Schedule security awareness training for all users',
                timeframe: '1 month',
                impact: 'Reduces phishing and social engineering risks',
                cost: 2000,
                assignee: 'HR Department'
            }
        );
        
        return items.slice(0, 6); // Return top 6 items
    }
    
    async getThreatLandscapeData(multiplier) {
        return {
            timeline: this.generateThreatTimelineData(30),
            geolocation: this.generateGeolocationData(multiplier),
            attackVectors: this.generateAttackVectorData(multiplier),
            threatActors: this.generateThreatActorData(multiplier)
        };
    }
    
    generateThreatTimelineData(days) {
        const data = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            data.push({
                date: date.toISOString().split('T')[0],
                threats: Math.floor(Math.random() * 20) + 5,
                mitigated: Math.floor(Math.random() * 15) + 3,
                blocked: Math.floor(Math.random() * 50) + 10
            });
        }
        return data;
    }
    
    generateGeolocationData(multiplier) {
        const countries = [
            { name: 'China', threats: Math.floor(Math.random() * 100 * multiplier) + 50 },
            { name: 'Russia', threats: Math.floor(Math.random() * 80 * multiplier) + 30 },
            { name: 'North Korea', threats: Math.floor(Math.random() * 40 * multiplier) + 20 },
            { name: 'Iran', threats: Math.floor(Math.random() * 30 * multiplier) + 15 },
            { name: 'United States', threats: Math.floor(Math.random() * 25 * multiplier) + 10 },
            { name: 'Brazil', threats: Math.floor(Math.random() * 20 * multiplier) + 8 },
            { name: 'India', threats: Math.floor(Math.random() * 15 * multiplier) + 5 }
        ];
        
        return countries.sort((a, b) => b.threats - a.threats);
    }
    
    generateAttackVectorData(multiplier) {
        return [
            { name: 'Email Phishing', count: Math.floor(Math.random() * 50 * multiplier) + 20, percentage: 35 },
            { name: 'Malicious Downloads', count: Math.floor(Math.random() * 30 * multiplier) + 15, percentage: 25 },
            { name: 'Web Exploitation', count: Math.floor(Math.random() * 20 * multiplier) + 10, percentage: 20 },
            { name: 'Network Intrusion', count: Math.floor(Math.random() * 15 * multiplier) + 8, percentage: 12 },
            { name: 'Insider Threats', count: Math.floor(Math.random() * 10 * multiplier) + 3, percentage: 5 },
            { name: 'Physical Access', count: Math.floor(Math.random() * 5 * multiplier) + 1, percentage: 3 }
        ];
    }
    
    generateThreatActorData(multiplier) {
        const actors = [
            { name: 'APT28 (Fancy Bear)', attribution: 'Russian GRU', activity: 'High' },
            { name: 'Lazarus Group', attribution: 'North Korea', activity: 'Medium' },
            { name: 'APT40 (Leviathan)', attribution: 'Chinese MSS', activity: 'High' },
            { name: 'Carbanak', attribution: 'Financial Crime', activity: 'Low' },
            { name: 'Cozy Bear (APT29)', attribution: 'Russian SVR', activity: 'Medium' }
        ];
        
        return actors.map(actor => ({
            ...actor,
            detectionCount: Math.floor(Math.random() * 10 * multiplier) + 1,
            lastSeen: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
        })).filter(actor => actor.detectionCount > 0);
    }
    
    async calculateRiskScore() {
        // Complex risk calculation based on multiple factors
        const weights = {
            vulnerabilities: 0.4,
            compliance: 0.2,
            configuration: 0.2,
            incidents: 0.1,
            threats: 0.1
        };
        
        return {
            overall: Math.floor(Math.random() * 40) + 60, // 60-100
            breakdown: {
                vulnerabilities: Math.floor(Math.random() * 30) + 70,
                compliance: Math.floor(Math.random() * 25) + 75,
                configuration: Math.floor(Math.random() * 35) + 65,
                incidents: Math.floor(Math.random() * 20) + 80,
                threats: Math.floor(Math.random() * 30) + 70
            }
        };
    }
    
    async getBenchmarkData() {
        const industryType = this.organization.industry || 'Technology';
        
        return {
            industry: industryType,
            peerComparison: {
                securityPosture: {
                    you: this.reportData?.securityPosture?.overallScore || 82,
                    industry: Math.floor(Math.random() * 20) + 70,
                    topQuartile: Math.floor(Math.random() * 15) + 85
                },
                incidentResponse: {
                    you: this.reportData?.incidents?.mttr || 6,
                    industry: Math.floor(Math.random() * 8) + 8,
                    topQuartile: Math.floor(Math.random() * 4) + 2
                },
                vulnerabilities: {
                    you: this.reportData?.vulnerabilities?.critical || 3,
                    industry: Math.floor(Math.random() * 10) + 5,
                    topQuartile: Math.floor(Math.random() * 3) + 1
                }
            }
        };
    }
    
    // UI Update Methods
    updateSecurityMetrics() {
        const data = this.reportData;
        
        // Update security posture score
        const scoreElement = document.getElementById('securityPostureScore');
        if (scoreElement) {
            scoreElement.textContent = data.securityPosture.overallScore;
            scoreElement.className = `posture-score ${this.getPostureClass(data.securityPosture.overallScore)}`;
            
            // Update progress bar
            const progressBar = scoreElement.parentElement.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = `${data.securityPosture.overallScore}%`;
                progressBar.className = `progress-bar ${this.getProgressBarClass(data.securityPosture.overallScore)}`;
            }
        }
        
        // Update metric cards
        this.updateElement('criticalVulns', data.vulnerabilities.critical);
        this.updateElement('licenseViolations', data.licenseCompliance.summary.violations);
        this.updateElement('mitreTTPs', data.mitreTTPs.tactics.length);
        this.updateElement('incidentsResolved', data.incidents.resolved);
    }
    
    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }
    
    updateComplianceOverview() {
        const container = document.getElementById('complianceOverview');
        if (!container || !this.reportData.compliance) return;
        
        const frameworks = this.reportData.compliance.frameworks;
        
        container.innerHTML = frameworks.map(framework => {
            const percentage = Math.round((framework.score / framework.total) * 100);
            const statusClass = percentage >= 90 ? 'success' : percentage >= 75 ? 'warning' : 'danger';
            
            return `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="text-center">
                        <div class="compliance-gauge mx-auto mb-2">
                            <div class="progress progress-sm">
                                <div class="progress-bar bg-${statusClass}" style="width: ${percentage}%" role="progressbar"></div>
                            </div>
                        </div>
                        <h4 class="card-title text-${statusClass}">${percentage}%</h4>
                        <div class="text-muted">${framework.name}</div>
                        <div class="small text-muted">${framework.score}/${framework.total} controls</div>
                        <div class="mt-1">
                            <span class="badge badge-outline-${statusClass}">${framework.category}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    updateLicenseCompliance() {
        const container = document.getElementById('licenseComplianceDetails');
        if (!container || !this.reportData.licenseCompliance) return;
        
        const licenses = this.reportData.licenseCompliance.licenses;
        const summary = this.reportData.licenseCompliance.summary;
        
        const summaryHtml = `
            <div class="row mb-3">
                <div class="col-md-3">
                    <div class="text-center">
                        <div class="h3 text-success">${summary.compliant}</div>
                        <div class="text-muted small">Compliant</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="text-center">
                        <div class="h3 text-warning">${summary.warnings}</div>
                        <div class="text-muted small">Warnings</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="text-center">
                        <div class="h3 text-danger">${summary.violations}</div>
                        <div class="text-muted small">Violations</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="text-center">
                        <div class="h3 text-info">$${summary.totalPotentialFines.toLocaleString()}</div>
                        <div class="text-muted small">Potential Fines</div>
                    </div>
                </div>
            </div>
        `;
        
        const licensesHtml = licenses.map(license => {
            const statusClass = license.status === 'violation' ? 'danger' : 
                               license.status === 'warning' ? 'warning' : 'success';
            const statusText = license.status === 'violation' ? 'VIOLATION' : 
                              license.status === 'warning' ? 'WARNING' : 'COMPLIANT';
            
            return `
                <div class="d-flex justify-content-between align-items-center mb-2 p-3 border rounded">
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <strong>${license.product}</strong>
                                <div class="text-muted small">${license.category}</div>
                            </div>
                            <span class="badge bg-${statusClass}">${statusText}</span>
                        </div>
                        <div class="text-muted small mt-1">
                            ${license.installed} installed / ${license.licensed} licensed
                            ${license.potentialFine > 0 ? ` • Potential fine: $${license.potentialFine.toLocaleString()}` : ''}
                        </div>
                        <div class="text-muted small">
                            Risk: ${license.risk} • Last audit: ${license.lastAudit.toLocaleDateString()}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = summaryHtml + licensesHtml;
    }
    
    updateConfigurationRisks() {
        const container = document.getElementById('configurationRisks');
        if (!container || !this.reportData.configurationRisks) return;
        
        const risks = this.reportData.configurationRisks;
        
        container.innerHTML = risks.map(risk => {
            const severityClass = risk.severity.toLowerCase() === 'critical' ? 'danger' : 
                                 risk.severity.toLowerCase() === 'high' ? 'warning' : 'info';
            
            return `
                <div class="security-finding risk-level-${risk.severity.toLowerCase()} mb-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="mb-0">${risk.title}</h5>
                        <div class="text-end">
                            <span class="badge bg-${severityClass}">${risk.severity}</span>
                            <div class="small text-muted">CVSS: ${risk.cvssScore}</div>
                        </div>
                    </div>
                    <p class="text-muted mb-2">${risk.description}</p>
                    <div class="small">
                        <strong>Category:</strong> ${risk.category}<br>
                        <strong>Affected Devices:</strong> ${risk.devices}<br>
                        <strong>Estimated Cost:</strong> $${risk.estimatedCost.toLocaleString()}<br>
                        <strong>Timeline:</strong> ${risk.timeline}<br>
                        <strong>Recommendation:</strong> ${risk.recommendation}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    updateThreatLandscape() {
        if (!this.reportData.threatLandscape) return;
        
        // Update threat analysis chart with latest data
        if (this.charts.threatAnalysis) {
            const timeline = this.reportData.threatLandscape.timeline;
            this.charts.threatAnalysis.data.labels = timeline.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            this.charts.threatAnalysis.data.datasets[0].data = timeline.map(d => d.threats);
            this.charts.threatAnalysis.data.datasets[1].data = timeline.map(d => d.mitigated);
            this.charts.threatAnalysis.update();
        }
    }
    
    updateActionableItems() {
        const container = document.getElementById('actionableItems');
        if (!container || !this.reportData.actionableItems) return;
        
        const items = this.reportData.actionableItems;
        
        container.innerHTML = items.map(item => {
            const priorityClass = item.priority.toLowerCase() === 'critical' ? 'danger' : 
                                 item.priority.toLowerCase() === 'high' ? 'warning' : 'info';
            
            return `
                <div class="actionable-item mb-3">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h6 class="mb-0">${item.title}</h6>
                        <span class="badge bg-${priorityClass}">${item.priority}</span>
                    </div>
                    <p class="text-muted small mb-2">${item.description}</p>
                    <div class="small">
                        <strong>Action:</strong> ${item.action}<br>
                        <strong>Timeframe:</strong> ${item.timeframe}<br>
                        <strong>Impact:</strong> ${item.impact}<br>
                        <strong>Estimated Cost:</strong> $${item.cost?.toLocaleString() || 'N/A'}<br>
                        <strong>Assignee:</strong> ${item.assignee}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    updateLastUpdated() {
        const lastUpdated = this.formatTimeAgo(this.reportData.securityPosture.lastUpdated);
        const element = document.getElementById('postureLastUpdated');
        if (element) {
            element.textContent = lastUpdated;
        }
    }
    
    // Utility Methods
    formatTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        return date.toLocaleDateString();
    }
    
    getPostureClass(score) {
        if (score >= 90) return 'posture-excellent';
        if (score >= 75) return 'posture-good';
        if (score >= 60) return 'posture-fair';
        return 'posture-poor';
    }
    
    getProgressBarClass(score) {
        if (score >= 90) return 'bg-success';
        if (score >= 75) return 'bg-success';
        if (score >= 60) return 'bg-warning';
        return 'bg-danger';
    }
    
    // Chart Management
    initializeCharts() {
        this.initThreatAnalysisChart();
        this.initComplianceTrendChart();
        this.initVulnerabilityBreakdownChart();
    }
    
    initThreatAnalysisChart() {
        const ctx = document.getElementById('threatAnalysisChart');
        if (!ctx) return;
        
        this.charts.threatAnalysis = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.generateTimeLabels(),
                datasets: [{
                    label: 'Threats Detected',
                    data: this.generateThreatTimelineData(),
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    tension: 0.4,
                    fill: true
                }, {
                    label: 'Threats Mitigated',
                    data: this.generateMitigationTimelineData(),
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            afterLabel: function(context) {
                                const dataIndex = context.dataIndex;
                                const blocked = Math.floor(Math.random() * 50) + 10;
                                return `Blocked: ${blocked}`;
                            }
                        }
                    }
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
                        display: true,
                        title: {
                            display: true,
                            text: 'Count'
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }
    
    initComplianceTrendChart() {
        // Additional chart implementations can be added here
    }
    
    initVulnerabilityBreakdownChart() {
        // Additional chart implementations can be added here
    }
    
    generateTimeLabels() {
        const labels = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }
        return labels;
    }
    
    generateThreatTimelineData() {
        return Array.from({ length: 30 }, () => Math.floor(Math.random() * 20) + 5);
    }
    
    generateMitigationTimelineData() {
        return Array.from({ length: 30 }, () => Math.floor(Math.random() * 15) + 3);
    }
    
    // Compliance Framework Management
    initializeComplianceFrameworks() {
        this.complianceFrameworks = {
            'cis-v8': {
                name: 'CIS Controls v8',
                categories: [
                    'Inventory and Control of Enterprise Assets',
                    'Inventory and Control of Software Assets',
                    'Data Protection',
                    'Secure Configuration of Enterprise Assets and Software',
                    'Account Management',
                    'Access Control Management'
                ]
            },
            'nist-csf': {
                name: 'NIST Cybersecurity Framework',
                categories: [
                    'Identify', 'Protect', 'Detect', 'Respond', 'Recover'
                ]
            },
            'iso-27001': {
                name: 'ISO 27001:2022',
                categories: [
                    'Information Security Policies',
                    'Organization of Information Security',
                    'Human Resource Security',
                    'Asset Management',
                    'Access Control'
                ]
            }
        };
    }
    
    // MITRE ATT&CK Framework
    initializeMitreMatrix() {
        this.mitreMatrix = {
            tactics: [
                { id: 'TA0001', name: 'Initial Access', color: '#ff6b6b' },
                { id: 'TA0002', name: 'Execution', color: '#4ecdc4' },
                { id: 'TA0003', name: 'Persistence', color: '#45b7d1' },
                { id: 'TA0004', name: 'Privilege Escalation', color: '#96ceb4' },
                { id: 'TA0005', name: 'Defense Evasion', color: '#ffeaa7' },
                { id: 'TA0006', name: 'Credential Access', color: '#dda0dd' },
                { id: 'TA0007', name: 'Discovery', color: '#98d8c8' },
                { id: 'TA0008', name: 'Lateral Movement', color: '#f7dc6f' },
                { id: 'TA0009', name: 'Collection', color: '#bb8fce' },
                { id: 'TA0011', name: 'Command and Control', color: '#85c1e9' },
                { id: 'TA0010', name: 'Exfiltration', color: '#f8c471' },
                { id: 'TA0040', name: 'Impact', color: '#ec7063' }
            ]
        };
    }
    
    // Error Handling
    showError(message) {
        console.error(message);
        
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'toast show position-fixed top-0 end-0 m-3';
        toast.style.zIndex = '9999';
        toast.innerHTML = `
            <div class="toast-header bg-danger text-white">
                <strong class="me-auto">Error</strong>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }
    
    // Auto-refresh
    setupAutoRefresh() {
        // Refresh data every 5 minutes
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.loadReportData();
            }
        }, this.cacheExpiry);
    }
    
    // Public API Methods
    async refreshData() {
        this.lastDataFetch = null; // Force refresh
        await this.loadReportData();
    }
    
    async updateOrgFilter(orgId) {
        this.currentOrg = orgId;
        await this.refreshData();
    }
    
    async exportReport(format, reportType, options = {}) {
        try {
            const reportData = {
                type: reportType,
                generated: new Date().toISOString(),
                organization: this.currentOrg,
                data: this.reportData,
                options
            };
            
            switch(format) {
                case 'json':
                    this.downloadJSON(reportData, `security-report-${reportType}-${Date.now()}.json`);
                    break;
                case 'csv':
                    this.downloadCSV(reportData, `security-report-${reportType}-${Date.now()}.csv`);
                    break;
                case 'pdf':
                    // PDF generation would be handled by a service
                    this.generatePDFReport(reportData);
                    break;
                default:
                    throw new Error(`Unsupported format: ${format}`);
            }
        } catch (error) {
            console.error('Export failed:', error);
            this.showError(`Failed to export report: ${error.message}`);
        }
    }
    
    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    downloadCSV(data, filename) {
        // Convert key metrics to CSV format
        const csvData = this.convertToCSV(data);
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    convertToCSV(data) {
        // Simple CSV conversion for key metrics
        const lines = [
            ['Metric', 'Value', 'Category'],
            ['Security Posture Score', data.data.securityPosture.overallScore, 'Overall'],
            ['Critical Vulnerabilities', data.data.vulnerabilities.critical, 'Vulnerabilities'],
            ['High Vulnerabilities', data.data.vulnerabilities.high, 'Vulnerabilities'],
            ['License Violations', data.data.licenseCompliance.summary.violations, 'Compliance'],
            ['Open Incidents', data.data.incidents.open, 'Incidents'],
            ['MITRE TTPs Detected', data.data.mitreTTPs.tactics.length, 'Threats']
        ];
        
        return lines.map(line => line.map(field => `"${field}"`).join(',')).join('\n');
    }
    
    generatePDFReport(data) {
        // This would typically call a backend service to generate PDF
        this.showError('PDF generation requires backend service integration');
    }
}

// Export for use
window.SecurityReportsManager = SecurityReportsManager;
