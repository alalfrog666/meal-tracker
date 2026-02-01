const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== 訂餐場次 API =====

// 取得所有場次
app.get('/api/meals', (req, res) => {
  try {
    const meals = db.getAllMeals();
    res.json(meals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新增場次
app.post('/api/meals', (req, res) => {
  try {
    const { restaurant, date } = req.body;
    const meal = db.createMeal(restaurant, date || new Date().toISOString().split('T')[0]);
    res.json(meal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 取得單一場次詳情
app.get('/api/meals/:id', (req, res) => {
  try {
    const meal = db.getMealById(parseInt(req.params.id));
    if (!meal) {
      return res.status(404).json({ error: '找不到此場次' });
    }
    const items = db.getItemsByMealId(parseInt(req.params.id));
    const payments = db.getPaymentsByMealId(parseInt(req.params.id));
    res.json({ ...meal, items, payments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 刪除場次
app.delete('/api/meals/:id', (req, res) => {
  try {
    db.deleteMeal(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 品項 API =====

// 新增品項
app.post('/api/meals/:id/items', (req, res) => {
  try {
    const { person, item, price } = req.body;
    const newItem = db.addItem(parseInt(req.params.id), person, item, parseFloat(price));
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 刪除品項
app.delete('/api/items/:id', (req, res) => {
  try {
    db.deleteItem(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 墊付 API =====

// 新增墊付記錄
app.post('/api/meals/:id/payments', (req, res) => {
  try {
    const { person, amount } = req.body;
    const payment = db.addPayment(parseInt(req.params.id), person, parseFloat(amount));
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 刪除墊付記錄
app.delete('/api/payments/:id', (req, res) => {
  try {
    db.deletePayment(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 結算 API =====

// 計算結算結果
app.get('/api/settle', (req, res) => {
  try {
    const result = db.calculateSettlement();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 標記場次已結算
app.post('/api/meals/:id/settle', (req, res) => {
  try {
    db.settleMeal(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 團隊成員 API =====

// 取得所有成員
app.get('/api/members', (req, res) => {
  try {
    const members = db.getAllMembers();
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新增成員
app.post('/api/members', (req, res) => {
  try {
    const { name } = req.body;
    const member = db.addMember(name);
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 刪除成員
app.delete('/api/members/:id', (req, res) => {
  try {
    db.deleteMember(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 清理超過六個月的資料
app.post('/api/cleanup', (req, res) => {
  try {
    const deleted = db.cleanupOldData();
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 啟動伺服器（等待資料庫初始化）
db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🦐 團隊訂餐系統運行中: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('資料庫初始化失敗:', err);
  process.exit(1);
});
