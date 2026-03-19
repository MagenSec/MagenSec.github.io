/**
 * Shared microcopy helpers for Security Officer note cards.
 * Keeps delivery/freshness wording consistent across dashboard variants.
 */

export function formatRelativeTimeShort(input) {
  if (!input) return 'unknown';
  const dt = input instanceof Date ? input : new Date(input);
  if (isNaN(dt.getTime())) return 'unknown';

  const diffMs = Date.now() - dt.getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(mins / 60);

  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h ago`;
  if (hours >= 1) return `${hours}h ${mins % 60}m ago`;
  return `${mins}m ago`;
}

export function buildOfficerNoteStatusCopy({ signalUpdatedText, reportCard }) {
  const normalizeSignalAge = (value) => {
    if (!value) return 'unknown';
    const text = String(value).trim();
    if (!text) return 'unknown';
    if (/ago$/i.test(text) || /unknown|recently/i.test(text)) return text;

    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) {
      return formatRelativeTimeShort(parsed);
    }
    return text;
  };

  const generatedAt = reportCard?.generatedAt || null;
  const emailSentAt = reportCard?.emailSentAt || null;
  const emailRecipientCount = Number(reportCard?.emailRecipientCount || 0);
  const sourceRaw = (reportCard?.triggerSource || 'Cron').toString();
  const source = sourceRaw.toLowerCase() === 'cron'
    ? 'Comms Unit'
    : sourceRaw.toLowerCase() === 'portal'
      ? 'Field Console'
      : sourceRaw.toLowerCase() === 'admin'
        ? 'Command Desk'
        : sourceRaw.toLowerCase() === 'backfill'
          ? 'Records Unit'
          : sourceRaw;

  const reportText = generatedAt
    ? `Situation Report generated: ${formatRelativeTimeShort(generatedAt)}`
    : 'Situation Report status awaiting latest generation signal';

  const emailText = emailSentAt
    ? `sent ${formatRelativeTimeShort(emailSentAt)}${emailRecipientCount > 0 ? ` to ${emailRecipientCount} recipient${emailRecipientCount === 1 ? '' : 's'}` : ''}`
    : (generatedAt ? 'pending send' : 'not sent');

  return {
    signalLine: `Signal updated: ${normalizeSignalAge(signalUpdatedText)} · ${reportText}`,
    deliveryLine: `Email: ${emailText} · Source: ${source}`
  };
}
