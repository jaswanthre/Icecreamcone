require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const salesRoutes = require("./routes/salesRoutes");
const expensesRoutes = require("./routes/expensesRoutes");
const exportRoutes = require("./routes/exportRoutes");

const app = express();

connectDB();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
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
