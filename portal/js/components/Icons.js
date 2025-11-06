/**
 * SVG Icon Library
 * Icons from Heroicons (https://heroicons.com) - MIT License
 * 
 * Usage:
 *   import { Icons } from './Icons.js';
 *   html`<${Icons.User} size=${20} color="white" className="mr-2" />`
 */

const { html } = window;

/**
 * User icon (Individual org, profile)
 */
export const User = ({ size = 24, color = 'currentColor', className = '' }) => html`
    <svg 
        class=${className}
        width=${size} 
        height=${size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke=${color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>
`;

/**
 * Building icon (Business org)
 */
export const Building = ({ size = 24, color = 'currentColor', className = '' }) => html`
    <svg 
        class=${className}
        width=${size} 
        height=${size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke=${color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
        <path d="M9 22v-4h6v4"></path>
        <path d="M8 6h.01"></path>
        <path d="M16 6h.01"></path>
        <path d="M12 6h.01"></path>
        <path d="M12 10h.01"></path>
        <path d="M12 14h.01"></path>
        <path d="M16 10h.01"></path>
        <path d="M16 14h.01"></path>
        <path d="M8 10h.01"></path>
        <path d="M8 14h.01"></path>
    </svg>
`;

/**
 * Shield icon (Security, protection)
 */
export const Shield = ({ size = 24, color = 'currentColor', className = '' }) => html`
    <svg 
        class=${className}
        width=${size} 
        height=${size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke=${color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
    </svg>
`;

/**
 * ChevronDown icon (Dropdown indicator)
 */
export const ChevronDown = ({ size = 24, color = 'currentColor', className = '' }) => html`
    <svg 
        class=${className}
        width=${size} 
        height=${size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke=${color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
`;

/**
 * Search icon (Search input)
 */
export const Search = ({ size = 24, color = 'currentColor', className = '' }) => html`
    <svg 
        class=${className}
        width=${size} 
        height=${size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke=${color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
    </svg>
`;

/**
 * Check icon (Selected state, success)
 */
export const Check = ({ size = 24, color = 'currentColor', className = '' }) => html`
    <svg 
        class=${className}
        width=${size} 
        height=${size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke=${color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
`;

/**
 * X icon (Close, dismiss)
 */
export const X = ({ size = 24, color = 'currentColor', className = '' }) => html`
    <svg 
        class=${className}
        width=${size} 
        height=${size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke=${color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
`;

/**
 * AlertCircle icon (Warnings, errors)
 */
export const AlertCircle = ({ size = 24, color = 'currentColor', className = '' }) => html`
    <svg 
        class=${className}
        width=${size} 
        height=${size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke=${color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
`;

/**
 * Laptop icon (Device)
 */
export const Laptop = ({ size = 24, color = 'currentColor', className = '' }) => html`
    <svg 
        class=${className}
        width=${size} 
        height=${size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke=${color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="2" y1="20" x2="22" y2="20"></line>
    </svg>
`;

/**
 * Activity icon (Telemetry, monitoring)
 */
export const Activity = ({ size = 24, color = 'currentColor', className = '' }) => html`
    <svg 
        class=${className}
        width=${size} 
        height=${size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke=${color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
`;

// Export all icons as named exports
export const Icons = {
    User,
    Building,
    Shield,
    ChevronDown,
    Search,
    Check,
    X,
    AlertCircle,
    Laptop,
    Activity
};
