const express = require("express");
const router = express.Router();
const momoRoutes = require("./momo");
const authRoutes = require("./auth");
const shippingRoutes = require("./shipping");
const orderRoutes = require("./orders");
const packageRoutes = require("./packages");
const addressRoutes = require("./address");
const trackingRoutes = require("./trackings");
const orderController = require("../controllers/orderController");
const verifyToken = require("../middleware/verifyToken");
const contactRoutes = require("./contact");

// Public routes
router.use("/auth", authRoutes);
router.post("/orders/chatbot", orderController.createOrderFromChatbot); //  Gọi trực tiếp từ controller
router.use("/momo", momoRoutes);
router.use("/address", addressRoutes);
router.use("/contact", contactRoutes);

// Protected routes
router.use("/shipping", verifyToken, shippingRoutes);
router.use("/orders", verifyToken, orderRoutes);
router.use("/packages", verifyToken, packageRoutes);
router.use("/tracking", verifyToken, trackingRoutes);

module.exports = router;
