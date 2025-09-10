// Configuration for the MSCC (MagenSec Command Center) portal
// API base is automatically updated by buildDeployContainer.ps1 during deployment

window.msccConfig = {
  // API base (automatically updated during deployment)
  apiBase: 'https://ms-central-api.braveisland-ad151ae6.eastus.azurecontainerapps.io',
  
  // OAuth configuration
  oauth: {
    // Google OAuth Web Client ID (for web applications)
    clientId: '530204671754-ev6q9q91d61cpiepvrfetk72m3og7s0k.apps.googleusercontent.com',
    redirectUri: 'https://magensec.gigabits.co.in/mscc/login.html'
  },
  
  // Feature flags
  features: {
    offlineMode: true,      // Allow operation without backend
    demoData: false,        // Use demo data when backend unavailable
    auditLogging: true,     // Enable audit logging
    realTimeUpdates: false  // Enable real-time telemetry updates
  },
  
  // Cache settings
  cache: {
    ttlMinutes: 5,          // Cache TTL in minutes
    maxSizeMB: 50           // Maximum cache size
  }
};

// Simple API resolver (no dynamic resolution needed)
window.apiResolver = {
  async resolveApiBase() {
    // Return the configured API base (updated by build script)
    return window.msccConfig.apiBase;
  }
};
