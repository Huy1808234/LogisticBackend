const express = require('express');
const router = express.Router();
const { calculateShipping } = require('../controllers/shippingController');
const verifyToken = require('../middleware/verifyToken');

router.use(verifyToken);

router.post('/calculate', calculateShipping);

module.exports = router;
