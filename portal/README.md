# MagenSec Portal - No-Build Setup

## 🎯 Philosophy: No Build, Just Ship!

This portal uses **zero build tools**. Everything runs directly in the browser using modern standards and CDN dependencies.

## Tech Stack
- **HTML5** - Modern semantic markup
- **Vanilla JavaScript (ES Modules)** - No frameworks, no compilers
- **Preact + HTM** (via CDN) - Lightweight React-like components
- **Tailwind CSS** (via CDN) - Utility-first styling
- **Page.js** (via CDN) - Client-side routing

### Why No Build?
✅ **Deploy anywhere** - GitHub Pages, any static host  
✅ **No dependencies** - No `node_modules`, no `package.json`  
✅ **Instant changes** - Edit and refresh, that's it  
✅ **Open source friendly** - View source works perfectly  
✅ **Version control friendly** - No generated files to commit  

## Prerequisites

**For Development:**
- Node.js (for `npx http-server`) **OR** Python (for `python -m http.server`)
- Any modern web browser

**For Deployment:**
- Nothing! Just upload the files to any static host

## Development

```bash
# From project root
./start-local-web.ps1

# Or manually
cd Web/portal
npx http-server -p 8080 -c-1 --cors
```

Portal runs on **http://localhost:8080/** - no build, no compile, just refresh!

## Deployment to GitHub Pages

1. Push `Web/portal/` files to `gh-pages` branch
2. Done! GitHub serves it at `https://magensec.github.io/portal/`

No build step needed!

## OAuth Configuration

Authorized redirect URIs (already configured):
- `http://localhost:8080/` (local development)
- `https://magensec.github.io/portal/` (production)

## Extending the Portal

Add a new page by creating `js/pages/mypage.js` and adding a route in `js/router.js`. No build required - just edit and refresh!

📖 **Full documentation**: See comments in the source files
