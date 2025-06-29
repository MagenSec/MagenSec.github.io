/* global google, Tabler */
// vulnsView.js
console.log('vulnsView.js loaded');

(function() {
    if (!window.viewInitializers) {
        window.viewInitializers = {};
    }

    // Register the initializer for the vulnerabilities view
    window.viewInitializers.vulnerabilities = async function(container, { dataService }) {
        console.log('Initializing Vulnerabilities view');
        
        if (!container) {
            console.error('Vulnerabilities view requires a container element.');
            return;
        }

        // Load the HTML content
        try {
            const response = await fetch('views/vulnerabilities.html');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const htmlContent = await response.text();
            container.innerHTML = htmlContent;
        } catch (error) {
            console.error('Error loading vulnerabilities view HTML:', error);
            container.innerHTML = `<div class="alert alert-danger">Error loading vulnerability management view. Please try again later.</div>`;
            return;
        }

        // Get threatIntel dynamically - it should be available by now
        const threatIntel = window.threatIntel;
        
        // Create and initialize the view instance
        const vulnsView = new VulnsView(container, dataService, threatIntel);
        await vulnsView.initialize();
        
        // Store the view instance for cleanup later
        container._viewInstance = vulnsView;
    };

class VulnsView {
    constructor(container, dataService, threatIntel) {
        this.container = container;
        this.dataService = dataService;
        this.threatIntel = threatIntel || null; // Allow null threatIntel
        this.fullCveData = [];
        this.currentPage = 1;
        this.ITEMS_PER_PAGE = 15;

        // Bind event handlers to this instance
        this.boundRenderComponents = this.renderComponents.bind(this);
    }

    async initialize() {
        console.log('Initializing Vulnerability Management view');
        try {
            // The HTML has been loaded by the initializer function
            // We can directly proceed with rendering the dynamic components.
            await this.renderComponents();
        } catch (error) {
            console.error('Error initializing vulnerabilities view:', error);
            this.container.innerHTML = `<div class="alert alert-danger">Error loading vulnerability management view. Please try again later.</div>`;
        }

        // Add event listeners for org/device changes
        document.addEventListener('orgChanged', this.boundRenderComponents);
        document.addEventListener('deviceChanged', this.boundRenderComponents);
    }

    destroy() {
        console.log('Destroying Vulnerabilities view');
        // Remove event listeners to prevent memory leaks and errors
        document.removeEventListener('orgChanged', this.boundRenderComponents);
        document.removeEventListener('deviceChanged', this.boundRenderComponents);
    }

    // Helper method to get threatIntel service (with fallback)
    getThreatIntel() {
        return this.threatIntel || window.threatIntel || null;
    }

    async renderComponents() {
        console.log('Rendering components for Vulnerability Management view');
        try {
            // Show loading indicators
            this.showLoadingIndicators(true);

            const orgId = sessionStorage.getItem('org') || 'all';
            const deviceId = sessionStorage.getItem('selectedDeviceId') || 'all';

            // Fetch data
            this.fullCveData = await this.dataService.getCveTelemetry(orgId, deviceId);

            // Render UI components with the fetched data
            this.renderExecutiveKPIs(this.fullCveData);
            this.renderRiskOverview(this.fullCveData, window.charting);
            this.renderSecurityInsights(this.fullCveData);
            this.renderVulnerabilitiesTable(this.fullCveData, this.currentPage);

            // Initialize tooltips for the info icons
            this.initializeTooltips();

        } catch (error) {
            console.error('Error rendering vulnerability components:', error);
            const viewContent = document.getElementById('viewContent');
            if(viewContent) {
                 viewContent.innerHTML = `<div class="alert alert-danger">Error rendering vulnerability components. Please try again later.</div>`;
            }
        } finally {
            // Hide loading indicators
            this.showLoadingIndicators(false);
        }
    }

    renderExecutiveKPIs(cveData) {
        if (!cveData || cveData.length === 0) {
            const criticalEl = document.getElementById('critical-count');
            const kevEl = document.getElementById('kev-count');
            const highRiskEl = document.getElementById('high-risk-count');
            const avgAgeEl = document.getElementById('avg-age');
            
            if (criticalEl) criticalEl.textContent = '0';
            if (kevEl) kevEl.textContent = '0';
            if (highRiskEl) highRiskEl.textContent = '0';
            if (avgAgeEl) avgAgeEl.textContent = 'N/A';
            return;
        }

        // Calculate KPIs
        const criticalCount = cveData.filter(cve => cve.Severity === 'CRITICAL').length;
        const threatIntel = this.getThreatIntel();
        const kevCount = cveData.filter(cve => 
            threatIntel && threatIntel.isKnownExploited && threatIntel.isKnownExploited(cve.CveId)
        ).length;
        const highRiskCount = cveData.filter(cve => 
            cve.EPSSProbability && (cve.EPSSProbability * 100) >= 10
        ).length;

        // Calculate average age
        const now = new Date();
        const validDates = cveData.filter(cve => cve.FirstSeen);
        let avgAge = 'N/A';
        
        if (validDates.length > 0) {
            const totalAge = validDates.reduce((sum, cve) => {
                const firstSeenDate = new Date(cve.FirstSeen);
                const ageInDays = Math.floor((now - firstSeenDate) / (1000 * 60 * 60 * 24));
                return sum + Math.max(0, ageInDays); // Ensure non-negative
            }, 0);
            avgAge = Math.round(totalAge / validDates.length);
            
            // For demo data, if all are 0 days, show "< 1" for clarity
            if (avgAge === 0) {
                avgAge = '< 1';
            }
        }

        // Update UI with null checks - ensure DOM is ready
        setTimeout(() => {
            const criticalEl = document.getElementById('critical-count');
            const kevEl = document.getElementById('kev-count');
            const highRiskEl = document.getElementById('high-risk-count');
            const avgAgeEl = document.getElementById('avg-age');
            
            if (criticalEl) criticalEl.textContent = criticalCount;
            if (kevEl) kevEl.textContent = kevCount;
            if (highRiskEl) highRiskEl.textContent = highRiskCount;
            if (avgAgeEl) avgAgeEl.textContent = avgAge;
        }, 100);
    }

    renderRiskOverview(cveData, charting) {
        const gaugeContainer = this.container.querySelector('#org-exploitability-gauge');
        const severityContainer = this.container.querySelector('#severity-distribution-chart');
        const heatmapContainer = this.container.querySelector('#risk-heatmap-chart');

        if (!cveData || cveData.length === 0) {
            if (gaugeContainer) gaugeContainer.innerHTML = '<div class="text-center p-5 text-muted">No data to calculate exploitability.</div>';
            if (severityContainer) severityContainer.innerHTML = '<div class="text-center p-5 text-muted">No severity data available.</div>';
            if (heatmapContainer) heatmapContainer.innerHTML = '<div class="text-center p-5 text-muted">No data for risk heatmap.</div>';
            return;
        }

        // 1. Calculate Organizational Exploitability
        const probNoExploit = cveData.reduce((product, cve) => product * (1 - (cve.EPSSProbability || 0)), 1);
        const orgExploitability = (1 - probNoExploit) * 100;

        // Render Gauge Chart
        if (gaugeContainer && charting) {
            charting.renderGauge(
                gaugeContainer.id,
                'Risk',
                orgExploitability,
                {
                    max: 100,
                    redFrom: 75, redTo: 100,
                    yellowFrom: 50, yellowTo: 75,
                    greenFrom: 0, greenTo: 50,
                    extraOptions: {
                        height: 200,
                        width: '100%',
                        titleTextStyle: { fontSize: 11 },
                        chartArea: { left: 10, top: 50, width: '90%', height: '50%' }
                    }
                }
            );
        }

        // 2. Render Severity Distribution Pie Chart
        if (severityContainer && charting) {
            const severityCounts = cveData.reduce((acc, cve) => {
                const severity = cve.Severity || 'UNKNOWN';
                acc[severity] = (acc[severity] || 0) + 1;
                return acc;
            }, {});

            // Create proper data rows array for Google Charts (header separate from data)
            const severityHeader = ['Severity', 'Count'];
            const severityRows = [];
            
            if (severityCounts.CRITICAL) severityRows.push(['Critical', severityCounts.CRITICAL]);
            if (severityCounts.HIGH) severityRows.push(['High', severityCounts.HIGH]);
            if (severityCounts.MEDIUM) severityRows.push(['Medium', severityCounts.MEDIUM]);
            if (severityCounts.LOW) severityRows.push(['Low', severityCounts.LOW]);
            
            // Only render if we have data
            if (severityRows.length > 0) {
                charting.renderPieChart(
                    severityContainer.id,
                    severityRows,
                    severityHeader,
                    {
                        title: 'Severity Distribution',
                        extraOptions: {
                            height: 200,
                            width: '100%',
                            colors: ['#dc2626', '#ea580c', '#ca8a04', '#16a34a'],
                            legend: { position: 'bottom' }
                        }
                    }
                );
            } else {
                severityContainer.innerHTML = '<div class="text-center p-3 text-muted">No severity data available.</div>';
            }
        }

        // 3. Prepare data for Risk Heatmap (EPSS vs. CVSS)
        const heatmapHeader = ['CVSS Score', 'EPSS Probability', { role: 'tooltip', type: 'string' }];
        const heatmapRows = cveData.map(cve => {
            const cvssScore = cve.Score || 0;
            const epssProb = (cve.EPSSProbability || 0) * 100;
            const tooltip = `${cve.CveId}\nApp: ${cve.AppName}\nCVSS: ${cvssScore}, EPSS: ${epssProb.toFixed(2)}%`;
            return [cvssScore, epssProb, tooltip];
        });

        // Render Scatter Chart
        if (heatmapContainer && charting) {
            charting.renderScatterChart(
                heatmapContainer.id,
                heatmapRows,
                heatmapHeader,
                {
                    title: 'Risk Heatmap: Technical Severity vs Real-World Threat',
                    extraOptions: {
                        height: 300,
                        width: '100%',
                        chartArea: { left: 80, top: 60, width: '75%', height: '70%' },
                        hAxis: { 
                            title: 'CVSS Score (Technical Severity)', 
                            minValue: 0, 
                            maxValue: 10,
                            titleTextStyle: { fontSize: 11 }
                        },
                        vAxis: { 
                            title: 'EPSS Probability (%)', 
                            minValue: 0,
                            titleTextStyle: { fontSize: 11 }
                        },
                        titleTextStyle: { fontSize: 12 },
                        legend: { position: 'none' }
                    }
                }
            );
        }
    }

    renderSecurityInsights(cveData) {
        if (!cveData || cveData.length === 0) {
            return;
        }

        // Calculate severity distribution
        const severityCounts = cveData.reduce((acc, cve) => {
            const severity = cve.Severity || 'UNKNOWN';
            acc[severity] = (acc[severity] || 0) + 1;
            return acc;
        }, {});

        const total = cveData.length;
        const critPct = Math.round((severityCounts.CRITICAL || 0) / total * 100);
        const highPct = Math.round((severityCounts.HIGH || 0) / total * 100);
        const medPct = Math.round((severityCounts.MEDIUM || 0) / total * 100);
        const lowPct = 100 - critPct - highPct - medPct;

        // Update progress bars with null checks - ensure DOM is ready
        setTimeout(() => {
            const progressCritical = document.getElementById('progress-critical');
            const progressHigh = document.getElementById('progress-high');
            const progressMedium = document.getElementById('progress-medium');
            const progressLow = document.getElementById('progress-low');
            
            if (progressCritical) progressCritical.style.width = critPct + '%';
            if (progressHigh) progressHigh.style.width = highPct + '%';
            if (progressMedium) progressMedium.style.width = medPct + '%';
            if (progressLow) progressLow.style.width = lowPct + '%';

            // Update percentages with null checks
            const critPctEl = document.getElementById('crit-pct');
            const highPctEl = document.getElementById('high-pct');
            const medPctEl = document.getElementById('med-pct');
            const lowPctEl = document.getElementById('low-pct');
            
            if (critPctEl) critPctEl.textContent = critPct + '%';
            if (highPctEl) highPctEl.textContent = highPct + '%';
            if (medPctEl) medPctEl.textContent = medPct + '%';
            if (lowPctEl) lowPctEl.textContent = lowPct + '%';
        }, 100);

        // Calculate threat intelligence metrics
        const epssCount = cveData.filter(cve => cve.EPSSProbability !== null && cve.EPSSProbability !== undefined).length;
        const epssCoverage = Math.round((epssCount / total) * 100);
        const veryHighRisk = cveData.filter(cve => cve.EPSSProbability && (cve.EPSSProbability * 100) >= 30).length;
        const uniqueApps = new Set(cveData.map(cve => cve.AppName).filter(Boolean)).size;

        const epssCoverageEl = document.getElementById('epss-coverage');
        const veryHighRiskEl = document.getElementById('very-high-risk');
        const appsAffectedEl = document.getElementById('apps-affected');
        
        setTimeout(() => {
            if (epssCoverageEl) epssCoverageEl.textContent = epssCoverage + '%';
            if (veryHighRiskEl) veryHighRiskEl.textContent = veryHighRisk;
            if (appsAffectedEl) appsAffectedEl.textContent = uniqueApps;
        }, 100);

        // Update additional risk metrics
        setTimeout(() => {
            this.updateAdditionalRiskMetrics(cveData, epssCoverage);
        }, 150);

        // Generate action recommendations
        this.generateRecommendations(cveData);
    }

    updateAdditionalRiskMetrics(cveData, epssCoverage) {
        // Update EPSS Coverage gauge
        setTimeout(() => {
            const epssValueEl = document.getElementById('epss-gauge-value');
            const epssProgressEl = document.getElementById('epss-progress');
            if (epssValueEl) epssValueEl.textContent = epssCoverage + '%';
            if (epssProgressEl) epssProgressEl.style.width = epssCoverage + '%';
        }, 50);

        // Calculate and update average risk score
        const validEpssScores = cveData.filter(cve => cve.EPSSProbability !== null && cve.EPSSProbability !== undefined);
        let avgRiskScore = 0;
        if (validEpssScores.length > 0) {
            avgRiskScore = validEpssScores.reduce((sum, cve) => sum + (cve.EPSSProbability * 100), 0) / validEpssScores.length;
        }
        
        setTimeout(() => {
            const riskScoreEl = document.getElementById('avg-risk-score');
            const riskProgressEl = document.getElementById('risk-score-progress');
            if (riskScoreEl) riskScoreEl.textContent = avgRiskScore.toFixed(1) + '%';
            const riskScorePercentage = Math.min(avgRiskScore, 100); // Cap at 100% for progress bar
            if (riskProgressEl) riskProgressEl.style.width = riskScorePercentage + '%';
        }, 50);

        // Calculate patch velocity (average age of vulnerabilities)
        const now = new Date();
        const validDates = cveData.filter(cve => cve.FirstSeen);
        let avgPatchVelocity = 0;
        
        if (validDates.length > 0) {
            const totalAge = validDates.reduce((sum, cve) => {
                const firstSeenDate = new Date(cve.FirstSeen);
                const ageInDays = Math.floor((now - firstSeenDate) / (1000 * 60 * 60 * 24));
                return sum + Math.max(0, ageInDays); // Ensure non-negative
            }, 0);
            avgPatchVelocity = Math.round(totalAge / validDates.length);
        }

        setTimeout(() => {
            const velocityEl = document.getElementById('patch-velocity');
            const velocityProgressEl = document.getElementById('velocity-progress');
            const velocityDisplay = avgPatchVelocity === 0 ? '< 1 day' : avgPatchVelocity + ' days';
            if (velocityEl) velocityEl.textContent = velocityDisplay;
            // For demo data with 0 days, show some reasonable progress
            let velocityPercentage = 0;
            if (avgPatchVelocity === 0) {
                velocityPercentage = 95; // High velocity (good)
            } else {
                velocityPercentage = Math.max(10, 100 - Math.min(avgPatchVelocity, 90)); // Scale properly
            }
            if (velocityProgressEl) velocityProgressEl.style.width = velocityPercentage + '%';
        }, 50);
    }

    generateRecommendations(cveData) {
        const recommendations = [];
        const threatIntel = this.getThreatIntel();

        // Check for KEV vulnerabilities
        const kevCount = cveData.filter(cve => 
            threatIntel && threatIntel.isKnownExploited && threatIntel.isKnownExploited(cve.CveId)
        ).length;
        
        if (kevCount > 0) {
            recommendations.push({
                priority: 'high',
                icon: 'ti-alert-triangle',
                text: `Patch ${kevCount} known exploited vulnerabilities immediately`,
                class: 'alert-danger'
            });
        }

        // Check for high EPSS scores
        const highEpss = cveData.filter(cve => cve.EPSSProbability && (cve.EPSSProbability * 100) >= 10).length;
        if (highEpss > 0) {
            recommendations.push({
                priority: 'medium',
                icon: 'ti-trending-up',
                text: `Prioritize ${highEpss} vulnerabilities with high exploitation probability`,
                class: 'alert-warning'
            });
        }

        // Check for critical vulnerabilities
        const criticalCount = cveData.filter(cve => cve.Severity === 'CRITICAL').length;
        if (criticalCount > 0) {
            recommendations.push({
                priority: 'medium',
                icon: 'ti-shield-exclamation',
                text: `Review ${criticalCount} critical vulnerabilities for business impact`,
                class: 'alert-info'
            });
        }

        // Check vulnerability age
        const now = new Date();
        const oldVulns = cveData.filter(cve => {
            if (!cve.FirstSeen) return false;
            const ageInDays = Math.floor((now - new Date(cve.FirstSeen)) / (1000 * 60 * 60 * 24));
            return ageInDays > 30;
        }).length;

        if (oldVulns > 0) {
            recommendations.push({
                priority: 'low',
                icon: 'ti-clock',
                text: `${oldVulns} vulnerabilities are over 30 days old - review patch management process`,
                class: 'alert-secondary'
            });
        }

        // Render recommendations
        const container = document.getElementById('action-recommendations');
        if (!container) {
            console.warn('action-recommendations container not found, skipping recommendations update');
            return;
        }
        
        if (recommendations.length === 0) {
            container.innerHTML = `
                <div class="alert alert-success py-2 mb-2">
                    <div class="d-flex align-items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"></path>
                            <path d="M9 12l2 2l4 -4"></path>
                        </svg>
                        <div>No urgent actions required. Continue monitoring.</div>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = recommendations.map(rec => {
                let iconSvg = '';
                switch(rec.icon) {
                    case 'ti-alert-triangle':
                        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M12 9v4"></path>
                            <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"></path>
                            <path d="M12 16h.01"></path>
                        </svg>`;
                        break;
                    case 'ti-trending-up':
                        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M3 17l6 -6l4 4l8 -8"></path>
                            <path d="M14 7l7 0l0 7"></path>
                        </svg>`;
                        break;
                    case 'ti-shield-exclamation':
                        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3z"></path>
                            <path d="M12 8v4"></path>
                            <path d="M12 16h.01"></path>
                        </svg>`;
                        break;
                    case 'ti-clock':
                        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"></path>
                            <path d="M12 7v5l3 3"></path>
                        </svg>`;
                        break;
                    default:
                        iconSvg = `<i class="${rec.icon} me-2"></i>`;
                }
                
                return `
                    <div class="alert ${rec.class} py-2 mb-2">
                        <div class="d-flex align-items-center">
                            ${iconSvg}
                            <div class="small">${rec.text}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    renderVulnerabilitiesTable(cveData, page = 1) {
        this.currentPage = page;
        const tableBody = this.container.querySelector('#cve-remediation-table')?.querySelector('tbody');
        const paginationContainer = this.container.querySelector('#cve-table-pagination');

        if (!tableBody || !paginationContainer) {
            console.error('Remediation table body or pagination container not found');
            return;
        }

        if (!cveData || cveData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center">No vulnerability data available for the selected scope.</td></tr>';
            paginationContainer.innerHTML = '';
            
            // Update pagination info for empty state
            const paginationInfoEl = document.getElementById('pagination-info');
            const totalItemsEl = document.getElementById('total-items');
            
            if (paginationInfoEl) {
                paginationInfoEl.textContent = '0 to 0';
            }
            if (totalItemsEl) {
                totalItemsEl.textContent = '0';
            }
            
            return;
        }

        // Sort data: KEV status, then EPSS probability, then CVSS score
        const sortedData = cveData.sort((a, b) => {
            const threatIntel = this.getThreatIntel();
            const aIsKev = threatIntel && threatIntel.isKnownExploited ? threatIntel.isKnownExploited(a.CveId) : false;
            const bIsKev = threatIntel && threatIntel.isKnownExploited ? threatIntel.isKnownExploited(b.CveId) : false;
            if (aIsKev !== bIsKev) return aIsKev ? -1 : 1; // Prioritize KEV

            const epssA = a.EPSSProbability || 0;
            const epssB = b.EPSSProbability || 0;
            if (epssA !== epssB) return epssB - epssA; // Then by EPSS

            const scoreA = a.Score || 0;
            const scoreB = b.Score || 0;
            return scoreB - scoreA; // Finally by CVSS
        });

        // Pagination logic
        const totalItems = sortedData.length;
        const totalPages = Math.ceil(totalItems / this.ITEMS_PER_PAGE);
        const startIndex = (page - 1) * this.ITEMS_PER_PAGE;
        const endIndex = startIndex + this.ITEMS_PER_PAGE;
        const paginatedData = sortedData.slice(startIndex, endIndex);

        tableBody.innerHTML = paginatedData.map(cve => {
            const threatIntel = this.getThreatIntel();
            const isKev = threatIntel && threatIntel.isKnownExploited ? threatIntel.isKnownExploited(cve.CveId) : false;
            const kevBadge = isKev ? '<span class="badge bg-red text-red-fg">KEV</span>' : '';
            const firstSeen = cve.FirstSeen ? new Date(cve.FirstSeen).toLocaleDateString() : 'N/A';
            
            // Enhanced Risk Score display with visual indicators
            let threatLevelDisplay = 'N/A';
            if (cve.EPSSProbability) {
                const epssPercent = (cve.EPSSProbability * 100);
                const epssFormatted = epssPercent.toFixed(1) + '%';
                
                // Determine threat level and styling based on EPSS score
                let threatLevel, badgeClass, iconClass;
                if (epssPercent >= 10) {
                    threatLevel = 'HIGH RISK';
                    badgeClass = 'bg-red text-white';
                    iconClass = 'ti-alert-triangle';
                } else if (epssPercent >= 1) {
                    threatLevel = 'MEDIUM';
                    badgeClass = 'bg-yellow text-dark';
                    iconClass = 'ti-alert-circle';
                } else {
                    threatLevel = 'LOW';
                    badgeClass = 'bg-green text-white';
                    iconClass = 'ti-info-circle';
                }
                
                threatLevelDisplay = `
                    <div class="d-flex flex-column align-items-center">
                        <span class="badge ${badgeClass} mb-1">
                            <i class="ti ${iconClass} me-1"></i>${threatLevel}
                        </span>
                        <small class="text-muted">${epssFormatted}</small>
                    </div>
                `;
            }

            return `
            <tr>
                <td><a href="https://nvd.nist.gov/vuln/detail/${cve.CveId}" target="_blank">${cve.CveId}</a></td>
                <td>${cve.Severity || 'N/A'}</td>
                <td>${cve.Score || 'N/A'}</td>
                <td class="text-center">${threatLevelDisplay}</td>
                <td class="text-center">${kevBadge}</td>
                <td class="text-center">${cve.DeviceCount || 1}</td>
                <td>${firstSeen}</td>
                <td><a href="#" class="btn btn-sm btn-ghost-primary details-btn" data-cve-id="${cve.CveId}">Details</a></td>
            </tr>
        `}).join('');

        // Setup pagination controls
        window.uiUtils.setupPagination(paginationContainer, totalPages, (newPage) => {
            this.renderVulnerabilitiesTable(this.fullCveData, newPage);
        }, page);

        // Update pagination info text
        const startItem = Math.min((page - 1) * this.ITEMS_PER_PAGE + 1, totalItems);
        const endItem = Math.min(page * this.ITEMS_PER_PAGE, totalItems);
        
        const paginationInfoEl = document.getElementById('pagination-info');
        const totalItemsEl = document.getElementById('total-items');
        
        if (paginationInfoEl) {
            paginationInfoEl.textContent = totalItems > 0 ? `${startItem} to ${endItem}` : '0 to 0';
        }
        if (totalItemsEl) {
            totalItemsEl.textContent = totalItems;
        }

        // Add event listeners for details buttons
        this.addDetailButtonListeners();
    }

    addDetailButtonListeners() {
        const tableBody = this.container.querySelector('#cve-remediation-table')?.querySelector('tbody');
        if (!tableBody) return;

        tableBody.addEventListener('click', (event) => {
            const target = event.target.closest('.details-btn');
            if (target) {
                event.preventDefault();
                const cveId = target.dataset.cveId;
                this.showDetailsModal(cveId);
            }
        });
    }

    showDetailsModal(cveId) {
        const cve = this.fullCveData.find(c => c.CveId === cveId);
        if (!cve) {
            console.error(`CVE ${cveId} not found in data`);
            return;
        }

        const threatIntel = this.getThreatIntel();
        const isKev = threatIntel && threatIntel.isKnownExploited ? threatIntel.isKnownExploited(cve.CveId) : false;
        const kevPill = isKev ? '<span class="badge bg-red-lt ms-2">In CISA KEV</span>' : '';

        const body = `
            <div class="row g-3">
                <div class="col-md-6">
                    <label class="form-label text-muted">Severity</label>
                    <div class="d-flex align-items-center">
                        <span class="badge ${this.getSeverityBadgeClass(cve.Severity)} me-2">${cve.Severity || 'N/A'}</span>
                        <span class="text-muted">CVSS: ${cve.Score || 'N/A'}</span>
                    </div>
                </div>
                <div class="col-md-6">
                    <label class="form-label text-muted">Threat Level</label>
                    <div>${cve.EPSSProbability ? (cve.EPSSProbability * 100).toFixed(1) + '% exploitation probability' : 'N/A'}</div>
                </div>
                <div class="col-12">
                    <label class="form-label text-muted">Application</label>
                    <div class="d-flex align-items-center">
                        <i class="ti ti-app-window me-2 text-blue"></i>
                        <span>${cve.AppName || 'N/A'} ${cve.AppVersion || ''}</span>
                        ${cve.AppVendor ? `<small class="text-muted ms-2">by ${cve.AppVendor}</small>` : ''}
                    </div>
                </div>
                <div class="col-12">
                    <label class="form-label text-muted">Discovery Date</label>
                    <div class="d-flex align-items-center">
                        <i class="ti ti-calendar me-2 text-green"></i>
                        <span>${cve.FirstSeen ? new Date(cve.FirstSeen).toLocaleString() : 'N/A'}</span>
                    </div>
                </div>
                <div class="col-12">
                    <label class="form-label text-muted">Affected Devices (${cve.DeviceCount || 0})</label>
                    ${cve.Devices && cve.Devices.length > 0 ? 
                        `<div class="list-group list-group-flush">
                            ${cve.Devices.slice(0, 5).map(d => `
                                <div class="list-group-item px-0 py-2 border-0">
                                    <i class="ti ti-device-desktop me-2 text-blue"></i>
                                    <span class="font-monospace">${d}</span>
                                </div>
                            `).join('')}
                            ${cve.Devices.length > 5 ? `
                                <div class="list-group-item px-0 py-2 border-0 text-muted">
                                    <i class="ti ti-dots me-2"></i>
                                    ... and ${cve.Devices.length - 5} more devices
                                </div>
                            ` : ''}
                        </div>` : 
                        '<div class="text-muted"><i class="ti ti-info-circle me-2"></i>No specific device information available.</div>'
                    }
                </div>
            </div>
        `;

        window.uiUtils.showModal({
            id: 'cve-details-modal',
            title: `Details for ${cve.CveId}${kevPill}`,
            body: body,
            size: 'modal-lg'
        });
    }

    getSeverityBadgeClass(severity) {
        switch(severity) {
            case 'CRITICAL': return 'bg-red text-white';
            case 'HIGH': return 'bg-orange text-white';
            case 'MEDIUM': return 'bg-yellow text-dark';
            case 'LOW': return 'bg-green text-white';
            default: return 'bg-gray text-white';
        }
    }

    initializeTooltips() {
        // Initialize Bootstrap tooltips for info icons
        const tooltipElements = this.container.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltipElements.forEach(element => {
            if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
                new bootstrap.Tooltip(element);
            }
        });
    }

    showLoadingIndicators(isLoading) {
        const loadingClass = 'loading-placeholder';
        const selectors = [
            '#critical-count', '#kev-count', '#high-risk-count', '#avg-age',
            '#org-exploitability-gauge', '#severity-distribution-chart', '#risk-heatmap-chart',
            '#epss-gauge-value', '#avg-risk-score', '#patch-velocity'
        ];

        selectors.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                if (isLoading) {
                    element.classList.add(loadingClass);
                    if (element.textContent) {
                        element.dataset.originalText = element.textContent;
                        element.textContent = '...';
                    }
                } else {
                    element.classList.remove(loadingClass);
                    if (element.dataset.originalText) {
                        element.textContent = element.dataset.originalText;
                        delete element.dataset.originalText;
                    }
                }
            }
        });

        // Show/hide table loading
        const tableBody = document.querySelector('#cve-remediation-table tbody');
        if (tableBody) {
            if (isLoading) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-center p-4">
                            <div class="d-flex align-items-center justify-content-center">
                                <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                                <span>Loading vulnerability data...</span>
                            </div>
                        </td>
                    </tr>
                `;
            }
        }

        console.log(`Setting loading state to: ${isLoading}`);
    }
}
})();
