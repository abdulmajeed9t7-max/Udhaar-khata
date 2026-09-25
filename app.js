/* ============================================================
   ادھار کھاتہ PRO - Main Application Logic
   Version: 3.0.0
   ============================================================ */

import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, getDocs, query, where, limit,
  doc, updateDoc, deleteDoc, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ============================================================
   PWA: Register Service Worker
   ============================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then((reg) => console.log('✅ SW registered:', reg.scope))
      .catch((err) => console.log('❌ SW fail:', err));
  });
}

/* ============================================================
   CONFIG / CONSTANTS
   ============================================================ */
const DEFAULT_SETTINGS = {
  shopName: "Ktk Store",
  shopPhone: "0300-1234567",
  shopAddress: "",
  billNote: "ادھار کی صورت میں بل ضرور لیں — شکریہ"
};

let APP_SETTINGS = { ...DEFAULT_SETTINGS };

/* ============================================================
   STATE
   ============================================================ */
const state = {
  user: null,
  previousBalance: 0,
  lastBillData: null,
  allCustomers: [],
  allTransactions: [],
  currentCustomerFilter: 'all',
  currentReportFilter: 'today',
  selectedCustomer: null
};

/* ============================================================
   DOM HELPERS
   ============================================================ */
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function show(el) { if (typeof el === 'string') el = $(el); if (el) el.style.display = ''; }
function hide(el) { if (typeof el === 'string') el = $(el); if (el) el.style.display = 'none'; }
function showFlex(el) { if (typeof el === 'string') el = $(el); if (el) el.style.display = 'flex'; }
function showBlock(el) { if (typeof el === 'string') el = $(el); if (el) el.style.display = 'block'; }

/* ============================================================
   UTILITIES
   ============================================================ */
function formatMoney(n) {
  return Number(n || 0).toLocaleString('en-PK');
}

function formatDate(date) {
  if (!date) return '—';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-GB');
}

function formatTime(date) {
  if (!date) return '—';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeDate(date) {
  if (!date) return '—';
  const d = date?.toDate ? date.toDate() : new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'ابھی';
  if (diffMin < 60) return `${diffMin} منٹ پہلے`;
  if (diffHr < 24) return `${diffHr} گھنٹے پہلے`;
  if (diffDay === 1) return 'کل';
  if (diffDay < 7) return `${diffDay} دن پہلے`;
  return formatDate(date);
}

function balanceInfo(balance) {
  const b = Number(balance) || 0;
  if (b > 0) return { label: 'بقایا', value: b, className: 'credit', emoji: '📕' };
  if (b < 0) return { label: 'ایڈوانس', value: Math.abs(b), className: 'advance', emoji: '📗' };
  return { label: 'صاف حساب', value: 0, className: 'clear', emoji: '📘' };
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(message, type = 'info', duration = 3000) {
  const container = $('toastContainer');
  if (!container) return;

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ============================================================
   LOADING
   ============================================================ */
function showLoading(text = 'لوڈ ہو رہا ہے...') {
  const overlay = $('loadingOverlay');
  const txt = $('loadingText');
  if (txt) txt.textContent = text;
  if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
  const overlay = $('loadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

/* ============================================================
   SETTINGS MANAGEMENT (localStorage)
   ============================================================ */
function loadSettings() {
  try {
    const saved = localStorage.getItem('udhaarSettings');
    if (saved) APP_SETTINGS = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch (e) {
    console.warn('Settings load error:', e);
  }
}

function saveSettingsToStorage(settings) {
  try {
    APP_SETTINGS = { ...APP_SETTINGS, ...settings };
    localStorage.setItem('udhaarSettings', JSON.stringify(APP_SETTINGS));
  } catch (e) {
    console.warn('Settings save error:', e);
  }
}

function applyShopInfoToUI() {
  const headerTitle = $('headerTitle');
  if (headerTitle) headerTitle.textContent = APP_SETTINGS.shopName || 'ادھار کھاتہ';

  const avatar = $('headerAvatar');
  if (avatar) avatar.textContent = (APP_SETTINGS.shopName || 'K').charAt(0).toUpperCase();

  if ($('settingShopName')) $('settingShopName').value = APP_SETTINGS.shopName || '';
  if ($('settingShopPhone')) $('settingShopPhone').value = APP_SETTINGS.shopPhone || '';
  if ($('settingShopAddress')) $('settingShopAddress').value = APP_SETTINGS.shopAddress || '';
  if ($('settingBillNote')) $('settingBillNote').value = APP_SETTINGS.billNote || '';
}

/* ============================================================
   SPLASH SCREEN
   ============================================================ */
function hideSplash() {
  const splash = $('splashScreen');
  if (!splash) return;
  splash.style.animation = 'fadeOut 0.4s forwards';
  setTimeout(() => splash.style.display = 'none', 400);
}

/* ============================================================
   AUTH: Tab Switch
   ============================================================ */
const tabLogin = $('tabLogin');
const tabSignup = $('tabSignup');

if (tabLogin) {
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    $('loginBtn').style.display = '';
    $('signupBtn').style.display = 'none';
    $('forgotPasswordRow').style.display = 'none';
    $('loginError').textContent = '';
  });
}

if (tabSignup) {
  tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    $('loginBtn').style.display = 'none';
    $('signupBtn').style.display = '';
    $('forgotPasswordRow').style.display = 'none';
    $('loginError').textContent = '';
  });
}

/* ============================================================
   AUTH: Login
   ============================================================ */
$('loginBtn')?.addEventListener('click', async () => {
  const errEl = $('loginError');
  errEl.textContent = '';
  const email = $('loginEmail').value.trim();
  const pass = $('loginPassword').value;

  if (!email || !pass) {
    errEl.textContent = 'ای میل اور پاسورڈ دونوں لکھیں';
    return;
  }
  if (!email.includes('@')) {
    errEl.textContent = 'درست ای میل لکھیں';
    return;
  }

  const btn = $('loginBtn');
  btn.textContent = 'انتظار کریں...';
  btn.disabled = true;

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    showToast('کامیابی سے لاگ ان ہو گئے', 'success');
  } catch (e) {
    console.error(e);
    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
      errEl.textContent = 'غلط پاسورڈ';
    } else if (e.code === 'auth/user-not-found') {
      errEl.textContent = 'یہ ای میل رجسٹرڈ نہیں';
    } else if (e.code === 'auth/invalid-email') {
      errEl.textContent = 'ای میل درست نہیں';
    } else if (e.code === 'auth/too-many-requests') {
      errEl.textContent = 'بہت زیادہ کوششیں — کچھ دیر بعد کوشش کریں';
    } else {
      errEl.textContent = 'لاگ ان ناکام: ' + (e.message || '');
    }
  }

  btn.textContent = 'لاگ ان کریں';
  btn.disabled = false;
});

/* ============================================================
   AUTH: Signup
   ============================================================ */
$('signupBtn')?.addEventListener('click', async () => {
  const errEl = $('loginError');
  errEl.textContent = '';
  const email = $('loginEmail').value.trim();
  const pass = $('loginPassword').value;

  if (!email || !email.includes('@')) {
    errEl.textContent = 'درست ای میل لکھیں';
    return;
  }
  if (pass.length < 6) {
    errEl.textContent = 'پاسورڈ کم از کم 6 حروف کا ہو';
    return;
  }

  const btn = $('signupBtn');
  btn.textContent = 'انتظار کریں...';
  btn.disabled = true;

  try {
    await createUserWithEmailAndPassword(auth, email, pass);
    showToast('نیا اکاؤنٹ بن گیا', 'success');
  } catch (e) {
    console.error(e);
    if (e.code === 'auth/email-already-in-use') {
      errEl.textContent = 'یہ ای میل پہلے سے موجود ہے';
    } else if (e.code === 'auth/weak-password') {
      errEl.textContent = 'پاسورڈ کمزور ہے';
    } else {
      errEl.textContent = 'اکاؤنٹ نہیں بن سکا: ' + (e.message || '');
    }
  }

  btn.textContent = 'نیا اکاؤنٹ بنائیں';
  btn.disabled = false;
});

/* ============================================================
   AUTH: Forgot Password
   ============================================================ */
$('forgotPasswordLink')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = $('loginEmail').value.trim();
  if (!email || !email.includes('@')) {
    showToast('پہلے اپنی ای میل لکھیں', 'warning');
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('ری سیٹ لنک ای میل پر بھیج دیا گیا', 'success');
  } catch (e) {
    showToast('ای میل نہیں بھیجی جا سکی', 'error');
  }
});

/* ============================================================
   AUTH: Logout
   ============================================================ */
async function doLogout() {
  if (!confirm('کیا آپ واقعی لاگ آؤٹ کرنا چاہتے ہیں؟')) return;
  try {
    await signOut(auth);
    showToast('لاگ آؤٹ ہو گئے', 'info');
  } catch (e) {
    showToast('لاگ آؤٹ ناکام', 'error');
  }
}

$('logoutBtn')?.addEventListener('click', doLogout);
$('logoutBtn2')?.addEventListener('click', doLogout);

/* ============================================================
   AUTH STATE CHANGE
   ============================================================ */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    state.user = user;
    loadSettings();
    applyShopInfoToUI();

    hide('loginScreen');
    showBlock('mainApp');
    showFlex('bottomNav');

    if ($('userEmail')) $('userEmail').textContent = user.email;
    if ($('aboutUserEmail')) $('aboutUserEmail').textContent = user.email;
    if ($('aboutLastLogin')) {
      $('aboutLastLogin').textContent = new Date().toLocaleString('en-GB', {
        dateStyle: 'medium', timeStyle: 'short'
      });
    }

    setTimeout(hideSplash, 500);
    await refreshAll();
    switchPage('dashboard');
  } else {
    state.user = null;
    hide('mainApp');
    hide('bottomNav');
    showFlex('loginScreen');
    $('loginEmail').value = '';
    $('loginPassword').value = '';
    setTimeout(hideSplash, 800);
  }
});

/* ============================================================
   PAGE NAVIGATION
   ============================================================ */
const PAGES = ['dashboard', 'bill', 'customers', 'reports', 'settings'];

function switchPage(pageName) {
  PAGES.forEach((p) => {
    const el = $('page' + p.charAt(0).toUpperCase() + p.slice(1));
    if (el) el.style.display = p === pageName ? 'block' : 'none';
  });

  $$('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === pageName);
  });

  if (pageName === 'customers') loadCustomersList();
  if (pageName === 'reports') loadReports();
  if (pageName === 'dashboard') loadDashboard();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

$('viewAllCustomers')?.addEventListener('click', () => switchPage('customers'));
$('viewAllTransactions')?.addEventListener('click', () => openTransactionsModal());

/* ============================================================
   REFRESH ALL DATA
   ============================================================ */
async function refreshAll() {
  try {
    await Promise.all([
      loadCustomersCache(),
      loadTransactionsCache()
    ]);
    await loadDashboard();
    if ($('pageCustomers').style.display !== 'none') loadCustomersList();
    if ($('pageReports').style.display !== 'none') loadReports();
  } catch (e) {
    console.error('Refresh error:', e);
  }
}

/* ============================================================
   LOAD CUSTOMERS CACHE
   ============================================================ */
async function loadCustomersCache() {
  const snap = await getDocs(collection(db, "customers"));
  state.allCustomers = [];
  snap.forEach((d) => state.allCustomers.push({ id: d.id, ...d.data() }));
  state.allCustomers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/* ============================================================
   LOAD TRANSACTIONS CACHE
   ============================================================ */
async function loadTransactionsCache() {
  const snap = await getDocs(collection(db, "transactions"));
  state.allTransactions = [];
  snap.forEach((d) => state.allTransactions.push({ id: d.id, ...d.data() }));
  state.allTransactions.sort((a, b) => {
    const da = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
    const db_ = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
    return db_ - da;
  });
}

/* ============================================================
   DASHBOARD
   ============================================================ */
async function loadDashboard() {
  await Promise.all([loadDashboardStats(), loadRecentTransactions(), loadTopCustomers()]);
}

async function loadDashboardStats() {
  const customers = state.allCustomers;
  let totalBalance = 0;
  customers.forEach((c) => totalBalance += Number(c.balance) || 0);

  if ($('statTotalCustomers')) $('statTotalCustomers').textContent = customers.length;

  const info = balanceInfo(totalBalance);
  if ($('statTotalBalance')) {
    $('statTotalBalance').textContent = '₨ ' + formatMoney(info.value);
  }
  if ($('statTotalLabel')) $('statTotalLabel').textContent = 'کل ' + info.label;
  if ($('statTotalCard')) {
    $('statTotalCard').classList.remove('green', 'red');
    if (info.className === 'advance') $('statTotalCard').classList.add('green');
  }

  // Today's stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let todaySales = 0;
  let todayPayment = 0;

  state.allTransactions.forEach((t) => {
    const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
    if (d >= today) {
      todaySales += Number(t.billTotal) || 0;
      todayPayment += Number(t.payment) || 0;
    }
  });

  if ($('statTodaySales')) $('statTodaySales').textContent = '₨ ' + formatMoney(todaySales);
  if ($('statTodayPayment')) $('statTodayPayment').textContent = '₨ ' + formatMoney(todayPayment);
}

async function loadRecentTransactions() {
  const list = $('recentTransactionsList');
  if (!list) return;
  const recent = state.allTransactions.slice(0, 5);

  if (recent.length === 0) {
    list.innerHTML = '<p class="empty-msg">ابھی کوئی لین دین نہیں</p>';
    return;
  }

  list.innerHTML = '';
  recent.forEach((t) => {
    const div = document.createElement('div');
    div.className = 'recent-item';
    const info = balanceInfo(t.billTotal);
    div.innerHTML = `
      <div class="recent-avatar credit">${initials(t.customerName)}</div>
      <div class="recent-content">
        <div class="recent-name">${t.customerName || 'نامعلوم'}</div>
        <div class="recent-time">${formatRelativeDate(t.date)}</div>
      </div>
      <div class="recent-amount credit">₨ ${formatMoney(t.billTotal)}</div>
    `;
    list.appendChild(div);
  });
}

async function loadTopCustomers() {
  const list = $('topCustomersList');
  if (!list) return;

  const top = [...state.allCustomers]
    .filter((c) => Number(c.balance) > 0)
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 5);

  if (top.length === 0) {
    list.innerHTML = '<p class="empty-msg">کوئی بقایا والا کسٹمر نہیں</p>';
    return;
  }

  list.innerHTML = '';
  top.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'recent-item';
    div.innerHTML = `
      <div class="recent-avatar">${initials(c.name)}</div>
      <div class="recent-content">
        <div class="recent-name">${c.name}</div>
        <div class="recent-time">${c.phone || '—'}</div>
      </div>
      <div class="recent-amount credit">₨ ${formatMoney(c.balance)}</div>
    `;
    div.addEventListener('click', () => openCustomerModal(c));
    list.appendChild(div);
  });
}

/* ============================================================
   NEW BILL — Customer Suggestions (Live Search)
   ============================================================ */
const customerNameInput = $('customerName');
const customerSuggestions = $('customerSuggestions');

const debouncedSearch = debounce(() => {
  const q = customerNameInput.value.trim().toLowerCase();

  if (q.length < 1) {
    hideSuggestions();
    state.previousBalance = 0;
    updatePrevBalanceUI();
    return;
  }

  const matches = state.allCustomers.filter((c) =>
    (c.name || '').toLowerCase().includes(q)
  ).slice(0, 8);

  const exactMatch = state.allCustomers.find((c) =>
    (c.name || '').toLowerCase() === q
  );

  if (exactMatch && matches.length === 1) {
    state.previousBalance = Number(exactMatch.balance) || 0;
    if ($('customerPhone')) $('customerPhone').value = exactMatch.phone || '';
    updatePrevBalanceUI();
    hideSuggestions();
    return;
  }

  renderSuggestions(matches);
}, 200);

customerNameInput?.addEventListener('input', debouncedSearch);

function renderSuggestions(matches) {
  if (!customerSuggestions) return;
  customerSuggestions.innerHTML = '';

  if (matches.length === 0) {
    const q = customerNameInput.value.trim();
    const newDiv = document.createElement('div');
    newDiv.className = 'suggestion-new';
    newDiv.innerHTML = `➕ نیا کسٹمر بنائیں: <strong>${q}</strong>`;
    newDiv.addEventListener('click', () => {
      hideSuggestions();
      showToast('نیا کسٹمر بل بناتے وقت خودکار بن جائے گا', 'info');
    });
    customerSuggestions.appendChild(newDiv);
    customerSuggestions.style.display = 'block';
    return;
  }

  matches.forEach((c) => {
    const info = balanceInfo(c.balance);
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `
      <div class="suggestion-name">${c.name}</div>
      <div class="suggestion-balance ${info.className}">${info.label}: ₨ ${formatMoney(info.value)}</div>
    `;
    div.addEventListener('click', () => {
      customerNameInput.value = c.name;
      if ($('customerPhone')) $('customerPhone').value = c.phone || '';
      state.previousBalance = Number(c.balance) || 0;
      updatePrevBalanceUI();
      hideSuggestions();
    });
    customerSuggestions.appendChild(div);
  });

  customerSuggestions.style.display = 'block';
}

function hideSuggestions() {
  if (!customerSuggestions) return;
  customerSuggestions.style.display = 'none';
  customerSuggestions.innerHTML = '';
}

document.addEventListener('click', (e) => {
  if (customerNameInput && !customerNameInput.contains(e.target) &&
      customerSuggestions && !customerSuggestions.contains(e.target)) {
    hideSuggestions();
  }
});

function updatePrevBalanceUI() {
  const info = balanceInfo(state.previousBalance);
  if ($('previousBalance')) $('previousBalance').textContent = formatMoney(info.value);
  if ($('prevBalanceLabel')) $('prevBalanceLabel').textContent = 'پچھلا ' + info.label;
  const card = $('prevBalanceCard');
  if (card) {
    card.classList.remove('advance', 'clear');
    if (info.className === 'advance') card.classList.add('advance');
    else if (info.className === 'clear') card.classList.add('clear');
  }
}

/* ============================================================
   NEW BILL — Items
   ============================================================ */
function addItemRow(itemName = '', qty = '') {
  const container = $('itemsContainer');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <input type="text" placeholder="آئٹم کا نام" class="item-name" value="${itemName}">
    <input type="number" placeholder="تعداد" class="item-qty" value="${qty}" min="0" step="any" inputmode="numeric">
    <button type="button" class="remove-btn">×</button>
  `;
  row.querySelector('.remove-btn').addEventListener('click', () => {
    row.remove();
    if (container.children.length === 0) addItemRow();
  });
  container.appendChild(row);
}

$('addItemBtn')?.addEventListener('click', () => addItemRow());

/* ============================================================
   NEW BILL — Generate
   ============================================================ */
$('generateBillBtn')?.addEventListener('click', async () => {
  const name = customerNameInput.value.trim();
  const phone = $('customerPhone')?.value.trim() || '';
  const billAmount = Number($('billAmount')?.value) || 0;
  const payment = Number($('paymentAmount')?.value) || 0;

  if (!name) {
    showToast('کسٹمر کا نام لکھیں', 'warning');
    customerNameInput.focus();
    return;
  }

  const items = [];
  $$('.item-row').forEach((row) => {
    const itemName = row.querySelector('.item-name').value.trim();
    const qty = Number(row.querySelector('.item-qty').value) || 0;
    if (itemName && qty > 0) items.push({ name: itemName, qty });
  });

  if (billAmount === 0 && payment === 0) {
    showToast('ادھار رقم یا ادائیگی درج کریں', 'warning');
    return;
  }

  const currentBalance = state.previousBalance + billAmount - payment;
  const billDate = new Date();

  const btn = $('generateBillBtn');
  btn.disabled = true;
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<span>⏳</span> محفوظ ہو رہا ہے...';

  try {
    await addDoc(collection(db, "transactions"), {
      customerName: name,
      customerPhone: phone,
      date: billDate,
      items,
      previousBalance: state.previousBalance,
      billTotal: billAmount,
      payment,
      currentBalance,
      userEmail: auth.currentUser.email
    });

    const q = query(collection(db, "customers"), where("name", "==", name), limit(1));
    const snap = await getDocs(q);

    if (!snap.empty) {
      await updateDoc(doc(db, "customers", snap.docs[0].id), {
        balance: currentBalance,
        phone: phone,
        lastUpdated: billDate
      });
    } else {
      await addDoc(collection(db, "customers"), {
        name, phone, balance: currentBalance, createdAt: billDate
      });
    }

    state.lastBillData = {
      name, phone, items,
      previousBalance: state.previousBalance,
      billTotal: billAmount,
      payment,
      currentBalance,
      date: billDate
    };

    renderBillPreview(state.lastBillData);
    showToast('بل کامیابی سے محفوظ ہو گیا', 'success');

    await loadCustomersCache();
    await loadTransactionsCache();
    await loadDashboardStats();

  } catch (e) {
    console.error(e);
    showToast('محفوظ کرنے میں مسئلہ: ' + e.message, 'error', 5000);
  }

  btn.disabled = false;
  btn.innerHTML = origHTML;
});

/* ============================================================
   BILL PREVIEW
   ============================================================ */
function renderBillPreview(data) {
  const preview = $('billPreview');
  if (!preview) return;

  const dateStr = formatDate(data.date);
  const timeStr = formatTime(data.date);

  const itemsHTML = data.items.map((it) => `
    <tr><td>${it.name}</td><td>${it.qty}</td></tr>
  `).join('');

  const info = balanceInfo(data.currentBalance);
  const totalClass = info.className === 'advance' ? 'total-row advance'
    : info.className === 'clear' ? 'total-row clear' : 'total-row';
  const totalLabelText = 'کل ' + info.label;

  preview.innerHTML = `
    <div class="header">
      <div class="shop-name">${APP_SETTINGS.shopName || 'Ktk Store'}</div>
      <div class="shop-phone">📞 ${APP_SETTINGS.shopPhone || ''}</div>
      ${APP_SETTINGS.shopAddress ? `<div class="shop-address">📍 ${APP_SETTINGS.shopAddress}</div>` : ''}
    </div>
    <div class="meta">
      <div><strong>کسٹمر:</strong> ${data.name}</div>
      <div><strong>تاریخ:</strong> ${dateStr} — ${timeStr}</div>
    </div>
    <table>
      <thead>
        <tr><th>آئٹم</th><th>تعداد</th></tr>
      </thead>
      <tbody>
        ${itemsHTML || '<tr><td colspan="2" style="color:#999;">کوئی آئٹم شامل نہیں</td></tr>'}
      </tbody>
    </table>
    <div class="summary">
      <div class="row"><span>پچھلا بقایا</span><span>₨ ${formatMoney(data.previousBalance)}</span></div>
      <div class="row"><span>آج کا ادھار</span><span>₨ ${formatMoney(data.billTotal)}</span></div>
      <div class="row"><span>ادائیگی</span><span>− ₨ ${formatMoney(data.payment)}</span></div>
      <div class="row ${totalClass}"><span>${totalLabelText}</span><span>₨ ${formatMoney(info.value)}</span></div>
    </div>
    ${APP_SETTINGS.billNote ? `<div class="note">💡 ${APP_SETTINGS.billNote}</div>` : ''}
    <div class="footer">شکریہ! دوبارہ تشریف لائیں 🌟</div>
  `;

  showBlock('billPreviewWrapper');
  setTimeout(() => {
    $('billPreviewWrapper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

/* ============================================================
   WHATSAPP SHARE
   ============================================================ */
$('shareWhatsappBtn')?.addEventListener('click', async () => {
  if (!state.lastBillData) return;
  const btn = $('shareWhatsappBtn');
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ تصویر بن رہی ہے...';

  try {
    const canvas = await html2canvas($('billPreview'), {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false
    });

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], `bill-${state.lastBillData.name}.png`, { type: 'image/png' });

    const info = balanceInfo(state.lastBillData.currentBalance);
    const message = `السلام علیکم ${state.lastBillData.name}\nآپ کا ${info.label}: ₨ ${formatMoney(info.value)}\n\nشکریہ — ${APP_SETTINGS.shopName}`;

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'بل', text: message });
        showToast('شیئر ہو گیا', 'success');
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.log('Share error:', err);
        }
      }
    } else {
      // Fallback: download + wa.me link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bill-${state.lastBillData.name}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const phone = normalizePhone(state.lastBillData.phone);
      const waUrl = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(message + '\n\n(بل کی تصویر منسلک کریں)')}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');

      showToast('تصویر ڈاؤن لوڈ ہو گئی — واٹس ایپ میں منسلک کریں', 'info', 5000);
    }
  } catch (e) {
    console.error(e);
    showToast('تصویر بنانے میں مسئلہ ہوا', 'error');
  }

  btn.disabled = false;
  btn.innerHTML = origHTML;
});

/* ============================================================
   PRINT BILL
   ============================================================ */
$('printBillBtn')?.addEventListener('click', () => {
  if (!state.lastBillData) return;
  window.print();
});

/* ============================================================
   NEW BILL RESET
   ============================================================ */
function resetBillForm() {
  customerNameInput.value = '';
  $('customerPhone').value = '';
  $('billAmount').value = '';
  $('paymentAmount').value = '';
  state.previousBalance = 0;
  updatePrevBalanceUI();

  const container = $('itemsContainer');
  container.innerHTML = '';
  addItemRow();

  hide('billPreviewWrapper');
  state.lastBillData = null;
  hideSuggestions();
}

$('newBillBtn')?.addEventListener('click', () => {
  resetBillForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('clearBillBtn')?.addEventListener('click', () => {
  if (confirm('کیا آپ فارم صاف کرنا چاہتے ہیں؟')) {
    resetBillForm();
  }
});

/* ============================================================
   CUSTOMERS LIST
   ============================================================ */
async function loadCustomersList() {
  const list = $('customersList');
  if (!list) return;
  list.innerHTML = '<p class="empty-msg">لوڈ ہو رہا ہے...</p>';

  try {
    await loadCustomersCache();
    applyCustomerFilters();
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p class="empty-msg">لوڈ نہیں ہو سکی</p>';
  }
}

function applyCustomerFilters() {
  const search = ($('searchCustomer')?.value || '').trim().toLowerCase();
  const filter = state.currentCustomerFilter;
  const sort = $('sortCustomers')?.value || 'name';

  let list = [...state.allCustomers];

  // Search filter
  if (search) {
    list = list.filter((c) =>
      (c.name || '').toLowerCase().includes(search) ||
      (c.phone || '').includes(search)
    );
  }

  // Category filter
  if (filter === 'credit') list = list.filter((c) => Number(c.balance) > 0);
  else if (filter === 'advance') list = list.filter((c) => Number(c.balance) < 0);
  else if (filter === 'clear') list = list.filter((c) => Number(c.balance) === 0);

  // Sort
  if (sort === 'name') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (sort === 'balance-high') {
    list.sort((a, b) => Number(b.balance) - Number(a.balance));
  } else if (sort === 'balance-low') {
    list.sort((a, b) => Number(a.balance) - Number(b.balance));
  } else if (sort === 'recent') {
    list.sort((a, b) => {
      const da = a.lastUpdated?.toDate ? a.lastUpdated.toDate() : new Date(a.lastUpdated || 0);
      const db_ = b.lastUpdated?.toDate ? b.lastUpdated.toDate() : new Date(b.lastUpdated || 0);
      return db_ - da;
    });
  }

  renderCustomersList(list);
}

function renderCustomersList(list) {
  const container = $('customersList');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<p class="empty-msg">کوئی کسٹمر نہیں ملا</p>';
    return;
  }

  container.innerHTML = '';
  list.forEach((c) => {
    const info = balanceInfo(c.balance);
    const div = document.createElement('div');
    div.className = 'customer-item';
    div.innerHTML = `
      <div class="customer-info">
        <div class="customer-name">${c.name || 'بے نام'}</div>
        <div class="customer-phone">${c.phone || '—'}</div>
      </div>
      <div class="customer-balance ${info.className}">
        <div class="amount">₨ ${formatMoney(info.value)}</div>
        <div class="label">${info.label}</div>
      </div>
    `;
    div.addEventListener('click', () => openCustomerModal(c));
    container.appendChild(div);
  });
}

$('searchCustomer')?.addEventListener('input', debounce(applyCustomerFilters, 200));
$('sortCustomers')?.addEventListener('change', applyCustomerFilters);

$$('.filter-chip[data-filter]').forEach((chip) => {
  chip.addEventListener('click', () => {
    $$('.filter-chip[data-filter]').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.currentCustomerFilter = chip.dataset.filter;
    applyCustomerFilters();
  });
});

/* ============================================================
   CUSTOMER DETAIL MODAL
   ============================================================ */
async function openCustomerModal(customer) {
  state.selectedCustomer = customer;
  if ($('modalCustomerName')) $('modalCustomerName').textContent = customer.name || 'کسٹمر';
  if ($('modalPhone')) $('modalPhone').textContent = customer.phone || '—';

  const info = balanceInfo(customer.balance);
  if ($('modalBalance')) {
    $('modalBalance').textContent = '₨ ' + formatMoney(info.value);
    $('modalBalance').className = 'modal-stat-value ' + info.className;
  }
  if ($('modalBalanceLabel')) $('modalBalanceLabel').textContent = info.label;

  showFlex('customerModal');
  document.body.style.overflow = 'hidden';

  // Load customer's transactions
  const list = $('transactionsList');
  list.innerHTML = '<p class="empty-msg">لوڈ ہو رہا ہے...</p>';

  try {
    const txns = state.allTransactions.filter(
      (t) => t.customerName === customer.name
    );

    if (txns.length === 0) {
      list.innerHTML = '<p class="empty-msg">کوئی لین دین نہیں</p>';
      return;
    }

    list.innerHTML = '';
    txns.forEach((t) => {
      const dateStr = formatDate(t.date);
      const timeStr = formatTime(t.date);
      const itemsText = (t.items || []).length > 0
        ? (t.items || []).map((it) => `${it.name} × ${it.qty}`).join(' • ')
        : 'کوئی آئٹم نہیں';

      const div = document.createElement('div');
      div.className = 'transaction-item';
      div.innerHTML = `
        <div class="transaction-header">
          <span>${dateStr} — ${timeStr}</span>
          <span class="transaction-amount credit">ادھار: ₨ ${formatMoney(t.billTotal)}</span>
        </div>
        ${t.payment > 0 ? `<div class="transaction-header"><span></span><span class="transaction-amount payment">ادائیگی: ₨ ${formatMoney(t.payment)}</span></div>` : ''}
        <div class="transaction-detail">${itemsText}</div>
        <div class="transaction-detail">
          پچھلا: ₨ ${formatMoney(t.previousBalance)} → اب: ₨ ${formatMoney(t.currentBalance)}
        </div>
      `;
      list.appendChild(div);
    });
  } catch (e) {
    console.error(e);
    list.innerHTML = '<p class="empty-msg">لین دین لوڈ نہیں ہو سکے</p>';
  }
}

/* ============================================================
   MODAL: Close handlers
   ============================================================ */
$$('[data-close]').forEach((el) => {
  el.addEventListener('click', () => {
    const modalId = el.dataset.close;
    hide(modalId);
    document.body.style.overflow = '';
  });
});

$('modalNewBillBtn')?.addEventListener('click', () => {
  if (!state.selectedCustomer) return;
  hide('customerModal');
  document.body.style.overflow = '';
  switchPage('bill');

  // Pre-fill customer
  setTimeout(() => {
    customerNameInput.value = state.selectedCustomer.name;
    $('customerPhone').value = state.selectedCustomer.phone || '';
    state.previousBalance = Number(state.selectedCustomer.balance) || 0;
    updatePrevBalanceUI();
  }, 300);
});

$('modalPaymentBtn')?.addEventListener('click', () => {
  if (!state.selectedCustomer) return;
  openPaymentModal(state.selectedCustomer);
});

$('modalCallBtn')?.addEventListener('click', () => {
  if (!state.selectedCustomer) return;
  const phone = normalizePhone(state.selectedCustomer.phone);
  if (!phone) {
    showToast('فون نمبر موجود نہیں', 'warning');
    return;
  }
  window.location.href = 'tel:' + phone;
});

/* ============================================================
   PAYMENT MODAL
   ============================================================ */
function openPaymentModal(customer) {
  state.selectedCustomer = customer;
  if ($('paymentModalAmount')) $('paymentModalAmount').value = '';
  if ($('paymentModalNote')) $('paymentModalNote').value = '';
  showFlex('paymentModal');
}

$('paymentModalSaveBtn')?.addEventListener('click', async () => {
  const amount = Number($('paymentModalAmount')?.value) || 0;
  const note = $('paymentModalNote')?.value.trim() || '';
  const customer = state.selectedCustomer;

  if (!customer) return;
  if (amount <= 0) {
    showToast('درست رقم لکھیں', 'warning');
    return;
  }

  const btn = $('paymentModalSaveBtn');
  btn.disabled = true;
  btn.textContent = 'محفوظ ہو رہا ہے...';

  try {
    const previousBalance = Number(customer.balance) || 0;
    const currentBalance = previousBalance - amount;
    const billDate = new Date();

    await addDoc(collection(db, "transactions"), {
      customerName: customer.name,
      customerPhone: customer.phone || '',
      date: billDate,
      items: [],
      previousBalance,
      billTotal: 0,
      payment: amount,
      currentBalance,
      note: note,
      userEmail: auth.currentUser.email
    });

    await updateDoc(doc(db, "customers", customer.id), {
      balance: currentBalance,
      lastUpdated: billDate
    });

    showToast('ادائیگی محفوظ ہو گئی: ₨ ' + formatMoney(amount), 'success');
    hide('paymentModal');
    document.body.style.overflow = '';

    await loadCustomersCache();
    await loadTransactionsCache();
    await loadDashboardStats();

    if ($('pageCustomers').style.display !== 'none') applyCustomerFilters();

    // Update modal if open
    if ($('customerModal').style.display !== 'none') {
      const updated = state.allCustomers.find((c) => c.name === customer.name);
      if (updated) openCustomerModal(updated);
    }
  } catch (e) {
    console.error(e);
    showToast('محفوظ نہیں ہو سکی: ' + e.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'ادائیگی محفوظ کریں';
});

/* ============================================================
   TRANSACTIONS MODAL (View All)
   ============================================================ */
function openTransactionsModal() {
  showFlex('transactionsModal');
  document.body.style.overflow = 'hidden';
  renderAllTransactions();
}

function renderAllTransactions() {
  const list = $('allTransactionsList');
  if (!list) return;

  if (state.allTransactions.length === 0) {
    list.innerHTML = '<p class="empty-msg">کوئی لین دین نہیں</p>';
    return;
  }

  list.innerHTML = '';
  state.allTransactions.slice(0, 100).forEach((t) => {
    const dateStr = formatDate(t.date);
    const timeStr = formatTime(t.date);
    const itemsText = (t.items || []).length > 0
      ? (t.items || []).map((it) => `${it.name} × ${it.qty}`).join(' • ')
      : '—';

    const div = document.createElement('div');
    div.className = 'transaction-item';
    div.innerHTML = `
      <div class="transaction-header">
        <strong>${t.customerName || 'نامعلوم'}</strong>
        <span>${dateStr} — ${timeStr}</span>
      </div>
      ${Number(t.billTotal) > 0 ? `<div class="transaction-header"><span></span><span class="transaction-amount credit">ادھار: ₨ ${formatMoney(t.billTotal)}</span></div>` : ''}
      ${Number(t.payment) > 0 ? `<div class="transaction-header"><span></span><span class="transaction-amount payment">ادائیگی: ₨ ${formatMoney(t.payment)}</span></div>` : ''}
      <div class="transaction-detail">${itemsText}</div>
    `;
    list.appendChild(div);
  });
}

/* ============================================================
   REPORTS
   ============================================================ */
function loadReports() {
  const filter = state.currentReportFilter;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let startDate = null;
  if (filter === 'today') startDate = startOfToday;
  else if (filter === 'week') startDate = startOfWeek;
  else if (filter === 'month') startDate = startOfMonth;

  const filtered = state.allTransactions.filter((t) => {
    if (!startDate) return true;
    const d = t.date?.toDate ? t.date.toDate() : new Date(t.date);
    return d >= startDate;
  });

  let totalCredit = 0;
  let totalPayment = 0;

  filtered.forEach((t) => {
    totalCredit += Number(t.billTotal) || 0;
    totalPayment += Number(t.payment) || 0;
  });

  if ($('reportTotalCredit')) $('reportTotalCredit').textContent = '₨ ' + formatMoney(totalCredit);
  if ($('reportTotalPayment')) $('reportTotalPayment').textContent = '₨ ' + formatMoney(totalPayment);
  if ($('reportNetBalance')) $('reportNetBalance').textContent = '₨ ' + formatMoney(totalCredit - totalPayment);
  if ($('reportTotalTxns')) $('reportTotalTxns').textContent = filtered.length;

  renderReportTransactions(filtered);
}

function renderReportTransactions(list) {
  const container = $('reportTransactionsList');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<p class="empty-msg">اس دورانیے میں کوئی لین دین نہیں</p>';
    return;
  }

  container.innerHTML = '';
  list.slice(0, 50).forEach((t) => {
    const dateStr = formatDate(t.date);
    const timeStr = formatTime(t.date);
    const itemsText = (t.items || []).length > 0
      ? (t.items || []).map((it) => `${it.name} × ${it.qty}`).join(' • ')
      : '—';

    const div = document.createElement('div');
    div.className = 'transaction-item';
    div.innerHTML = `
      <div class="transaction-header">
        <strong>${t.customerName || 'نامعلوم'}</strong>
        <span>${dateStr} — ${timeStr}</span>
      </div>
      ${Number(t.billTotal) > 0 ? `<div class="transaction-header"><span></span><span class="transaction-amount credit">ادھار: ₨ ${formatMoney(t.billTotal)}</span></div>` : ''}
      ${Number(t.payment) > 0 ? `<div class="transaction-header"><span></span><span class="transaction-amount payment">ادائیگی: ₨ ${formatMoney(t.payment)}</span></div>` : ''}
      <div class="transaction-detail">${itemsText}</div>
    `;
    container.appendChild(div);
  });
}

$$('.filter-chip[data-report]').forEach((chip) => {
  chip.addEventListener('click', () => {
    $$('.filter-chip[data-report]').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.currentReportFilter = chip.dataset.report;
    loadReports();
  });
});

/* ============================================================
   SETTINGS
   ============================================================ */
$('saveSettingsBtn')?.addEventListener('click', () => {
  const settings = {
    shopName: $('settingShopName')?.value.trim() || DEFAULT_SETTINGS.shopName,
    shopPhone: $('settingShopPhone')?.value.trim() || DEFAULT_SETTINGS.shopPhone,
    shopAddress: $('settingShopAddress')?.value.trim() || '',
    billNote: $('settingBillNote')?.value.trim() || ''
  };

  saveSettingsToStorage(settings);
  applyShopInfoToUI();
  showToast('سیٹنگز محفوظ ہو گئیں', 'success');
});

/* ============================================================
   EXPORT DATA
   ============================================================ */
$('exportDataBtn')?.addEventListener('click', () => {
  try {
    const data = {
      exportedAt: new Date().toISOString(),
      settings: APP_SETTINGS,
      customers: state.allCustomers.map((c) => ({
        name: c.name,
        phone: c.phone,
        balance: c.balance
      })),
      transactions: state.allTransactions.map((t) => ({
        customerName: t.customerName,
        date: t.date?.toDate ? t.date.toDate().toISOString() : t.date,
        items: t.items,
        previousBalance: t.previousBalance,
        billTotal: t.billTotal,
        payment: t.payment,
        currentBalance: t.currentBalance
      }))
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `udhaar-khata-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('ڈیٹا ڈاؤن لوڈ ہو گیا', 'success');
  } catch (e) {
    console.error(e);
    showToast('ایکسپورٹ ناکام', 'error');
  }
});

$('refreshDataBtn')?.addEventListener('click', async () => {
  showLoading('ڈیٹا ریفریش ہو رہا ہے...');
  await refreshAll();
  hideLoading();
  showToast('ڈیٹا ریفریش ہو گیا', 'success');
});

/* ============================================================
   KEYBOARD SHORTCUTS (Desktop)
   ============================================================ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $$('.modal').forEach((m) => {
      if (m.style.display !== 'none' && m.style.display !== '') {
        m.style.display = 'none';
      }
    });
    document.body.style.overflow = '';
  }
});

/* ============================================================
   INIT
   ============================================================ */
loadSettings();
applyShopInfoToUI();
addItemRow();

// Splash timeout as backup
setTimeout(() => {
  if ($('splashScreen')?.style.display !== 'none' && !state.user) {
    hideSplash();
    showFlex('loginScreen');
  }
}, 2000);

console.log('🚀 ادھار کھاتہ PRO loaded successfully');
