# MagenSec Command Center (MSCC) Portal

A comprehensive web portal for security management serving three distinct user types with role-based access control and client-side data processing.

## Overview

The MagenSec Command Center is a modern web application built with HTML5, CSS3, and vanilla JavaScript. It provides security analytics, device management, and compliance monitoring through an intuitive dashboard interface.

## Architecture

### User Roles & Access Levels

1. **Individual Users (Housewife Persona)**
   - Personal device security monitoring
   - Simplified security alerts and recommendations
   - Windows Defender integration
   - Basic compliance checking

2. **Business Administrators (Startup Owner Persona)**
   - Organization-wide security oversight
   - Cost optimization analytics
   - Team device management
   - Compliance reporting for business frameworks

3. **Site Administrators (CISO Persona)**
   - Global platform oversight
   - Multi-organization management
   - Advanced threat intelligence
   - Enterprise compliance frameworks

### Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Authentication**: Google OAuth 2.0
- **Charts**: Chart.js
- **Storage**: Client-side caching with localStorage
- **Architecture**: Single Page Application (SPA)

### Key Features

- **Role-Based Dashboards**: Customized views based on user permissions
- **Real-time Security Monitoring**: Live threat detection and alerts
- **Cost Optimization**: Analytics for license and infrastructure costs
- **Compliance Management**: Multiple framework support (SOC 2, ISO 27001, GDPR, NIST)
- **Device Management**: Centralized device inventory and health monitoring
- **Client-side Processing**: Minimal server load with intelligent caching

## File Structure

```
Web/mscc/
├── index.html                 # Main application entry point
├── assets/
│   ├── css/
│   │   ├── main.css          # Core styling system
│   │   ├── dashboard.css     # Dashboard-specific styles
│   │   └── auth.css          # Authentication UI styles
│   ├── js/
│   │   ├── app.js            # Application initialization
│   │   ├── auth.js           # Authentication management
│   │   ├── api.js            # API interface layer
│   │   ├── cache.js          # Client-side caching
│   │   └── dashboard.js      # Dashboard UI management
├── views/
│   ├── individual-dashboard.html  # Individual user view
│   ├── business-dashboard.html    # Business admin view
│   └── admin-dashboard.html       # Site admin view
├── components/               # Reusable UI components (future)
└── MSCC_PORTAL_PLAN.md      # Comprehensive implementation plan
```

## Implementation Status

### ✅ Completed (Phase 1-2)
- [x] Project structure and foundation
- [x] Authentication system with Google OAuth
- [x] Role-based access control
- [x] CSS design system with CSS variables
- [x] Responsive dashboard layouts
- [x] Client-side caching system
- [x] API interface layer
- [x] Three distinct dashboard views
- [x] Modern UI components and styling

### 🚧 In Progress (Phase 3)
- [ ] Chart integration and data visualization
- [ ] Real API integration with Cloud backend
- [ ] Interactive dashboard widgets
- [ ] Mock data for demonstration

### 📋 Planned (Phase 4-8)
- [ ] Device management interfaces
- [ ] Advanced security analytics
- [ ] Report generation system
- [ ] Admin management tools
- [ ] Mobile responsiveness optimization
- [ ] Performance optimization
- [ ] Security hardening
- [ ] Testing and documentation

## Getting Started

### 🌐 Modern Secure Authentication with Tabler.io

The MagenSec Command Center has been rebuilt with **Tabler.io** framework for professional UI and **secure OAuth API** for authentication. No more client-side secrets!

### Architecture Overview

1. **Frontend**: Tabler.io-based responsive dashboard (pure static)
2. **Authentication**: Secure OAuth API handling (Cloud/Endpoints/OAuthEndpoint.cs)
3. **Data**: Client-side processing with API integration
4. **Hosting**: Works on GitHub Pages, any static host, or local files

### Quick Start Options

**Option 1: Direct File Access (Development)**
```bash
# Just open the file directly in your browser
# Works on any operating system
open login.html     # macOS
start login.html    # Windows
xdg-open login.html # Linux
```

**Option 2: GitHub Pages (Production)**
- Upload to GitHub repository
- Enable GitHub Pages in repository settings
- Access via `https://yourusername.github.io/repository-name/Web/mscc/`

**Option 3: Any Static Host**
- Deploy to Netlify, Vercel, Azure Static Web Apps, etc.
- Just upload the `Web/mscc/` folder

### Authentication Flow (SECURE! 🔒)

1. **Client Redirects**: User clicks "Continue with Google" 
2. **Google OAuth**: Redirects to Google for authentication
3. **Secure API**: Google redirects to your Cloud API with auth code
4. **Token Exchange**: API securely exchanges code for user info using client secret
5. **Session Token**: API returns secure session token to client
6. **Dashboard Access**: Client uses session token for API calls

**Key Security Benefits:**
- ✅ Client secret stays on server (never exposed)
- ✅ Google OAuth handled server-side
- ✅ Session tokens with expiration
- ✅ No sensitive data in client code

### Configuration

**1. Cloud API Setup (Required for Production)**
```bash
# Start your Cloud API server
cd Cloud
dotnet run

# API will be available at http://localhost:5000
# OAuth endpoints at /api/oauth/*
```

**2. Google OAuth Configuration**
- Client ID: `699473904929-plq471tdlgouhonarnu4hqjaobsbh6jd.apps.googleusercontent.com`
- Client Secret: Already configured in OAuthEndpoint.cs
- Redirect URI: Automatically set by API based on request origin

**3. Development Mode (No OAuth Required)**
When running locally, the portal offers test users:

1. **👤 Sarah Johnson** (Individual User)
   - Personal device security management
   - Simplified interface for home users

2. **💼 Mike Chen** (Business Admin)  
   - Startup security management
   - Cost optimization focus

3. **🛡️ Dr. Emily Rodriguez** (Site Administrator)
   - Global platform oversight
   - Advanced threat intelligence

The portal automatically detects your environment and offers appropriate authentication:

**🌐 GitHub Pages / Production**
- Portal API integration (enter your credentials)
- Falls back to demo mode if API unavailable

**💻 Local Development**  
- Demo mode with three test users (no credentials needed)
- Portal API integration if running locally

**🎯 Demo Mode**
- Choose from three personas:
  - **👤 Sarah Johnson** (Individual User) - Personal devices
  - **💼 Mike Chen** (Business Admin) - Startup security
  - **🛡️ Dr. Emily Rodriguez** (Site Admin) - Global oversight

### **Zero Configuration Required**

✅ **No server setup**  
✅ **No build process**  
✅ **No API keys required for demo**  
✅ **Works offline**  
✅ **Mobile responsive**  

### **Production Integration**

To connect with your existing Portal API:

1. **Update API endpoint** in `assets/js/api.js`:
   ```javascript
   // Update the production URL
   if (hostname.includes('github.io')) {
       return 'https://your-portal-api-domain.com/api';
   }
   ```

2. **Configure authentication endpoint** in `assets/js/auth.js`:
   ```javascript
   // Uses your existing /api/auth/login endpoint
   const response = await fetch('/api/auth/login', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ email, password })
   });
   ```

### **File Structure**
```
Web/mscc/
├── index.html                    # 👈 Just open this file!
├── assets/
│   ├── css/                     # Styling (CSS variables)
│   ├── js/                      # Client-side logic
│   └── icons/                   # Icons and assets
└── views/                       # Dashboard templates
```

## Security Considerations

- **Client-side Focus**: Minimal server-side processing reduces attack surface
- **Data Isolation**: Organization data is properly segregated
- **Secure Authentication**: OAuth 2.0 with proper token handling
- **Input Validation**: All user inputs are sanitized
- **CSP Headers**: Content Security Policy for XSS protection (recommended)

## Performance Features

- **Intelligent Caching**: 5-minute TTL with client-side storage
- **Lazy Loading**: Components loaded on demand
- **Responsive Design**: Mobile-first approach
- **Minimal Dependencies**: Lightweight architecture
- **Batch API Requests**: Optimized data fetching

## Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## Contributing

1. Follow the existing code style and patterns
2. Update documentation for new features
3. Test across different user roles
4. Ensure mobile responsiveness
5. Add appropriate error handling

## Future Enhancements

### Phase 5-8 Roadmap
- **Mobile App**: React Native companion app
- **Advanced Analytics**: Machine learning insights
- **API Optimization**: GraphQL implementation
- **Real-time Updates**: WebSocket integration
- **Offline Support**: Service worker implementation
- **Multi-language**: Internationalization support

## License

Proprietary - MagenSec Ltd. All rights reserved.

## Support

For technical support or feature requests, contact the development team at support@magensec.com.

---

**Last Updated**: December 2024  
**Version**: 2.0.0  
**Status**: Development
