// Configuration for the MSCC (MagenSec Command Center) portal
// Production configuration with dynamic API resolution

window.msccConfig = {
  // API resolution will be done dynamically on page load
  apiBase: null, // Will be resolved dynamically
  
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

// API Resolution System (only uses short URL)
window.apiResolver = {
  cachedApiBase: null,
  resolutionPromise: null,
  
  async resolveApiBase() {
    // Return cached result if available
    if (this.cachedApiBase) {
      return this.cachedApiBase;
    }
    
    // Return existing promise if resolution is in progress
    if (this.resolutionPromise) {
      return this.resolutionPromise;
    }
    
    // Start new resolution
    this.resolutionPromise = this._doResolveApiBase();
    
    try {
      this.cachedApiBase = await this.resolutionPromise;
      return this.cachedApiBase;
    } finally {
      this.resolutionPromise = null;
    }
  },
  
  async _doResolveApiBase() {
    console.log('Starting API base resolution using short URL...');
    
    try {
      const shortUrlResponse = await fetch('https://magensec.short.gy/webapi/healthz', {
        method: 'HEAD',
        mode: 'cors'
      });
      
      if (shortUrlResponse.ok) {
        const resolvedUrl = shortUrlResponse.url;
        // Extract base URL from the resolved URL (remove /healthz)
        const url = new URL(resolvedUrl);
        const apiBase = `${url.protocol}//${url.host}`;
        console.log('Short URL resolved to:', apiBase);
        return apiBase;
      }
    } catch (error) {
      console.error('Short URL resolution failed:', error.message);
    }
    
    // Show user-friendly notification if short URL fails
    this._showApiResolutionError();
    throw new Error('Unable to resolve API endpoint. Please contact support.');
  },
  
  _showApiResolutionError() {
    // Create and show notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 9999;
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.4;
    `;
    notification.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px;">Service Unavailable</div>
      <div>Unable to connect to MagenSec services. Please check your internet connection or contact support.</div>
      <button onclick="this.parentElement.remove()" style="
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">&times;</button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 10000);
  }
};
