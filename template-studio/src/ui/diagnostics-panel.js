import { state } from '../state.js';

let panelControls = null;

function pluralize(label, count) {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}

function formatOverflowStats(metrics = {}) {
  const { overflowChars = 0, suggestedTrim = 0 } = metrics;
  if (!overflowChars) {
    return 'Fits within capacity';
  }
  return `+${overflowChars} chars · trim ~${suggestedTrim}`;
}

function focusRegion(boxId) {
  if (!boxId) return;
  state.selectedBoxId = boxId;
  document.dispatchEvent(new CustomEvent('diagnosticRegionFocus', { detail: { boxId } }));
}

function handleCardClick(event) {
  const card = event.target.closest('[data-box-id]');
  if (card) {
    focusRegion(card.dataset.boxId);
  }
}

function renderEmptyState(bodyEl) {
  const empty = document.createElement('p');
  empty.className = 'diagnostics-empty';
  empty.textContent = 'No overflow detected. Keep refining your layout.';
  bodyEl.appendChild(empty);
}

function renderDiagnostics(items = []) {
  if (!panelControls?.bodyEl || !panelControls?.summaryEl) {
    return;
  }

  const { bodyEl, summaryEl } = panelControls;
  summaryEl.textContent = pluralize('issue', items.length);
  summaryEl.dataset.severity = items.length ? 'warn' : 'clear';

  bodyEl.innerHTML = '';

  if (items.length === 0) {
    renderEmptyState(bodyEl);
    return;
  }

  const table = document.createElement('table');
  table.className = 'diagnostic-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Region', 'Role', 'Severity', 'Guidance', 'Actions'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  items.forEach((diagnostic) => {
    const row = document.createElement('tr');
    row.dataset.boxId = diagnostic.boxId;

    const regionCell = document.createElement('td');
    regionCell.className = 'diagnostic-region-cell';
    regionCell.textContent = diagnostic.area || diagnostic.boxId;
    row.appendChild(regionCell);

    const roleCell = document.createElement('td');
    roleCell.className = 'diagnostic-role-cell';
    roleCell.textContent = diagnostic.role || 'Content Block';
    row.appendChild(roleCell);

    const severityCell = document.createElement('td');
    severityCell.className = 'diagnostic-severity-cell';
    severityCell.textContent = formatOverflowStats(diagnostic.metrics);
    row.appendChild(severityCell);

    const messageCell = document.createElement('td');
    messageCell.className = 'diagnostic-message-cell';
    messageCell.textContent = diagnostic.message;
    row.appendChild(messageCell);

    const actionCell = document.createElement('td');
    actionCell.className = 'diagnostic-action-cell';
    const focusBtn = document.createElement('button');
    focusBtn.type = 'button';
    focusBtn.className = 'diagnostic-focus-btn';
    focusBtn.textContent = 'Focus';
    actionCell.appendChild(focusBtn);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  bodyEl.appendChild(table);
}

function handleDiagnosticsEvent(event) {
  const overflow = event?.detail?.overflow || [];
  renderDiagnostics(overflow);
}

export function initDiagnosticsPanel({ bodyEl, summaryEl } = {}) {
  panelControls = { bodyEl, summaryEl };
  if (bodyEl) {
    bodyEl.addEventListener('click', handleCardClick);
  }
  document.addEventListener('templateDiagnosticsUpdated', handleDiagnosticsEvent);
  renderDiagnostics(state.diagnostics?.overflow || []);
}
