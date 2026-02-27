import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { emitBrandStateChanged } from '../src/branding/brands.js';

function setupDom() {
  const dom = new JSDOM('<div></div>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.CustomEvent = dom.window.CustomEvent;
  global.Event = dom.window.Event;
  return dom;
}

describe('emitBrandStateChanged', () => {
  let dom;

  beforeEach(() => {
    dom = setupDom();
  });

  afterEach(() => {
    if (dom) {
      dom.window.close();
    }
    delete global.window;
    delete global.document;
    delete global.CustomEvent;
    delete global.Event;
  });

  it('dispatches CustomEvent with brand detail when available', async () => {
    const brandState = { id: 'epam', variant: 'dark' };
    const detail = await new Promise((resolve) => {
      document.addEventListener('brandStateChanged', (event) => {
        resolve(event.detail);
      }, { once: true });
      emitBrandStateChanged(brandState);
    });

    assert.deepStrictEqual(detail.brand, brandState);
  });

  it('falls back to Event when CustomEvent is not available', async () => {
    global.window.CustomEvent = undefined;
    global.CustomEvent = undefined;

    const brandState = { id: 'epam', variant: 'light' };
    const detail = await new Promise((resolve) => {
      document.addEventListener('brandStateChanged', (event) => {
        resolve(event.detail);
      }, { once: true });
      emitBrandStateChanged(brandState);
    });

    assert.deepStrictEqual(detail.brand, brandState);
  });
});
