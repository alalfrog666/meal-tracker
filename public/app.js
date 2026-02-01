const API = '';

// State
let currentMealId = null;
let members = [];

// DOM Elements
const views = {
  meals: document.getElementById('meals-view'),
  mealDetail: document.getElementById('meal-detail-view'),
  settle: document.getElementById('settle-view'),
  members: document.getElementById('members-view')
};

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    showView(view);
  });
});

function showView(viewName) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-view="${viewName}"]`)?.classList.add('active');
  
  Object.values(views).forEach(v => v.classList.remove('active'));
  
  if (viewName === 'meals') {
    views.meals.classList.add('active');
    loadMeals();
  } else if (viewName === 'settle') {
    views.settle.classList.add('active');
    loadSettlement();
  } else if (viewName === 'members') {
    views.members.classList.add('active');
    loadMembers();
  }
}

// Load members for datalist
async function loadMembersDatalist() {
  const res = await fetch(`${API}/api/members`);
  members = await res.json();
  const datalist = document.getElementById('members-datalist');
  datalist.innerHTML = members.map(m => `<option value="${m.name}">`).join('');
}

// ===== Meals =====

async function loadMeals() {
  const res = await fetch(`${API}/api/meals`);
  const meals = await res.json();
  
  const list = document.getElementById('meals-list');
  if (meals.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🍽️</div>
        <p>還沒有訂餐記錄</p>
        <p>點擊上方按鈕新增！</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = meals.map(meal => `
    <div class="list-item clickable" onclick="openMeal(${meal.id})">
      <div class="info">
        <div class="title">${meal.restaurant}</div>
        <div class="subtitle">${meal.date} · ${meal.item_count} 品項 ${meal.settled ? '✅ 已結算' : ''}</div>
      </div>
      <div class="amount">$${meal.total}</div>
    </div>
  `).join('');
}

async function openMeal(id) {
  currentMealId = id;
  await loadMealDetail();
  views.meals.classList.remove('active');
  views.mealDetail.classList.add('active');
  loadMembersDatalist();
}

async function loadMealDetail() {
  const res = await fetch(`${API}/api/meals/${currentMealId}`);
  const meal = await res.json();
  
  const total = meal.items.reduce((sum, i) => sum + i.price, 0);
  const totalPaid = meal.payments.reduce((sum, p) => sum + p.amount, 0);
  
  document.getElementById('meal-info').innerHTML = `
    <div class="title" style="font-size:1.3rem;margin-bottom:8px;">📍 ${meal.restaurant}</div>
    <div class="subtitle">日期：${meal.date}</div>
    <div style="margin-top:12px;display:flex;justify-content:space-between;">
      <span>總金額：<strong>$${total}</strong></span>
      <span>已墊付：<strong>$${totalPaid}</strong></span>
    </div>
  `;
  
  // Items
  const itemsList = document.getElementById('items-list');
  if (meal.items.length === 0) {
    itemsList.innerHTML = '<div class="empty">還沒有品項</div>';
  } else {
    itemsList.innerHTML = meal.items.map(item => `
      <div class="list-item">
        <div class="info">
          <div class="title">${item.person}</div>
          <div class="subtitle">${item.item}</div>
        </div>
        <div class="amount">$${item.price}</div>
        <button class="delete-btn" onclick="deleteItem(${item.id})">×</button>
      </div>
    `).join('');
  }
  
  // Payments
  const paymentsList = document.getElementById('payments-list');
  if (meal.payments.length === 0) {
    paymentsList.innerHTML = '<div class="empty">還沒有墊付記錄</div>';
  } else {
    paymentsList.innerHTML = meal.payments.map(p => `
      <div class="list-item">
        <div class="info">
          <div class="title">${p.person} 墊付</div>
        </div>
        <div class="amount">$${p.amount}</div>
        <button class="delete-btn" onclick="deletePayment(${p.id})">×</button>
      </div>
    `).join('');
  }
}

// Back button
document.getElementById('back-btn').addEventListener('click', () => {
  views.mealDetail.classList.remove('active');
  views.meals.classList.add('active');
  loadMeals();
});

// Delete meal
document.getElementById('delete-meal-btn').addEventListener('click', async () => {
  if (!confirm('確定要刪除這個訂餐記錄嗎？')) return;
  await fetch(`${API}/api/meals/${currentMealId}`, { method: 'DELETE' });
  views.mealDetail.classList.remove('active');
  views.meals.classList.add('active');
  loadMeals();
});

// Add item
document.getElementById('add-item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const person = document.getElementById('item-person').value.trim();
  const item = document.getElementById('item-name').value.trim();
  const price = parseFloat(document.getElementById('item-price').value);
  
  await fetch(`${API}/api/meals/${currentMealId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person, item, price })
  });
  
  document.getElementById('item-person').value = '';
  document.getElementById('item-name').value = '';
  document.getElementById('item-price').value = '';
  loadMealDetail();
  loadMembersDatalist();
});

// Delete item
async function deleteItem(id) {
  await fetch(`${API}/api/items/${id}`, { method: 'DELETE' });
  loadMealDetail();
}

// Add payment
document.getElementById('add-payment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const person = document.getElementById('payment-person').value.trim();
  const amount = parseFloat(document.getElementById('payment-amount').value);
  
  await fetch(`${API}/api/meals/${currentMealId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person, amount })
  });
  
  document.getElementById('payment-person').value = '';
  document.getElementById('payment-amount').value = '';
  loadMealDetail();
  loadMembersDatalist();
});

// Delete payment
async function deletePayment(id) {
  await fetch(`${API}/api/payments/${id}`, { method: 'DELETE' });
  loadMealDetail();
}

// ===== New Meal Modal =====

const modal = document.getElementById('modal');
const mealDateInput = document.getElementById('meal-date');

document.getElementById('new-meal-btn').addEventListener('click', () => {
  mealDateInput.value = new Date().toISOString().split('T')[0];
  modal.classList.remove('hidden');
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  modal.classList.add('hidden');
});

document.getElementById('new-meal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const restaurant = document.getElementById('meal-restaurant').value.trim();
  const date = mealDateInput.value;
  
  const res = await fetch(`${API}/api/meals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurant, date })
  });
  
  const meal = await res.json();
  modal.classList.add('hidden');
  document.getElementById('meal-restaurant').value = '';
  openMeal(meal.id);
});

// ===== Settlement =====

async function loadSettlement() {
  const res = await fetch(`${API}/api/settle`);
  const data = await res.json();
  
  // Summary
  const summaryEl = document.getElementById('settle-summary');
  const entries = Object.entries(data.summary);
  
  if (entries.length === 0) {
    summaryEl.innerHTML = '<div class="empty">沒有需要結算的記錄</div>';
    document.getElementById('settle-transactions').innerHTML = '';
    return;
  }
  
  summaryEl.innerHTML = `
    <div style="margin-bottom:12px;color:var(--text-light);">未結算場次：${data.unsettledMeals} 場</div>
    <div class="summary-grid">
      ${entries.map(([name, balance]) => `
        <div class="summary-item">
          <div class="name">${name}</div>
          <div class="balance ${balance >= 0 ? 'positive' : 'negative'}">
            ${balance >= 0 ? '+' : ''}$${Math.round(balance)}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  // Transactions
  const transEl = document.getElementById('settle-transactions');
  if (data.transactions.length === 0) {
    transEl.innerHTML = '<div class="empty">✅ 不需要轉帳，大家已經結清！</div>';
  } else {
    transEl.innerHTML = data.transactions.map(t => `
      <div class="transaction-item">
        <div class="from"><strong>${t.from}</strong></div>
        <div class="arrow">→</div>
        <div class="to"><strong>${t.to}</strong></div>
        <div class="amount">$${t.amount}</div>
      </div>
    `).join('');
  }
}

// Settle all
document.getElementById('settle-all-btn').addEventListener('click', async () => {
  if (!confirm('確定要將所有未結算的訂餐標記為已結算嗎？')) return;
  
  const res = await fetch(`${API}/api/meals`);
  const meals = await res.json();
  
  for (const meal of meals.filter(m => !m.settled)) {
    await fetch(`${API}/api/meals/${meal.id}/settle`, { method: 'POST' });
  }
  
  loadSettlement();
  alert('已全部標記為結算完成！');
});

// ===== Members =====

async function loadMembers() {
  const res = await fetch(`${API}/api/members`);
  const members = await res.json();
  
  const list = document.getElementById('members-list');
  if (members.length === 0) {
    list.innerHTML = '<div class="empty">還沒有成員<br>新增訂餐時會自動建立</div>';
    return;
  }
  
  list.innerHTML = members.map(m => `
    <div class="list-item">
      <div class="info">
        <div class="title">${m.name}</div>
      </div>
      <button class="delete-btn" onclick="deleteMember(${m.id})">×</button>
    </div>
  `).join('');
}

document.getElementById('add-member-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('member-name').value.trim();
  
  await fetch(`${API}/api/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  
  document.getElementById('member-name').value = '';
  loadMembers();
});

async function deleteMember(id) {
  if (!confirm('確定要刪除這個成員嗎？')) return;
  await fetch(`${API}/api/members/${id}`, { method: 'DELETE' });
  loadMembers();
}

// Initial load
loadMeals();
loadMembersDatalist();
