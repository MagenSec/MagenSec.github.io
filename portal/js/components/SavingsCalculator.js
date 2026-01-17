/**
 * Security Savings Calculator Widget
 * Shows ROI from MagenSec license vs potential breach costs
 * Pricing: $1.99/user/device/month (Business), $4.99/org/year up to 5 devices (Personal)
 */

const { html, Component } = window;

export class SavingsCalculator extends Component {
    constructor(props) {
        super(props);
        this.chartInstance = null;
        this.chartEl = null;
    }

    componentDidMount() {
        this.renderChart();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.deviceCount !== this.props.deviceCount || 
            prevProps.vulnerabilities !== this.props.vulnerabilities ||
            prevProps.isPersonal !== this.props.isPersonal) {
            this.renderChart();
        }
    }

    componentWillUnmount() {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }

    calculateSavings() {
        const { deviceCount = 1, vulnerabilities = {}, isPersonal = false } = this.props;
        
        // MagenSec Pricing
        // Business: $1.99/user/device/month = $23.88/user/device/year
        // Personal: $4.99/org/year (up to 5 devices)
        const pricePerDeviceYear = isPersonal ? (4.99 / Math.min(deviceCount, 5)) : (1.99 * 12);
        const annualLicenseCost = isPersonal ? 4.99 : (deviceCount * 1.99 * 12);
        
        // Industry average breach costs (IBM Cost of Data Breach 2024)
        const costPerCritical = 2400;  // $2,400 per critical CVE unpatched
        const costPerHigh = 800;       // $800 per high severity CVE
        
        const critical = vulnerabilities.critical || 0;
        const high = vulnerabilities.high || 0;
        
        // Conservative: Only count unmitigated critical/high
        const potentialBreachCost = (critical * costPerCritical) + (high * costPerHigh);
        
        // ROI calculation
        const costAvoidance = Math.max(0, potentialBreachCost - annualLicenseCost);
        const roi = annualLicenseCost > 0 ? ((costAvoidance / annualLicenseCost) * 100) : 0;
        const paybackDays = annualLicenseCost > 0 && costAvoidance > 0 ? 
            Math.ceil((annualLicenseCost / (costAvoidance / 365))) : 0;
        
        return {
            annualLicenseCost,
            potentialBreachCost,
            costAvoidance,
            roi,
            paybackDays,
            pricePerDevice: pricePerDeviceYear
        };
    }

    renderChart() {
        if (!window.Chart || !this.chartEl) return;
        
        const savings = this.calculateSavings();
        const maxValue = Math.max(savings.annualLicenseCost, savings.costAvoidance);
        const percentAvoided = maxValue > 0 ? (savings.costAvoidance / maxValue) * 100 : 0;
        
        const config = {
            type: 'bar',
            data: {
                labels: ['Annual Cost', 'Cost Avoidance'],
                datasets: [{
                    label: 'Amount ($)',
                    data: [savings.annualLicenseCost, savings.costAvoidance],
                    backgroundColor: ['#d63939', '#2fb344'],
                    borderWidth: 0
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `$${context.parsed.x.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => `$${value}`
                        }
                    }
                }
            }
        };
        
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }
        
        this.chartInstance = new window.Chart(this.chartEl, config);
    }

    render() {
        const savings = this.calculateSavings();
        const { deviceCount = 1, isPersonal = false } = this.props;
        
        return html`
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2 text-success" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <path d="M9 14c0 1.657 2.686 3 6 3s6 -1.343 6 -3s-2.686 -3 -6 -3s-6 1.343 -6 3z"/>
                            <path d="M9 14v4c0 1.656 2.686 3 6 3s6 -1.344 6 -3v-4"/>
                            <path d="M3 6c0 1.072 1.144 2.062 3 2.598s4.144 .536 6 0c1.856 -.536 3 -1.526 3 -2.598c0 -1.072 -1.144 -2.062 -3 -2.598s-4.144 -.536 -6 0c-1.856 .536 -3 1.526 -3 2.598z"/>
                            <path d="M3 6v10c0 .888 .772 1.45 2 2"/>
                            <path d="M3 11c0 .888 .772 1.45 2 2"/>
                        </svg>
                        Security Savings Calculator
                    </h3>
                </div>
                <div class="card-body">
                    <div class="row g-3 mb-3">
                        <div class="col-sm-6">
                            <div class="text-muted small text-uppercase fw-semibold">Annual License Cost</div>
                            <div class="h3 mb-0 text-danger">$${savings.annualLicenseCost.toFixed(2)}</div>
                            <div class="text-muted small">${deviceCount} device${deviceCount !== 1 ? 's' : ''} × $${savings.pricePerDevice}/year</div>
                        </div>
                        <div class="col-sm-6">
                            <div class="text-muted small text-uppercase fw-semibold">Potential Breach Cost Avoided</div>
                            <div class="h3 mb-0 text-success">$${savings.costAvoidance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                            <div class="text-muted small">From mitigating critical/high CVEs</div>
                        </div>
                    </div>

                    <div style="height: 120px; margin-bottom: 1rem;">
                        <canvas ref=${(el) => { this.chartEl = el; }}></canvas>
                    </div>

                    <div class="row g-3">
                        <div class="col-sm-6">
                            <div class="d-flex align-items-center">
                                <div class="subheader mb-0">Return on Investment</div>
                                <div class="ms-auto">
                                    <span class="badge bg-success-lt text-success fs-3">${savings.roi.toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-sm-6">
                            <div class="d-flex align-items-center">
                                <div class="subheader mb-0">Payback Period</div>
                                <div class="ms-auto">
                                    <span class="badge bg-info-lt text-info fs-3">${savings.paybackDays} days</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="alert alert-info mt-3 mb-0">
                        <div class="d-flex">
                            <div>
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                    <circle cx="12" cy="12" r="9"/>
                                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                                    <polyline points="11 12 12 12 12 16 13 16"/>
                                </svg>
                            </div>
                            <div>
                                <div class="fw-semibold">About this calculation</div>
                                <div class="text-muted small">
                                    Based on industry average breach costs: $2,400 per unpatched critical CVE, $800 per high severity CVE.
                                    ${isPersonal ? 'Personal' : 'Business'} license pricing applies.
                                    Actual savings may vary based on threat landscape and remediation speed.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
