import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { initDiagnosticsPanel } from '../../src/ui/diagnostics-panel.js';
import { state, resetState } from '../../src/state.js';

const TEMPLATE_HTML = `
  <div>
    <div id="body"></div>
    <span id="summary"></span>
  </div>
`;

describe('Diagnostics Panel', () => {
  let dom;

  beforeEach(() => {
    resetState();
    dom = new JSDOM(TEMPLATE_HTML);
    global.window = dom.window;
    global.document = dom.window.document;
    global.CustomEvent = dom.window.CustomEvent;
    state.diagnostics.overflow = [];
  });

  it('renders empty state initially', () => {
    const summaryEl = document.getElementById('summary');
    initDiagnosticsPanel({
      bodyEl: document.getElementById('body'),
      summaryEl
    });

    assert.strictEqual(document.querySelectorAll('.diagnostic-card').length, 0);
    assert.strictEqual(document.querySelectorAll('.diagnostics-empty').length, 1);
    assert.match(summaryEl.textContent, /0 issues/i);
  });

  it('renders overflow cards and summary when diagnostics exist', () => {
    state.diagnostics.overflow = [
      {
        boxId: 'box-1',
        area: 'quote',
        role: 'supporting-text',
        metrics: { overflowChars: 42, capacity: 120, suggestedTrim: 45 },
        message: 'Overflow message'
      }
    ];

    const summaryEl = document.getElementById('summary');

    initDiagnosticsPanel({
      bodyEl: document.getElementById('body'),
      summaryEl
    });

    const cards = document.querySelectorAll('.diagnostic-card');
    assert.strictEqual(cards.length, 1);
    assert.match(summaryEl.textContent, /1 issue/i);
    assert.strictEqual(cards[0].dataset.boxId, 'box-1');
  });

  it('dispatches focus event when card is clicked', async () => {
    state.diagnostics.overflow = [
      {
        boxId: 'box-focus',
        area: 'callout',
        role: 'secondary-title',
        metrics: { overflowChars: 18, capacity: 90, suggestedTrim: 20 },
        message: 'Overflow message'
      }
    ];

    initDiagnosticsPanel({
      bodyEl: document.getElementById('body'),
      summaryEl: document.getElementById('summary')
    });

    const focusPromise = new Promise((resolve) => {
      document.addEventListener('diagnosticRegionFocus', (event) => {
        resolve(event.detail.boxId);
      }, { once: true });
    });

    document.querySelector('.diagnostic-card').click();
    const focusedId = await focusPromise;
    assert.strictEqual(focusedId, 'box-focus');
  });
});
