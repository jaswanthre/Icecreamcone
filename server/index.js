require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const salesRoutes = require("./routes/salesRoutes");
const expensesRoutes = require("./routes/expensesRoutes");
const exportRoutes = require("./routes/exportRoutes");

const app = express();

connectDB();

// Configure CORS to accept a comma-separated list in CLIENT_ORIGIN.
// Examples:
//  - CLIENT_ORIGIN=https://example.com
//  - CLIENT_ORIGIN=https://one.example.com,https://two.example.com
//  - CLIENT_ORIGIN=.vercel.app   (allows any vercel.app preview hostname)
const rawAllowed = process.env.CLIENT_ORIGIN || "";
const allowedOrigins = rawAllowed
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (Postman, curl) with no Origin header
      if (!origin) return callback(null, true);

      const normalized = origin.replace(/\/+$/, "");

      // Exact match
      if (allowedOrigins.includes(normalized)) return callback(null, true);

      // If environment includes any vercel.app token, allow any vercel.app origin
      if (allowedOrigins.some((a) => a.includes("vercel.app"))) {
        try {
          const url = new URL(origin);
          if (url.hostname.endsWith(".vercel.app")) return callback(null, true);
        } catch (e) {
          // fallthrough
        }
      }

      return callback(new Error("Not allowed by CORS"));
    },
    optionsSuccessStatus: 200,
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Nostic Daybook API is running." });
});

app.use("/api/sales", salesRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/export", exportRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
