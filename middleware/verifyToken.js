const jwt = require("jsonwebtoken");
require("dotenv").config();

function verifyToken(req, res, next) {
  // Lấy token từ header hoặc cookie
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  const token = tokenFromHeader || req.cookies.accessToken;

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: decoded.userId,
      role: decoded.role,
    };

    next(); // tiếp tục middleware
  } catch (err) {
    console.error("Token verify error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = verifyToken;
