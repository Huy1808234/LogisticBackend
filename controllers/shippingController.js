//  controllers/shippingController.js
const {
  geocodeCity,
  getDistance,
  determineRegion,
  isUrbanDistrict,
  calculatePrice,
} = require('../services/shippingService');

exports.calculateShipping = async (req, res) => {
  try {
    const {
      fromAddress,
      toAddress,
      weight,
      height,
      width,
      length,
      freightType,
      extraServices = [],
      declaredValue = 0, // nếu dùng bảo hiểm thì cần khai giá trị hàng
    } = req.body;

    if (!fromAddress || !toAddress) {
      return res.status(400).json({ error: 'Thiếu địa chỉ điểm đi hoặc điểm đến.' });
    }

    // Geocode địa chỉ gửi & nhận
    const from = await geocodeCity(fromAddress);
    const to = await geocodeCity(toAddress);

    const sameCity = from.province === to.province;

    // Tính khoảng cách thực tế
    let distanceKm = 0;
    try {
      const distResult = await getDistance(from.coords, to.coords);
      distanceKm = distResult.distanceKm;
    } catch (e) {
      if (sameCity) {
        distanceKm = 10; // mặc định nếu cùng tỉnh mà API lỗi
      } else {
        throw new Error("Không thể tính khoảng cách giữa hai địa điểm.");
      }
    }

    // Tính khối lượng tính cước
    const volumeWeight = (height * width * length) / 6000;
    const chargeableWeight = Math.max(weight, volumeWeight);

    // Phân vùng chính xác
    const region = determineRegion(from.province, to.province);

    // Kiểm tra nội thành
    const isUrban = isUrbanDistrict(from.locality) && isUrbanDistrict(to.locality);

    // Tính phí vận chuyển
    const { basePrice, extraServicesDetail, total } = calculatePrice(
      region,
      chargeableWeight,
      extraServices,
      isUrban,
      declaredValue
    );

    // Trả kết quả
    res.json({
      from: fromAddress,
      to: toAddress,
      freightType,
      distanceKm,
      region,
      isUrban,
      chargeableWeight: chargeableWeight.toFixed(2),
      basePrice,
      extraServices: extraServicesDetail,
      total,
    });
  } catch (err) {
    console.error('[CALCULATE] Error:', err);
    res.status(500).json({ error: err.message });
  }
};
