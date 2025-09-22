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
// also push to cloud if enabled (fire-and-forget)
if (isFirebaseConfigured()) {
try { scheduleCloudSave(entries); } catch (e) { /* noop */ }
}
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

async function addEntry() {
const details = collectDetailsInputs();
const inputs = collectCalcInputs();
const breakdown = computeBreakdown();

console.log('Saving entry with price:', inputs.price);

const entry = {
id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
details,
inputs,
breakdown,
createdAt: Date.now(),
};

// Extract image from listing URL if available
if (details.listingUrl) {
entry.imageUrl = await extractImageFromUrl(details.listingUrl);
}

const all = loadSaved();
all.push(entry);
saveAll(all);
renderTable(all);
}

async function removeEntry(id) {
const all = loadSaved();
const next = all.filter(e => e.id !== id);
saveAll(next);
renderTable(next);
// Also sync the deletion to cloud
if (isFirebaseConfigured()) {
try {
await saveAllToCloud(next);
} catch (e) {
console.warn('Failed to sync deletion to cloud:', e);
}
}
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
const i = e.inputs;
const address = escapeHtml(d.address || '');
const bedrooms = escapeHtml(d.bedrooms || '');
const bathrooms = escapeHtml(d.bathrooms || '');
const sqft = escapeHtml(d.sqft || '');
const lotSqft = escapeHtml(d.lotSqft || '');
const yearBuilt = escapeHtml(d.yearBuilt || '');
const link = renderLink(d.listingUrl || '');
const price = formatCurrency(i.price || 0);
const image = renderImage(e.imageUrl || '');
console.log('Rendering entry:', e.id, 'price:', i.price, 'formatted:', price);
tr.innerHTML = `
<td>${image}</td>
<td>${address}</td>
<td><strong>${price}</strong></td>
<td>${bedrooms}</td>
<td>${bathrooms}</td>
<td>${sqft}</td>
<td>${lotSqft}</td>
<td>${yearBuilt}</td>
<td>${formatCurrency(b.monthlyPI)}</td>
<td>${formatCurrency(b.monthlyTaxes)}</td>
<td>${formatCurrency(b.monthlyIns)}</td>
<td>${formatCurrency(b.monthlyHOA)}</td>
<td><strong>${formatCurrency(b.total)}/mo</strong></td>
<td>${link}</td>
<td><button class="danger" data-id="${escapeAttr(e.id)}">Remove</button></td>
`;
tbody.appendChild(tr);
}

// bind remove buttons
for (const btn of tbody.querySelectorAll('button[data-id]')) {
btn.addEventListener('click', async (ev) => {
const id = ev.currentTarget.getAttribute('data-id');
await removeEntry(id);
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

async function extractImageFromUrl(url) {
try {
console.log('Attempting to extract image from:', url);
// Try a simpler approach - look for common real estate image patterns in URL structure
if (url.includes('zillow.com')) {
// For Zillow, try to construct a likely image URL
const zillowMatch = url.match(/\/b\/([^\/]+)\/([^\/]+)\/house\/(\d+)/);
if (zillowMatch) {
const [, street, city, zpid] = zillowMatch;
return `https://photos.zillowstatic.com/fp/${zpid}_cc_ft_768.jpg`;
}
}
if (url.includes('redfin.com')) {
// For Redfin, try similar approach
const redfinMatch = url.match(/\/home\/(\d+)/);
if (redfinMatch) {
const mlsId = redfinMatch[1];
return `https://ssl.cdn-redfin.com/photo/1/bigphoto/${mlsId}/1_0.jpg`;
}
}
// Fallback: try to fetch with CORS proxy
const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
const response = await fetch(proxyUrl);
const html = await response.text();
// Look for any img tag with common real estate keywords
const imgRegex = /<img[^>]+src="([^"]*(?:photo|image|house|property|home|listing)[^"]*\.(?:jpg|jpeg|png|webp))[^"]*"[^>]*>/i;
const match = html.match(imgRegex);
if (match && match[1]) {
let imageUrl = match[1];
if (imageUrl.startsWith('//')) {
imageUrl = 'https:' + imageUrl;
} else if (imageUrl.startsWith('/')) {
const urlObj = new URL(url);
imageUrl = urlObj.origin + imageUrl;
}
console.log('Found image:', imageUrl);
return imageUrl;
}
} catch (error) {
console.warn('Image extraction failed:', error);
}
console.log('No image found for URL:', url);
return null;
}

function renderImage(imageUrl) {
if (!imageUrl) return '<span style="color: #999;">No image</span>';
return `<img src="${escapeAttr(imageUrl)}" alt="Property" style="width: 80px; height: 60px; object-fit: cover; border-radius: 4px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';"><span style="display: none; color: #999;">Image failed</span>`;
}

function init() {
document.getElementById('btn-calc').addEventListener('click', updateResults);
document.getElementById('btn-save').addEventListener('click', async () => {
updateResults();
await addEntry();
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

// initialize cloud sync (loads from Firestore if available)
cloudSyncInit();
}

document.addEventListener('DOMContentLoaded', () => {
// Immediately show something in the status box
updateSyncStatus('App starting...');

// Test if Firebase is loaded
setTimeout(() => {
if (typeof firebase === 'undefined') {
alert('Firebase not loaded! Check if firebase-config.js is loading properly.');
updateSyncStatus('Firebase scripts not loaded', true);
return;
}
if (!window.firebaseConfig) {
alert('Firebase config not found! Check firebase-config.js');
updateSyncStatus('Firebase config missing', true);
return;
}
updateSyncStatus('Firebase loaded, starting app...');
init();
}, 100);
});

// ------------------- Cloud sync (Firebase) -------------------

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDB = null;
let firebaseUser = null;
let cloudSaveTimer = null;

function updateSyncStatus(message, isError = false) {
const statusEl = document.getElementById('sync-status');
if (statusEl) {
statusEl.textContent = message;
statusEl.style.color = isError ? '#d32f2f' : '#333';
statusEl.style.backgroundColor = isError ? '#ffebee' : '#f5f5f5';
}
console.log('SYNC:', message);
// Also show an alert for critical errors
if (isError && message.includes('Firebase error')) {
alert('Firebase Error: ' + message);
}
}

function isFirebaseConfigured() {
const configured = typeof window !== 'undefined' && window.firebase && window.firebaseConfig;
if (!configured) {
updateSyncStatus('Firebase not configured', true);
}
return configured;
}

async function ensureFirebase() {
updateSyncStatus('Initializing Firebase...');
if (!isFirebaseConfigured()) return false;

try {
if (!firebaseApp) {
updateSyncStatus('Setting up Firebase app...');
firebaseApp = firebase.initializeApp(window.firebaseConfig);
firebaseAuth = firebase.auth();
firebaseDB = firebase.firestore();
}

if (!firebaseAuth.currentUser) {
updateSyncStatus('Signing in anonymously...');
const result = await firebaseAuth.signInAnonymously();
firebaseUser = result.user;
updateSyncStatus(`Signed in: ${firebaseUser.uid}`);
} else {
firebaseUser = firebaseAuth.currentUser;
updateSyncStatus(`Already signed in: ${firebaseUser.uid}`);
}

return !!firebaseUser;
} catch (error) {
updateSyncStatus(`Firebase error: ${error.message}`, true);
console.error('Firebase setup error:', error);
return false;
}
}

function cloudDocRef() {
// Use a shared "household" document so all devices see the same data
return firebaseDB.collection('household').doc('home-calculator-saves');
}

async function loadFromCloud() {
const ok = await ensureFirebase();
if (!ok) return null;
try {
updateSyncStatus('Loading from cloud...');
const snap = await cloudDocRef().get();
if (!snap.exists) {
updateSyncStatus('No cloud data found');
return [];
}
const data = snap.data() || {};
const entries = Array.isArray(data.entries) ? data.entries : [];
updateSyncStatus(`Loaded ${entries.length} entries from cloud`);
return entries;
} catch (error) {
updateSyncStatus(`Load error: ${error.message}`, true);
console.error('Cloud load error:', error);
return null;
}
}

async function saveAllToCloud(entries) {
const ok = await ensureFirebase();
if (!ok) return;
try {
updateSyncStatus(`Saving ${entries.length} entries to cloud...`);
console.log('Attempting to save to:', cloudDocRef().path);
console.log('User ID:', firebaseUser?.uid);
await cloudDocRef().set({ entries, updatedAt: Date.now() }, { merge: true });
updateSyncStatus(`Saved ${entries.length} entries to cloud`);
} catch (error) {
updateSyncStatus(`Save error: ${error.message}`, true);
console.error('Cloud save error:', error);
console.error('Error code:', error.code);
console.error('Error details:', error.details);
}
}

function scheduleCloudSave(entries) {
clearTimeout(cloudSaveTimer);
cloudSaveTimer = setTimeout(() => { saveAllToCloud(entries); }, 300);
}

async function cloudSyncInit() {
try {
updateSyncStatus('Starting cloud sync...');
const ok = await ensureFirebase();
if (!ok) return;
const local = loadSaved();
const remote = await loadFromCloud();
if (remote && remote.length) {
// merge remote with local data (avoid duplicates by ID)
const localIds = new Set(local.map(e => e.id));
const newFromLocal = local.filter(e => !remote.some(r => r.id === e.id));
const merged = [...remote, ...newFromLocal];
updateSyncStatus(`Merged: ${remote.length} from cloud + ${newFromLocal.length} local = ${merged.length} total`);
saveAll(merged);
renderTable(merged);
// upload the merged data back to cloud
await saveAllToCloud(merged);
} else if (local && local.length) {
// migrate local to cloud
updateSyncStatus(`Migrating ${local.length} local entries to cloud...`);
await saveAllToCloud(local);
updateSyncStatus(`Migration complete - ${local.length} entries now in cloud`);
renderTable(local);
} else {
updateSyncStatus('No data to sync');
}
} catch (e) {
updateSyncStatus(`Sync init failed: ${e.message}`, true);
console.error('Cloud sync init failed', e);
}
}
