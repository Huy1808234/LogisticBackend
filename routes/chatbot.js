// routes/chatbot.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.post('/orders/chatbot', orderController.createOrderFromChatbot);
module.exports = router;
