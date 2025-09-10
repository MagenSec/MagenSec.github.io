// Copy this file to config.js and adjust values as needed.
// Configuration for the MSCC (MagenSec Command Center) portal
// Set apiBase to your Cloud API base URL for backend connectivity.

window.msccConfig = {
  // Cloud API base URL - e.g., 'https://magensec.gigabits.co.in' or your Container App URL
  apiBase: '',
  
  // OAuth configuration (if different from defaults)
  oauth: {
    // These will be filled in by the OAuth implementation
    clientId: '',
    redirectUri: ''
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
