const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const OpenAI = require('openai');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Multer for file uploads (in memory)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// OpenAI client (will be initialized if API key exists)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== 菜單圖片分析 API =====

app.post('/api/analyze-menu', upload.single('image'), async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ 
        error: '尚未設定 OpenAI API Key',
        hint: '請在 Railway 環境變數中設定 OPENAI_API_KEY'
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: '請上傳圖片' });
    }

    // Convert image to base64
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `分析這張菜單圖片，提取所有餐點名稱和價格。
              
請用以下 JSON 格式回覆（只回覆 JSON，不要其他文字）：
{
  "items": [
    {"name": "餐點名稱", "price": 數字價格},
    {"name": "餐點名稱", "price": 數字價格}
  ]
}

注意：
- price 應該是數字，如果看不到價格就設為 null
- 只提取食物/飲料項目，忽略分類標題
- 如果圖片不是菜單，回覆 {"items": [], "error": "這不是菜單圖片"}`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 2000
    });

    const content = response.choices[0]?.message?.content || '';
    
    // Parse JSON from response
    let result;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      return res.status(500).json({ 
        error: '無法解析 AI 回應',
        raw: content 
      });
    }

    res.json(result);

  } catch (err) {
    console.error('Menu analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

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

// Batch add menu items
app.post('/api/restaurants/:id/menu/batch', (req, res) => {
  try {
    const { items } = req.body;
    const restaurantId = parseInt(req.params.id);
    const added = [];
    
    for (const item of items) {
      if (item.name) {
        const newItem = db.addMenuItem(restaurantId, item.name, item.price || 0);
        added.push(newItem);
      }
    }
    
    res.json({ added: added.length, items: added });
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

// Check if OpenAI is configured
app.get('/api/config', (req, res) => {
  res.json({
    hasOpenAI: !!openai
  });
});

db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🦐 團隊訂餐系統運行中: http://localhost:${PORT}`);
    if (openai) {
      console.log('✅ OpenAI Vision 已啟用');
    } else {
      console.log('⚠️ OpenAI Vision 未設定 (設定 OPENAI_API_KEY 環境變數以啟用)');
    }
  });
}).catch(err => {
  console.error('資料庫初始化失敗:', err);
  process.exit(1);
});
