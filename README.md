#  LogisticBackend

A backend API for managing inter-provincial shipping orders, customers, payments, and tracking – built with Node.js, Express, and MySQL.

##  Features

-  User authentication (JWT-based)
-  Create & manage shipping orders
-  Payment integration (MoMo, COD)
-  Customer & staff management
-  Package details (dimensions, weight, services)
-  Real-time order tracking & status updates
-  Image upload support (proof of delivery)
-  Admin dashboard-ready APIs

---

## 🔧 Tech Stack

- **Node.js** + **Express.js**
- **MySQL** (with async/await + connection pooling)
- **JWT** (authentication)
- **Multer** (image upload)
- **dotenv** (for environment configs)
- **axios** (MoMo API integration)
- **Mapbox / OpenRouteService** (for route & distance)

---

## Getting Started

### 1. Clone project

```bash
git clone https://github.com/Huy1808234/LogisticBackend.git
cd LogisticBackend
