# ⚙️ Nexus 2.0 | Core API Engine (Backend)

![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![MongoDB](https://img.shields.io/badge/MongoDB-%234ea94b.svg?style=for-the-badge&logo=mongodb&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=JSON%20web%20tokens)

> The engine room. This repository contains the custom Node.js/Express backend that powers **Nexus 2.0**. It is engineered to handle custom security protocols, complex relational database queries, and dynamic station locking.

🌐 **Live Client Interface:** [nexus-frontend-lyart.vercel.app](https://nexus-frontend-lyart.vercel.app/)  
🎨 **Frontend Repository:** [Nexus React Client](https://github.com/Jatinyadav29/nexus-frontend.git)

---

## 🏗️ Architecture & Security
* **Custom Auth System:** We explicitly bypassed third-party providers to engineer a fully custom **JWT + Bcrypt** authentication system, ensuring absolute granular control over admin roles and protected routes.
* **Relational Data Mapping:** Advanced MongoDB schemas mapping individual `Player IDs` -> `Squad IDs` -> `Tournament IDs`.
* **Dynamic Hardware Locking:** Booking endpoints immediately mutate and lock station states in the database to prevent time-overlaps and double-bookings.
* **Command Center Override:** Secure admin endpoints capable of executing live "Force Aborts" to instantly update database states and free up hardware without page reloads.

## 📡 Core API Endpoints (Examples)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/login` | Authenticates user & returns JWT | No |
| `POST` | `/api/bookings/deploy` | Locks a PC station for a time slot | Yes |
| `PUT` | `/api/admin/force-abort` | Cancels booking & frees PC | Yes (Admin) |
| `GET` | `/api/tournaments/roster` | Fetches relational squad intel | Yes (Admin) |

## 🚀 Run it Locally

**1. Clone the repository:**
```bash
git clone https://github.com/Jatin29yadav/Nexus.git
cd Nexus
```

**2. Install dependencies:**
```bash
npm install
```

**3. Configure Environment Variables:**
Create a `.env` file in the root directory to store your credentials securely:
```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_super_secret_key
```

**4. Ignite the Server:**
```bash
npm run dev
```

---

## 🛠️ Maintenance 
Nexus 2.0 is a live, evolving project. Future patches will focus on optimizing queries and preparing the architecture for asynchronous workflow agents. Pull Requests are welcome!
