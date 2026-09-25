import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, getDocs, query, where, limit, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ⚠️ اپنی دکان کی معلومات یہاں لکھیں
const SHOP_NAME = "Ktk Store";
const SHOP_PHONE = "0300-1234567";

// ============ Elements ============
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginError = document.getElementById('loginError');
const userEmail = document.getElementById('userEmail');
const tabLogin = document.getElementById('tabLogin');
const tabSignup = document.getElementById('tabSignup');

const customerName = document.getElementById('customerName');
const customerPhone = document.getElementById('customerPhone');
const previousBalanceEl = document.getElementById('previousBalance');
const itemsContainer = document.getElementById('itemsContainer');
const addItemBtn = document.getElementById('addItemBtn');
const paymentAmount = document.getElementById('paymentAmount');
const generateBillBtn = document.getElementById('generateBillBtn');
const billPreviewWrapper = document.getElementById('billPreviewWrapper');
const billPreview = document.getElementById('billPreview');
const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
const newBillBtn = document.getElementById('newBillBtn');
const customerNamesList = document.getElementById('customerNames');
const totalCustomersEl = document.getElementById('totalCustomers');
const totalOutstandingEl = document.getElementById('totalOutstanding');

let previousBalance = 0;
let lastBillData = null;

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

// ============ Login ============
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
    console.error(e);
  }
  loginBtn.textContent = 'لاگ ان کریں';
  loginBtn.disabled = false;
});

// ============ Signup ============
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
    console.error(e);
  }
  signupBtn.textContent = 'نیا اکاؤنٹ بنائیں';
  signupBtn.disabled = false;
});

// ============ Logout ============
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
    userEmail.textContent = user.email;
    loadCustomerNames();
    loadStats();
  } else {
    loginScreen.style.display = 'flex';
    mainApp.style.display = 'none';
    loginEmail.value = '';
    loginPassword.value = '';
  }
});

// ============ Customer names list ============
async function loadCustomerNames() {
  customerNamesList.innerHTML = '';
  try {
    const snap = await getDocs(collection(db, "customers"));
    snap.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.data().name;
      customerNamesList.appendChild(opt);
    });
  } catch (e) {
    console.error(e);
  }
}

// ============ Stats ============
async function loadStats() {
  try {
    const snap = await getDocs(collection(db, "customers"));
    let total = 0;
    let outstanding = 0;
    snap.forEach((d) => {
      total++;
      outstanding += Number(d.data().balance) || 0;
    });
    totalCustomersEl.textContent = total;
    totalOutstandingEl.textContent = '₨ ' + outstanding.toLocaleString();
  } catch (e) {
    console.error(e);
  }
}

// ============ Auto-load previous balance ============
customerName.addEventListener('change', async () => {
  const name = customerName.value.trim();
  if (!name) return;
  try {
    const q = query(collection(db, "customers"), where("name", "==", name), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data();
      previousBalance = data.balance || 0;
      customerPhone.value = data.phone || '';
    } else {
      previousBalance = 0;
    }
    previousBalanceEl.textContent = previousBalance.toLocaleString();
  } catch (e) {
    console.error(e);
  }
});

// ============ Add item row ============
function addItemRow() {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <input type="text" placeholder="آئٹم" class="item-name">
    <input type="number" placeholder="تعداد" class="item-qty" value="1" min="1">
    <input type="number" placeholder="ریٹ" class="item-rate">
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
  const payment = Number(paymentAmount.value) || 0;

  if (!name) {
    alert('کسٹمر کا نام لکھیں');
    return;
  }

  const items = [];
  document.querySelectorAll('.item-row').forEach((row) => {
    const itemName = row.querySelector('.item-name').value.trim();
    const qty = Number(row.querySelector('.item-qty').value) || 0;
    const rate = Number(row.querySelector('.item-rate').value) || 0;
    if (itemName && qty > 0 && rate > 0) {
      items.push({ name: itemName, qty, rate, amount: qty * rate });
    }
  });

  const billTotal = items.reduce((s, i) => s + i.amount, 0);
  const currentBalance = previousBalance + billTotal - payment;
  const billDate = new Date();

  generateBillBtn.textContent = 'محفوظ ہو رہا ہے...';
  generateBillBtn.disabled = true;

  try {
    await addDoc(collection(db, "transactions"), {
      customerName: name,
      customerPhone: phone,
      date: billDate,
      items: items,
      previousBalance: previousBalance,
      billTotal: billTotal,
      payment: payment,
      currentBalance: currentBalance,
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
        name: name,
        phone: phone,
        balance: currentBalance,
        createdAt: billDate
      });
    }

    lastBillData = {
      name, phone, items, previousBalance, billTotal, payment,
      currentBalance, date: billDate
    };
    renderBillPreview(lastBillData);
    loadCustomerNames();
    loadStats();
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
      <td>${it.rate}</td>
      <td>${it.amount}</td>
    </tr>
  `).join('');

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
        <tr><th>آئٹم</th><th>تعداد</th><th>ریٹ</th><th>رقم</th></tr>
      </thead>
      <tbody>
        ${itemsHTML || '<tr><td colspan="4" style="color:#999;">کوئی آئٹم شامل نہیں</td></tr>'}
      </tbody>
    </table>
    <div class="summary">
      <div class="row"><span>پچھلا بقایا</span><span>₨ ${data.previousBalance.toLocaleString()}</span></div>
      <div class="row"><span>آج کا ادھار</span><span>₨ ${data.billTotal.toLocaleString()}</span></div>
      <div class="row"><span>ادائیگی</span><span>− ₨ ${data.payment.toLocaleString()}</span></div>
      <div class="row total-row"><span>کل بقایا</span><span>₨ ${data.currentBalance.toLocaleString()}</span></div>
    </div>
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
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true
    });
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], `bill-${lastBillData.name}.png`, { type: 'image/png' });

    const message = `السلام علیکم ${lastBillData.name}\nآپ کا کل بقایا: ₨ ${lastBillData.currentBalance}\n\nشکریہ — ${SHOP_NAME}`;

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'بل',
          text: message
        });
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
  previousBalanceEl.textContent = '0';
  previousBalance = 0;
  itemsContainer.innerHTML = '';
  addItemRow();
  paymentAmount.value = '0';
  billPreviewWrapper.style.display = 'none';
  lastBillData = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// پہلی قطار شامل کریں
addItemRow();
