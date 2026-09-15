import { validateDisplayMessage } from './protocol.mjs';

function fail(code, message = code) {
  throw Object.assign(new Error(message), { code });
}

function clampPercent(value) {
  if (!Number.isFinite(value)) fail('INVALID_USAGE_PERCENT');
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function selectCodexSnapshot(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) fail('INVALID_RATE_LIMIT_RESPONSE');
  const buckets = response.rateLimitsByLimitId;
  if (buckets && typeof buckets === 'object' && !Array.isArray(buckets)) {
    if (buckets.codex && typeof buckets.codex === 'object') return buckets.codex;
    const exact = Object.values(buckets).find(value => value?.limitId === 'codex');
    if (exact) return exact;
  }
  if (response.rateLimits && typeof response.rateLimits === 'object') return response.rateLimits;
  fail('CODEX_USAGE_UNAVAILABLE');
}

export function selectWeeklyWindow(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) fail('CODEX_USAGE_UNAVAILABLE');
  const windows = [snapshot.primary, snapshot.secondary].filter(
    value => value && typeof value === 'object' && !Array.isArray(value),
  );
  const weekly = windows.find(value => value.windowDurationMins === 7 * 24 * 60);
  if (!weekly) fail('CODEX_WEEKLY_USAGE_UNAVAILABLE');
  return weekly;
}

export function formatCountdown(nowEpochSeconds, resetEpochSeconds) {
  if (!Number.isInteger(resetEpochSeconds) || resetEpochSeconds < 0) return 'UNKNOWN';
  const seconds = Math.max(0, resetEpochSeconds - nowEpochSeconds);
  if (seconds === 0) return 'NOW';
  const minutes = Math.max(1, Math.floor(seconds / 60));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function formatResetAt(resetEpochSeconds, timeZone = 'America/Los_Angeles') {
  if (!Number.isInteger(resetEpochSeconds) || resetEpochSeconds < 0) return 'TIME UNKNOWN';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(new Date(resetEpochSeconds * 1000));
  const part = type => parts.find(value => value.type === type)?.value;
  const weekday = part('weekday');
  const hour = part('hour');
  const minute = part('minute');
  const period = part('dayPeriod');
  if (!weekday || !hour || !minute || !period) return 'TIME UNKNOWN';
  return `${weekday.toUpperCase()} · ${hour}:${minute} ${period.toUpperCase()}`;
}

export function formatUpdatedAt(epochSeconds, timeZone = 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(new Date(epochSeconds * 1000));
  const part = type => parts.find(value => value.type === type)?.value;
  return `${part('hour')}:${part('minute')} ${part('dayPeriod').toUpperCase()}`;
}

export function buildDisplayMessage(response, {
  nowEpochSeconds = Math.floor(Date.now() / 1000),
  timeZone = 'America/Los_Angeles',
} = {}) {
  if (!Number.isInteger(nowEpochSeconds) || nowEpochSeconds < 0) fail('INVALID_CURRENT_TIME');
  const snapshot = selectCodexSnapshot(response);
  const window = selectWeeklyWindow(snapshot);
  const usedPercent = clampPercent(window.usedPercent);
  const resetAt = Number.isInteger(window.resetsAt) && window.resetsAt >= 0 ? window.resetsAt : null;
  const resetCredits = Number.isInteger(response.rateLimitResetCredits?.availableCount)
    ? Math.max(0, response.rateLimitResetCredits.availableCount)
    : null;
  return validateDisplayMessage({
    schemaVersion: 1,
    type: 'codex_usage',
    state: response.ordinaryUsageAllowed === false ? 'limited' : 'live',
    generatedAt: nowEpochSeconds,
    usedPercent,
    remainingPercent: 100 - usedPercent,
    resetAt,
    resetInLabel: resetAt === null ? 'UNKNOWN' : formatCountdown(nowEpochSeconds, resetAt),
    resetAtLabel: formatResetAt(resetAt, timeZone),
    resetCredits,
    updatedAtLabel: formatUpdatedAt(nowEpochSeconds, timeZone),
  });
}
