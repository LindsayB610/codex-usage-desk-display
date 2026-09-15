export const PROTOCOL_VERSION = 1;
export const MESSAGE_TYPE = 'codex_usage';

function boundedInteger(value, minimum, maximum, name) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw Object.assign(new Error(`Invalid ${name}`), { code: 'INVALID_DISPLAY_MESSAGE' });
  }
  return value;
}

function nullableInteger(value, minimum, maximum, name) {
  return value === null ? null : boundedInteger(value, minimum, maximum, name);
}

function shortString(value, maximum, name) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum || /[\r\n\x00-\x1f\x7f]/.test(value)) {
    throw Object.assign(new Error(`Invalid ${name}`), { code: 'INVALID_DISPLAY_MESSAGE' });
  }
  return value;
}

export function validateDisplayMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Display message must be an object'), { code: 'INVALID_DISPLAY_MESSAGE' });
  }
  const expected = [
    'generatedAt', 'remainingPercent', 'resetAt', 'resetAtLabel', 'resetCredits',
    'resetInLabel', 'schemaVersion', 'state', 'type', 'updatedAtLabel', 'usedPercent',
  ];
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected.sort())) {
    throw Object.assign(new Error('Display message fields changed'), { code: 'INVALID_DISPLAY_MESSAGE' });
  }
  if (value.schemaVersion !== PROTOCOL_VERSION || value.type !== MESSAGE_TYPE || !['live', 'limited'].includes(value.state)) {
    throw Object.assign(new Error('Unsupported display message'), { code: 'INVALID_DISPLAY_MESSAGE' });
  }
  const message = {
    schemaVersion: PROTOCOL_VERSION,
    type: MESSAGE_TYPE,
    state: value.state,
    generatedAt: boundedInteger(value.generatedAt, 0, Number.MAX_SAFE_INTEGER, 'generatedAt'),
    usedPercent: boundedInteger(value.usedPercent, 0, 100, 'usedPercent'),
    remainingPercent: boundedInteger(value.remainingPercent, 0, 100, 'remainingPercent'),
    resetAt: nullableInteger(value.resetAt, 0, Number.MAX_SAFE_INTEGER, 'resetAt'),
    resetInLabel: shortString(value.resetInLabel, 16, 'resetInLabel'),
    resetAtLabel: shortString(value.resetAtLabel, 24, 'resetAtLabel'),
    resetCredits: nullableInteger(value.resetCredits, 0, 999, 'resetCredits'),
    updatedAtLabel: shortString(value.updatedAtLabel, 16, 'updatedAtLabel'),
  };
  if (message.usedPercent + message.remainingPercent !== 100) {
    throw Object.assign(new Error('Usage percentages disagree'), { code: 'INVALID_DISPLAY_MESSAGE' });
  }
  return Object.freeze(message);
}

export function encodeDisplayMessage(value) {
  const message = validateDisplayMessage(value);
  const line = `${JSON.stringify(message)}\n`;
  if (Buffer.byteLength(line) > 2048) {
    throw Object.assign(new Error('Display message too large'), { code: 'INVALID_DISPLAY_MESSAGE' });
  }
  return line;
}

export function parseDisplayMessage(line) {
  if (typeof line !== 'string' || Buffer.byteLength(line) > 2048) {
    throw Object.assign(new Error('Display line is invalid'), { code: 'INVALID_DISPLAY_MESSAGE' });
  }
  let value;
  try { value = JSON.parse(line.trim()); }
  catch { throw Object.assign(new Error('Display line is not JSON'), { code: 'INVALID_DISPLAY_MESSAGE' }); }
  return validateDisplayMessage(value);
}
