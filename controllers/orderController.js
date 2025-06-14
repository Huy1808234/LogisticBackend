const db = require("../utils/db");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const {
  geocodeCity,
  getDistance,
  determineRegion,
  isUrbanDistrict,
  calculatePrice,
} = require("../services/shippingService");

exports.createOrder = async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      receiverName,
      receiverPhone,
      receiverStreet,
      receiverWard,
      receiverDistrict,
      receiverCity,
      description,
      weight,
      width,
      height,
      length,
      extraServices = [],
      declaredValue = 0,
      paymentMethod = "COD", // Nhận phương thức thanh toán
      photo = "",
    } = req.body;

    if (
      !userId ||
      !receiverName ||
      !receiverPhone ||
      !receiverCity ||
      !weight ||
      !width ||
      !height ||
      !length
    ) {
      return res.status(400).json({ error: "Thiếu thông tin bắt buộc" });
    }

    const conn = await db.getConnection();

    // 1. Lấy thông tin người gửi
    const [userResult] = await conn.query(
      "SELECT username, phone, street, ward, district, city FROM users WHERE id = ?",
      [userId]
    );
    const user = userResult[0];
    if (!user) {
      return res.status(404).json({ error: "Không tìm thấy người dùng." });
    }

    const senderAddress = [user.street, user.ward, user.district, user.city]
      .filter(Boolean)
      .join(", ");

    // 2. Tìm hoặc tạo Customer người gửi
    const [existingSender] = await conn.query(
      `SELECT CustomerID FROM Customer WHERE Phone = ? AND Customer_type = 'Người gửi'`,
      [user.phone]
    );
    let senderId;
    if (existingSender.length > 0) {
      senderId = existingSender[0].CustomerID;
    } else {
      const [senderInsert] = await conn.query(
        `INSERT INTO Customer (Customer_type, Name, Phone, Street, Ward, District, City)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          "Người gửi",
          user.username,
          user.phone,
          user.street ?? "",
          user.ward ?? "",
          user.district ?? "",
          user.city ?? "",
        ]
      );
      senderId = senderInsert.insertId;
    }

    // 3. Tạo người nhận
    const [receiverInsert] = await conn.query(
      `INSERT INTO Customer (Customer_type, Name, Phone, Street, Ward, District, City)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        "Người nhận",
        receiverName,
        receiverPhone,
        receiverStreet ?? "",
        receiverWard ?? "",
        receiverDistrict ?? "",
        receiverCity,
      ]
    );
    const receiverId = receiverInsert.insertId;

    const receiverAddress = [
      receiverStreet,
      receiverWard,
      receiverDistrict,
      receiverCity,
    ]
      .filter(Boolean)
      .join(", ");

    // 4. Tính phí vận chuyển
    const from = await geocodeCity(senderAddress);
    const to = await geocodeCity(receiverAddress);
    const sameCity = from.province === to.province;

    let distanceKm = 0;
    try {
      const dist = await getDistance(from.coords, to.coords);
      distanceKm = dist.distanceKm;
    } catch {
      distanceKm = sameCity ? 10 : 0;
    }

    const volumeWeight = (height * width * length) / 6000;
    const chargeableWeight = Math.max(weight, volumeWeight);
    const region = determineRegion(from.province, to.province);
    const isUrban =
      isUrbanDistrict(from.locality) && isUrbanDistrict(to.locality);

    const {
      basePrice,
      extraServicesDetail,
      total: shipCost,
    } = calculatePrice(
      region,
      chargeableWeight,
      extraServices,
      isUrban,
      declaredValue
    );

    // 5. Lưu ảnh nếu có
    let photoUrl = null;
    if (photo && photo.startsWith("data:image")) {
      const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
      const filename = `order_${Date.now()}_${uuidv4().slice(0, 8)}.png`;
      const filePath = path.join(__dirname, "..", "uploads", filename);
      fs.writeFileSync(filePath, base64Data, "base64");
      photoUrl = `/uploads/${filename}`;
    }

    // 6. Tạo đơn hàng
    const orderCode = `ORD-${Date.now()}`;
    const paymentStatus = "Chưa thanh toán"; // luôn luôn để vậy khi mới tạo đơn

    const [orderInsert] = await conn.query(
      `INSERT INTO \`Order\` (Order_code, Sender_id, Service_id, Total_package, Total_weight,
        Ship_cost, Payment_status, Order_status, Receiver_id, Photo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderCode,
        senderId,
        1,
        1,
        weight,
        shipCost,
        paymentStatus,
        "Mới tạo",
        receiverId,
        photoUrl,
      ]
    );
    const orderId = orderInsert.insertId;

    // 7. Ghi nhận thanh toán
    const mappedMethod = mapPaymentMethod(paymentMethod);
    await conn.query(
      `INSERT INTO Payment (Order_id, Payment_method, Amount, Notes, Created_at, Updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [orderId, mappedMethod, shipCost, `Thanh toán bằng ${mappedMethod}`]
    );

    // 8. Tạo kiện hàng
    const dimensions = `${length}x${width}x${height}`;
    await conn.query(
      `INSERT INTO Package (Order_id, Sender_id, Receiver_id, Service_id, Weight, Dimensions,
        Description, Value, Current_Warehouse_id, Status, Estimated_delivery, Is_fragile, Extra_service)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        senderId,
        receiverId,
        1,
        weight,
        dimensions,
        description,
        declaredValue,
        null,
        "Đang xử lý",
        null,
        false,
        JSON.stringify(extraServices),
      ]
    );

    // 9. Tracking
    const [staffResult] = await conn.query(
      `SELECT StaffID FROM Staff WHERE Position = 'Nhân viên kho' LIMIT 1`
    );
    const staffId = staffResult[0]?.StaffID ?? null;

    await conn.query(
      `INSERT INTO Tracking (Order_id, Staff_id, Status, Notes, Timestamp)
   VALUES (?, ?, ?, ?, NOW())`,
      [orderId, staffId, "Mới tạo", "Khởi tạo đơn hàng"]
    );

    conn.release();

    res.status(201).json({
      message: "Tạo đơn hàng thành công",
      orderId,
      orderCode,
      shipCost,
      chargeableWeight: chargeableWeight.toFixed(2),
      distanceKm,
      basePrice,
      extraServicesDetail,
      region,
      isUrban,
      photoUrl,
    });
  } catch (err) {
    console.error("Lỗi tạo đơn hàng:", err);
    res
      .status(500)
      .json({ error: "Không thể tạo đơn hàng", detail: err.message });
  }
};

// === Hàm ánh xạ phương thức thanh toán từ frontend về DB ENUM
function mapPaymentMethod(method) {
  switch (method) {
    case "MoMo":
      return "Ví điện tử";
    case "ATM":
      return "Chuyển khoản";
    case "VISA":
      return "Điện tử";
    case "COD":
    default:
      return "Tiền mặt";
  }
}

// === 2. Lấy tất cả đơn hàng
exports.getAllOrders = async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM `order`");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi lấy danh sách đơn hàng" });
  }
};

// === 3. Lấy đơn hàng theo ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute("SELECT * FROM `order` WHERE OrderID = ?", [
      id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }

    const order = rows[0];
    res.json({
      orderId: order.OrderID,
      orderCode: order.Order_code,
      senderId: order.Sender_id,
      serviceId: order.Service_id,
      totalPackage: order.Total_package,
      totalWeight: order.Total_weight,
      shipCost: order.Ship_cost,
      paymentStatus: order.Payment_status,
      orderStatus: order.Order_status,
      createdAt: order.Created_at,
      updatedAt: order.Updated_at,
    });
  } catch (err) {
    console.error("Lỗi truy vấn đơn hàng:", err);
    res.status(500).json({ error: "Lỗi khi truy vấn đơn hàng" });
  }
};

// === 4. Chatbot tạo đơn hàng đơn giản
exports.createOrderFromChatbot = async (req, res) => {
  try {
    const { name, phone, total_package, total_weight, payment_status } =
      req.body;

    if (!name || !phone || !total_package || !total_weight || !payment_status) {
      return res
        .status(400)
        .json({ error: "Thiếu thông tin đơn hàng từ chatbot" });
    }

    const [found] = await db.execute(
      "SELECT * FROM `customer` WHERE Name = ? AND Phone = ? AND Customer_type = 'Người gửi'",
      [name, phone]
    );

    let sender_id;
    if (found.length > 0) {
      sender_id = found[0].CustomerID;
    } else {
      const [inserted] = await db.execute(
        "INSERT INTO `customer` (Name, Phone, Customer_type) VALUES (?, ?, 'Người gửi')",
        [name, phone]
      );
      sender_id = inserted.insertId;
    }

    const orderCode = "ORD" + Date.now();
    const [result] = await db.execute(
      'INSERT INTO `order` (Order_code, Sender_id, Service_id, Total_package, Total_weight, Ship_cost, Payment_status, Order_status) VALUES (?, ?, ?, ?, ?, ?, ?, "Mới tạo")',
      [orderCode, sender_id, 1, total_package, total_weight, 0, payment_status]
    );

    res.status(201).json({
      success: true,
      message: "Đơn hàng đã được tạo thành công từ chatbot",
      orderId: result.insertId,
      orderCode,
    });
  } catch (err) {
    console.error("Lỗi tạo đơn từ chatbot:", err);
    res.status(500).json({
      error: "Không thể tạo đơn hàng từ chatbot",
      detail: err.message,
    });
  }
};

// === 5. Hủy đơn hàng
// huy don hang
exports.cancelOrder = async (req, res) => {
  const { code } = req.params;

  try {
    const [result] = await db.query(
      `UPDATE \`order\`
       SET Order_status = 'Đã hủy',
           Payment_status = 'Thất bại',
           Updated_at = NOW()
       WHERE Order_code = ? AND Payment_status = 'Chưa Thanh Toán'`,
      [code]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        error: "Không thể huỷ. Đơn không tồn tại hoặc đã thanh toán.",
      });
    }

    res.json({ message: "Đơn hàng đã được huỷ." });
  } catch (err) {
    console.error(" Huỷ đơn hàng lỗi:", err);
    res.status(500).json({ error: "Lỗi server khi huỷ đơn hàng." });
  }
};

// API kiểm tra trạng thái đơn hàng theo mã đơn
exports.trackOrder = async (req, res) => {
  const { orderCode } = req.params;
  try {
    const conn = await db.getConnection();

    // 1. Tìm đơn hàng theo mã
    const [orderResult] = await conn.query(
      `SELECT o.OrderID, o.Order_code, o.Ship_cost, o.Order_status, o.Payment_status,
              c.Name AS senderName, c.Phone AS senderPhone,
              p.Receiver_id, p.Weight, p.Dimensions, p.Description, p.Value
       FROM \`Order\` o
       JOIN Customer c ON o.Sender_id = c.CustomerID
       JOIN Package p ON p.Order_id = o.OrderID
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
      [order.OrderID]
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
        address: [
          receiver?.Street,
          receiver?.Ward,
          receiver?.District,
          receiver?.City,
        ]
          .filter(Boolean)
          .join(", "),
      },
      tracking: trackingResult.map((t) => ({
        status: t.Status,
        location: t.Location,
        time: t.Timestamp,
        notes: t.Notes,
      })),
    });
  } catch (err) {
    console.error(" Lỗi tracking:", err);
    res
      .status(500)
      .json({ error: "Không thể tra cứu đơn hàng", detail: err.message });
  }
};

//lay lich su don hang
exports.getCustomerOrders = async (req, res) => {
  const userId = req.user?.id;

  try {
    const conn = await db.getConnection();

    // 1. Lấy số điện thoại từ bảng users
    const [userResult] = await conn.query(
      `SELECT phone FROM users WHERE id = ?`,
      [userId]
    );

    if (userResult.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy thông tin user" });
    }

    const phone = userResult[0].phone;

    // 2. Tìm CustomerID người gửi tương ứng với phone
    const [senderResult] = await conn.query(
      `SELECT CustomerID FROM Customer 
       WHERE Phone = ? AND Customer_type = 'Người gửi'`,
      [phone]
    );

    if (senderResult.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy người gửi" });
    }

    const senderId = senderResult[0].CustomerID;

    // 3. Truy vấn lịch sử đơn hàng
    const [orders] = await conn.query(
      `
      SELECT 
        o.Order_code,
        o.Order_status,
        o.Payment_status,
        o.Created_at,
        o.Ship_cost,
        r.Name AS receiverName,
        r.Phone AS receiverPhone,
        CONCAT_WS(', ', r.Street, r.Ward, r.District, r.City) AS receiverAddress
      FROM \`Order\` o
      JOIN Customer r ON o.Receiver_id = r.CustomerID
      WHERE o.Sender_id = ?
      ORDER BY o.Created_at DESC;
    `,
      [senderId]
    );

    conn.release();
    res.status(200).json(orders);
  } catch (err) {
    console.error("Lỗi lấy lịch sử đơn hàng:", err);
    res
      .status(500)
      .json({ error: "Không thể lấy lịch sử đơn hàng", detail: err.message });
  }
};

//xem chi tiet don hang
exports.getOrderDetail = async (req, res) => {
  const orderCode = req.params.code;
  try {
    const conn = await db.getConnection();

    const [results] = await conn.query(
      `
      SELECT 
        o.Order_code,
        o.Order_status,
        o.Created_at,
        o.Ship_cost,
        o.Total_weight,
        o.Payment_status,
        p.Dimensions,
        p.Description,
        p.Value,
        s.Name AS senderName,
        s.Phone AS senderPhone,
        CONCAT_WS(', ', s.Street, s.Ward, s.District, s.City) AS senderAddress,
        r.Name AS receiverName,
        r.Phone AS receiverPhone,
        CONCAT_WS(', ', r.Street, r.Ward, r.District, r.City) AS receiverAddress
      FROM \`Order\` o
      JOIN Package p ON o.OrderID = p.Order_id
      JOIN Customer s ON o.Sender_id = s.CustomerID
      JOIN Customer r ON o.Receiver_id = r.CustomerID
      WHERE o.Order_code = ?
      LIMIT 1
    `,
      [orderCode]
    );

    conn.release();

    if (results.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy đơn hàng" });
    }

    res.status(200).json(results[0]);
  } catch (err) {
    console.error("Lỗi getOrderDetail:", err);
    res.status(500).json({ error: "Lỗi server", detail: err.message });
  }
};
