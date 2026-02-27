const ROLE_DENSITY = new Map([
  ['primary-title', 18],
  ['secondary-title', 24],
  ['section-title', 24],
  ['supporting-text', 44],
  ['context-info', 42],
  ['criteria-list', 36],
  ['key-data', 28],
  ['supporting-data', 28],
  ['footer', 20],
  ['page-number', 18],
  ['reference', 26],
  ['data-table', 20],
  ['visual-aid', 12],
  ['logo', 10]
]);

const MIN_CHAR_CAPACITY = 40;
const AVERAGE_CHARS_PER_WORD = 6;

function normalizeRole(roleKey) {
  return roleKey || 'supporting-text';
}

export function estimateCharacterCapacity({ gridWidth = 1, gridHeight = 1, role, maxWords }) {
  const normalizedRole = normalizeRole(role);
  const density = ROLE_DENSITY.get(normalizedRole) ?? ROLE_DENSITY.get('supporting-text');
  const baseCapacity = Math.max(gridWidth, 1) * Math.max(gridHeight, 1) * density;
  const capFromWords = typeof maxWords === 'number' && maxWords > 0
    ? maxWords * AVERAGE_CHARS_PER_WORD
    : Infinity;
  return Math.max(MIN_CHAR_CAPACITY, Math.min(baseCapacity, capFromWords));
}

export function evaluateTextOverflow({ text = '', gridWidth = 1, gridHeight = 1, role, maxWords }) {
  const normalizedRole = normalizeRole(role);
  const normalizedText = (text || '').toString().replace(/\s+/g, ' ').trim();
  const contentLength = normalizedText.length;
  if (!contentLength) {
    return {
      role: normalizedRole,
      capacity: estimateCharacterCapacity({ gridWidth, gridHeight, role: normalizedRole, maxWords }),
      used: 0,
      overflowChars: 0,
      overflowRatio: 0,
      suggestedTrim: 0,
      textSample: ''
    };
  }

  const capacity = estimateCharacterCapacity({ gridWidth, gridHeight, role: normalizedRole, maxWords });
  const overflowChars = Math.max(0, contentLength - capacity);
  const overflowRatio = capacity > 0 ? contentLength / capacity : 0;
  const suggestedTrim = overflowChars > 0 ? Math.ceil(overflowChars * 1.05) : 0;

  return {
    role: normalizedRole,
    capacity,
    used: contentLength,
    overflowChars,
    overflowRatio,
    suggestedTrim,
    textSample: normalizedText.slice(0, 160)
  };
}

export function summarizeOverflow({ overflowChars = 0, used = 0, capacity = 0 }) {
  if (overflowChars <= 0) {
    return 'Content fits within region capacity.';
  }
  const percentOver = capacity > 0 ? Math.round((overflowChars / capacity) * 100) : 0;
  return `Exceeds capacity by ${overflowChars} chars (~${percentOver}% over budget).`;
}
