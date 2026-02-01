const API = '';

// State
let currentMealId = null;
let currentRestaurantId = null;
let members = [];
let restaurants = [];
let menuItems = [];

// DOM Elements
const views = {
  meals: document.getElementById('meals-view'),
  mealDetail: document.getElementById('meal-detail-view'),
  settle: document.getElementById('settle-view'),
  members: document.getElementById('members-view'),
  restaurants: document.getElementById('restaurants-view')
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
  } else if (viewName === 'restaurants') {
    views.restaurants.classList.add('active');
    loadRestaurants();
  }
}

// Load data for datalists
async function loadDataLists() {
  const [membersRes, restaurantsRes, menuRes] = await Promise.all([
    fetch(`${API}/api/members`),
    fetch(`${API}/api/restaurants`),
    fetch(`${API}/api/menu`)
  ]);
  
  members = await membersRes.json();
  restaurants = await restaurantsRes.json();
  menuItems = await menuRes.json();
  
  document.getElementById('members-datalist').innerHTML = 
    members.map(m => `<option value="${m.name}">`).join('');
  
  document.getElementById('restaurants-datalist').innerHTML = 
    restaurants.map(r => `<option value="${r.name}">`).join('');
  
  document.getElementById('menu-datalist').innerHTML = 
    menuItems.map(m => `<option value="${m.name}">${m.restaurant_name ? `(${m.restaurant_name}) ` : ''}$${m.price || 0}</option>`).join('');
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
  loadDataLists();
}

async function loadMealDetail() {
  const res = await fetch(`${API}/api/meals/${currentMealId}`);
  const meal = await res.json();
  
  const personalItems = meal.items.filter(i => !i.shared);
  const sharedItems = meal.items.filter(i => i.shared);
  
  const totalPersonal = personalItems.reduce((sum, i) => sum + i.price, 0);
  const totalShared = sharedItems.reduce((sum, i) => sum + i.price, 0);
  const total = totalPersonal + totalShared;
  const totalPaid = meal.payments.reduce((sum, p) => sum + p.amount, 0);
  
  document.getElementById('meal-info').innerHTML = `
    <div class="title" style="font-size:1.3rem;margin-bottom:8px;">📍 ${meal.restaurant}</div>
    <div class="subtitle">日期：${meal.date}</div>
    <div style="margin-top:12px;">
      <div style="display:flex;justify-content:space-between;">
        <span>個人消費：</span><strong>$${totalPersonal}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span>🍲 共食：</span><strong>$${totalShared}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid #eee;margin-top:8px;padding-top:8px;">
        <span>總金額：</span><strong>$${total}</strong>
      </div>
    </div>
  `;
  
  // Items
  const itemsList = document.getElementById('items-list');
  if (meal.items.length === 0) {
    itemsList.innerHTML = '<div class="empty">還沒有品項</div>';
  } else {
    itemsList.innerHTML = meal.items.map(item => `
      <div class="list-item ${item.shared ? 'shared' : ''}">
        <div class="info">
          <div class="title">${item.shared ? '🍲 共食' : item.person}</div>
          <div class="subtitle">${item.item}</div>
        </div>
        <div class="amount">$${item.price}</div>
        <button class="delete-btn" onclick="deleteItem(${item.id})">×</button>
      </div>
    `).join('');
  }
  
  // Subtotal for payments
  const subtotalEl = document.getElementById('meal-subtotal');
  subtotalEl.innerHTML = `
    <div class="subtotal-row">
      <span>📊 本店總支出</span>
      <strong>$${total}</strong>
    </div>
    <div class="subtotal-row">
      <span>已墊付</span>
      <span>$${totalPaid}</span>
    </div>
    <div class="subtotal-row ${total - totalPaid !== 0 ? 'total' : ''}">
      <span>${total > totalPaid ? '待墊付' : '多付'}</span>
      <strong style="color:${total > totalPaid ? 'var(--danger)' : 'var(--primary)'}">$${Math.abs(total - totalPaid)}</strong>
    </div>
  `;
  
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
  
  // Auto-fill payment amount
  const remaining = total - totalPaid;
  if (remaining > 0) {
    document.getElementById('payment-amount').value = remaining;
  }
}

// Shared checkbox toggles person field
document.getElementById('item-shared').addEventListener('change', (e) => {
  const personInput = document.getElementById('item-person');
  if (e.target.checked) {
    personInput.value = '共食';
    personInput.disabled = true;
  } else {
    personInput.value = '';
    personInput.disabled = false;
  }
});

// Auto-fill price when selecting menu item
document.getElementById('item-name').addEventListener('change', (e) => {
  const selectedItem = menuItems.find(m => m.name === e.target.value);
  if (selectedItem && selectedItem.price) {
    document.getElementById('item-price').value = selectedItem.price;
  }
});

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
  const shared = document.getElementById('item-shared').checked;
  const person = document.getElementById('item-person').value.trim();
  const item = document.getElementById('item-name').value.trim();
  const price = parseFloat(document.getElementById('item-price').value);
  
  await fetch(`${API}/api/meals/${currentMealId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person, item, price, shared })
  });
  
  document.getElementById('item-shared').checked = false;
  document.getElementById('item-person').disabled = false;
  document.getElementById('item-person').value = '';
  document.getElementById('item-name').value = '';
  document.getElementById('item-price').value = '';
  loadMealDetail();
  loadDataLists();
});

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
  loadDataLists();
});

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
  loadDataLists();
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
  
  // Meal summaries (店家小結)
  const summariesEl = document.getElementById('meal-summaries');
  if (data.mealSummaries && data.mealSummaries.length > 0) {
    summariesEl.innerHTML = `
      <h3>📋 各店家支出</h3>
      ${data.mealSummaries.map(m => `
        <div class="meal-summary-card">
          <div class="header">
            <span class="restaurant">${m.restaurant}</span>
            <span class="date">${m.date}</span>
          </div>
          <div class="amounts">
            <span>支出: $${m.totalSpent}</span>
            <span>已墊付: $${m.totalPaid}</span>
          </div>
          ${m.payments.length > 0 ? `
            <div class="paid-by">
              墊付: ${m.payments.map(p => `${p.person} $${p.amount}`).join(', ')}
            </div>
          ` : '<div class="paid-by" style="color:var(--danger)">⚠️ 尚未填寫墊付人</div>'}
        </div>
      `).join('')}
    `;
  } else {
    summariesEl.innerHTML = '';
  }
  
  // Summary
  const summaryEl = document.getElementById('settle-summary');
  const entries = Object.entries(data.summary || {});
  
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
  if (!data.transactions || data.transactions.length === 0) {
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

// ===== Restaurants =====

async function loadRestaurants() {
  const res = await fetch(`${API}/api/restaurants`);
  restaurants = await res.json();
  
  const list = document.getElementById('restaurants-list');
  if (restaurants.length === 0) {
    list.innerHTML = '<div class="empty">還沒有店家<br>新增訂餐時會自動建立</div>';
    document.getElementById('menu-section').classList.add('hidden');
    return;
  }
  
  list.innerHTML = restaurants.map(r => `
    <div class="list-item clickable" onclick="selectRestaurant(${r.id}, '${r.name}')">
      <div class="info">
        <div class="title">${r.name}</div>
      </div>
      <button class="delete-btn" onclick="event.stopPropagation(); deleteRestaurant(${r.id})">×</button>
    </div>
  `).join('');
}

async function selectRestaurant(id, name) {
  currentRestaurantId = id;
  document.getElementById('menu-title').textContent = `📋 ${name} 菜單`;
  document.getElementById('menu-section').classList.remove('hidden');
  
  const res = await fetch(`${API}/api/restaurants/${id}/menu`);
  const items = await res.json();
  
  const list = document.getElementById('menu-list');
  if (items.length === 0) {
    list.innerHTML = '<div class="empty">還沒有餐點</div>';
  } else {
    list.innerHTML = items.map(item => `
      <div class="list-item">
        <div class="info">
          <div class="title">${item.name}</div>
        </div>
        <div class="amount">${item.price ? `$${item.price}` : '-'}</div>
        <button class="delete-btn" onclick="deleteMenuItem(${item.id})">×</button>
      </div>
    `).join('');
  }
}

document.getElementById('add-restaurant-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('restaurant-name').value.trim();
  
  await fetch(`${API}/api/restaurants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  
  document.getElementById('restaurant-name').value = '';
  loadRestaurants();
});

async function deleteRestaurant(id) {
  if (!confirm('確定要刪除這個店家嗎？（菜單也會一起刪除）')) return;
  await fetch(`${API}/api/restaurants/${id}`, { method: 'DELETE' });
  document.getElementById('menu-section').classList.add('hidden');
  loadRestaurants();
}

document.getElementById('add-menu-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('menu-item-name').value.trim();
  const price = parseFloat(document.getElementById('menu-item-price').value) || 0;
  
  await fetch(`${API}/api/restaurants/${currentRestaurantId}/menu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, price })
  });
  
  document.getElementById('menu-item-name').value = '';
  document.getElementById('menu-item-price').value = '';
  selectRestaurant(currentRestaurantId, document.getElementById('menu-title').textContent.replace('📋 ', '').replace(' 菜單', ''));
});

async function deleteMenuItem(id) {
  await fetch(`${API}/api/menu/${id}`, { method: 'DELETE' });
  selectRestaurant(currentRestaurantId, document.getElementById('menu-title').textContent.replace('📋 ', '').replace(' 菜單', ''));
}

// Initial load
loadMeals();
loadDataLists();
