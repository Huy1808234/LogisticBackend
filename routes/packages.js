// routes/packages.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const packageController = require('../controllers/packageController');

// Middleware bảo vệ toàn bộ route
router.use(verifyToken);

// Routes
router.post('/', packageController.createPackage);
router.get('/', packageController.getAllPackages);

module.exports = router;
