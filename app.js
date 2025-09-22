function formatCurrency(value) {
return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function parseNumber(value) {
const num = Number(value);
return Number.isFinite(num) ? num : 0;
}

function calcMonthlyPI(loanAmount, annualRatePct, termYears) {
const principal = loanAmount;
const monthlyRate = annualRatePct / 100 / 12;
const n = termYears * 12;
if (principal <= 0 || annualRatePct <= 0 || termYears <= 0) return 0;
const factor = Math.pow(1 + monthlyRate, n);
return principal * (monthlyRate * factor) / (factor - 1);
}

function calcMonthlyTaxes(homePrice, taxRatePct) {
const annual = homePrice * (taxRatePct / 100);
return annual / 12;
}

function loadSaved() {
try {
const raw = localStorage.getItem('piti_saved_v1');
return raw ? JSON.parse(raw) : [];
} catch (e) {
console.error('Failed to load saved', e);
return [];
}
}

function saveAll(entries) {
localStorage.setItem('piti_saved_v1', JSON.stringify(entries));
}

function collectCalcInputs() {
const price = parseNumber(document.getElementById('price').value);
const downPayment = parseNumber(document.getElementById('downPayment').value);
const rate = parseNumber(document.getElementById('rate').value);
const termYears = parseNumber(document.getElementById('termYears').value) || 30;
const includeSolar = document.getElementById('includeSolar').checked;
const solarCost = parseNumber(document.getElementById('solarCost').value) || 16000;
const financeSolar = document.getElementById('financeSolar').checked;
const taxRate = parseNumber(document.getElementById('taxRate').value) || 1.6;
const hoaMonthly = parseNumber(document.getElementById('hoaMonthly').value) || 0;
const insMonthly = parseNumber(document.getElementById('insMonthly').value) || 0;

return { price, downPayment, rate, termYears, includeSolar, solarCost, financeSolar, taxRate, hoaMonthly, insMonthly };
}

function computeBreakdown() {
const inputs = collectCalcInputs();
let financedSolar = inputs.includeSolar && inputs.financeSolar ? inputs.solarCost : 0;
const loanAmount = Math.max(0, inputs.price - (inputs.downPayment || 0)) + financedSolar;
const monthlyPI = calcMonthlyPI(loanAmount, inputs.rate, inputs.termYears);
const monthlyTaxes = calcMonthlyTaxes(inputs.price, inputs.taxRate);
const monthlyIns = inputs.insMonthly;
const monthlyHOA = inputs.hoaMonthly;
const total = monthlyPI + monthlyTaxes + monthlyIns + monthlyHOA;
return { monthlyPI, monthlyTaxes, monthlyIns, monthlyHOA, total, loanAmount };
}

function updateResults() {
const { monthlyPI, monthlyTaxes, monthlyIns, monthlyHOA, total } = computeBreakdown();
document.getElementById('resPI').textContent = formatCurrency(monthlyPI);
document.getElementById('resTaxes').textContent = formatCurrency(monthlyTaxes);
document.getElementById('resIns').textContent = formatCurrency(monthlyIns);
document.getElementById('resHOA').textContent = formatCurrency(monthlyHOA);
document.getElementById('resTotal').textContent = formatCurrency(total);
document.getElementById('results').classList.remove('hidden');
}

function collectDetailsInputs() {
return {
address: document.getElementById('address').value.trim(),
bedrooms: document.getElementById('bedrooms').value.trim(),
bathrooms: document.getElementById('bathrooms').value.trim(),
sqft: document.getElementById('sqft').value.trim(),
lotSqft: document.getElementById('lotSqft').value.trim(),
yearBuilt: document.getElementById('yearBuilt').value.trim(),
listingUrl: document.getElementById('listingUrl').value.trim(),
};
}

function addEntry() {
const details = collectDetailsInputs();
const inputs = collectCalcInputs();
const breakdown = computeBreakdown();

const entry = {
id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
details,
inputs,
breakdown,
createdAt: Date.now(),
};

const all = loadSaved();
all.push(entry);
saveAll(all);
renderTable(all);
}

function removeEntry(id) {
const all = loadSaved();
const next = all.filter(e => e.id !== id);
saveAll(next);
renderTable(next);
}

function clearAll() {
if (!confirm('Clear all saved entries?')) return;
saveAll([]);
renderTable([]);
}

function renderTable(entries) {
const tbody = document.querySelector('#compare-table tbody');
tbody.innerHTML = '';
for (const e of entries) {
const tr = document.createElement('tr');
const d = e.details;
const b = e.breakdown;
const address = escapeHtml(d.address || '');
const bedrooms = escapeHtml(d.bedrooms || '');
const bathrooms = escapeHtml(d.bathrooms || '');
const sqft = escapeHtml(d.sqft || '');
const lotSqft = escapeHtml(d.lotSqft || '');
const yearBuilt = escapeHtml(d.yearBuilt || '');
const link = renderLink(d.listingUrl || '');
tr.innerHTML = `
<td>${address}</td>
<td>${bedrooms}</td>
<td>${bathrooms}</td>
<td>${sqft}</td>
<td>${lotSqft}</td>
<td>${yearBuilt}</td>
<td>${formatCurrency(b.monthlyPI)}</td>
<td>${formatCurrency(b.monthlyTaxes)}</td>
<td>${formatCurrency(b.monthlyIns)}</td>
<td>${formatCurrency(b.monthlyHOA)}</td>
<td><strong>${formatCurrency(b.total)}</strong></td>
<td>${link}</td>
<td><button class="danger" data-id="${escapeAttr(e.id)}">Remove</button></td>
`;
tbody.appendChild(tr);
}

// bind remove buttons
for (const btn of tbody.querySelectorAll('button[data-id]')) {
btn.addEventListener('click', (ev) => {
const id = ev.currentTarget.getAttribute('data-id');
removeEntry(id);
});
}
}

function escapeHtml(str) {
return String(str).replace(/[&<>\"]+/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderLink(url) {
if (!url) return '';
try {
const u = new URL(url);
const host = u.host.replace(/^www\./, '');
return `<a href="${escapeAttr(u.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(host)}</a>`;
} catch {
return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">link</a>`;
}
}

function escapeAttr(str) {
return String(str).replace(/["'<>&]/g, (c) => ({ '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

function init() {
document.getElementById('btn-calc').addEventListener('click', updateResults);
document.getElementById('btn-save').addEventListener('click', () => {
updateResults();
addEntry();
});
document.getElementById('btn-clear-all').addEventListener('click', clearAll);

// Live update totals on input changes (debounced)
let t;
for (const el of document.querySelectorAll('#calc-form input')) {
el.addEventListener('input', () => {
clearTimeout(t);
t = setTimeout(updateResults, 200);
});
}

// hydrate saved
renderTable(loadSaved());

// render initial calculation with current defaults
updateResults();
}

document.addEventListener('DOMContentLoaded', init);
