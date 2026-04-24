// FreshnessBadge — small badge showing snapshot/live status with age.
// Consumes the ApiFreshness contract: { status, source, generatedAt, ageSeconds, expiresAt }
// status: "fresh" | "stale" | "live"
// source: "snapshot" | "live"
const { html } = window.htm;

function formatAge(seconds) {
  if (seconds == null || seconds < 0) return '';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

function FreshnessBadge({ freshness, refreshing }) {
  if (refreshing) {
    return html`
      <span class="badge bg-blue-lt text-blue ms-2" title="Background refresh in progress">
        <span class="spinner-border spinner-border-sm me-1" style="width:0.7rem;height:0.7rem;" role="status"></span>
        Refreshing…
      </span>`;
  }
  if (!freshness) return null;

  const source = freshness.source || 'live';
  const age = formatAge(freshness.ageSeconds);
  const isStale = freshness.status === 'stale';
  const cls = isStale ? 'bg-yellow-lt text-yellow' : (source === 'snapshot' ? 'bg-blue-lt text-blue' : 'bg-green-lt text-green');
  const label = source === 'snapshot' ? 'Snapshot' : 'Live';
  const tip = `Source: ${source}${age ? ' · ' + age : ''}${freshness.generatedAt ? ' · ' + new Date(freshness.generatedAt).toLocaleString() : ''}`;

  return html`
    <span class="badge ${cls} ms-2" title="${tip}">
      <i class="ti ti-${source === 'snapshot' ? 'database' : 'broadcast'} me-1"></i>
      ${label}${age ? html` · <span class="ms-1">${age}</span>` : null}
    </span>`;
}

window.FreshnessBadge = FreshnessBadge;
