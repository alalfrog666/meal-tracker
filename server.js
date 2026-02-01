const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== 餐廳 API =====

app.get('/api/restaurants', (req, res) => {
  try {
    const restaurants = db.getAllRestaurants();
    res.json(restaurants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restaurants', (req, res) => {
  try {
    const { name } = req.body;
    const restaurant = db.addRestaurant(name);
    res.json(restaurant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/restaurants/:id', (req, res) => {
  try {
    db.deleteRestaurant(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 菜單項目 API =====

app.get('/api/restaurants/:id/menu', (req, res) => {
  try {
    const items = db.getMenuItemsByRestaurant(parseInt(req.params.id));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/menu', (req, res) => {
  try {
    const items = db.getAllMenuItems();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restaurants/:id/menu', (req, res) => {
  try {
    const { name, price } = req.body;
    const item = db.addMenuItem(parseInt(req.params.id), name, parseFloat(price) || 0);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/menu/:id', (req, res) => {
  try {
    db.deleteMenuItem(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 訂餐場次 API =====

app.get('/api/meals', (req, res) => {
  try {
    const meals = db.getAllMeals();
    res.json(meals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/meals', (req, res) => {
  try {
    const { restaurant, date } = req.body;
    const meal = db.createMeal(restaurant, date || new Date().toISOString().split('T')[0]);
    res.json(meal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

app.delete('/api/meals/:id', (req, res) => {
  try {
    db.deleteMeal(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 品項 API =====

app.post('/api/meals/:id/items', (req, res) => {
  try {
    const { person, item, price, shared } = req.body;
    const newItem = db.addItem(
      parseInt(req.params.id), 
      person || '共食', 
      item, 
      parseFloat(price),
      shared === true || shared === 'true' || shared === 1
    );
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', (req, res) => {
  try {
    db.deleteItem(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 墊付 API =====

app.post('/api/meals/:id/payments', (req, res) => {
  try {
    const { person, amount } = req.body;
    const payment = db.addPayment(parseInt(req.params.id), person, parseFloat(amount));
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/payments/:id', (req, res) => {
  try {
    db.deletePayment(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 結算 API =====

app.get('/api/settle', (req, res) => {
  try {
    const result = db.calculateSettlement();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/meals/:id/settle', (req, res) => {
  try {
    db.settleMeal(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 團隊成員 API =====

app.get('/api/members', (req, res) => {
  try {
    const members = db.getAllMembers();
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/members', (req, res) => {
  try {
    const { name } = req.body;
    const member = db.addMember(name);
    res.json(member);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/members/:id', (req, res) => {
  try {
    db.deleteMember(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cleanup', (req, res) => {
  try {
    const deleted = db.cleanupOldData();
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🦐 團隊訂餐系統運行中: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('資料庫初始化失敗:', err);
  process.exit(1);
});
