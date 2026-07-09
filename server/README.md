# Nostic Daybook — Backend

Node.js + Express + MongoDB (Mongoose) API for the Nostic Daybook app.

## Setup

```bash
npm install
cp .env.example .env   # then fill in your MONGO_URI
npm run dev             # nodemon, or `npm start` for plain node
```

## Project structure

```
config/db.js              MongoDB connection
models/Sale.js            Sales schema (date, opening, phonepe, cash, sale, closing)
models/Expense.js         Expenses schema (date, stock, salary, rent, others[])
controllers/salesController.js
controllers/expensesController.js
routes/salesRoutes.js
routes/expensesRoutes.js
routes/exportRoutes.js    Excel export
utils/normalizeDate.js    Normalizes dates to midnight UTC (1 doc per day)
utils/excelExport.js      Builds the .xlsx workbook (Sales, Expenses, Monthly Summary)
index.js                  App entry point
```

## Data model

**Sale** (one document per calendar day)
| field    | type   | notes                              |
|----------|--------|-------------------------------------|
| date     | Date   | unique                              |
| opening  | Number | auto-filled from previous closing   |
| phonepe  | Number | today's online sales                |
| cash     | Number | today's cash sales                  |
| sale     | Number | computed = phonepe + cash           |
| closing  | Number | computed = opening + sale           |

**Expense** (one document per calendar day, holding all categories)
| field  | type                                | notes                          |
|--------|-------------------------------------|---------------------------------|
| date   | Date                                | unique                          |
| stock  | { phonepe, cash }                  |                                  |
| salary | { phonepe, cash }                  |                                  |
| rent   | { phonepe, cash }                  |                                  |
| others | [{ type, phonepe, cash }]          | free-form list, e.g. "Electricity bill" |

## API reference

### Sales — `/api/sales`
| Method | Route                        | Description |
|--------|-------------------------------|-------------|
| POST   | `/`                            | Create/update today's sale. Body: `{ date, opening?, phonepe, cash }`. `opening` auto-fills from yesterday's closing if omitted. |
| GET    | `/?limit=10`                   | Sales history, most recent first. |
| GET    | `/:date`                       | Single day's sale entry. |
| DELETE | `/:id`                         | Delete a sale entry by its Mongo `_id`. |
| GET    | `/summary/dashboard`           | Dashboard cards: opening balance, total online, total cash, closing balance, days logged. |
| GET    | `/summary/monthly?months=5`    | Monthly PhonePe/Cash/Sale/Expenses/Net rollup. |

### Expenses — `/api/expenses`
| Method | Route                                   | Description |
|--------|-------------------------------------------|-------------|
| POST   | `/:date/stock`                            | Upsert Stock expense. Body: `{ phonepe, cash }`. |
| POST   | `/:date/salary`                           | Upsert Salary expense. Body: `{ phonepe, cash }`. |
| POST   | `/:date/rent`                             | Upsert Rent expense. Body: `{ phonepe, cash }`. |
| POST   | `/:date/others`                           | Add an "Others" line item. Body: `{ type, phonepe, cash }`. |
| DELETE | `/:date/others/:itemId`                   | Remove one "Others" line item. |
| GET    | `/:date`                                  | Get all expenses recorded for a date. |
| GET    | `/?limit=30`                              | List expense documents, most recent first. |

### Export — `/api/export`
| Method | Route     | Description |
|--------|-----------|-------------|
| GET    | `/excel`  | Downloads `nostic-daybook.xlsx` with Sales, Expenses, and Monthly Summary sheets. |

## Notes

- Dates are normalized to midnight UTC so there is exactly one Sale document and one Expense document per calendar day (upserts, not duplicates) — matching the "Enter" buttons per category in the UI.
- `sale` and `closing` on the Sale model are always server-computed, never trusted from the client.
- Monthly `Net = totalSale - expenses`, matching the "Monthly Sale" table in the UI.
- Authentication ("Log out" button in the UI) isn't included here — add a simple JWT/session middleware in front of these routes if you need per-user data.
