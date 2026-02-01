const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'meals.db');

let db = null;

// 初始化資料庫
async function initDb() {
  const SQL = await initSqlJs();
  
  try {
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
  } catch (e) {
    db = new SQL.Database();
  }

  // 建立資料表
  db.run(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER,
      name TEXT NOT NULL,
      price REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant TEXT NOT NULL,
      date TEXT NOT NULL,
      settled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER NOT NULL,
      person TEXT NOT NULL,
      item TEXT NOT NULL,
      price REAL NOT NULL,
      shared INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER NOT NULL,
      person TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 確保 shared 欄位存在（升級舊資料庫）
  try {
    db.run('ALTER TABLE items ADD COLUMN shared INTEGER DEFAULT 0');
  } catch (e) {
    // 欄位已存在，忽略錯誤
  }

  saveDb();
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function get(sql, params = []) {
  const results = all(sql, params);
  return results[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return { lastID: db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] };
}

// ===== 成員相關 =====

function getAllMembers() {
  return all('SELECT * FROM members ORDER BY name');
}

function addMember(name) {
  const existing = get('SELECT * FROM members WHERE name = ?', [name]);
  if (existing) return existing;
  
  run('INSERT INTO members (name) VALUES (?)', [name]);
  return get('SELECT * FROM members WHERE name = ?', [name]);
}

function deleteMember(id) {
  run('DELETE FROM members WHERE id = ?', [id]);
}

// ===== 餐廳相關 =====

function getAllRestaurants() {
  return all('SELECT * FROM restaurants ORDER BY name');
}

function addRestaurant(name) {
  const existing = get('SELECT * FROM restaurants WHERE name = ?', [name]);
  if (existing) return existing;
  
  run('INSERT INTO restaurants (name) VALUES (?)', [name]);
  return get('SELECT * FROM restaurants WHERE name = ?', [name]);
}

function deleteRestaurant(id) {
  run('DELETE FROM menu_items WHERE restaurant_id = ?', [id]);
  run('DELETE FROM restaurants WHERE id = ?', [id]);
}

// ===== 菜單項目相關 =====

function getMenuItemsByRestaurant(restaurantId) {
  return all('SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY name', [restaurantId]);
}

function getAllMenuItems() {
  return all(`
    SELECT mi.*, r.name as restaurant_name 
    FROM menu_items mi 
    LEFT JOIN restaurants r ON mi.restaurant_id = r.id 
    ORDER BY r.name, mi.name
  `);
}

function addMenuItem(restaurantId, name, price) {
  const existing = get('SELECT * FROM menu_items WHERE restaurant_id = ? AND name = ?', [restaurantId, name]);
  if (existing) {
    // 更新價格
    run('UPDATE menu_items SET price = ? WHERE id = ?', [price, existing.id]);
    return get('SELECT * FROM menu_items WHERE id = ?', [existing.id]);
  }
  
  run('INSERT INTO menu_items (restaurant_id, name, price) VALUES (?, ?, ?)', [restaurantId, name, price]);
  return get('SELECT * FROM menu_items WHERE restaurant_id = ? AND name = ?', [restaurantId, name]);
}

function deleteMenuItem(id) {
  run('DELETE FROM menu_items WHERE id = ?', [id]);
}

// ===== 場次相關 =====

function getAllMeals() {
  return all(`
    SELECT m.*, 
           (SELECT COUNT(*) FROM items WHERE meal_id = m.id) as item_count,
           (SELECT COALESCE(SUM(price), 0) FROM items WHERE meal_id = m.id) as total
    FROM meals m
    ORDER BY m.date DESC, m.created_at DESC
  `);
}

function getMealById(id) {
  return get('SELECT * FROM meals WHERE id = ?', [id]);
}

function createMeal(restaurant, date) {
  // 自動儲存餐廳
  addRestaurant(restaurant);
  
  const result = run('INSERT INTO meals (restaurant, date) VALUES (?, ?)', [restaurant, date]);
  return getMealById(result.lastID);
}

function deleteMeal(id) {
  run('DELETE FROM items WHERE meal_id = ?', [id]);
  run('DELETE FROM payments WHERE meal_id = ?', [id]);
  run('DELETE FROM meals WHERE id = ?', [id]);
}

function settleMeal(id) {
  run('UPDATE meals SET settled = 1 WHERE id = ?', [id]);
}

// ===== 品項相關 =====

function getItemsByMealId(mealId) {
  return all('SELECT * FROM items WHERE meal_id = ? ORDER BY created_at', [mealId]);
}

function addItem(mealId, person, item, price, shared = false) {
  // 自動儲存成員
  if (!shared) {
    addMember(person);
  }
  
  // 自動儲存菜單項目
  const meal = getMealById(mealId);
  if (meal) {
    const restaurant = get('SELECT * FROM restaurants WHERE name = ?', [meal.restaurant]);
    if (restaurant) {
      addMenuItem(restaurant.id, item, price);
    }
  }
  
  const result = run('INSERT INTO items (meal_id, person, item, price, shared) VALUES (?, ?, ?, ?, ?)', 
    [mealId, shared ? '共食' : person, item, price, shared ? 1 : 0]);
  return get('SELECT * FROM items WHERE id = ?', [result.lastID]);
}

function deleteItem(id) {
  run('DELETE FROM items WHERE id = ?', [id]);
}

// ===== 墊付相關 =====

function getPaymentsByMealId(mealId) {
  return all('SELECT * FROM payments WHERE meal_id = ? ORDER BY created_at', [mealId]);
}

function addPayment(mealId, person, amount) {
  addMember(person);
  const result = run('INSERT INTO payments (meal_id, person, amount) VALUES (?, ?, ?)', 
    [mealId, person, amount]);
  return get('SELECT * FROM payments WHERE id = ?', [result.lastID]);
}

function deletePayment(id) {
  run('DELETE FROM payments WHERE id = ?', [id]);
}

// ===== 結算計算 =====

function calculateSettlement() {
  const unsettledMeals = all('SELECT id FROM meals WHERE settled = 0');
  
  if (unsettledMeals.length === 0) {
    return { transactions: [], summary: {}, mealSummaries: [] };
  }

  const mealIds = unsettledMeals.map(m => m.id);
  
  // 取得每個場次的詳細資訊（用於店家小結）
  const mealSummaries = mealIds.map(mealId => {
    const meal = getMealById(mealId);
    const items = getItemsByMealId(mealId);
    const payments = getPaymentsByMealId(mealId);
    
    const totalSpent = items.reduce((sum, i) => sum + i.price, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    
    return {
      id: mealId,
      restaurant: meal.restaurant,
      date: meal.date,
      totalSpent,
      totalPaid,
      payments: payments.map(p => ({ person: p.person, amount: p.amount }))
    };
  });

  // 計算每個人的消費（考慮共食分攤）
  const balance = {};
  
  mealIds.forEach(mealId => {
    const items = getItemsByMealId(mealId);
    const payments = getPaymentsByMealId(mealId);
    
    // 找出這個場次的所有參與者（有點餐的人）
    const participants = [...new Set(items.filter(i => !i.shared).map(i => i.person))];
    const participantCount = participants.length || 1;
    
    // 計算共食費用
    const sharedTotal = items.filter(i => i.shared).reduce((sum, i) => sum + i.price, 0);
    const sharedPerPerson = sharedTotal / participantCount;
    
    // 個人消費 + 共食分攤
    items.forEach(item => {
      if (!item.shared) {
        balance[item.person] = (balance[item.person] || 0) - item.price;
      }
    });
    
    // 每個參與者分攤共食費用
    participants.forEach(person => {
      balance[person] = (balance[person] || 0) - sharedPerPerson;
    });
    
    // 墊付
    payments.forEach(p => {
      balance[p.person] = (balance[p.person] || 0) + p.amount;
    });
  });

  const transactions = calculateTransactions(balance);

  return {
    transactions,
    summary: balance,
    mealSummaries,
    unsettledMeals: unsettledMeals.length
  };
}

function calculateTransactions(balance) {
  const transactions = [];
  
  const debtors = [];
  const creditors = [];
  
  Object.entries(balance).forEach(([person, amount]) => {
    if (amount < -0.01) {
      debtors.push({ person, amount: -amount });
    } else if (amount > 0.01) {
      creditors.push({ person, amount });
    }
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    
    const amount = Math.min(debtor.amount, creditor.amount);
    
    if (amount > 0.01) {
      transactions.push({
        from: debtor.person,
        to: creditor.person,
        amount: Math.round(amount)
      });
    }
    
    debtor.amount -= amount;
    creditor.amount -= amount;
    
    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return transactions;
}

// ===== 清理舊資料 =====

function cleanupOldData() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateStr = sixMonthsAgo.toISOString().split('T')[0];
  
  const oldMeals = all('SELECT id FROM meals WHERE date < ? AND settled = 1', [dateStr]);
  oldMeals.forEach(meal => {
    deleteMeal(meal.id);
  });
  
  return oldMeals.length;
}

module.exports = {
  initDb,
  getAllMembers,
  addMember,
  deleteMember,
  getAllRestaurants,
  addRestaurant,
  deleteRestaurant,
  getMenuItemsByRestaurant,
  getAllMenuItems,
  addMenuItem,
  deleteMenuItem,
  getAllMeals,
  getMealById,
  createMeal,
  deleteMeal,
  settleMeal,
  getItemsByMealId,
  addItem,
  deleteItem,
  getPaymentsByMealId,
  addPayment,
  deletePayment,
  calculateSettlement,
  cleanupOldData
};
