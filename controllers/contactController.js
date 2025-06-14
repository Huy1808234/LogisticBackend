const db = require("../utils/db");

exports.submitContactForm = (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: "Vui lòng điền đầy đủ thông tin." });
  }

  const sql = `
    INSERT INTO contact_messages (name, email, subject, message)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [name, email, subject, message], (err) => {
    if (err) {
      console.error("Lỗi khi lưu liên hệ:", err);
      return res.status(500).json({ message: "Lỗi máy chủ." });
    }

    return res.status(200).json({ message: "Đã gửi liên hệ thành công!" });
  });
};
