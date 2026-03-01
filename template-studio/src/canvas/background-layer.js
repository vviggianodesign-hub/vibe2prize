import { sanitizeHtmlFragment } from '../utils/sanitize-html.js';
import { styleObjectToCss } from '../utils/shared-styles.js';

const DEFAULT_FILL = 'linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(129, 240, 200, 0.2))';

function clampOpacity(value, fallback = 1) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, 0), 1);
}

function resolveLength(value, fallback, scale) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value * scale}px`;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function buildTransform(transform = {}) {
  const parts = [];
  if (typeof transform.translateX === 'number') {
    parts.push(`translateX(${transform.translateX}px)`);
  } else if (typeof transform.translateX === 'string') {
    parts.push(`translateX(${transform.translateX})`);
  }
  if (typeof transform.translateY === 'number') {
    parts.push(`translateY(${transform.translateY}px)`);
  } else if (typeof transform.translateY === 'string') {
    parts.push(`translateY(${transform.translateY})`);
  }
  if (typeof transform.rotate === 'number') {
    parts.push(`rotate(${transform.rotate}deg)`);
  } else if (typeof transform.rotate === 'string') {
    parts.push(`rotate(${transform.rotate})`);
  }
  if (typeof transform.scale === 'number') {
    parts.push(`scale(${transform.scale})`);
  } else if (typeof transform.scaleX === 'number' || typeof transform.scaleY === 'number') {
    parts.push(`scale(${transform.scaleX ?? 1}, ${transform.scaleY ?? 1})`);
  }
  return parts.length ? parts.join(' ') : undefined;
}

function computeShapeStyle(shape = {}, context) {
  const {
    scale,
    boardWidth,
    boardHeight
  } = context;
  const coords = shape.coords || {};
  const style = {
    position: 'absolute',
    left: resolveLength(coords.x, '0px', scale),
    top: resolveLength(coords.y, '0px', scale),
    width: resolveLength(coords.width, `${boardWidth}px`, scale),
    height: resolveLength(coords.height, `${boardHeight}px`, scale),
    opacity: clampOpacity(shape.opacity, 1),
    pointerEvents: 'none',
    zIndex: typeof shape.zIndex === 'number' ? shape.zIndex : (shape.zIndex === 0 ? 0 : -1),
    mixBlendMode: shape.blendMode || undefined,
    filter: shape.style?.filter,
    borderRadius: shape.style?.borderRadius,
    background: shape.style?.background,
    boxShadow: shape.style?.boxShadow,
    overflow: 'visible'
  };

  const transform = buildTransform(shape.transform);
  if (transform) {
    style.transform = transform;
  }

  return style;
}

function createPrimitiveMarkup(shape = {}, styleFallback) {
  const fill = shape.style?.fill || DEFAULT_FILL;
  const stroke = shape.style?.stroke || 'rgba(255, 255, 255, 0.25)';
  const strokeWidth = shape.style?.strokeWidth ?? 1.5;
  switch (shape.kind) {
    case 'circle':
      return `<div style="width:100%;height:100%;border-radius:999px;background:${fill};box-shadow:${shape.style?.boxShadow ?? '0 20px 60px rgba(0,0,0,0.35)'};"></div>`;
    case 'path':
    case 'blob':
      if (shape.d) {
        return `
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path d="${shape.d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
          </svg>
        `;
      }
      return `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <path d="M11.6,28.7C19.3,10.1,49.2,0.2,69.8,8.6s30.3,29.9,19.6,47.3c-10.7,17.4-33.4,30.8-52,27.4C19,80,4,62.7,11.6,28.7Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
        </svg>
      `;
    case 'rect':
    default:
      return `<div style="width:100%;height:100%;border-radius:${shape.style?.borderRadius ?? '32px'};background:${shape.style?.background || fill};border:${shape.style?.border || '1px solid rgba(255,255,255,0.15)'};"></div>`;
  }
}

function getShapeMarkup(shape) {
  if (shape?.html) {
    return sanitizeHtmlFragment(shape.html);
  }
  if (shape?.svg) {
    return sanitizeHtmlFragment(shape.svg);
  }
  if (shape?.kind) {
    return createPrimitiveMarkup(shape);
  }
  return '';
}

function applyDomStyle(element, styleObject) {
  Object.entries(styleObject).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    element.style[key] = value;
  });
}

export function renderBackgroundLayerToDom({
  board,
  shapes,
  scale,
  canvasWidth,
  canvasHeight,
  boardWidth,
  boardHeight,
  visible = true
}) {
  if (!board || !visible || !Array.isArray(shapes) || !shapes.length) {
    return null;
  }
  const layer = document.createElement('div');
  layer.className = 'slide-preview-background-layer';
  layer.setAttribute('aria-hidden', 'true');
  const context = { scale, canvasWidth, canvasHeight, boardWidth, boardHeight };

  shapes.forEach((shape) => {
    if (!shape) return;
    const wrapper = document.createElement('div');
    const style = computeShapeStyle(shape, context);
    wrapper.className = `slide-preview-background-shape${shape.className ? ` ${shape.className}` : ''}`;
    wrapper.dataset.shapeId = shape.id || '';
    applyDomStyle(wrapper, style);
    const markup = getShapeMarkup(shape);
    if (markup) {
      wrapper.innerHTML = markup;
    }
    layer.appendChild(wrapper);
  });

  if (!layer.childElementCount) {
    return null;
  }

  board.appendChild(layer);
  return layer;
}

export function buildBackgroundLayerReact({
  React,
  shapes,
  scale,
  canvasWidth,
  canvasHeight,
  boardWidth,
  boardHeight,
  visible = true
}) {
  if (!React || !visible || !Array.isArray(shapes) || !shapes.length) {
    return null;
  }
  const context = { scale, canvasWidth, canvasHeight, boardWidth, boardHeight };
  const children = shapes.map((shape, index) => {
    if (!shape) return null;
    const style = computeShapeStyle(shape, context);
    const markup = getShapeMarkup(shape);
    const contentProps = markup
      ? { dangerouslySetInnerHTML: { __html: markup } }
      : undefined;
    return React.createElement(
      'div',
      {
        key: shape.id || `${shape.kind || 'shape'}-${index}`,
        className: `slide-preview-background-shape${shape.className ? ` ${shape.className}` : ''}`,
        style
      },
      contentProps ? React.createElement('div', { className: 'background-shape-content', ...contentProps }) : null
    );
  }).filter(Boolean);

  if (!children.length) {
    return null;
  }

  return React.createElement('div', {
    className: 'slide-preview-background-layer',
    'aria-hidden': true
  }, ...children);
}

export function buildBackgroundLayerHtml({
  shapes,
  scale,
  canvasWidth,
  canvasHeight,
  boardWidth,
  boardHeight,
  visible = true
}) {
  if (!visible || !Array.isArray(shapes) || !shapes.length) {
    return '';
  }
  const context = { scale, canvasWidth, canvasHeight, boardWidth, boardHeight };
  const shapesHtml = shapes.map((shape) => {
    if (!shape) return '';
    const style = computeShapeStyle(shape, context);
    const markup = getShapeMarkup(shape);
    const className = `slide-preview-background-shape${shape.className ? ` ${shape.className}` : ''}`;
    return `<div class="${className}" style="${styleObjectToCss(style)}">${markup || ''}</div>`;
  }).join('');

  if (!shapesHtml.trim()) {
    return '';
  }

  return `<div class="slide-preview-background-layer" aria-hidden="true">${shapesHtml}</div>`;
}
