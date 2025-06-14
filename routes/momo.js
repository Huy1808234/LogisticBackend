const express = require("express");
const router = express.Router();
const momoController = require("../controllers/paymentController");
const orderController = require("../controllers/orderController"); // 👈 thêm dòng này

// Gửi yêu cầu tạo thanh toán
router.post("/create", momoController.createMomoPayment);

// MoMo gọi IPN sau khi giao dịch hoàn tất (server xử lý)
router.post("/ipn", momoController.handleMomoIPN);

// MoMo redirect người dùng về sau khi thanh toán (hiển thị trạng thái)
router.get("/redirect", momoController.handleMomoRedirect);

// Tự động huỷ đơn nếu không thanh toán sau 15 phút
router.get("/auto-cancel", momoController.autoCancelUnpaidOrders);

module.exports = router;
