const express = require("express");
const axios = require("axios");
const router = express.Router();

// Lấy danh sách tỉnh/thành
router.get("/provinces", async (req, res) => {
  try {
    const result = await axios.get(
      "https://provinces.open-api.vn/api/?depth=1"
    );
    res.json(result.data);
  } catch (err) {
    console.error("Lỗi khi lấy tỉnh:", err.message);
    res.status(500).json({ error: "Không lấy được danh sách tỉnh/thành." });
  }
});

// Lấy quận/huyện theo mã tỉnh (provinceCode)
router.get("/districts", async (req, res) => {
  const { provinceCode } = req.query;

  if (!provinceCode) {
    return res.status(400).json({ error: "Thiếu mã tỉnh" });
  }

  try {
    const result = await axios.get(
      `https://provinces.open-api.vn/api/p/${provinceCode}?depth=2`
    );
    const districts = result.data?.districts || [];
    res.json(districts);
  } catch (err) {
    console.error(" Lỗi khi lấy quận/huyện:", err.message);
    res.status(500).json({ error: "Không lấy được danh sách quận/huyện." });
  }
});

module.exports = router;
