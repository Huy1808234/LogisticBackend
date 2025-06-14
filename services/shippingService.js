const axios = require('axios');
require('dotenv').config();

const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

function normalizeText(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ===== 1. Geocode địa chỉ bằng Mapbox =====
async function geocodeCity(address) {
  const normalizedAddress = normalizeText(address);

  const res = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`, {
    params: {
      access_token: MAPBOX_TOKEN,
      limit: 5,
      country: 'VN',
    }
  });

  const features = res.data?.features || [];
  if (features.length === 0) throw new Error(`Không tìm thấy tọa độ cho: ${address}`);

  const feature = features.find(f => normalizeText(f.place_name).includes(normalizedAddress)) || features[0];

  const coords = feature.center;
  const context = feature.context || [];

  const province = context.find(c => c.id.includes('region') || c.id.includes('place'))?.text ||
                   feature.place_name.split(',').slice(-2, -1)[0]?.trim() || '';

  const locality = context.find(c => c.id.includes('district') || c.id.includes('locality'))?.text ||
                   feature.place_name.split(',').slice(-3, -2)[0]?.trim() || '';

  console.log('\n== GEOCODE RESULT ==');
  console.log(' Địa chỉ người dùng:', address);
  console.log(' Địa chỉ khớp nhất:', feature.place_name);
  console.log(' Tọa độ:', coords);
  console.log(' Tỉnh/Thành:', province);
  console.log(' Quận/Huyện:', locality);

  return {
    coords,
    locality,
    province,
  };
}

// ===== 2. Tính khoảng cách bằng Mapbox Directions API =====
async function getDistance(fromCoords, toCoords) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fromCoords[0]},${fromCoords[1]};${toCoords[0]},${toCoords[1]}`;
  const res = await axios.get(url, {
    params: {
      access_token: MAPBOX_TOKEN,
      overview: 'simplified',
      geometries: 'geojson',
    },
  });

  const route = res.data?.routes?.[0];
  if (!route) throw new Error('Không tìm thấy tuyến đường phù hợp từ Mapbox');

  return {
    distanceKm: parseFloat((route.distance / 1000).toFixed(2)),
    durationHours: parseFloat((route.duration / 3600).toFixed(2)),
  };
}

// ===== 3. Phân vùng tỉnh thành theo J&T =====
function determineRegion(fromProvince, toProvince) {
  const NORTH = ["Bắc Giang", "Bắc Kạn", "Bắc Ninh", "Cao Bằng", "Điện Biên", "Hà Giang", "Hà Nam", "Hà Nội", "Hải Dương", "Hải Phòng", "Hòa Bình", "Hưng Yên", "Lai Châu", "Lạng Sơn", "Lào Cai", "Nam Định", "Ninh Bình", "Phú Thọ", "Quảng Ninh", "Sơn La", "Thái Bình", "Thái Nguyên", "Tuyên Quang", "Vĩnh Phúc", "Yên Bái"];
  const CENTRAL = ["Bình Định", "Bình Thuận", "Đà Nẵng", "Đắk Lắk", "Đắk Nông", "Gia Lai", "Hà Tĩnh", "Khánh Hòa", "Kon Tum", "Lâm Đồng", "Ninh Thuận", "Nghệ An", "Phú Yên", "Quảng Bình", "Quảng Nam", "Quảng Ngãi", "Quảng Trị", "Thanh Hóa", "Thừa Thiên Huế"];
  const SOUTH = ["An Giang", "Bà Rịa Vũng Tàu", "Bạc Liêu", "Bến Tre", "Bình Dương", "Bình Phước", "Cà Mau", "Cần Thơ", "Đồng Nai", "Đồng Tháp", "Hậu Giang", "Ho Chi Minh City", "Kiên Giang", "Long An", "Sóc Trăng", "Tây Ninh", "Tiền Giang", "Trà Vinh", "Vĩnh Long"];

  if (fromProvince === toProvince) return 'nội_tỉnh';

  const inSameRegion =
    (NORTH.includes(fromProvince) && NORTH.includes(toProvince)) ||
    (CENTRAL.includes(fromProvince) && CENTRAL.includes(toProvince)) ||
    (SOUTH.includes(fromProvince) && SOUTH.includes(toProvince));

  return inSameRegion ? 'nội_miền' : 'liên_miền';
}

// ===== 4. Kiểm tra có phải nội thành không =====
function isUrbanDistrict(localityRaw = '') {
  const normalized = normalizeText(localityRaw);

  const urbanDistricts = [
    // Hồ Chí Minh
    'quan 1', 'quan 3', 'quan 4', 'quan 5', 'quan 6', 'quan 7', 'quan 8',
    'quan 10', 'quan 11', 'go vap', 'tan binh', 'tan phu',
    'phu nhuan', 'binh thanh', ' thu duc',
    // Hà Nội
    'hoan kiem', 'ba dinh', 'cau giay', 'dong da', 'hai ba trung', 'thanh xuan',
    // Đà Nẵng
    'hai chau', 'thanh khe', 'son tra',
    //Tiền Giang
        // Thêm Mỹ Tho nếu muốn coi là nội thành
    'my tho'
  ];

  return urbanDistricts.some(district => normalized.includes(district));
}

// ===== 5. Tính phí vận chuyển =====
function calculatePrice(region, chargeableWeight, extraServices = [], isUrban = true, declaredValue = 0) {
  const baseRates = {
    nội_tỉnh: {
      nội_thành: [22000, 22000, 22000, 22000],
      ngoại_thành: [25000, 25000, 25000, 25000],
    },
    nội_miền: {
      nội_thành: [28000, 30500, 33000, 35500],
      ngoại_thành: [32500, 35500, 38000, 41000],
    },
    cận_miền: {
      nội_thành: [30000, 35000, 40000, 45000],
      ngoại_thành: [34500, 40500, 46000, 52000],
    },
    liên_miền: {
      nội_thành: [31000, 36000, 41500, 46000],
      ngoại_thành: [36000, 41500, 48000, 53000],
    },
  };

  const extraPerHalfKg = {
    nội_tỉnh: { nội_thành: 6000, ngoại_thành: 7000 },
    nội_miền: { nội_thành: 8000, ngoại_thành: 9000 },
    cận_miền: { nội_thành: 10000, ngoại_thành: 12000 },
    liên_miền: { nội_thành: 12000, ngoại_thành: 14000 },
  };

  const type = isUrban ? 'nội_thành' : 'ngoại_thành';
  let basePrice = baseRates[region][type][3];

  if (chargeableWeight <= 2.0) {
    const index = Math.floor((chargeableWeight - 0.01) / 0.5);
    basePrice = baseRates[region][type][index];
  } else {
    const extraWeight = chargeableWeight - 2.0;
    basePrice += Math.ceil(extraWeight / 0.5) * extraPerHalfKg[region][type];
  }

  if (chargeableWeight > 10) {
    basePrice = Math.ceil(basePrice * 1.2); // phụ phí 20% nếu >10kg
  }

  let extra = 0;
  const details = {};

  if (extraServices.includes('Freight')) {
    extra += 100000;
    details.Freight = 100000;
  }
  if (extraServices.includes('Express Delivery')) {
    extra += 150000;
    details['Express Delivery'] = 150000;
  }
  if (extraServices.includes('Insurance')) {
    const insurance = Math.ceil(declaredValue * 0.01);
    extra += insurance;
    details.Insurance = insurance;
  }
  if (extraServices.includes('Packaging')) {
    extra += 50000;
    details.Packaging = 50000;
  }

  return {
    basePrice,
    extraServicesDetail: details,
    total: basePrice + extra,
  };
}

module.exports = {
  geocodeCity,
  getDistance,
  determineRegion,
  isUrbanDistrict,
  calculatePrice,
};
