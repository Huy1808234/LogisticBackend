const express = require('express');
const app = express();
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const routes = require('./routes/api');
const userRoutes = require('./routes/users');
const cookieParser = require('cookie-parser');

dotenv.config();

// Middleware
app.use(express.json({ limit: '10mb' })); // Tăng giới hạn
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(cors({
    origin: [
    'http://localhost:3000'
  ],
  credentials: true
}));

// Cho phép truy cập ảnh đã lưu
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api', routes);
app.use('/api/users', userRoutes);

// 404 fallback
app.use((req, res) => {
  console.error(`[ 404] ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
