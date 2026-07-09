const Sale = require("../models/Sale");
const Expense = require("../models/Expense");
const normalizeDate = require("../utils/normalizeDate");

// @desc  Create or update today's sale (upsert by date)
// @route POST /api/sales
// @body  { date, opening, phonepe, cash }
exports.createSale = async (req, res) => {
  try {
    const { date, phonepe = 0, cash = 0 } = req.body;
    let { opening } = req.body;
    const day = normalizeDate(date);

    // If opening balance not explicitly provided, auto-fill from
    // the closing balance of the most recent prior day.
    if (opening === undefined || opening === null || opening === "") {
      const prev = await Sale.findOne({ date: { $lt: day } }).sort({ date: -1 });
      opening = prev ? prev.closing : 0;
    }

    const sale = (Number(phonepe) || 0) + (Number(cash) || 0);
    const closing = (Number(opening) || 0) + sale;

    const saved = await Sale.findOneAndUpdate(
      { date: day },
      {
        $set: {
          date: day,
          opening: Number(opening) || 0,
          phonepe: Number(phonepe) || 0,
          cash: Number(cash) || 0,
          sale,
          closing,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.status(201).json(saved);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "A sales entry for this date already exists." });
    }
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get sales history, most recent first
// @route GET /api/sales?limit=10
exports.getHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const sales = await Sale.find().sort({ date: -1 }).limit(limit);
    res.json(sales);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Get single sale by date
// @route GET /api/sales/:date
exports.getSaleByDate = async (req, res) => {
  try {
    const day = normalizeDate(req.params.date);
    const sale = await Sale.findOne({ date: day });
    if (!sale) return res.status(404).json({ message: "No sale entry for this date." });
    res.json(sale);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Delete a sale entry
// @route DELETE /api/sales/:id
exports.deleteSale = async (req, res) => {
  try {
    const deleted = await Sale.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Sale entry not found." });
    res.json({ message: "Sale entry deleted.", deleted });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Dashboard summary cards: opening balance, total online,
//        total cash, closing balance, days logged
// @route GET /api/sales/summary/dashboard
exports.getDashboardSummary = async (req, res) => {
  try {
    const agg = await Sale.aggregate([
      {
        $group: {
          _id: null,
          totalOnline: { $sum: "$phonepe" },
          totalCash: { $sum: "$cash" },
          daysLogged: { $sum: 1 },
        },
      },
    ]);

    const totals = agg[0] || { totalOnline: 0, totalCash: 0, daysLogged: 0 };
    const latest = await Sale.findOne().sort({ date: -1 });

    res.json({
      openingBalance: latest ? latest.closing : 0, // next day's opening = latest closing
      totalOnline: totals.totalOnline,
      totalCash: totals.totalCash,
      closingBalance: latest ? latest.closing : 0,
      daysLogged: totals.daysLogged,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc  Monthly sale summary (last N months) combined with expenses
// @route GET /api/sales/summary/monthly?months=5
exports.getMonthlySummary = async (req, res) => {
  try {
    const months = parseInt(req.query.months, 10) || 5;

    const salesAgg = await Sale.aggregate([
      {
        $group: {
          _id: { year: { $year: "$date" }, month: { $month: "$date" } },
          phonepe: { $sum: "$phonepe" },
          cash: { $sum: "$cash" },
          totalSale: { $sum: "$sale" },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: months },
    ]);

    const expensesAgg = await Expense.aggregate([
      { $unwind: { path: "$others", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { year: { $year: "$date" }, month: { $month: "$date" } },
          total: {
            $sum: {
              $add: [
                { $ifNull: ["$stock.phonepe", 0] },
                { $ifNull: ["$stock.cash", 0] },
                { $ifNull: ["$salary.phonepe", 0] },
                { $ifNull: ["$salary.cash", 0] },
                { $ifNull: ["$rent.phonepe", 0] },
                { $ifNull: ["$rent.cash", 0] },
                { $ifNull: ["$others.phonepe", 0] },
                { $ifNull: ["$others.cash", 0] },
              ],
            },
          },
        },
      },
    ]);

    // NOTE: the $unwind + per-document category sums above can double count
    // stock/salary/rent once per "others" element. To keep this accurate we
    // recompute month totals from raw documents instead.
    const expenseDocs = await Expense.find();
    const expenseByMonth = {};
    for (const doc of expenseDocs) {
      const key = `${doc.date.getUTCFullYear()}-${doc.date.getUTCMonth() + 1}`;
      const othersTotal = (doc.others || []).reduce((s, o) => s + (o.phonepe || 0) + (o.cash || 0), 0);
      const docTotal =
        (doc.stock?.phonepe || 0) +
        (doc.stock?.cash || 0) +
        (doc.salary?.phonepe || 0) +
        (doc.salary?.cash || 0) +
        (doc.rent?.phonepe || 0) +
        (doc.rent?.cash || 0) +
        othersTotal;
      expenseByMonth[key] = (expenseByMonth[key] || 0) + docTotal;
    }

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    const result = salesAgg.map((m) => {
      const key = `${m._id.year}-${m._id.month}`;
      const expenses = expenseByMonth[key] || 0;
      return {
        month: `${monthNames[m._id.month - 1]} ${m._id.year}`,
        phonepe: m.phonepe,
        cash: m.cash,
        totalSale: m.totalSale,
        expenses,
        net: m.totalSale - expenses,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
