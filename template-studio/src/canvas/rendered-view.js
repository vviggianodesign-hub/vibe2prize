import { state } from '../state.js';
import { hashColor } from './renderer.js';
import { getRoleFromBox } from '../utils/roles.js';
import {
  getRoleTitle,
  resolvePreviewText,
  isImageRole,
  buildTablePreview,
  formatAreaLabel,
  createImagePlaceholder
} from '../utils/preview-content.js';
import { getBrandSnapshot } from '../branding/brands.js';
import { evaluateTextOverflow } from '../../../core/layout/overflow-metrics.js';
import {
  formatPageNumberLabel,
  normalizeRendererFlags
} from '../../../core/layout/renderer-utils.js';
function emptyState(container) {
  container.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'slide-preview-empty';
  empty.innerHTML = '<p>Draw regions to preview a slide.</p><p class="hint">The preview mirrors approximate typography, spacing, and data blocks.</p>';
  container.appendChild(empty);
}

function recordOverflowDiagnostics({ box, role, previewText, collection }) {
  if (!previewText) {
    return null;
  }
  const metrics = evaluateTextOverflow({
    text: previewText,
    gridWidth: box.gridWidth,
    gridHeight: box.gridHeight,
    role,
    maxWords: box.metadata?.maxWords
  });
  if (metrics.overflowChars > 0 && Array.isArray(collection)) {
    const percentOver = metrics.capacity > 0
      ? Math.max(0, Math.round((metrics.overflowChars / metrics.capacity) * 100))
      : 0;
    collection.push({
      boxId: box.id,
      area: box.name,
      role,
      metrics,
      message: `Region "${box.name || box.id}" exceeds capacity by ${metrics.overflowChars} chars (~${percentOver}% over budget). Remove ~${metrics.suggestedTrim} characters or enlarge the region.`
    });
  }
  return metrics;
}

function ensureOverflowBadge(region, textContent) {
  if (!region) return null;
  let badge = region.querySelector('.slide-preview-overflow-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'slide-preview-overflow-badge';
    region.appendChild(badge);
  }
  badge.textContent = textContent;
  return badge;
}

function describeTypography(element) {
  if (typeof window === 'undefined' || !element) {
    return null;
  }
  const styles = window.getComputedStyle(element);
  if (!styles) return null;
  return {
    fontFamily: styles.fontFamily,
    fontSize: styles.fontSize,
    fontWeight: styles.fontWeight,
    lineHeight: styles.lineHeight,
    color: styles.color
  };
}

function buildTooltipSections({ role, box, region }) {
  const titleParts = [];
  const roleTitle = getRoleTitle(role);
  if (roleTitle) titleParts.push(roleTitle);
  const areaLabel = formatAreaLabel(box);
  if (areaLabel) titleParts.push(areaLabel);

  const contentNode = region.querySelector('.slide-preview-region-copy')
    || region.querySelector('.slide-preview-table')
    || region.querySelector('.slide-preview-image');
  const typography = describeTypography(contentNode);
  const styleLines = [];
  if (typography) {
    if (typography.fontFamily) styleLines.push(`Font: ${typography.fontFamily}`);
    if (typography.fontSize) styleLines.push(`Size: ${typography.fontSize}`);
    if (typography.lineHeight) styleLines.push(`Line: ${typography.lineHeight}`);
    if (typography.fontWeight) styleLines.push(`Weight: ${typography.fontWeight}`);
    if (typography.color) styleLines.push(`Color: ${typography.color}`);
  }

  return {
    title: titleParts.join(' — '),
    styleLines
  };
}

function buildTooltip({ role, box, region }) {
  const sections = buildTooltipSections({ role, box, region });
  const tooltipLines = [];
  if (sections.title) tooltipLines.push(sections.title);
  if (sections.styleLines.length) tooltipLines.push(sections.styleLines.join(' • '));
  return tooltipLines.join('\n');
}

function selectBrandLogo(snapshot) {
  if (!snapshot?.assets?.logo) return null;
  const variantKey = snapshot.theme === 'light' ? 'light' : 'dark';
  const fallbackKey = variantKey === 'light' ? 'dark' : 'light';
  return snapshot.assets.logo[variantKey] || snapshot.assets.logo[fallbackKey] || null;
}

function createBrandImage({ snapshot, role }) {
  if (!snapshot) return null;
  if (role !== 'logo') return null;
  const src = selectBrandLogo(snapshot);
  if (!src) return null;
  const img = document.createElement('img');
  img.className = 'slide-preview-brand-asset';
  img.src = src;
  img.alt = `${snapshot.label || snapshot.id || 'Brand'} logo`;
  img.decoding = 'async';
  img.loading = 'lazy';
  return img;
}

function resolveFooterCopy({ box, role, previewText, snapshot }) {
  if (role !== 'footer') return previewText;
  const hasCustomCopy = Boolean(box?.metadata?.previewText || box?.metadata?.sampleContent);
  if (hasCustomCopy) {
    return previewText;
  }
  return snapshot?.copy?.footer || previewText;
}

function resolvePageNumberCopy({ role, pagination }) {
  if (role !== 'page-number') return null;
  return formatPageNumberLabel(pagination);
}


function recordVisualOverflow({ board, boxes, diagnostics }) {
  if (!board) return;
  const boxIndex = new Map(boxes.map((box) => [box.id, box]));
  board.querySelectorAll('.slide-preview-region').forEach((region) => {
    const boxId = region.dataset.boxId;
    const box = boxIndex.get(boxId);
    if (!box) return;
    const overflowPx = Math.ceil(region.scrollHeight - region.clientHeight);
    if (overflowPx <= 1) return;
    region.dataset.overflow = 'true';
    const hasBadge = region.querySelector('.slide-preview-overflow-badge');
    if (!hasBadge) {
      ensureOverflowBadge(region, `+${overflowPx}px`);
    }
    const alreadyRecorded = diagnostics.some((entry) => entry.boxId === boxId);
    if (!alreadyRecorded) {
      diagnostics.push({
        boxId,
        area: box.name,
        role: getRoleFromBox(box),
        metrics: {
          overflowPx,
          type: 'visual'
        },
        message: [
          `Region "${box.name || box.id}" visually overflows by ~${overflowPx}px.`,
          'Global fix: lower this role’s font size/line-height in Template Studio → Brand (or tweak template-studio/src/branding/brands.js).',
          'Local fix: give the region more rows/columns or swap to a smaller text style.'
        ].join(' ')
      });
    }
  });
}

export function renderSlidePreview(container) {
  if (!container) return;
  const boxes = state.boxes || [];
  if (!boxes.length) {
    emptyState(container);
    return;
  }

  container.innerHTML = '';
  const board = document.createElement('div');
  board.className = 'slide-preview-grid';

  const containerRect = container.getBoundingClientRect();
  const containerWidth = container.clientWidth || containerRect.width;
  const containerHeight = container.clientHeight || containerRect.height;
  if (containerWidth <= 0 || containerHeight <= 0) {
    container.appendChild(board);
    return;
  }

  const pagination = state.pagination || {};
  const flags = normalizeRendererFlags(state.previewFlags || {});
  const diagnosticsEnabled = Boolean(flags.showDiagnostics);

  const scaleX = containerWidth / state.canvasWidth;
  const scaleY = containerHeight / state.canvasHeight;
  const scale = Math.max(Math.min(scaleX, scaleY), 0);
  const boardWidth = state.canvasWidth * scale;
  const boardHeight = state.canvasHeight * scale;
  const cellWidth = (state.canvasWidth / Math.max(state.columns, 1)) * scale;
  const cellHeight = (state.canvasHeight / Math.max(state.rows, 1)) * scale;

  board.style.width = `${boardWidth}px`;
  board.style.height = `${boardHeight}px`;
  board.style.gridTemplateColumns = `repeat(${state.columns}, ${cellWidth}px)`;
  board.style.gridTemplateRows = `repeat(${state.rows}, ${cellHeight}px)`;
  board.style.gap = '0';
  board.dataset.previewChrome = flags.previewChrome ? 'true' : 'false';
  board.dataset.regionOutlines = flags.showRegionOutlines ? 'true' : 'false';
  container.appendChild(board);

  const overflowDiagnostics = diagnosticsEnabled ? [] : null;
  const brandSnapshot = getBrandSnapshot(state.brand?.id, state.brand?.variant);

  boxes.forEach((box) => {
    const role = getRoleFromBox(box);
    const region = document.createElement('article');
    region.className = 'slide-preview-region';
    region.dataset.boxId = box.id;
    region.dataset.role = role;
    const inputType = box.metadata?.inputType || 'text';
    region.dataset.inputType = inputType;
    region.style.gridColumn = `${box.gridX + 1} / span ${Math.max(box.gridWidth, 1)}`;
    region.style.gridRow = `${box.gridY + 1} / span ${Math.max(box.gridHeight, 1)}`;
    region.style.borderColor = hashColor(box.id);
    region.classList.add(flags.showRegionOutlines ? 'slide-preview-region--outlined' : 'slide-preview-region--plain');

    const regionWidth = Math.max(box.gridWidth, 1) * cellWidth;
    const regionHeight = Math.max(box.gridHeight, 1) * cellHeight;
    const verticalPadding = Math.min(regionHeight * 0.25, 18);
    const horizontalPadding = Math.min(regionWidth * 0.08, 24);
    region.style.padding = `${verticalPadding}px ${horizontalPadding}px`;

    if (role === 'data-table') {
      region.appendChild(buildTablePreview(box.metadata));
    } else if (inputType === 'image' || isImageRole(role)) {
      const brandImage = createBrandImage({ snapshot: brandSnapshot, role });
      if (brandImage) {
        region.appendChild(brandImage);
      } else {
        region.appendChild(createImagePlaceholder(role));
      }
    } else {
      const body = document.createElement('p');
      body.className = 'slide-preview-region-copy';
      const basePreviewText = resolvePreviewText(box, role);
      const footerAwareCopy = resolveFooterCopy({ box, role, previewText: basePreviewText, snapshot: brandSnapshot });
      const systemCopy = resolvePageNumberCopy({ role, pagination });
      const resolvedCopy = systemCopy || footerAwareCopy || basePreviewText || '';
      body.textContent = resolvedCopy;
      region.appendChild(body);

      if (diagnosticsEnabled) {
        const metrics = recordOverflowDiagnostics({ box, role, previewText: resolvedCopy, collection: overflowDiagnostics });
        if (metrics?.overflowChars > 0) {
          region.dataset.overflow = 'true';
          ensureOverflowBadge(region, `-${metrics.suggestedTrim} chars`);
        } else {
          region.removeAttribute('data-overflow');
          const badge = region.querySelector('.slide-preview-overflow-badge');
          if (badge) {
            badge.remove();
          }
        }
      } else {
        region.removeAttribute('data-overflow');
        const badge = region.querySelector('.slide-preview-overflow-badge');
        if (badge) {
          badge.remove();
        }
      }
    }

    board.appendChild(region);

    const tooltip = buildTooltip({ role, box, region });
    if (tooltip) {
      region.title = tooltip;
    } else {
      region.removeAttribute('title');
    }
  });

  if (diagnosticsEnabled) {
    recordVisualOverflow({ board, boxes, diagnostics: overflowDiagnostics });
  }

  const nextDiagnostics = diagnosticsEnabled ? overflowDiagnostics : [];
  state.diagnostics = state.diagnostics || {};
  state.diagnostics.overflow = nextDiagnostics;
  document.dispatchEvent(new CustomEvent('templateDiagnosticsUpdated', {
    detail: {
      overflow: nextDiagnostics
    }
  }));
}
