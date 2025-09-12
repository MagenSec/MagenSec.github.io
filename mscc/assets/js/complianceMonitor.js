/**
 * MagenSec Command Center - Compliance Monitor
 * Handles compliance framework monitoring, configuration drift detection, and security policy validation
 */

class ComplianceMonitor {
    constructor() {
        this.frameworks = {
            nist: {
                name: 'NIST Cybersecurity Framework',
                controls: [
                    'Identify', 'Protect', 'Detect', 'Respond', 'Recover'
                ]
            },
            cis: {
                name: 'CIS Controls',
                controls: [
                    'Inventory and Control of Hardware Assets',
                    'Inventory and Control of Software Assets',
                    'Continuous Vulnerability Management',
                    'Controlled Use of Administrative Privileges',
                    'Secure Configuration for Hardware and Software'
                ]
            },
            hips: {
                name: 'HIPS Security Standards',
                controls: [
                    'Access Control', 'Audit and Accountability',
                    'Configuration Management', 'Identification and Authentication',
                    'System and Information Integrity'
                ]
            }
        };

        this.configBaselines = {
            windows: {
                uac: { expected: 'enabled', critical: true },
                firewall: { expected: 'enabled', critical: true },
                updates: { expected: 'automatic', critical: true },
                bitlocker: { expected: 'enabled', critical: false },
                defender: { expected: 'enabled', critical: true }
            }
        };

        this.complianceCache = new Map();
        this.driftHistory = [];
        this.lastUpdate = null;
    }

    /**
     * Initialize compliance monitoring
     */
    async init() {
        console.log('Initializing Compliance Monitor...');
        
        try {
            // Load compliance data
            await this.loadComplianceData();
            
            // Load configuration data
            await this.loadConfigurationData();
            
            // Load drift detection data
            await this.loadDriftData();
            
            // Set up periodic updates
            this.setupPeriodicUpdates();
            
            console.log('Compliance Monitor initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Compliance Monitor:', error);
            this.showErrorState();
        }
    }

    /**
     * Load compliance framework data
     */
    async loadComplianceData() {
        for (const framework of Object.keys(this.frameworks)) {
            try {
                const complianceData = await this.fetchComplianceScore(framework);
                this.updateFrameworkDisplay(framework, complianceData);
            } catch (error) {
                console.error(`Failed to load compliance data for ${framework}:`, error);
                this.showFrameworkError(framework);
            }
        }
    }

    /**
     * Fetch compliance score for a framework
     */
    async fetchComplianceScore(framework) {
        try {
            // Use the data service to fetch compliance telemetry
            if (window.msccDataService && window.msccDataService.fetchOData) {
                const complianceData = await window.msccDataService.fetchOData('ComplianceTelemetry', null, {
                    $filter: `Framework eq '${framework.toUpperCase()}'`,
                    $orderby: 'Timestamp desc',
                    $top: 1
                });

                if (complianceData && complianceData.length > 0) {
                    return complianceData[0];
                }
            }

            // Fallback to demo data
            return this.generateDemoComplianceData(framework);
        } catch (error) {
            console.error(`Error fetching compliance data for ${framework}:`, error);
            return this.generateDemoComplianceData(framework);
        }
    }

    /**
     * Generate demo compliance data for testing
     */
    generateDemoComplianceData(framework) {
        const scores = {
            nist: { score: 78, status: 'partial', issues: 12, lastAssessment: new Date().toISOString() },
            cis: { score: 85, status: 'good', issues: 8, lastAssessment: new Date().toISOString() },
            hips: { score: 92, status: 'excellent', issues: 3, lastAssessment: new Date().toISOString() }
        };

        return scores[framework] || { score: 0, status: 'unknown', issues: 0, lastAssessment: new Date().toISOString() };
    }

    /**
     * Update framework display with compliance data
     */
    updateFrameworkDisplay(framework, data) {
        const scoreElement = document.getElementById(`${framework}-score`);
        const statusElement = document.getElementById(`${framework}-status`);

        if (scoreElement && statusElement) {
            // Update score
            scoreElement.textContent = `${data.score}%`;
            scoreElement.className = `compliance-score ${this.getScoreClass(data.score)}`;

            // Update status
            statusElement.textContent = this.getStatusText(data.status, data.issues);
            statusElement.className = `compliance-status ${data.status}`;
        }
    }

    /**
     * Get CSS class for compliance score
     */
    getScoreClass(score) {
        if (score >= 90) return 'excellent';
        if (score >= 70) return 'good';
        return 'poor';
    }

    /**
     * Get status text for compliance
     */
    getStatusText(status, issues) {
        const statusTexts = {
            excellent: `Compliant (${issues} minor issues)`,
            good: `Mostly Compliant (${issues} issues)`,
            partial: `Partially Compliant (${issues} issues)`,
            poor: `Non-Compliant (${issues} critical issues)`,
            unknown: 'Status Unknown'
        };
        return statusTexts[status] || 'Status Unknown';
    }

    /**
     * Load configuration monitoring data
     */
    async loadConfigurationData() {
        try {
            // Load baseline compliance data
            await this.loadBaselineCompliance();
            
            // Load Windows Defender status
            await this.loadDefenderStatus();
            
            // Load security policy compliance
            await this.loadPolicyCompliance();
            
            // Load security services status
            await this.loadServicesStatus();
            
        } catch (error) {
            console.error('Failed to load configuration data:', error);
            this.showConfigurationError();
        }
    }

    /**
     * Load baseline compliance data
     */
    async loadBaselineCompliance() {
        try {
            // Fetch configuration telemetry
            const configData = await this.fetchConfigurationTelemetry();
            
            // Analyze baseline compliance
            const compliance = this.analyzeBaselineCompliance(configData);
            
            // Update UI
            this.updateBaselineDisplay(compliance);
            
        } catch (error) {
            console.error('Failed to load baseline compliance:', error);
            this.showDemoBaselineData();
        }
    }

    /**
     * Fetch configuration telemetry data
     */
    async fetchConfigurationTelemetry() {
        if (window.msccDataService && window.msccDataService.fetchOData) {
            return await window.msccDataService.fetchOData('ConfigTelemetry', null, {
                $orderby: 'Timestamp desc',
                $top: 100
            });
        }
        return [];
    }

    /**
     * Analyze baseline compliance from configuration data
     */
    analyzeBaselineCompliance(configData) {
        let compliant = 0;
        let drift = 0;
        let total = 0;

        // Analyze each device's configuration
        const deviceConfigs = this.groupByDevice(configData);
        
        for (const [deviceId, configs] of deviceConfigs.entries()) {
            total++;
            const isCompliant = this.checkDeviceCompliance(configs);
            
            if (isCompliant) {
                compliant++;
            } else {
                drift++;
            }
        }

        return { compliant, drift, total };
    }

    /**
     * Group configuration data by device
     */
    groupByDevice(configData) {
        const grouped = new Map();
        
        configData.forEach(config => {
            const deviceId = config.DeviceId || config.RowKey;
            if (!grouped.has(deviceId)) {
                grouped.set(deviceId, []);
            }
            grouped.get(deviceId).push(config);
        });
        
        return grouped;
    }

    /**
     * Check if device configuration is compliant with baseline
     */
    checkDeviceCompliance(configs) {
        // Check critical security settings
        const criticalSettings = ['UAC', 'WindowsFirewall', 'WindowsDefender', 'AutomaticUpdates'];
        
        for (const setting of criticalSettings) {
            const configItem = configs.find(c => c.SettingName === setting);
            if (!configItem || configItem.Value !== 'Enabled') {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Update baseline compliance display
     */
    updateBaselineDisplay(compliance) {
        document.getElementById('baseline-compliant').textContent = compliance.compliant;
        document.getElementById('baseline-drift').textContent = compliance.drift;
        
        // Create simple chart for baseline compliance
        this.createBaselineChart(compliance);
    }

    /**
     * Create baseline compliance chart
     */
    createBaselineChart(compliance) {
        const canvas = document.getElementById('baselineChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const total = compliance.compliant + compliance.drift;
        
        if (total === 0) return;
        
        // Simple pie chart
        const compliantAngle = (compliance.compliant / total) * 2 * Math.PI;
        const driftAngle = (compliance.drift / total) * 2 * Math.PI;
        
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 60;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw compliant slice
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, 0, compliantAngle);
        ctx.closePath();
        ctx.fillStyle = '#27ae60';
        ctx.fill();
        
        // Draw drift slice
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, compliantAngle, compliantAngle + driftAngle);
        ctx.closePath();
        ctx.fillStyle = '#e74c3c';
        ctx.fill();
        
        // Add labels
        ctx.fillStyle = '#2c3e50';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${compliance.compliant} Compliant`, centerX, centerY + radius + 20);
        ctx.fillText(`${compliance.drift} Drift`, centerX, centerY + radius + 35);
    }

    /**
     * Load Windows Defender status
     */
    async loadDefenderStatus() {
        try {
            // Fetch security telemetry
            const securityData = await this.fetchSecurityTelemetry();
            
            // Analyze Defender status
            const defenderStatus = this.analyzeDefenderStatus(securityData);
            
            // Update UI
            this.updateDefenderDisplay(defenderStatus);
            
        } catch (error) {
            console.error('Failed to load Defender status:', error);
            this.showDemoDefenderData();
        }
    }

    /**
     * Fetch security telemetry data
     */
    async fetchSecurityTelemetry() {
        if (window.msccDataService && window.msccDataService.fetchOData) {
            return await window.msccDataService.fetchOData('SecurityTelemetry', null, {
                $filter: "ComponentName eq 'WindowsDefender'",
                $orderby: 'Timestamp desc',
                $top: 50
            });
        }
        return [];
    }

    /**
     * Analyze Windows Defender status
     */
    analyzeDefenderStatus(securityData) {
        let protected = 0;
        let outdated = 0;
        let lastScan = null;
        let signatureVersion = null;
        let realtimeProtection = 'Unknown';

        // Group by device and get latest status
        const deviceData = this.groupByDevice(securityData);
        
        deviceData.forEach(devices => {
            const latest = devices[0]; // Most recent data
            
            if (latest.RealtimeProtectionEnabled === 'true') {
                protected++;
                realtimeProtection = 'Enabled';
            }
            
            // Check signature age (consider outdated if > 7 days)
            const signatureDate = new Date(latest.SignatureLastUpdated);
            const daysSinceUpdate = (Date.now() - signatureDate.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysSinceUpdate > 7) {
                outdated++;
            }
            
            // Track most recent scan and signature version
            if (!lastScan || new Date(latest.LastScan) > new Date(lastScan)) {
                lastScan = latest.LastScan;
            }
            
            if (!signatureVersion || latest.SignatureVersion > signatureVersion) {
                signatureVersion = latest.SignatureVersion;
            }
        });

        return {
            protected,
            outdated,
            total: deviceData.size,
            lastScan,
            signatureVersion,
            realtimeProtection
        };
    }

    /**
     * Update Windows Defender display
     */
    updateDefenderDisplay(status) {
        document.getElementById('defender-protected').textContent = status.protected;
        document.getElementById('defender-outdated').textContent = status.outdated;
        
        // Update detailed status
        document.getElementById('realtime-status').textContent = status.realtimeProtection;
        document.getElementById('last-scan').textContent = status.lastScan ? 
            new Date(status.lastScan).toLocaleDateString() : 'Unknown';
        document.getElementById('signature-version').textContent = status.signatureVersion || 'Unknown';
    }

    /**
     * Load security policy compliance
     */
    async loadPolicyCompliance() {
        try {
            // This would typically fetch from GroupPolicy or Registry monitoring
            // For now, use configuration telemetry
            const configData = await this.fetchConfigurationTelemetry();
            
            // Analyze policy compliance
            const policyStatus = this.analyzePolicyCompliance(configData);
            
            // Update UI
            this.updatePolicyDisplay(policyStatus);
            
        } catch (error) {
            console.error('Failed to load policy compliance:', error);
            this.showDemoPolicyData();
        }
    }

    /**
     * Analyze security policy compliance
     */
    analyzePolicyCompliance(configData) {
        const policies = {
            uac: 'unknown',
            firewall: 'unknown',
            updates: 'unknown',
            bitlocker: 'unknown'
        };

        // Find latest policy configurations
        configData.forEach(config => {
            switch (config.SettingName) {
                case 'UAC':
                    policies.uac = config.Value === 'Enabled' ? 'enabled' : 'disabled';
                    break;
                case 'WindowsFirewall':
                    policies.firewall = config.Value === 'Enabled' ? 'enabled' : 'disabled';
                    break;
                case 'AutomaticUpdates':
                    policies.updates = config.Value === 'Enabled' ? 'enabled' : 'disabled';
                    break;
                case 'BitLocker':
                    policies.bitlocker = config.Value === 'Enabled' ? 'enabled' : 'disabled';
                    break;
            }
        });

        return policies;
    }

    /**
     * Update policy compliance display
     */
    updatePolicyDisplay(policies) {
        document.getElementById('uac-status').textContent = this.formatPolicyStatus(policies.uac);
        document.getElementById('uac-status').className = `policy-status ${policies.uac}`;
        
        document.getElementById('firewall-status').textContent = this.formatPolicyStatus(policies.firewall);
        document.getElementById('firewall-status').className = `policy-status ${policies.firewall}`;
        
        document.getElementById('updates-status').textContent = this.formatPolicyStatus(policies.updates);
        document.getElementById('updates-status').className = `policy-status ${policies.updates}`;
        
        document.getElementById('bitlocker-status').textContent = this.formatPolicyStatus(policies.bitlocker);
        document.getElementById('bitlocker-status').className = `policy-status ${policies.bitlocker}`;
    }

    /**
     * Format policy status for display
     */
    formatPolicyStatus(status) {
        const statusText = {
            enabled: 'Enabled',
            disabled: 'Disabled',
            unknown: 'Unknown'
        };
        return statusText[status] || 'Unknown';
    }

    /**
     * Load security services status
     */
    async loadServicesStatus() {
        try {
            // In a real implementation, this would check Windows services
            // For now, use demo data
            this.showDemoServicesData();
        } catch (error) {
            console.error('Failed to load services status:', error);
            this.showDemoServicesData();
        }
    }

    /**
     * Load configuration drift data
     */
    async loadDriftData() {
        try {
            const timeframe = document.getElementById('drift-timeframe').value;
            const driftData = await this.fetchDriftEvents(timeframe);
            
            this.displayDriftTimeline(driftData);
        } catch (error) {
            console.error('Failed to load drift data:', error);
            this.showDemoDriftData();
        }
    }

    /**
     * Fetch configuration drift events
     */
    async fetchDriftEvents(timeframe) {
        // Calculate date range
        const now = new Date();
        const startDate = new Date();
        
        switch (timeframe) {
            case '24h':
                startDate.setHours(startDate.getHours() - 24);
                break;
            case '7d':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(startDate.getDate() - 30);
                break;
        }

        if (window.msccDataService && window.msccDataService.fetchOData) {
            return await window.msccDataService.fetchOData('ConfigTelemetry', null, {
                $filter: `Timestamp ge '${startDate.toISOString()}' and ConfigDrift eq true`,
                $orderby: 'Timestamp desc'
            });
        }
        
        return [];
    }

    /**
     * Display configuration drift timeline
     */
    displayDriftTimeline(driftData) {
        const timeline = document.getElementById('drift-timeline');
        if (!timeline) return;

        if (driftData.length === 0) {
            timeline.innerHTML = '<p>No configuration drift detected in the selected timeframe.</p>';
            return;
        }

        let html = '<div class="drift-events">';
        driftData.forEach(event => {
            html += `
                <div class="drift-event">
                    <div class="drift-time">${new Date(event.Timestamp).toLocaleString()}</div>
                    <div class="drift-device">${event.DeviceId}</div>
                    <div class="drift-setting">${event.SettingName}: ${event.OldValue} → ${event.NewValue}</div>
                    <div class="drift-severity ${event.Severity?.toLowerCase() || 'medium'}">${event.Severity || 'Medium'}</div>
                </div>
            `;
        });
        html += '</div>';

        timeline.innerHTML = html;
    }

    /**
     * Show framework details modal
     */
    showFrameworkDetails(framework) {
        // This would open a detailed view of the framework compliance
        console.log(`Showing details for ${framework} framework`);
        alert(`${this.frameworks[framework].name} details would be shown here.`);
    }

    /**
     * Generate compliance report
     */
    generateReport(reportType) {
        console.log(`Generating ${reportType} compliance report`);
        alert(`${reportType.charAt(0).toUpperCase() + reportType.slice(1)} report generation would start here.`);
    }

    /**
     * Refresh drift data
     */
    async refreshDriftData() {
        console.log('Refreshing drift data...');
        await this.loadDriftData();
    }

    /**
     * Setup periodic updates
     */
    setupPeriodicUpdates() {
        // Refresh data every 5 minutes
        setInterval(() => {
            this.loadComplianceData();
            this.loadConfigurationData();
        }, 5 * 60 * 1000);
    }

    /**
     * Show demo data when real data is unavailable
     */
    showDemoBaselineData() {
        this.updateBaselineDisplay({ compliant: 12, drift: 3, total: 15 });
    }

    showDemoDefenderData() {
        this.updateDefenderDisplay({
            protected: 14,
            outdated: 1,
            total: 15,
            lastScan: new Date().toISOString(),
            signatureVersion: '1.379.1249.0',
            realtimeProtection: 'Enabled'
        });
    }

    showDemoPolicyData() {
        this.updatePolicyDisplay({
            uac: 'enabled',
            firewall: 'enabled',
            updates: 'enabled',
            bitlocker: 'disabled'
        });
    }

    showDemoServicesData() {
        document.getElementById('security-service-status').textContent = 'Running';
        document.getElementById('security-service-status').className = 'service-status running';
        
        document.getElementById('update-service-status').textContent = 'Running';
        document.getElementById('update-service-status').className = 'service-status running';
        
        document.getElementById('firewall-service-status').textContent = 'Running';
        document.getElementById('firewall-service-status').className = 'service-status running';
        
        document.getElementById('smartcard-service-status').textContent = 'Stopped';
        document.getElementById('smartcard-service-status').className = 'service-status stopped';
    }

    showDemoDriftData() {
        const timeline = document.getElementById('drift-timeline');
        if (timeline) {
            timeline.innerHTML = `
                <div class="drift-events">
                    <div class="drift-event">
                        <div class="drift-time">${new Date().toLocaleString()}</div>
                        <div class="drift-device">DESKTOP-ABC123</div>
                        <div class="drift-setting">UAC: Enabled → Disabled</div>
                        <div class="drift-severity high">High</div>
                    </div>
                    <div class="drift-event">
                        <div class="drift-time">${new Date(Date.now() - 86400000).toLocaleString()}</div>
                        <div class="drift-device">LAPTOP-XYZ789</div>
                        <div class="drift-setting">Windows Firewall: Enabled → Disabled</div>
                        <div class="drift-severity high">High</div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Show error states
     */
    showFrameworkError(framework) {
        const scoreElement = document.getElementById(`${framework}-score`);
        const statusElement = document.getElementById(`${framework}-status`);
        
        if (scoreElement) scoreElement.textContent = 'Error';
        if (statusElement) statusElement.textContent = 'Unable to load';
    }

    showConfigurationError() {
        console.error('Configuration monitoring error - showing demo data');
        this.showDemoBaselineData();
        this.showDemoDefenderData();
        this.showDemoPolicyData();
        this.showDemoServicesData();
    }

    showErrorState() {
        console.error('Compliance monitor in error state - showing demo data');
        // Show demo data for all components
        Object.keys(this.frameworks).forEach(framework => {
            const data = this.generateDemoComplianceData(framework);
            this.updateFrameworkDisplay(framework, data);
        });
        
        this.showConfigurationError();
        this.showDemoDriftData();
    }
}

// Create global instance
window.ComplianceMonitor = new ComplianceMonitor();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComplianceMonitor;
}
