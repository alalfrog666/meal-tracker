const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'meals.db');

let db = null;

// 初始化資料庫
async function initDb() {
  const SQL = await initSqlJs();
  
  // 嘗試讀取現有資料庫
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

  saveDb();
  return db;
}

// 儲存資料庫到檔案
function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Helper: 執行查詢並返回所有結果
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

// Helper: 執行查詢並返回第一個結果
function get(sql, params = []) {
  const results = all(sql, params);
  return results[0] || null;
}

// Helper: 執行寫入操作
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

function addItem(mealId, person, item, price) {
  addMember(person);
  const result = run('INSERT INTO items (meal_id, person, item, price) VALUES (?, ?, ?, ?)', 
    [mealId, person, item, price]);
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
    return { transactions: [], summary: {} };
  }

  const mealIds = unsettledMeals.map(m => m.id);
  const placeholders = mealIds.map(() => '?').join(',');

  // 計算每個人的消費總額
  const spending = all(`
    SELECT person, SUM(price) as total_spent
    FROM items
    WHERE meal_id IN (${placeholders})
    GROUP BY person
  `, mealIds);

  // 計算每個人的墊付總額
  const paying = all(`
    SELECT person, SUM(amount) as total_paid
    FROM payments
    WHERE meal_id IN (${placeholders})
    GROUP BY person
  `, mealIds);

  // 建立餘額表
  const balance = {};
  
  spending.forEach(s => {
    balance[s.person] = (balance[s.person] || 0) - s.total_spent;
  });
  
  paying.forEach(p => {
    balance[p.person] = (balance[p.person] || 0) + p.total_paid;
  });

  // 計算交易
  const transactions = calculateTransactions(balance);

  return {
    transactions,
    summary: balance,
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
