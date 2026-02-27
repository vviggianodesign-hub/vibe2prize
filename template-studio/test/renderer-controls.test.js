import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { state, resetState } from '../src/state.js';
import {
  initializeRendererControls,
  syncPaginationControls,
  syncPreviewFlagControls,
} from '../src/ui/controls.js';

const CONTROL_TEMPLATE = `
  <div>
    <input id="pageNumberInput" value="1" />
    <input id="totalSlidesInput" value="12" />
    <input id="pageLabelInput" value="Page" />
    <input id="previewChromeToggle" type="checkbox" checked />
    <input id="regionOutlineToggle" type="checkbox" checked />
    <input id="diagnosticsToggle" type="checkbox" checked />
  </div>
`;

describe('Renderer Controls', () => {
  let dom;
  let controls;

  beforeEach(() => {
    resetState();
    dom = new JSDOM(CONTROL_TEMPLATE);
    global.window = dom.window;
    global.document = dom.window.document;
    controls = {
      paginationInputs: {
        pageNumber: document.getElementById('pageNumberInput'),
        totalSlides: document.getElementById('totalSlidesInput'),
        label: document.getElementById('pageLabelInput'),
      },
      previewToggles: {
        previewChrome: document.getElementById('previewChromeToggle'),
        regionOutlines: document.getElementById('regionOutlineToggle'),
        diagnostics: document.getElementById('diagnosticsToggle'),
      },
    };
  });

  it('syncs default pagination/flag values to inputs', () => {
    syncPaginationControls(controls);
    syncPreviewFlagControls(controls);

    assert.strictEqual(controls.paginationInputs.pageNumber.value, '1');
    assert.strictEqual(controls.paginationInputs.totalSlides.value, '12');
    assert.strictEqual(controls.paginationInputs.label.value, 'Page');
    assert.strictEqual(controls.previewToggles.previewChrome.checked, true);
    assert.strictEqual(controls.previewToggles.regionOutlines.checked, true);
    assert.strictEqual(controls.previewToggles.diagnostics.checked, true);
  });

  it('updates state when pagination inputs change', () => {
    initializeRendererControls(controls, () => {});

    controls.paginationInputs.pageNumber.value = '3';
    controls.paginationInputs.pageNumber.dispatchEvent(new dom.window.Event('input'));
    assert.strictEqual(state.pagination.pageNumber, 3);
    assert.strictEqual(state.pagination.totalSlides, 12);

    controls.paginationInputs.totalSlides.value = '20';
    controls.paginationInputs.totalSlides.dispatchEvent(new dom.window.Event('input'));
    assert.strictEqual(state.pagination.totalSlides, 20);

    controls.paginationInputs.label.value = 'Slide';
    controls.paginationInputs.label.dispatchEvent(new dom.window.Event('input'));
    assert.strictEqual(state.pagination.label, 'Slide');
  });

  it('updates state when preview toggles change', () => {
    initializeRendererControls(controls, () => {});

    controls.previewToggles.previewChrome.checked = false;
    controls.previewToggles.previewChrome.dispatchEvent(new dom.window.Event('change'));
    assert.strictEqual(state.previewFlags.previewChrome, false);

    controls.previewToggles.regionOutlines.checked = false;
    controls.previewToggles.regionOutlines.dispatchEvent(new dom.window.Event('change'));
    assert.strictEqual(state.previewFlags.showRegionOutlines, false);

    controls.previewToggles.diagnostics.checked = false;
    controls.previewToggles.diagnostics.dispatchEvent(new dom.window.Event('change'));
    assert.strictEqual(state.previewFlags.showDiagnostics, false);
  });

  it('does nothing when controls are missing', () => {
    resetState();
    const bareControls = {};
    assert.doesNotThrow(() => {
      initializeRendererControls(bareControls, () => {});
    });
  });
});
