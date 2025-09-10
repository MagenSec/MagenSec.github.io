// Configuration for the MSCC (MagenSec Command Center) portal
// Production configuration with dynamic API resolution

window.msccConfig = {
  // Use short URL directly as API base (no resolution needed)
  apiBase: 'https://magensec.short.gy/webapi',
  
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

// API Resolution System (simplified - uses short URL directly)
window.apiResolver = {
  async resolveApiBase() {
    // No resolution needed - just return the configured short URL API base
    return window.msccConfig.apiBase;
  }
};
