const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

// Tạo đơn, lấy danh sách, tra cứu
router.post('/', orderController.createOrder);
router.get('/', orderController.getAllOrders);
router.get('/track/:orderCode', orderController.trackOrder);
router.get('/detail/:code', orderController.getOrderDetail);
router.get('/history', orderController.getCustomerOrders);

// Lấy đơn theo ID
router.get('/:id', orderController.getOrderById);

// Huỷ đơn theo mã (chuẩn REST: DELETE)
router.delete('/cancel/:code', orderController.cancelOrder);

module.exports = router;
