/**
 * Severity badge component for vulnerabilities and findings
 * @param {Object} props
 * @param {string} props.severity - Critical, High, Medium, Low
 * @param {number} props.count - Optional count to display
 * @param {string} props.size - sm, md, lg
 */
export function SeverityBadge({ severity, count, size = 'md' }) {
    const { html } = window;
    const config = getSeverityConfig(severity);
    const sizeClass = size === 'sm' ? 'badge-sm' : '';
    
    return html`
        <span class="badge ${config.color} ${sizeClass}">
            ${count !== undefined ? `${count} ` : ''}${config.text}
        </span>
    `;
}

export function getSeverityConfig(severity) {
    const normalized = (severity || '').toLowerCase();
    
    switch (normalized) {
        case 'critical':
            return { text: 'Critical', color: 'bg-danger', weight: 4 };
        case 'high':
            return { text: 'High', color: 'bg-warning', weight: 3 };
        case 'medium':
            return { text: 'Medium', color: 'bg-info', weight: 2 };
        case 'low':
            return { text: 'Low', color: 'bg-success', weight: 1 };
        default:
            return { text: 'Unknown', color: 'bg-secondary', weight: 0 };
    }
}

export function getSeverityColor(severity) {
    return getSeverityConfig(severity).color.replace('bg-', '');
}

/**
 * Risk score badge with color coding
 * @param {Object} props
 * @param {number} props.score - Risk score 0-100
 * @param {boolean} props.showLabel - Whether to show "Risk" label
 */
export function RiskScoreBadge({ score, showLabel = true }) {
    const color = getRiskScoreColor(score);
    const label = getRiskScoreLabel(score);
    
    return html`
        <span class="badge bg-${color} text-white">
            ${showLabel ? `${label} ` : ''}${score}
        </span>
    `;
}

export function getRiskScoreColor(score) {
    if (score >= 80) return 'danger';   // High risk
    if (score >= 60) return 'warning';  // Medium risk
    if (score >= 40) return 'info';     // Low risk
    return 'success';                    // Very low risk
}

export function getRiskScoreLabel(score) {
    if (score >= 80) return 'Critical';
    if (score >= 60) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
}

/**
 * Grade badge (A, B, C, D, F)
 * @param {Object} props
 * @param {number} props.score - Score 0-100
 */
export function GradeBadge({ score }) {
    const grade = getGrade(score);
    const color = getGradeColor(grade);
    
    return html`
        <span class="badge bg-${color}">Grade ${grade}</span>
    `;
}

export function getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

export function getGradeColor(grade) {
    switch (grade) {
        case 'A': return 'success';
        case 'B': return 'info';
        case 'C': return 'warning';
        case 'D': return 'warning';
        default: return 'danger';
    }
}
