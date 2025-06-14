// controllers/packageController.js
const db = require("../utils/db");
exports.createPackage = async (req, res) => {
  try {
    const {
      order_id,
      sender_id,
      receiver_id,
      service_id,
      weight,
      dimensions,
      value,
      current_warehouse_id,
      status,
    } = req.body;

    console.log("[DEBUG] POST /packages req.body:", req.body);

    const [result] = await db.execute(
      "INSERT INTO Package (Order_id, Sender_id, Receiver_id, Service_id, Weight, Dimensions, Value, Current_Warehouse_id, Status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        order_id,
        sender_id,
        receiver_id,
        service_id,
        weight,
        dimensions,
        value,
        current_warehouse_id,
        status,
      ]
    );

    res.json({ packageId: result.insertId });
  } catch (err) {
    console.error("[ERROR] POST /packages:", err); // ⚠️ In lỗi thật ra console
    res.status(500).json({ error: err.message }); // ⚠️ Trả lỗi chi tiết về client
  }
};

exports.getAllPackages = async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM Package");
    res.json(rows);
  } catch (err) {
    console.error("[ERROR] GET /packages:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
