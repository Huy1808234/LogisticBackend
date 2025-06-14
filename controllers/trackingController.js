// controllers/trackingController.js
const db = require('../utils/db');

exports.createTracking = async (req, res) => {
  try {
    const { order_id, staff_id, status, location, timestamp, notes } = req.body;
    console.log('[DEBUG] POST /tracking req.body:', req.body);

    const [result] = await db.execute(
      'INSERT INTO Tracking (Order_id, Staff_id, Status, Location, Timestamp, Notes) VALUES (?, ?, ?, ?, ?, ?)',
      [order_id, staff_id, status, location, timestamp, notes]
    );

    res.json({ trackingId: result.insertId });
  } catch (err) {
    console.error('[ERROR] POST /tracking:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.getAllTracking = async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM Tracking');
    res.json(rows);
  } catch (err) {
    console.error('[ERROR] GET /tracking:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};



exports.trackOrder = async (req, res) => {
  const { orderCode } = req.params;

  try {
    const conn = await db.getConnection();

    // 1. Tìm đơn hàng theo mã
    const [orderResult] = await conn.query(
      `SELECT o.Order_id, o.Order_code, o.Ship_cost, o.Order_status, o.Payment_status,
              c.Name AS senderName, c.Phone AS senderPhone,
              p.Receiver_id, p.Weight, p.Dimensions, p.Description, p.Value
       FROM \`Order\` o
       JOIN Customer c ON o.Sender_id = c.CustomerID
       JOIN Package p ON p.Order_id = o.Order_id
       WHERE o.Order_code = ?`,
      [orderCode]
    );

    if (orderResult.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }

    const order = orderResult[0];

    // 2. Lấy thông tin người nhận
    const [receiverResult] = await conn.query(
      `SELECT Name, Phone, Street, Ward, District, City
       FROM Customer WHERE CustomerID = ?`,
      [order.Receiver_id]
    );

    const receiver = receiverResult[0];

    // 3. Lấy lịch sử tracking
    const [trackingResult] = await conn.query(
      `SELECT Status, Location, Timestamp, Notes
       FROM Tracking WHERE Order_id = ?
       ORDER BY Timestamp DESC`,
      [order.Order_id]
    );

    conn.release();

    res.json({
      orderCode: order.Order_code,
      status: order.Order_status,
      payment: order.Payment_status,
      cost: order.Ship_cost,
      weight: order.Weight,
      dimensions: order.Dimensions,
      description: order.Description,
      value: order.Value,
      sender: {
        name: order.senderName,
        phone: order.senderPhone,
      },
      receiver: {
        name: receiver?.Name,
        phone: receiver?.Phone,
        address: [receiver?.Street, receiver?.Ward, receiver?.District, receiver?.City].filter(Boolean).join(", "),
      },
      tracking: trackingResult.map(t => ({
        status: t.Status,
        location: t.Location,
        time: t.Timestamp,
        notes: t.Notes,
      }))
    });

  } catch (err) {
    console.error(" Lỗi tracking:", err);
    res.status(500).json({ error: "Không thể tra cứu đơn hàng", detail: err.message });
  }
};
