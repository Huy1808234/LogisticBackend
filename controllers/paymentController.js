const crypto = require("crypto");
const https = require("https");
const db = require("../utils/db");
require("dotenv").config();

// Tạo thanh toán MoMo và lưu vào bảng payment
exports.createMomoPayment = async (req, res) => {
  const { orderId, amount } = req.body; // orderId ở đây là Order_code, ví dụ: 'ORD-123456789'

  const partnerCode = process.env.MOMO_PARTNER_CODE;
  const accessKey = process.env.MOMO_ACCESS_KEY;
  const secretKey = process.env.MOMO_SECRET_KEY;

  const requestId = `${partnerCode}${Date.now()}`;
  const orderInfo = `Thanh toán đơn hàng ${orderId}`;
  const redirectUrl = `http://localhost:3000/orders/thankyou?orderId=${orderId}`;
  const ipnUrl = `https://b330-2405-4802-80ba-1fb0-9460-7b8b-385a-822d.ngrok-free.app/api/momo/ipn`;
  const requestType = "captureWallet";
  const extraData = "";

  //  Truy vấn OrderID thực từ Order_code
  let orderNumericId;
  try {
    const [[orderRow]] = await db.query(
      "SELECT OrderID FROM `order` WHERE Order_code = ?",
      [orderId]
    );

    if (!orderRow) {
      return res.status(400).json({ error: "Không tìm thấy đơn hàng" });
    }

    orderNumericId = orderRow.OrderID;
  } catch (err) {
    console.error(" Lỗi truy vấn OrderID:", err);
    return res.status(500).json({ error: "Lỗi khi truy vấn đơn hàng" });
  }

  // Ghi vào bảng payment
  try {
    await db.query(
      `INSERT INTO payment (Order_id, Payment_method, Amount, Notes, Created_at, Updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [orderNumericId, "Ví điện tử", amount, "Thanh toán bằng Ví MoMo"]
    );
  } catch (err) {
    console.error(" Lỗi lưu payment:", err);
    return res.status(500).json({ error: "Lỗi ghi thông tin thanh toán" });
  }

  // Tạo chữ ký MoMo
  const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  const requestBody = JSON.stringify({
    partnerCode,
    accessKey,
    requestId,
    amount,
    orderId,
    orderInfo,
    redirectUrl,
    ipnUrl,
    extraData,
    requestType,
    signature,
    lang: "vi",
  });

  const options = {
    hostname: "test-payment.momo.vn",
    port: 443,
    path: "/v2/gateway/api/create",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(requestBody),
    },
  };

  const momoReq = https.request(options, (momoRes) => {
    let data = "";
    momoRes.on("data", (chunk) => (data += chunk));
    momoRes.on("end", () => {
      const result = JSON.parse(data);
      console.log(" MoMo response:", result);
      res.json(result);
    });
  });

  momoReq.on("error", (e) => {
    console.error(" MoMo error:", e.message);
    res.status(500).json({ error: "Lỗi gọi MoMo" });
  });

  momoReq.write(requestBody);
  momoReq.end();
};

// Xử lý IPN từ MoMo
exports.handleMomoIPN = async (req, res) => {
  const { resultCode, orderId, amount, message, transId } = req.body;

  console.log(" IPN từ MoMo:", req.body);

  if (resultCode == 0) {
    console.log(
      ` Đơn ${orderId} đã thanh toán ${amount}đ - TransID: ${transId}`
    );

    try {
      // Cập nhật đơn hàng
      await db.query(
        "UPDATE `order` SET Payment_status = ?, Updated_at = NOW() WHERE Order_code = ?",
        ["Đã thanh toán", orderId]
      );

      // Cập nhật bảng payment
      await db.query(
        `UPDATE payment 
         SET Payment_date = NOW(), 
             Transaction_id = ?, 
             Updated_at = NOW() 
         WHERE Order_id = (SELECT OrderID FROM \`order\` WHERE Order_code = ?)`,
        [transId || null, orderId]
      );
    } catch (err) {
      console.error(" Lỗi cập nhật sau IPN:", err);
    }
  } else {
    console.log(` Giao dịch thất bại: ${orderId} | Lý do: ${message}`);
    try {
      await db.query(
        "UPDATE `order` SET Payment_status = ?, Order_status = ?, Updated_at = NOW() WHERE Order_code = ?",
        ["Thất bại", "Đã Hủy", orderId]
      );
    } catch (err) {
      console.error(" Lỗi cập nhật đơn thất bại:", err);
    }
  }

  res.status(200).json({ message: "IPN received" });
};

// Redirect người dùng về FE
exports.handleMomoRedirect = (req, res) => {
  let { orderId } = req.query;

  if (typeof orderId === "string") {
    orderId = orderId.split(",")[0].trim();
  }

  if (!orderId) {
    return res.redirect(
      "http://localhost:3000/orders/thankyou?error=missing_id"
    );
  }

  return res.redirect(
    `http://localhost:3000/orders/thankyou?orderId=${orderId}`
  );
};

// Hủy đơn chưa thanh toán sau 10s (test)
exports.autoCancelUnpaidOrders = async (req, res) => {
  try {
    const [rows] = await db.query(
      `UPDATE \`order\`
       SET Order_status = 'Đã hủy',
           Payment_status = 'Thất bại',
           Updated_at = NOW()
       WHERE Payment_status = 'Chưa Thanh Toán'
         AND TIMESTAMPDIFF(SECOND, Created_at, NOW()) >= 10`
    );

    res.json({
      message: ` Đã hủy ${rows.affectedRows} đơn sau 10 giây không thanh toán`,
    });
  } catch (err) {
    console.error(" Lỗi hủy đơn tự động:", err);
    res.status(500).json({ error: "Lỗi xử lý huỷ đơn" });
  }
};
