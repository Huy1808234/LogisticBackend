const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const db = require("../utils/db");
require("dotenv").config();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: false, // Đặt thành true nếu dùng HTTPS
  sameSite: "Lax",
};
// Đăng ký (tự động gán role: customer)
exports.register = async (req, res) => {
  const {
    email, username, password, phone,
    street, ward, district, city
  } = req.body;

  if (!email || !username || !password || !phone)
    return res.status(400).json({ error: "All fields are required" });

  try {
    const [emailCheck] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
    if (emailCheck.length > 0) return res.status(400).json({ error: "Email already registered" });

    const [usernameCheck] = await db.execute("SELECT * FROM users WHERE username = ?", [username]);
    if (usernameCheck.length > 0) return res.status(400).json({ error: "Username already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Thêm vào users
    const [result] = await db.execute(
      `INSERT INTO users (email, username, password, phone, street, ward, district, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, username, hashedPassword, phone, street, ward, district, city]
    );
    const userId = result.insertId;

    // Thêm vào account, role: customer
    await db.execute(
      `INSERT INTO account (Username, Password, Role, Customer_id, Balance)
       VALUES (?, ?, ?, ?, ?)`,
      [username, hashedPassword, "Khách hàng", userId, 0]
    );

    res.json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Register failed" });
  }
};

// Đăng nhập
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    const [users] = await db.execute("SELECT * FROM users WHERE email = ?", [email]);
    const user = users[0];
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid email or password" });

    // Truy vấn role từ bảng account
    const [accounts] = await db.execute(
      "SELECT Role FROM account WHERE Customer_id = ? OR Staff_id = ?",
      [user.id, user.id]
    );
    const role = accounts.length > 0 ? accounts[0].Role : "unknown";

    const accessToken = jwt.sign({ userId: user.id, role }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const refreshToken = jwt.sign({ userId: user.id, role }, process.env.REFRESH_SECRET, { expiresIn: "7d" });

    res.cookie("accessToken", accessToken, { ...COOKIE_OPTIONS, maxAge: 15 * 60 * 1000 });
    res.cookie("refreshToken", refreshToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
};

// Refresh Token
exports.refreshToken = (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token)
    return res.status(401).json({ error: "No refresh token provided" });

  try {
    const decoded = jwt.verify(token, process.env.REFRESH_SECRET);
    const newAccessToken = jwt.sign(
      { userId: decoded.userId },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.cookie("accessToken", newAccessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 15 * 60 * 1000,
    });
    res.json({ message: "Access token refreshed" });
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(403).json({ error: "Invalid refresh token" });
  }
};

// Logout
exports.logout = (req, res) => {
  res.clearCookie("accessToken", COOKIE_OPTIONS);
  res.clearCookie("refreshToken", COOKIE_OPTIONS);
  res.json({ message: "Logged out successfully" });
};

// Quên mật khẩu
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email?.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập email" });
  }

  try {
    const [users] = await db.execute("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    const user = users[0];
    if (!user) {
      // Trả về giống như khi thành công để tránh lộ dữ liệu
      return res.json({
        message:
          "Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expire = new Date(Date.now() + 60 * 60 * 1000); // 1 giờ

    await db.execute(
      "UPDATE users SET reset_token = ?, reset_token_expire = ? WHERE id = ?",
      [token, expire, user.id]
    );

    const resetLink = `http://localhost:3001/reset-password?token=${token}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: email,
      subject: "Đặt lại mật khẩu",
      html: `<p>Bạn đã yêu cầu đặt lại mật khẩu. Click link bên dưới để tiếp tục:</p>
             <a href="${resetLink}">${resetLink}</a>`,
    });

    res.json({ message: "Đã gửi email đặt lại mật khẩu" });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Lỗi gửi email đặt lại mật khẩu" });
  }
};

// Đặt lại mật khẩu
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: "Thiếu token hoặc mật khẩu mới" });
  }

  try {
    const [users] = await db.execute(
      "SELECT * FROM users WHERE reset_token = ? AND reset_token_expire > NOW()",
      [token]
    );

    const user = users[0];
    if (!user)
      return res
        .status(400)
        .json({ error: "Token không hợp lệ hoặc đã hết hạn" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.execute(
      "UPDATE users SET password = ?, reset_token = NULL, reset_token_expire = NULL WHERE id = ?",
      [hashedPassword, user.id]
    );

    res.json({ message: "Đặt lại mật khẩu thành công" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Không thể đặt lại mật khẩu" });
  }
};
