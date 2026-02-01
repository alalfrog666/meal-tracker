const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'meals.db'));

// 初始化資料表
db.exec(`
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant TEXT NOT NULL,
    date TEXT NOT NULL,
    settled INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL,
    person TEXT NOT NULL,
    item TEXT NOT NULL,
    price REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meal_id INTEGER NOT NULL,
    person TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
  );
`);

// 啟用外鍵約束
db.pragma('foreign_keys = ON');

// ===== 成員相關 =====

function getAllMembers() {
  return db.prepare('SELECT * FROM members ORDER BY name').all();
}

function addMember(name) {
  const stmt = db.prepare('INSERT OR IGNORE INTO members (name) VALUES (?)');
  const result = stmt.run(name);
  if (result.changes === 0) {
    return db.prepare('SELECT * FROM members WHERE name = ?').get(name);
  }
  return db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
}

function deleteMember(id) {
  return db.prepare('DELETE FROM members WHERE id = ?').run(id);
}

// ===== 場次相關 =====

function getAllMeals() {
  const meals = db.prepare(`
    SELECT m.*, 
           COUNT(DISTINCT i.id) as item_count,
           COALESCE(SUM(i.price), 0) as total
    FROM meals m
    LEFT JOIN items i ON m.id = i.meal_id
    GROUP BY m.id
    ORDER BY m.date DESC, m.created_at DESC
  `).all();
  return meals;
}

function getMealById(id) {
  return db.prepare('SELECT * FROM meals WHERE id = ?').get(id);
}

function createMeal(restaurant, date) {
  const stmt = db.prepare('INSERT INTO meals (restaurant, date) VALUES (?, ?)');
  const result = stmt.run(restaurant, date);
  return getMealById(result.lastInsertRowid);
}

function deleteMeal(id) {
  return db.prepare('DELETE FROM meals WHERE id = ?').run(id);
}

function settleMeal(id) {
  return db.prepare('UPDATE meals SET settled = 1 WHERE id = ?').run(id);
}

// ===== 品項相關 =====

function getItemsByMealId(mealId) {
  return db.prepare('SELECT * FROM items WHERE meal_id = ? ORDER BY created_at').all(mealId);
}

function addItem(mealId, person, item, price) {
  // 自動新增成員
  addMember(person);
  
  const stmt = db.prepare('INSERT INTO items (meal_id, person, item, price) VALUES (?, ?, ?, ?)');
  const result = stmt.run(mealId, person, item, price);
  return db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
}

function deleteItem(id) {
  return db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

// ===== 墊付相關 =====

function getPaymentsByMealId(mealId) {
  return db.prepare('SELECT * FROM payments WHERE meal_id = ? ORDER BY created_at').all(mealId);
}

function addPayment(mealId, person, amount) {
  // 自動新增成員
  addMember(person);
  
  const stmt = db.prepare('INSERT INTO payments (meal_id, person, amount) VALUES (?, ?, ?)');
  const result = stmt.run(mealId, person, amount);
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid);
}

function deletePayment(id) {
  return db.prepare('DELETE FROM payments WHERE id = ?').run(id);
}

// ===== 結算計算 =====

function calculateSettlement() {
  // 取得所有未結算的場次
  const unsettledMeals = db.prepare('SELECT id FROM meals WHERE settled = 0').all();
  
  if (unsettledMeals.length === 0) {
    return { transactions: [], summary: {} };
  }

  const mealIds = unsettledMeals.map(m => m.id);
  const placeholders = mealIds.map(() => '?').join(',');

  // 計算每個人的消費總額
  const spending = db.prepare(`
    SELECT person, SUM(price) as total_spent
    FROM items
    WHERE meal_id IN (${placeholders})
    GROUP BY person
  `).all(...mealIds);

  // 計算每個人的墊付總額
  const paying = db.prepare(`
    SELECT person, SUM(amount) as total_paid
    FROM payments
    WHERE meal_id IN (${placeholders})
    GROUP BY person
  `).all(...mealIds);

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
  
  // 分成債務人和債權人
  const debtors = []; // 欠錢的人 (balance < 0)
  const creditors = []; // 被欠錢的人 (balance > 0)
  
  Object.entries(balance).forEach(([person, amount]) => {
    if (amount < -0.01) {
      debtors.push({ person, amount: -amount }); // 轉為正數表示欠多少
    } else if (amount > 0.01) {
      creditors.push({ person, amount });
    }
  });

  // 排序：金額大的優先處理
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  // 配對交易
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
  
  const result = db.prepare('DELETE FROM meals WHERE date < ? AND settled = 1').run(dateStr);
  return result.changes;
}

module.exports = {
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
