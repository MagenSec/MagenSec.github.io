/**
 * MSCC MITRE ATT&CK Integration Module
 * Threat landscape analysis using MITRE ATT&CK framework
 */

class MitreAttackManager {
    constructor() {
        this.tactics = new Map();
        this.techniques = new Map();
        this.procedures = new Map();
        this.threatGroups = new Map();
        this.detectionRules = new Map();
        this.initializeFramework();
    }
    
    initializeFramework() {
        // Initialize MITRE ATT&CK tactics
        this.initializeTactics();
        this.initializeTechniques();
        this.initializeThreatGroups();
        this.initializeDetectionRules();
    }
    
    initializeTactics() {
        const tactics = [
            {
                id: 'TA0001',
                name: 'Initial Access',
                description: 'The adversary is trying to get into your network',
                color: '#ff6b6b'
            },
            {
                id: 'TA0002', 
                name: 'Execution',
                description: 'The adversary is trying to run malicious code',
                color: '#4ecdc4'
            },
            {
                id: 'TA0003',
                name: 'Persistence',
                description: 'The adversary is trying to maintain their foothold',
                color: '#45b7d1'
            },
            {
                id: 'TA0004',
                name: 'Privilege Escalation',
                description: 'The adversary is trying to gain higher-level permissions',
                color: '#96ceb4'
            },
            {
                id: 'TA0005',
                name: 'Defense Evasion',
                description: 'The adversary is trying to avoid being detected',
                color: '#ffeaa7'
            },
            {
                id: 'TA0006',
                name: 'Credential Access',
                description: 'The adversary is trying to steal account names and passwords',
                color: '#dda0dd'
            },
            {
                id: 'TA0007',
                name: 'Discovery',
                description: 'The adversary is trying to figure out your environment',
                color: '#98d8c8'
            },
            {
                id: 'TA0008',
                name: 'Lateral Movement',
                description: 'The adversary is trying to move through your environment',
                color: '#f7dc6f'
            },
            {
                id: 'TA0009',
                name: 'Collection',
                description: 'The adversary is trying to gather data of interest',
                color: '#bb8fce'
            },
            {
                id: 'TA0011',
                name: 'Command and Control',
                description: 'The adversary is trying to communicate with compromised systems',
                color: '#85c1e9'
            },
            {
                id: 'TA0010',
                name: 'Exfiltration',
                description: 'The adversary is trying to steal data',
                color: '#f8c471'
            },
            {
                id: 'TA0040',
                name: 'Impact',
                description: 'The adversary is trying to manipulate, interrupt, or destroy systems and data',
                color: '#ec7063'
            }
        ];
        
        tactics.forEach(tactic => this.tactics.set(tactic.id, tactic));
    }
    
    initializeTechniques() {
        // Key techniques for each tactic (simplified set for demonstration)
        const techniques = [
            // Initial Access
            { id: 'T1566', name: 'Phishing', tactic: 'TA0001', severity: 'High', detectable: true },
            { id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'TA0001', severity: 'High', detectable: true },
            { id: 'T1133', name: 'External Remote Services', tactic: 'TA0001', severity: 'Medium', detectable: true },
            { id: 'T1078', name: 'Valid Accounts', tactic: 'TA0001', severity: 'Medium', detectable: false },
            
            // Execution
            { id: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'TA0002', severity: 'High', detectable: true },
            { id: 'T1053', name: 'Scheduled Task/Job', tactic: 'TA0002', severity: 'Medium', detectable: true },
            { id: 'T1204', name: 'User Execution', tactic: 'TA0002', severity: 'Medium', detectable: false },
            
            // Persistence
            { id: 'T1547', name: 'Boot or Logon Autostart Execution', tactic: 'TA0003', severity: 'High', detectable: true },
            { id: 'T1136', name: 'Create Account', tactic: 'TA0003', severity: 'High', detectable: true },
            { id: 'T1543', name: 'Create or Modify System Process', tactic: 'TA0003', severity: 'High', detectable: true },
            
            // Privilege Escalation
            { id: 'T1068', name: 'Exploitation for Privilege Escalation', tactic: 'TA0004', severity: 'High', detectable: true },
            { id: 'T1134', name: 'Access Token Manipulation', tactic: 'TA0004', severity: 'Medium', detectable: true },
            { id: 'T1055', name: 'Process Injection', tactic: 'TA0004', severity: 'High', detectable: true },
            
            // Defense Evasion
            { id: 'T1027', name: 'Obfuscated Files or Information', tactic: 'TA0005', severity: 'Medium', detectable: false },
            { id: 'T1070', name: 'Indicator Removal on Host', tactic: 'TA0005', severity: 'Medium', detectable: true },
            { id: 'T1218', name: 'Signed Binary Proxy Execution', tactic: 'TA0005', severity: 'Medium', detectable: true },
            
            // Credential Access
            { id: 'T1110', name: 'Brute Force', tactic: 'TA0006', severity: 'High', detectable: true },
            { id: 'T1003', name: 'OS Credential Dumping', tactic: 'TA0006', severity: 'High', detectable: true },
            { id: 'T1552', name: 'Unsecured Credentials', tactic: 'TA0006', severity: 'Medium', detectable: true },
            
            // Discovery
            { id: 'T1083', name: 'File and Directory Discovery', tactic: 'TA0007', severity: 'Low', detectable: true },
            { id: 'T1057', name: 'Process Discovery', tactic: 'TA0007', severity: 'Low', detectable: true },
            { id: 'T1018', name: 'Remote System Discovery', tactic: 'TA0007', severity: 'Medium', detectable: true },
            
            // Lateral Movement
            { id: 'T1021', name: 'Remote Services', tactic: 'TA0008', severity: 'High', detectable: true },
            { id: 'T1563', name: 'Remote Service Session Hijacking', tactic: 'TA0008', severity: 'High', detectable: true },
            { id: 'T1550', name: 'Use Alternate Authentication Material', tactic: 'TA0008', severity: 'Medium', detectable: true },
            
            // Collection
            { id: 'T1005', name: 'Data from Local System', tactic: 'TA0009', severity: 'Medium', detectable: true },
            { id: 'T1039', name: 'Data from Network Shared Drive', tactic: 'TA0009', severity: 'Medium', detectable: true },
            { id: 'T1113', name: 'Screen Capture', tactic: 'TA0009', severity: 'Medium', detectable: true },
            
            // Command and Control
            { id: 'T1071', name: 'Application Layer Protocol', tactic: 'TA0011', severity: 'Medium', detectable: true },
            { id: 'T1572', name: 'Protocol Tunneling', tactic: 'TA0011', severity: 'Medium', detectable: true },
            { id: 'T1105', name: 'Ingress Tool Transfer', tactic: 'TA0011', severity: 'Medium', detectable: true },
            
            // Exfiltration
            { id: 'T1041', name: 'Exfiltration Over C2 Channel', tactic: 'TA0010', severity: 'High', detectable: true },
            { id: 'T1567', name: 'Exfiltration Over Web Service', tactic: 'TA0010', severity: 'High', detectable: true },
            { id: 'T1052', name: 'Exfiltration Over Physical Medium', tactic: 'TA0010', severity: 'Medium', detectable: false },
            
            // Impact
            { id: 'T1486', name: 'Data Encrypted for Impact', tactic: 'TA0040', severity: 'Critical', detectable: true },
            { id: 'T1490', name: 'Inhibit System Recovery', tactic: 'TA0040', severity: 'High', detectable: true },
            { id: 'T1498', name: 'Network Denial of Service', tactic: 'TA0040', severity: 'High', detectable: true }
        ];
        
        techniques.forEach(technique => this.techniques.set(technique.id, technique));
    }
    
    initializeThreatGroups() {
        const groups = [
            {
                id: 'G0007',
                name: 'APT28',
                aliases: ['Fancy Bear', 'Pawn Storm', 'Sofacy', 'Sednit'],
                attribution: 'Russian GRU (Main Intelligence Directorate)',
                description: 'Russian cyber espionage group',
                firstSeen: '2007',
                targets: ['Government', 'Military', 'Security Organizations'],
                geography: ['United States', 'Europe', 'Georgia', 'Ukraine'],
                techniques: ['T1566', 'T1059', 'T1068', 'T1027', 'T1003'],
                sophistication: 'High',
                activity: 'Active'
            },
            {
                id: 'G0032',
                name: 'Lazarus Group',
                aliases: ['Hidden Cobra', 'Guardians of Peace', 'ZINC'],
                attribution: 'North Korean government',
                description: 'North Korean state-sponsored cyber group',
                firstSeen: '2009',
                targets: ['Financial', 'Cryptocurrency', 'Media', 'Government'],
                geography: ['Global'],
                techniques: ['T1566', 'T1190', 'T1486', 'T1041', 'T1105'],
                sophistication: 'High',
                activity: 'Active'
            },
            {
                id: 'G0040',
                name: 'APT40',
                aliases: ['Leviathan', 'Kryptonite Panda', 'Gadolinium'],
                attribution: 'Chinese Ministry of State Security (MSS)',
                description: 'Chinese state-sponsored cyber espionage group',
                firstSeen: '2013',
                targets: ['Maritime', 'Government', 'Research', 'Universities'],
                geography: ['South China Sea region', 'United States', 'Europe'],
                techniques: ['T1566', 'T1190', 'T1059', 'T1083', 'T1021'],
                sophistication: 'High',
                activity: 'Active'
            },
            {
                id: 'G0008',
                name: 'Carbanak',
                aliases: ['FIN7', 'Carbon Spider'],
                attribution: 'Financial cybercrime group',
                description: 'Financially motivated cybercriminal organization',
                firstSeen: '2013',
                targets: ['Financial Services', 'Hospitality', 'Retail'],
                geography: ['Global'],
                techniques: ['T1566', 'T1059', 'T1055', 'T1005', 'T1041'],
                sophistication: 'Medium-High',
                activity: 'Active'
            },
            {
                id: 'G0029',
                name: 'APT29',
                aliases: ['Cozy Bear', 'The Dukes', 'Yttrium'],
                attribution: 'Russian Foreign Intelligence Service (SVR)',
                description: 'Russian intelligence service cyber operations group',
                firstSeen: '2008',
                targets: ['Government', 'Think Tanks', 'Healthcare', 'Energy'],
                geography: ['United States', 'Europe', 'Asia'],
                techniques: ['T1566', 'T1078', 'T1027', 'T1071', 'T1567'],
                sophistication: 'Very High',
                activity: 'Active'
            }
        ];
        
        groups.forEach(group => this.threatGroups.set(group.id, group));
    }
    
    initializeDetectionRules() {
        // Simplified detection rules mapping
        const rules = [
            {
                id: 'DR001',
                technique: 'T1566',
                name: 'Phishing Email Detection',
                description: 'Detects suspicious email attachments and links',
                dataSource: ['Email Gateway', 'DNS Logs', 'Web Proxy'],
                alertLevel: 'Medium',
                falsePositiveRate: 'Low'
            },
            {
                id: 'DR002',
                technique: 'T1059',
                name: 'Suspicious Script Execution',
                description: 'Detects unusual PowerShell and command line activity',
                dataSource: ['Process Logs', 'PowerShell Logs', 'Command History'],
                alertLevel: 'High',
                falsePositiveRate: 'Medium'
            },
            {
                id: 'DR003',
                technique: 'T1003',
                name: 'Credential Dumping Detection',
                description: 'Detects attempts to dump credentials from memory',
                dataSource: ['Security Logs', 'Process Monitoring', 'Memory Analysis'],
                alertLevel: 'Critical',
                falsePositiveRate: 'Low'
            },
            {
                id: 'DR004',
                technique: 'T1486',
                name: 'Ransomware Encryption Activity',
                description: 'Detects rapid file encryption patterns',
                dataSource: ['File System Monitoring', 'Process Monitoring'],
                alertLevel: 'Critical',
                falsePositiveRate: 'Very Low'
            }
        ];
        
        rules.forEach(rule => this.detectionRules.set(rule.id, rule));
    }
    
    // Generate threat landscape analysis
    generateThreatLandscape(organizationData, timeframe = 30) {
        const analysis = {
            timeframe: timeframe,
            generatedAt: new Date(),
            organization: organizationData.organization,
            overallRisk: this.calculateOverallThreatRisk(organizationData),
            tacticAnalysis: this.analyzeTacticActivity(organizationData, timeframe),
            techniqueAnalysis: this.analyzeTechniqueActivity(organizationData, timeframe),
            threatGroupActivity: this.analyzeThreatGroupActivity(organizationData, timeframe),
            detectionCoverage: this.analyzeDetectionCoverage(organizationData),
            riskTrends: this.generateRiskTrends(timeframe),
            recommendations: this.generateThreatRecommendations(organizationData),
            actionableThreatIntel: this.generateActionableThreatIntel(organizationData)
        };
        
        return analysis;
    }
    
    calculateOverallThreatRisk(organizationData) {
        // Calculate risk based on organization profile
        let riskScore = 50; // Base risk
        
        // Industry-based risk adjustments
        const industryRiskModifiers = {
            'Financial Services': 25,
            'Healthcare': 20,
            'Government': 30,
            'Technology': 15,
            'Energy': 25,
            'Retail': 10,
            'Education': 5,
            'Manufacturing': 10
        };
        
        const industry = organizationData.organization.industry || 'Technology';
        riskScore += industryRiskModifiers[industry] || 10;
        
        // Size-based risk adjustments
        const sizeMultiplier = organizationData.organization.type === 'individual' ? 0.5 : 
                              organizationData.organization.type === 'business' ? 1.0 : 1.5;
        riskScore *= sizeMultiplier;
        
        // Security posture adjustments
        const securityPosture = this.getSecurityPostureScore(organizationData);
        riskScore -= (securityPosture - 50); // Better security reduces risk
        
        // External threat environment
        riskScore += this.getCurrentThreatEnvironmentScore();
        
        return {
            score: Math.max(10, Math.min(100, Math.round(riskScore))),
            level: this.getRiskLevel(riskScore),
            factors: this.identifyRiskFactors(organizationData, riskScore),
            trend: this.generateRiskTrend()
        };
    }
    
    getSecurityPostureScore(organizationData) {
        // Mock security posture score - in real implementation, this would come from actual assessment
        const baseScore = 70;
        const variation = Math.random() * 30 - 15; // ±15 variation
        return Math.max(30, Math.min(100, baseScore + variation));
    }
    
    getCurrentThreatEnvironmentScore() {
        // Mock current threat environment - in real implementation, this would be from threat intel feeds
        return Math.floor(Math.random() * 20) + 10; // 10-30 additional risk
    }
    
    getRiskLevel(score) {
        if (score >= 80) return 'Critical';
        if (score >= 65) return 'High';
        if (score >= 40) return 'Medium';
        return 'Low';
    }
    
    identifyRiskFactors(organizationData, riskScore) {
        const factors = [];
        
        if (organizationData.organization.industry === 'Financial Services') {
            factors.push('High-value target for financially motivated actors');
        }
        
        if (organizationData.organization.type === 'site-admin') {
            factors.push('Large attack surface with multiple organizations');
        }
        
        if (riskScore > 70) {
            factors.push('Current elevated threat landscape');
            factors.push('Industry-specific targeting by nation-state actors');
        }
        
        factors.push('Standard business risk profile');
        
        return factors;
    }
    
    generateRiskTrend() {
        const trends = ['Increasing', 'Stable', 'Decreasing'];
        const weights = [0.4, 0.4, 0.2]; // Slightly biased toward increasing/stable
        
        const random = Math.random();
        let cumulative = 0;
        for (let i = 0; i < trends.length; i++) {
            cumulative += weights[i];
            if (random <= cumulative) {
                return trends[i];
            }
        }
        return 'Stable';
    }
    
    analyzeTacticActivity(organizationData, timeframe) {
        const tacticActivity = new Map();
        
        for (const [tacticId, tactic] of this.tactics) {
            const activity = {
                tactic: tactic,
                detectionCount: this.generateActivityCount(organizationData, 'tactic'),
                threatGroups: this.getThreatGroupsForTactic(tacticId),
                riskLevel: this.calculateTacticRisk(tacticId, organizationData),
                trend: this.generateActivityTrend(),
                topTechniques: this.getTopTechniquesForTactic(tacticId),
                mitigations: this.getMitigationsForTactic(tacticId)
            };
            
            tacticActivity.set(tacticId, activity);
        }
        
        return tacticActivity;
    }
    
    generateActivityCount(organizationData, type) {
        const baseMultiplier = organizationData.organization.type === 'individual' ? 1 :
                              organizationData.organization.type === 'business' ? 5 : 25;
        
        const activityLevel = type === 'tactic' ? 
            Math.floor(Math.random() * 20) + 5 :  // 5-25 for tactics
            Math.floor(Math.random() * 50) + 10;  // 10-60 for techniques
        
        return activityLevel * baseMultiplier;
    }
    
    getThreatGroupsForTactic(tacticId) {
        const groups = [];
        for (const [groupId, group] of this.threatGroups) {
            // Check if group uses techniques in this tactic
            const tacticTechniques = Array.from(this.techniques.values())
                .filter(t => t.tactic === tacticId)
                .map(t => t.id);
            
            const hasCommonTechniques = group.techniques.some(t => tacticTechniques.includes(t));
            if (hasCommonTechniques) {
                groups.push({
                    id: groupId,
                    name: group.name,
                    attribution: group.attribution,
                    activity: group.activity
                });
            }
        }
        return groups;
    }
    
    calculateTacticRisk(tacticId, organizationData) {
        // Risk calculation based on tactic criticality and organization profile
        const tacticRiskWeights = {
            'TA0001': 0.9,  // Initial Access - high risk
            'TA0040': 1.0,  // Impact - highest risk
            'TA0006': 0.8,  // Credential Access - high risk
            'TA0008': 0.7,  // Lateral Movement - medium-high risk
            'TA0010': 0.8,  // Exfiltration - high risk
            'TA0011': 0.6,  // Command and Control - medium risk
            'TA0005': 0.5,  // Defense Evasion - medium risk
            'TA0003': 0.6,  // Persistence - medium risk
            'TA0004': 0.7,  // Privilege Escalation - medium-high risk
            'TA0002': 0.5,  // Execution - medium risk
            'TA0007': 0.3,  // Discovery - low-medium risk
            'TA0009': 0.4   // Collection - low-medium risk
        };
        
        const baseRisk = (tacticRiskWeights[tacticId] || 0.5) * 100;
        const organizationModifier = organizationData.organization.type === 'site-admin' ? 1.2 : 1.0;
        
        const finalRisk = Math.min(100, baseRisk * organizationModifier);
        
        if (finalRisk >= 80) return 'Critical';
        if (finalRisk >= 60) return 'High';
        if (finalRisk >= 40) return 'Medium';
        return 'Low';
    }
    
    generateActivityTrend() {
        const trends = ['Increasing', 'Stable', 'Decreasing'];
        return trends[Math.floor(Math.random() * trends.length)];
    }
    
    getTopTechniquesForTactic(tacticId) {
        return Array.from(this.techniques.values())
            .filter(t => t.tactic === tacticId)
            .sort((a, b) => {
                const severityOrder = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
                return severityOrder[b.severity] - severityOrder[a.severity];
            })
            .slice(0, 3);
    }
    
    getMitigationsForTactic(tacticId) {
        // Simplified mitigation recommendations per tactic
        const mitigations = {
            'TA0001': [
                'Implement email security controls',
                'Deploy web application firewalls',
                'Conduct regular vulnerability assessments',
                'Implement multi-factor authentication'
            ],
            'TA0002': [
                'Application whitelisting',
                'PowerShell logging and restrictions',
                'Endpoint detection and response',
                'User access controls'
            ],
            'TA0003': [
                'Registry monitoring',
                'Service monitoring',
                'Account monitoring',
                'File integrity monitoring'
            ],
            'TA0040': [
                'Backup and recovery procedures',
                'Network segmentation',
                'Application isolation',
                'Data loss prevention'
            ]
        };
        
        return mitigations[tacticId] || ['General security hardening', 'Monitoring and detection', 'Access controls'];
    }
    
    analyzeTechniqueActivity(organizationData, timeframe) {
        const techniqueActivity = new Map();
        
        // Get top 20 most relevant techniques
        const topTechniques = Array.from(this.techniques.values())
            .sort((a, b) => {
                const severityOrder = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
                return severityOrder[b.severity] - severityOrder[a.severity];
            })
            .slice(0, 20);
        
        for (const technique of topTechniques) {
            const activity = {
                technique: technique,
                detectionCount: this.generateActivityCount(organizationData, 'technique'),
                severity: technique.severity,
                detectable: technique.detectable,
                tactic: this.tactics.get(technique.tactic),
                threatGroups: this.getThreatGroupsForTechnique(technique.id),
                detectionRules: this.getDetectionRulesForTechnique(technique.id),
                mitigations: this.getMitigationsForTechnique(technique.id),
                riskScore: this.calculateTechniqueRisk(technique, organizationData)
            };
            
            techniqueActivity.set(technique.id, activity);
        }
        
        return techniqueActivity;
    }
    
    getThreatGroupsForTechnique(techniqueId) {
        const groups = [];
        for (const [groupId, group] of this.threatGroups) {
            if (group.techniques.includes(techniqueId)) {
                groups.push({
                    id: groupId,
                    name: group.name,
                    attribution: group.attribution,
                    sophistication: group.sophistication
                });
            }
        }
        return groups;
    }
    
    getDetectionRulesForTechnique(techniqueId) {
        const rules = [];
        for (const [ruleId, rule] of this.detectionRules) {
            if (rule.technique === techniqueId) {
                rules.push(rule);
            }
        }
        return rules;
    }
    
    getMitigationsForTechnique(techniqueId) {
        // Simplified technique-specific mitigations
        const mitigations = {
            'T1566': ['Email security training', 'Email filtering', 'Attachment analysis'],
            'T1059': ['PowerShell execution policies', 'Command line monitoring', 'Application whitelisting'],
            'T1003': ['Credential protection', 'Privileged access management', 'Memory protection'],
            'T1486': ['Backup strategies', 'File monitoring', 'Ransomware-specific tools']
        };
        
        return mitigations[techniqueId] || ['Standard security controls', 'Monitoring and detection'];
    }
    
    calculateTechniqueRisk(technique, organizationData) {
        let riskScore = 50; // Base risk
        
        // Severity adjustment
        const severityModifiers = { 'Critical': 40, 'High': 25, 'Medium': 10, 'Low': 0 };
        riskScore += severityModifiers[technique.severity] || 0;
        
        // Detectability adjustment (lower detectability = higher risk)
        if (!technique.detectable) {
            riskScore += 15;
        }
        
        // Organization-specific adjustments
        if (organizationData.organization.type === 'site-admin') {
            riskScore += 10; // Higher exposure
        }
        
        return Math.max(10, Math.min(100, riskScore));
    }
    
    analyzeThreatGroupActivity(organizationData, timeframe) {
        const groupActivity = new Map();
        
        for (const [groupId, group] of this.threatGroups) {
            const relevanceScore = this.calculateGroupRelevance(group, organizationData);
            
            if (relevanceScore > 30) { // Only include relevant groups
                const activity = {
                    group: group,
                    relevanceScore: relevanceScore,
                    activityLevel: this.generateGroupActivityLevel(group),
                    targeting: this.analyzeGroupTargeting(group, organizationData),
                    techniques: group.techniques.map(tId => this.techniques.get(tId)).filter(Boolean),
                    recentCampaigns: this.generateRecentCampaigns(group),
                    riskToOrganization: this.calculateGroupRiskToOrg(group, organizationData)
                };
                
                groupActivity.set(groupId, activity);
            }
        }
        
        return groupActivity;
    }
    
    calculateGroupRelevance(group, organizationData) {
        let relevance = 0;
        
        // Geographic relevance
        const orgLocation = organizationData.organization.location || 'United States';
        if (group.geography.includes(orgLocation) || group.geography.includes('Global')) {
            relevance += 30;
        }
        
        // Industry targeting relevance
        const orgIndustry = organizationData.organization.industry || 'Technology';
        if (group.targets.some(target => target.toLowerCase().includes(orgIndustry.toLowerCase()))) {
            relevance += 40;
        }
        
        // Size/profile relevance
        if (organizationData.organization.type === 'site-admin' && group.targets.includes('Government')) {
            relevance += 20;
        }
        
        // Activity level
        if (group.activity === 'Active') {
            relevance += 10;
        }
        
        return Math.min(100, relevance);
    }
    
    generateGroupActivityLevel(group) {
        const levels = ['Low', 'Medium', 'High', 'Very High'];
        const weights = group.activity === 'Active' ? [0.1, 0.3, 0.4, 0.2] : [0.4, 0.4, 0.2, 0.0];
        
        const random = Math.random();
        let cumulative = 0;
        for (let i = 0; i < levels.length; i++) {
            cumulative += weights[i];
            if (random <= cumulative) {
                return levels[i];
            }
        }
        return 'Medium';
    }
    
    analyzeGroupTargeting(group, organizationData) {
        const targeting = {
            isTarget: false,
            likelihood: 0,
            reasons: []
        };
        
        // Check if organization fits group's typical targets
        const orgIndustry = organizationData.organization.industry || 'Technology';
        if (group.targets.some(target => target.toLowerCase().includes(orgIndustry.toLowerCase()))) {
            targeting.isTarget = true;
            targeting.likelihood += 40;
            targeting.reasons.push(`Industry match: ${orgIndustry}`);
        }
        
        // Check geographic targeting
        const orgLocation = organizationData.organization.location || 'United States';
        if (group.geography.includes(orgLocation)) {
            targeting.likelihood += 30;
            targeting.reasons.push(`Geographic targeting: ${orgLocation}`);
        }
        
        // Check organization size/profile
        if (organizationData.organization.type === 'site-admin') {
            targeting.likelihood += 20;
            targeting.reasons.push('Large organization profile');
        }
        
        targeting.likelihood = Math.min(100, targeting.likelihood);
        
        return targeting;
    }
    
    generateRecentCampaigns(group) {
        const campaigns = [
            {
                name: `Operation ${group.name} ${new Date().getFullYear()}`,
                timeframe: 'Last 90 days',
                targets: group.targets.slice(0, 2),
                techniques: group.techniques.slice(0, 3),
                impact: ['Data theft', 'System compromise']
            }
        ];
        
        return campaigns;
    }
    
    calculateGroupRiskToOrg(group, organizationData) {
        const targeting = this.analyzeGroupTargeting(group, organizationData);
        const sophistication = { 'Low': 20, 'Medium': 40, 'Medium-High': 60, 'High': 80, 'Very High': 95 };
        
        let riskScore = targeting.likelihood * 0.6; // 60% based on targeting likelihood
        riskScore += (sophistication[group.sophistication] || 40) * 0.4; // 40% based on sophistication
        
        if (riskScore >= 80) return 'Critical';
        if (riskScore >= 60) return 'High';
        if (riskScore >= 40) return 'Medium';
        return 'Low';
    }
    
    analyzeDetectionCoverage(organizationData) {
        const coverage = {
            overallCoverage: 0,
            tacticCoverage: new Map(),
            techniqueCoverage: new Map(),
            gaps: [],
            recommendations: []
        };
        
        // Calculate tactic coverage
        let totalTactics = this.tactics.size;
        let coveredTactics = 0;
        
        for (const [tacticId, tactic] of this.tactics) {
            const tacticTechniques = Array.from(this.techniques.values()).filter(t => t.tactic === tacticId);
            const detectableTechniques = tacticTechniques.filter(t => t.detectable);
            const detectionRules = this.getDetectionRulesForTactic(tacticId);
            
            const tacticCoverageScore = Math.min(100, (detectionRules.length / Math.max(1, detectableTechniques.length)) * 100);
            coverage.tacticCoverage.set(tacticId, {
                score: tacticCoverageScore,
                detectionRules: detectionRules.length,
                detectableTechniques: detectableTechniques.length,
                coverage: tacticCoverageScore > 50 ? 'Good' : 'Poor'
            });
            
            if (tacticCoverageScore > 50) coveredTactics++;
        }
        
        coverage.overallCoverage = Math.round((coveredTactics / totalTactics) * 100);
        
        // Identify gaps
        for (const [tacticId, tacticCoverage] of coverage.tacticCoverage) {
            if (tacticCoverage.score < 50) {
                const tactic = this.tactics.get(tacticId);
                coverage.gaps.push({
                    type: 'Tactic',
                    name: tactic.name,
                    coverage: tacticCoverage.score,
                    priority: tacticCoverage.score < 25 ? 'High' : 'Medium'
                });
            }
        }
        
        // Generate recommendations
        if (coverage.overallCoverage < 70) {
            coverage.recommendations.push({
                priority: 'High',
                title: 'Improve Detection Coverage',
                description: 'Deploy additional detection rules for critical tactics',
                impact: 'Significantly improve threat detection capabilities'
            });
        }
        
        return coverage;
    }
    
    getDetectionRulesForTactic(tacticId) {
        const tacticTechniques = Array.from(this.techniques.values())
            .filter(t => t.tactic === tacticId)
            .map(t => t.id);
        
        return Array.from(this.detectionRules.values())
            .filter(rule => tacticTechniques.includes(rule.technique));
    }
    
    generateRiskTrends(timeframe) {
        const trends = [];
        const currentDate = new Date();
        
        for (let i = timeframe - 1; i >= 0; i--) {
            const date = new Date(currentDate);
            date.setDate(date.getDate() - i);
            
            trends.push({
                date: date.toISOString().split('T')[0],
                overallRisk: Math.floor(Math.random() * 30) + 60, // 60-90 risk score
                threatVolume: Math.floor(Math.random() * 100) + 50,
                criticalThreats: Math.floor(Math.random() * 10) + 1
            });
        }
        
        return trends;
    }
    
    generateThreatRecommendations(organizationData) {
        const recommendations = [];
        
        recommendations.push({
            priority: 'Critical',
            title: 'Implement Email Security Controls',
            description: 'Deploy advanced email security to counter phishing attacks',
            tactics: ['TA0001'],
            techniques: ['T1566'],
            timeline: '30 days',
            cost: 15000,
            impact: 'Reduces initial access risk by 70%'
        });
        
        recommendations.push({
            priority: 'High',
            title: 'Enhance Endpoint Detection',
            description: 'Deploy EDR solutions for better technique visibility',
            tactics: ['TA0002', 'TA0003', 'TA0004'],
            techniques: ['T1059', 'T1055', 'T1547'],
            timeline: '60 days',
            cost: 50000,
            impact: 'Improves detection coverage by 40%'
        });
        
        recommendations.push({
            priority: 'High',
            title: 'Implement Privileged Access Management',
            description: 'Protect against credential access and privilege escalation',
            tactics: ['TA0006', 'TA0004'],
            techniques: ['T1003', 'T1068'],
            timeline: '90 days',
            cost: 75000,
            impact: 'Significantly reduces lateral movement risk'
        });
        
        return recommendations;
    }
    
    generateActionableThreatIntel(organizationData) {
        const intel = {
            highPriorityThreats: this.getHighPriorityThreats(organizationData),
            emergingThreats: this.getEmergingThreats(),
            industrySpecificThreats: this.getIndustrySpecificThreats(organizationData),
            iocs: this.generateIOCs(),
            huntingQueries: this.generateHuntingQueries()
        };
        
        return intel;
    }
    
    getHighPriorityThreats(organizationData) {
        // Return threats most relevant to the organization
        return [
            {
                name: 'Business Email Compromise',
                severity: 'Critical',
                likelihood: 'High',
                description: 'Targeted phishing campaigns against executives',
                indicators: ['Suspicious email domains', 'Executive impersonation'],
                mitigation: 'Email authentication, executive protection training'
            },
            {
                name: 'Ransomware Deployment',
                severity: 'Critical',
                likelihood: 'Medium',
                description: 'File encryption attacks via multiple vectors',
                indicators: ['Unusual file activity', 'Backup tampering'],
                mitigation: 'Backup isolation, network segmentation'
            }
        ];
    }
    
    getEmergingThreats() {
        return [
            {
                name: 'AI-Generated Phishing',
                description: 'Sophisticated phishing using AI-generated content',
                timeline: 'Emerging',
                impact: 'Increased success rates of social engineering'
            }
        ];
    }
    
    getIndustrySpecificThreats(organizationData) {
        const industry = organizationData.organization.industry || 'Technology';
        
        const threats = {
            'Financial Services': [
                'ATM malware attacks',
                'SWIFT network compromise',
                'Cryptocurrency theft'
            ],
            'Healthcare': [
                'Patient data theft',
                'Medical device compromise',
                'HIPAA compliance attacks'
            ],
            'Technology': [
                'Source code theft',
                'Supply chain attacks',
                'Cloud infrastructure compromise'
            ]
        };
        
        return threats[industry] || threats['Technology'];
    }
    
    generateIOCs() {
        // Mock Indicators of Compromise
        return [
            {
                type: 'Domain',
                value: 'malicious-example.com',
                confidence: 'High',
                threat: 'Phishing campaign',
                firstSeen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            },
            {
                type: 'File Hash',
                value: 'a1b2c3d4e5f6...',
                confidence: 'Medium',
                threat: 'Malware payload',
                firstSeen: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
            }
        ];
    }
    
    generateHuntingQueries() {
        return [
            {
                name: 'Suspicious PowerShell Activity',
                query: 'EventCode:4103 AND (Message:*DownloadString* OR Message:*EncodedCommand*)',
                dataSource: 'Windows Event Logs',
                description: 'Detects potentially malicious PowerShell commands'
            },
            {
                name: 'Credential Dumping Attempts',
                query: 'process_name:lsass.exe AND (parent_process:*mimikatz* OR cmdline:*sekurlsa*)',
                dataSource: 'Process Monitoring',
                description: 'Identifies attempts to dump credentials from memory'
            }
        ];
    }
    
    // Utility methods for visualization
    getTacticMatrix() {
        const matrix = [];
        for (const [tacticId, tactic] of this.tactics) {
            const techniques = Array.from(this.techniques.values()).filter(t => t.tactic === tacticId);
            matrix.push({
                tactic: tactic,
                techniques: techniques,
                threatGroups: this.getThreatGroupsForTactic(tacticId)
            });
        }
        return matrix;
    }
    
    exportThreatData(format = 'json') {
        const data = {
            tactics: Array.from(this.tactics.values()),
            techniques: Array.from(this.techniques.values()),
            threatGroups: Array.from(this.threatGroups.values()),
            detectionRules: Array.from(this.detectionRules.values()),
            generatedAt: new Date().toISOString()
        };
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        }
        
        // Add other export formats as needed
        return data;
    }
}

// Export for use
window.MitreAttackManager = MitreAttackManager;
