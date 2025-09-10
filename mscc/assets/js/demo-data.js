/**
 * MagenSec Command Center - Real Data Structure
 * This file defines the organization structure for real user authentication
 * All user data comes from actual devices and Google OAuth authentication
 */

window.demoData = {
    // Organizations - Real organizations for user assignment
    organizations: {
        'demo-mage-nsec': {
            id: 'demo-mage-nsec',
            name: 'DEMO-MAGE-NSEC',
            type: 'demo',
            permissions: ['read:devices', 'manage:devices', 'demo:access'],
            description: 'Demo organization for all users to see their device data'
        },
        'demo-giga-bits': {
            id: 'demo-giga-bits',
            name: 'DEMO-GIGA-BITS',
            type: 'internal',
            permissions: ['read:all', 'manage:all', 'admin:platform', 'internal:access'],
            description: 'Internal MagenSec organization (reserved for internal use)'
        }
    },

    // No dummy data - all content comes from real user devices and authentication
    devices: {},
    security: {},
    vulnerabilities: {},
    compliance: {},
    activities: {},
    costs: {},
    
    // Helper messages for empty states
    messages: {
        noDevices: "No devices found. Install MagenSec on your Windows devices to see them here.",
        noData: "Data will appear here once you have devices registered with MagenSec.",
        authRequired: "Please authenticate to view your device data."
    }
};

// Helper function to get organization info
window.getOrganizationInfo = function(orgId) {
    return window.demoData.organizations[orgId] || window.demoData.organizations['demo-mage-nsec'];
};

// Function to check if user is internal (MagenSec/GigaBits)
window.isInternalUser = function(userEmail) {
    if (!userEmail) return false;
    const domain = userEmail.split('@')[1]?.toLowerCase();
    return domain === 'magensec.com' || domain === 'gigabits.co.in';
};

// Function to get user's organization based on email
window.getUserOrganization = function(userEmail) {
    if (window.isInternalUser(userEmail)) {
        return window.demoData.organizations['demo-giga-bits'];
    }
    return window.demoData.organizations['demo-mage-nsec'];
};

// Function to simulate API responses with real data structure
window.simulateApiResponse = function(endpoint, userContext = null) {
    return new Promise((resolve, reject) => {
        // Simulate network delay
        setTimeout(() => {
            if (!userContext || !userContext.isAuthenticated) {
                reject(new Error('Authentication required'));
                return;
            }

            // Return empty data structures - real data will come from actual API
            if (endpoint.includes('/devices')) {
                resolve({ devices: [], message: window.demoData.messages.noDevices });
            } else if (endpoint.includes('/analytics/security/overview')) {
                resolve({ message: window.demoData.messages.noData });
            } else if (endpoint.includes('/analytics/vulnerabilities')) {
                resolve({ vulnerabilities: [], message: window.demoData.messages.noData });
            } else if (endpoint.includes('/analytics/compliance')) {
                resolve({ frameworks: [], message: window.demoData.messages.noData });
            } else if (endpoint.includes('/analytics/activities')) {
                resolve({ activities: [], message: window.demoData.messages.noData });
            } else {
                resolve({ message: window.demoData.messages.noData });
            }
        }, Math.random() * 500 + 200); // 200-700ms delay
    });
};
