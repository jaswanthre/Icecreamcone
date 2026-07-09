const express = require("express");
const router = express.Router();
const { buildDaybookWorkbook } = require("../utils/excelExport");

// @desc  Download full daybook (Sales, Expenses, Monthly Summary) as .xlsx
// @route GET /api/export/excel
router.get("/excel", async (req, res) => {
  try {
    const workbook = await buildDaybookWorkbook();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=nostic-daybook.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
