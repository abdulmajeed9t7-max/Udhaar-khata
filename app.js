import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, getDocs, query, where, limit, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ⚠️ اپنی دکان کی معلومات
const SHOP_NAME = "Ktk Store";
const SHOP_PHONE = "0300-1234567";
const BILL_NOTE = "ادھار کی صورت میں بل ضرور لیں — شکریہ";

// ============ PWA ============
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then((reg) => console.log('SW registered'))
      .catch((err) => console.log('SW fail:', err));
  });
}

// ============ Elements ============
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const bottomNav = document.getElementById('bottomNav');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginError = document.getElementById('loginError');
const userEmail = document.getElementById('userEmail');
const tabLogin = document.getElementById('tabLogin');
const tabSignup = document.getElementById('tabSignup');

const pageBill = document.getElementById('pageBill');
const pageCustomers = document.getElementById('pageCustomers');

const customerName = document.getElementById('customerName');
const customerPhone = document.getElementById('customerPhone');
const customerSuggestions = document.getElementById('customerSuggestions');
const previousBalanceEl = document.getElementById('previousBalance');
const prevBalanceCard = document.getElementById('prevBalanceCard');
const prevBalanceLabel = document.getElementById('prevBalanceLabel');
const itemsContainer = document.getElementById('itemsContainer');
const addItemBtn = document.getElementById('addItemBtn');
const billAmountInput = document.getElementById('billAmount');
const paymentAmount = document.getElementById('paymentAmount');
const generateBillBtn = document.getElementById('generateBillBtn');
const billPreviewWrapper = document.getElementById('billPreviewWrapper');
const billPreview = document.getElementById('billPreview');
const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
const newBillBtn = document.getElementById('newBillBtn');
const totalCustomersEl = document.getElementById('totalCustomers');
const totalOutstandingEl = document.getElementById('totalOutstanding');
const totalCard = document.getElementById('totalCard');
const totalLabel = document.getElementById('totalLabel');

const customersListEl = document.getElementById('customersList');
const searchCustomer = document.getElementById('searchCustomer');

const customerModal = document.getElementById('customerModal');
const modalOverlay = document.getElementById('modalOverlay');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalCustomerName = document.getElementById('modalCustomerName');
const modalPhone = document.getElementById('modalPhone');
const modalBalance = document.getElementById('modalBalance');
const modalBalanceLabel = document.getElementById('modalBalanceLabel');
const transactionsList = document.getElementById('transactionsList');

let previousBalance = 0;
let lastBillData = null;
let allCustomers = [];

// ============ Helpers ============
function formatMoney(n) {
  return Number(n || 0).toLocaleString('en-PK');
}

function balanceInfo(balance) {
  const b = Number(balance) || 0;
  if (b < 0) {
    return { label: 'ایڈوانس', value: Math.abs(b), className: 'advance' };
  }
  return { label: 'بقایا', value: b, className: 'credit' };
}

function updatePrevBalanceUI() {
  const info = balanceInfo(previousBalance);
  previousBalanceEl.textContent = formatMoney(info.value);
  prevBalanceLabel.textContent = 'پچھلا ' + info.label;
  if (info.className === 'advance') {
    prevBalanceCard.classList.add('advance');
  } else {
    prevBalanceCard.classList.remove('advance');
  }
}

// ============ Tab Switch ============
tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabSignup.classList.remove('active');
  loginBtn.style.display = 'block';
  signupBtn.style.display = 'none';
  loginError.textContent = '';
});
tabSignup.addEventListener('click', () => {
  tabSignup.classList.add('active');
  tabLogin.classList.remove('active');
  loginBtn.style.display = 'none';
  signupBtn.style.display = 'block';
  loginError.textContent = '';
});

// ============ Login / Signup ============
loginBtn.addEventListener('click', async () => {
  loginError.textContent = '';
  const email = loginEmail.value.trim();
  const pass = loginPassword.value;
  if (!email || !pass) {
    loginError.textContent = 'ای میل اور پاسورڈ دونوں لکھیں';
    return;
  }
  loginBtn.textContent = 'انتظار کریں...';
  loginBtn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    loginError.textContent = 'غلط ای میل یا پاسورڈ';
  }
  loginBtn.textContent = 'لاگ ان کریں';
  loginBtn.disabled = false;
});

signupBtn.addEventListener('click', async () => {
  loginError.textContent = '';
  const email = loginEmail.value.trim();
  const pass = loginPassword.value;
  if (!email || pass.length < 6) {
    loginError.textContent = 'درست ای میل اور 6+ حروف کا پاسورڈ لکھیں';
    return;
  }
  signupBtn.textContent = 'انتظار کریں...';
  signupBtn.disabled = true;
  try {
    await createUserWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    loginError.textContent = e.code === 'auth/email-already-in-use'
      ? 'یہ ای میل پہلے سے موجود ہے'
      : 'مسئلہ: ' + e.message;
  }
  signupBtn.textContent = 'نیا اکاؤنٹ بنائیں';
  signupBtn.disabled = false;
});

logoutBtn.addEventListener('click', async () => {
  if (confirm('کیا آپ واقعی لاگ آؤٹ کرنا چاہتے ہیں؟')) {
    await signOut(auth);
  }
});

// ============ Auth State ============
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.style.display = 'none';
    mainApp.style.display = 'block';
    bottomNav.style.display = 'flex';
    userEmail.textContent = user.email;
    refreshAll();
  } else {
    loginScreen.style.display = 'flex';
    mainApp.style.display = 'none';
    bottomNav.style.display = 'none';
    loginEmail.value = '';
    loginPassword.value = '';
  }
});

async function refreshAll() {
  await loadCustomersCache();
  await loadStats();
  await loadCustomersList();
}

// ============ Bottom Nav ============
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const page = btn.dataset.page;
    if (page === 'bill') {
      pageBill.style.display = 'block';
      pageCustomers.style.display = 'none';
    } else {
      pageBill.style.display = 'none';
      pageCustomers.style.display = 'block';
      loadCustomersList();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

// ============ Load customers cache ============
async function loadCustomersCache() {
  try {
    const snap = await getDocs(collection(db, "customers"));
    allCustomers = [];
    snap.forEach((d) => allCustomers.push({ id: d.id, ...d.data() }));
    allCustomers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } catch (e) { console.error(e); }
}

// ============ Load stats ============
async function loadStats() {
  try {
    const snap = await getDocs(collection(db, "customers"));
    let total = 0, outstanding = 0;
    snap.forEach((d) => {
      total++;
      outstanding += Number(d.data().balance) || 0;
    });
    totalCustomersEl.textContent = total;
    if (outstanding < 0) {
      totalOutstandingEl.textContent = '₨ ' + formatMoney(Math.abs(outstanding));
      totalLabel.textContent = 'کل ایڈوانس';
      totalCard.classList.add('green');
    } else {
      totalOutstandingEl.textContent = '₨ ' + formatMoney(outstanding);
      totalLabel.textContent = 'کل بقایا';
      totalCard.classList.remove('green');
    }
  } catch (e) { console.error(e); }
}

// ============ Load customers list ============
async function loadCustomersList() {
  customersListEl.innerHTML = '<p class="empty-msg">لوڈ ہو رہا ہے...</p>';
  await loadCustomersCache();
  renderCustomersList(allCustomers);
}

function renderCustomersList(list) {
  if (list.length === 0) {
    customersListEl.innerHTML = '<p class="empty-msg">ابھی کوئی کسٹمر نہیں</p>';
    return;
  }
  customersListEl.innerHTML = '';
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
    customersListEl.appendChild(div);
  });
}

searchCustomer.addEventListener('input', () => {
  const q = searchCustomer.value.trim().toLowerCase();
  if (!q) { renderCustomersList(allCustomers); return; }
  const filtered = allCustomers.filter((c) =>
    (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
  );
  renderCustomersList(filtered);
});

// ============ Customer Suggestions (Live Search) ============
function renderSuggestions(matches, exactMatch) {
  customerSuggestions.innerHTML = '';

  if (matches.length === 0 && !exactMatch) {
    // کوئی میچ نہیں — نیا کسٹمر بنانے کا آپشن
    const newDiv = document.createElement('div');
    newDiv.className = 'suggestion-new';
    newDiv.textContent = '➕ نیا کسٹمر بنائیں: ' + customerName.value.trim();
    newDiv.addEventListener('click', () => {
      hideSuggestions();
      // نام وہی رہنے دیں، باقی صارف بھرے گا
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
      customerName.value = c.name;
      customerPhone.value = c.phone || '';
      previousBalance = Number(c.balance) || 0;
      updatePrevBalanceUI();
      hideSuggestions();
    });
    customerSuggestions.appendChild(div);
  });

  customerSuggestions.style.display = 'block';
}

function hideSuggestions() {
  customerSuggestions.style.display = 'none';
  customerSuggestions.innerHTML = '';
}

customerName.addEventListener('input', () => {
  const q = customerName.value.trim().toLowerCase();
  if (q.length < 1) {
    hideSuggestions();
    previousBalance = 0;
    updatePrevBalanceUI();
    return;
  }
  const matches = allCustomers.filter((c) =>
    (c.name || '').toLowerCase().includes(q)
  ).slice(0, 8);

  const exactMatch = allCustomers.find((c) =>
    (c.name || '').toLowerCase() === q
  );

  if (exactMatch && matches.length === 1) {
    // بالکل وہی نام — خودکار bhro
    previousBalance = Number(exactMatch.balance) || 0;
    customerPhone.value = exactMatch.phone || '';
    updatePrevBalanceUI();
    hideSuggestions();
    return;
  }

  renderSuggestions(matches, exactMatch);
});

// کلک آؤٹ سائیڈ پر suggestions بند
document.addEventListener('click', (e) => {
  if (!customerName.contains(e.target) && !customerSuggestions.contains(e.target)) {
    hideSuggestions();
  }
});

// ============ Customer Modal ============
async function openCustomerModal(customer) {
  modalCustomerName.textContent = customer.name || 'کسٹمر';
  modalPhone.textContent = customer.phone || '—';

  const info = balanceInfo(customer.balance);
  modalBalance.textContent = '₨ ' + formatMoney(info.value);
  modalBalanceLabel.textContent = info.label;
  modalBalance.className = 'modal-stat-value ' + info.className;

  customerModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  transactionsList.innerHTML = '<p class="empty-msg">لوڈ ہو رہا ہے...</p>';

  try {
    const q = query(collection(db, "transactions"), where("customerName", "==", customer.name));
    const snap = await getDocs(q);
    const txns = [];
    snap.forEach((d) => txns.push(d.data()));
    txns.sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate() : new Date(a.date);
      const db_ = b.date?.toDate ? b.date.toDate() : new Date(b.date);
      return db_ - da;
    });

    if (txns.length === 0) {
      transactionsList.innerHTML = '<p class="empty-msg">کوئی لین دین نہیں</p>';
      return;
    }

    transactionsList.innerHTML = '';
    txns.forEach((t) => {
      const date = t.date?.toDate ? t.date.toDate() : new Date(t.date);
      const dateStr = date.toLocaleDateString('en-GB');
      const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

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
      transactionsList.appendChild(div);
    });
  } catch (e) {
    console.error(e);
    transactionsList.innerHTML = '<p class="empty-msg">لین دین لوڈ نہیں ہو سکے</p>';
  }
}

function closeModal() {
  customerModal.style.display = 'none';
  document.body.style.overflow = '';
}
closeModalBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);

// ============ Add item row (بدون ریٹ) ============
function addItemRow() {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <input type="text" placeholder="آئٹم کا نام" class="item-name">
    <input type="number" placeholder="تعداد" class="item-qty" value="1" min="0" step="any">
    <button type="button" class="remove-btn">×</button>
  `;
  row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
  itemsContainer.appendChild(row);
}
addItemBtn.addEventListener('click', addItemRow);

// ============ Generate bill ============
generateBillBtn.addEventListener('click', async () => {
  const name = customerName.value.trim();
  const phone = customerPhone.value.trim();
  const billAmount = Number(billAmountInput.value) || 0;
  const payment = Number(paymentAmount.value) || 0;

  if (!name) { alert('کسٹمر کا نام لکھیں'); return; }

  const items = [];
  document.querySelectorAll('.item-row').forEach((row) => {
    const itemName = row.querySelector('.item-name').value.trim();
    const qty = Number(row.querySelector('.item-qty').value) || 0;
    if (itemName && qty > 0) {
      items.push({ name: itemName, qty });
    }
  });

  if (billAmount === 0 && payment === 0) {
    alert('ادھار رقم یا ادائیگی درج کریں');
    return;
  }

  const currentBalance = previousBalance + billAmount - payment;
  const billDate = new Date();

  generateBillBtn.textContent = 'محفوظ ہو رہا ہے...';
  generateBillBtn.disabled = true;

  try {
    await addDoc(collection(db, "transactions"), {
      customerName: name,
      customerPhone: phone,
      date: billDate,
      items,
      previousBalance,
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
        phone: phone
      });
    } else {
      await addDoc(collection(db, "customers"), {
        name, phone, balance: currentBalance, createdAt: billDate
      });
    }

    lastBillData = {
      name, phone, items, previousBalance,
      billTotal: billAmount, payment, currentBalance, date: billDate
    };
    renderBillPreview(lastBillData);
    await refreshAll();
  } catch (e) {
    console.error(e);
    alert('محفوظ کرنے میں مسئلہ: ' + e.message);
  }

  generateBillBtn.textContent = 'بل بنائیں';
  generateBillBtn.disabled = false;
});

// ============ Bill Preview ============
function renderBillPreview(data) {
  const dateStr = data.date.toLocaleDateString('en-GB');
  const timeStr = data.date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const itemsHTML = data.items.map((it) => `
    <tr>
      <td>${it.name}</td>
      <td>${it.qty}</td>
    </tr>
  `).join('');

  const info = balanceInfo(data.currentBalance);
  const totalClass = info.className === 'advance' ? 'total-row advance' : 'total-row';
  const totalLabel = info.className === 'advance' ? 'کل ایڈوانس' : 'کل بقایا';

  billPreview.innerHTML = `
    <div class="header">
      <div class="shop-name">${SHOP_NAME}</div>
      <div class="shop-phone">📞 ${SHOP_PHONE}</div>
    </div>
    <div class="meta">
      <div><strong>کسٹمر:</strong> ${data.name}</div>
      <div><strong>تاریخ:</strong> ${dateStr} &nbsp; ${timeStr}</div>
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
      <div class="row ${totalClass}"><span>${totalLabel}</span><span>₨ ${formatMoney(info.value)}</span></div>
    </div>
    <div class="note">💡 ${BILL_NOTE}</div>
    <div class="footer">شکریہ! دوبارہ تشریف لائیں 🌟</div>
  `;

  billPreviewWrapper.style.display = 'block';
  billPreviewWrapper.scrollIntoView({ behavior: 'smooth' });
}

// ============ WhatsApp Share ============
shareWhatsappBtn.addEventListener('click', async () => {
  if (!lastBillData) return;
  shareWhatsappBtn.disabled = true;
  shareWhatsappBtn.textContent = 'تصویر بن رہی ہے...';

  try {
    const canvas = await html2canvas(billPreview, {
      scale: 2, backgroundColor: '#ffffff', useCORS: true
    });
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], `bill-${lastBillData.name}.png`, { type: 'image/png' });

    const info = balanceInfo(lastBillData.currentBalance);
    const message = `السلام علیکم ${lastBillData.name}\nآپ کا ${info.label}: ₨ ${formatMoney(info.value)}\n\nشکریہ — ${SHOP_NAME}`;

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'بل', text: message });
      } catch (err) {
        if (err.name !== 'AbortError') console.log('Share error', err);
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bill-${lastBillData.name}.png`;
      a.click();
      URL.revokeObjectURL(url);

      const phone = (lastBillData.phone || '').replace(/\D/g, '');
      const waUrl = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(message + '\n\n(بل کی تصویر منسلک کریں)')}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
    }
  } catch (e) {
    console.error(e);
    alert('تصویر بنانے میں مسئلہ ہوا');
  }

  shareWhatsappBtn.disabled = false;
  shareWhatsappBtn.textContent = '📲 واٹس ایپ پر بھیجیں';
});

// ============ New bill ============
newBillBtn.addEventListener('click', () => {
  customerName.value = '';
  customerPhone.value = '';
  previousBalance = 0;
  updatePrevBalanceUI();
  itemsContainer.innerHTML = '';
  addItemRow();
  billAmountInput.value = '0';
  paymentAmount.value = '0';
  billPreviewWrapper.style.display = 'none';
  lastBillData = null;
  hideSuggestions();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// پہلی قطار
addItemRow();
