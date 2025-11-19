import { html } from 'https://unpkg.com/htm/preact/standalone.module.js';

/**
 * Curated prompt suggestions categorized by user type
 */
const PROMPT_LIBRARY = {
    ciso: {
        label: 'CISO / Enterprise',
        icon: 'shield-check',
        prompts: [
            'What are the critical vulnerabilities that need immediate attention?',
            'Show me all high-severity security issues across the organization',
            'Which devices have the most compliance violations?',
            'What is our current patch compliance status?',
            'Identify devices with outdated critical software',
            'Show me security trends over the last 30 days',
            'Which applications pose the highest security risk?'
        ]
    },
    smb: {
        label: 'SMB / IT Manager',
        icon: 'building',
        prompts: [
            'What security issues should I fix first?',
            'Show me devices that need updates',
            'Which computers are at risk?',
            'What are the top 5 security problems?',
            'Are there any critical vulnerabilities?',
            'Show me patch status for all devices',
            'Which software needs updating?'
        ]
    },
    individual: {
        label: 'Individual / Home User',
        icon: 'user',
        prompts: [
            'Is my computer secure?',
            'What updates do I need to install?',
            'Show me any security warnings',
            'Which programs should I update?',
            'Are there any critical issues?',
            'What are my biggest security risks?',
            'How can I improve my security?'
        ]
    }
};

/**
 * PromptSuggestions - Display categorized prompt suggestions
 * @param {Object} props
 * @param {Function} props.onSelectPrompt - Callback when user clicks a suggestion
 */
export function PromptSuggestions({ onSelectPrompt }) {
    return html`
        <div class="card mb-4">
            <div class="card-body">
                <details>
                    <summary class="d-flex align-items-center">
                                            <div class="card-stamp card-stamp-lg">
                        <i class="ti ti-bulb icon icon-tabler"></i>
                    </div>
                        <strong>Suggested Prompts</strong>
                    </summary>
                    <div class="mt-3">
                        ${Object.entries(PROMPT_LIBRARY).map(([key, category]) => html`
                            <${PromptCategory}
                                key=${key}
                                category=${category}
                                onSelectPrompt=${onSelectPrompt}
                            />
                        `)}
                    </div>
                </details>
            </div>
        </div>
    `;
}

function PromptCategory({ category, onSelectPrompt }) {
    return html`
        <div class="mb-3">
            <h4 class="mb-2">
                <i class="ti ti-${category.icon} icon icon-tabler me-2"></i>
                ${category.label}
            </h4>
            <div class="d-flex flex-wrap gap-2">
                ${category.prompts.map(prompt => html`
                    <button
                        class="btn btn-sm btn-outline-primary"
                        onClick=${() => onSelectPrompt(prompt)}
                        title="Click to use this prompt"
                    >
                        <i class="ti ti-message-circle icon icon-tabler me-2"></i>
                        ${truncatePrompt(prompt)}
                    </button>
                `)}
            </div>
        </div>
    `;
}

/**
 * Truncate long prompts for display in chips
 */
function truncatePrompt(prompt, maxLength = 50) {
    if (prompt.length <= maxLength) {
        return prompt;
    }
    return prompt.substring(0, maxLength) + '...';
}
