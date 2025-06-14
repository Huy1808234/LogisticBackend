const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const authMiddleware = require('../middleware/verifyToken');

// GET /api/users/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id; 

    if (!userId) {
      return res.status(400).json({ error: 'User ID is missing from token' });
    }

    const [rows] = await db.execute(
      'SELECT username, email, phone FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching user info:', err);
    res.status(500).json({ error: 'Failed to load user info' });
  }
});

module.exports = router;
