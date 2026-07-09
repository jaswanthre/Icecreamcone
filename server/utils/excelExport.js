const ExcelJS = require("exceljs");
const Sale = require("../models/Sale");
const Expense = require("../models/Expense");

function fmtDate(d) {
  return d.toISOString().split("T")[0];
}

async function buildDaybookWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nostic Daybook";
  workbook.created = new Date();

  // ---- Sales sheet ----
  const salesSheet = workbook.addWorksheet("Sales");
  salesSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Opening", key: "opening", width: 12 },
    { header: "PhonePe", key: "phonepe", width: 12 },
    { header: "Cash", key: "cash", width: 12 },
    { header: "Sale", key: "sale", width: 12 },
    { header: "Closing", key: "closing", width: 12 },
  ];
  salesSheet.getRow(1).font = { bold: true };

  const sales = await Sale.find().sort({ date: 1 });
  sales.forEach((s) => {
    salesSheet.addRow({
      date: fmtDate(s.date),
      opening: s.opening,
      phonepe: s.phonepe,
      cash: s.cash,
      sale: s.sale,
      closing: s.closing,
    });
  });

  // ---- Expenses sheet ----
  const expenseSheet = workbook.addWorksheet("Expenses");
  expenseSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Category", key: "category", width: 16 },
    { header: "Description", key: "description", width: 24 },
    { header: "PhonePe", key: "phonepe", width: 12 },
    { header: "Cash", key: "cash", width: 12 },
  ];
  expenseSheet.getRow(1).font = { bold: true };

  const expenses = await Expense.find().sort({ date: 1 });
  expenses.forEach((e) => {
    const dateStr = fmtDate(e.date);
    if (e.stock?.phonepe || e.stock?.cash) {
      expenseSheet.addRow({ date: dateStr, category: "Stock", description: "-", phonepe: e.stock.phonepe, cash: e.stock.cash });
    }
    if (e.salary?.phonepe || e.salary?.cash) {
      expenseSheet.addRow({ date: dateStr, category: "Salary", description: "-", phonepe: e.salary.phonepe, cash: e.salary.cash });
    }
    if (e.rent?.phonepe || e.rent?.cash) {
      expenseSheet.addRow({ date: dateStr, category: "Rent", description: "-", phonepe: e.rent.phonepe, cash: e.rent.cash });
    }
    (e.others || []).forEach((o) => {
      expenseSheet.addRow({ date: dateStr, category: "Others", description: o.type, phonepe: o.phonepe, cash: o.cash });
    });
  });

  // ---- Monthly summary sheet ----
  const monthlySheet = workbook.addWorksheet("Monthly Summary");
  monthlySheet.columns = [
    { header: "Month", key: "month", width: 14 },
    { header: "PhonePe", key: "phonepe", width: 12 },
    { header: "Cash", key: "cash", width: 12 },
    { header: "Total Sale", key: "totalSale", width: 14 },
    { header: "Expenses", key: "expenses", width: 12 },
    { header: "Net", key: "net", width: 12 },
  ];
  monthlySheet.getRow(1).font = { bold: true };

  const monthlyMap = {};
  sales.forEach((s) => {
    const key = `${s.date.getUTCFullYear()}-${String(s.date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = { phonepe: 0, cash: 0, totalSale: 0, expenses: 0 };
    monthlyMap[key].phonepe += s.phonepe;
    monthlyMap[key].cash += s.cash;
    monthlyMap[key].totalSale += s.sale;
  });
  expenses.forEach((e) => {
    const key = `${e.date.getUTCFullYear()}-${String(e.date.getUTCMonth() + 1).padStart(2, "0")}`;
    const othersTotal = (e.others || []).reduce((s, o) => s + (o.phonepe || 0) + (o.cash || 0), 0);
    const total =
      (e.stock?.phonepe || 0) + (e.stock?.cash || 0) +
      (e.salary?.phonepe || 0) + (e.salary?.cash || 0) +
      (e.rent?.phonepe || 0) + (e.rent?.cash || 0) +
      othersTotal;
    if (!monthlyMap[key]) monthlyMap[key] = { phonepe: 0, cash: 0, totalSale: 0, expenses: 0 };
    monthlyMap[key].expenses += total;
  });

  Object.keys(monthlyMap)
    .sort()
    .forEach((key) => {
      const m = monthlyMap[key];
      monthlySheet.addRow({
        month: key,
        phonepe: m.phonepe,
        cash: m.cash,
        totalSale: m.totalSale,
        expenses: m.expenses,
        net: m.totalSale - m.expenses,
      });
    });

  return workbook;
}

module.exports = { buildDaybookWorkbook };
