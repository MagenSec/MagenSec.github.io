# MagenSec Portal

Modern web portal for device security management and organization administration.

**Live**: [magensec.github.io/portal](https://magensec.github.io/portal/)

## Runtime Vendor Assets

The portal is a buildless static SPA. Its runtime libraries are pinned and served
from `Web/vendor` so local development and GitHub Pages use the same same-origin
asset path. This avoids cross-origin CDN preflight failures during hard reloads
while keeping Subresource Integrity hashes on the script and stylesheet tags.

Verify checked-in vendor assets:

```powershell
../scripts/sync-vendor-assets.ps1
```

Re-download the currently pinned versions and verify hashes:

```powershell
../scripts/sync-vendor-assets.ps1 -Download
```

When a dependency needs a security or bug-fix update, bump the versioned URL and
local path in `Web/scripts/sync-vendor-assets.ps1`, re-download, update the
expected length/SHA-384 values, and patch the references in `portal/index.html`
and `.cdn-includes/` in the same change.


## License

See [LICENSE](../../LICENSE) file for details.
