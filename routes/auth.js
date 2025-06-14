const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Auth routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);

// Forgot password flow
router.post('/forgot-password', authController.forgotPassword); // Gửi mail
router.post('/reset-password', authController.resetPassword);   // Đặt lại mật khẩu

module.exports = router;
