// routes/tracking.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const trackingController = require('../controllers/trackingController');


// Middleware bảo vệ toàn bộ route
router.use(verifyToken);

// Routes
router.post('/', trackingController.createTracking);
router.get('/', trackingController.getAllTracking);

module.exports = router;
