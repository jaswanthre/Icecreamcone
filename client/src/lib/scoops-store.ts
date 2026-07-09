import * as XLSX from "xlsx";

export type ExpenseCategory = "stock" | "salary" | "rent" | "others";

export type ExpenseItem = {
  category: ExpenseCategory;
  description?: string;
  phonepe: number;
  cash: number;
};

export type DayEntry = {
  date: string; // YYYY-MM-DD
  opening: number;
  phonepe: number;
  cash: number;
  expenses?: ExpenseItem[];
  // legacy — kept for migration
  expPhonepe?: number;
  expCash?: number;
};

const ENTRIES_KEY = "scoops.entries.v1";
const AUTH_KEY = "scoops.auth.v1";

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AUTH_KEY) === "yes";
}

export function login(username: string, password: string): boolean {
  if (username.trim().toLowerCase() === "admin" && password === "icecream") {
    localStorage.setItem(AUTH_KEY, "yes");
    return true;
  }
  return false;
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}

function migrate(e: DayEntry): DayEntry {
  if (e.expenses) return e;
  const list: ExpenseItem[] = [];
  const ep = Number(e.expPhonepe) || 0;
  const ec = Number(e.expCash) || 0;
  if (ep > 0 || ec > 0) {
    list.push({ category: "stock", phonepe: ep, cash: ec });
  }
  return { ...e, expenses: list };
}

export function getEntries(): DayEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as DayEntry[]).map(migrate);
  } catch {
    return [];
  }
}

export function saveEntries(entries: DayEntry[]) {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

export function upsertEntry(entry: DayEntry) {
  const list = getEntries().filter((e) => e.date !== entry.date);
  list.push({ ...entry, expenses: entry.expenses ?? [] });
  list.sort((a, b) => a.date.localeCompare(b.date));
  saveEntries(list);
}

export function addExpense(date: string, item: ExpenseItem) {
  const entries = getEntries();
  const cur = entries.find((e) => e.date === date);
  if (!cur) return;
  cur.expenses = [...(cur.expenses ?? []), item];
  saveEntries(entries);
}

export function deleteEntry(date: string) {
  saveEntries(getEntries().filter((e) => e.date !== date));
}

export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function sumExp(items: ExpenseItem[] | undefined, cat?: ExpenseCategory) {
  const list = (items ?? []).filter((i) => !cat || i.category === cat);
  return {
    pp: list.reduce((s, i) => s + (Number(i.phonepe) || 0), 0),
    cs: list.reduce((s, i) => s + (Number(i.cash) || 0), 0),
  };
}

export function computeRows(entries: DayEntry[]) {
  let onlineTotal = 0;
  let cashTotal = 0;
  return entries.map((e) => {
    const pp = Number(e.phonepe) || 0;
    const cs = Number(e.cash) || 0;
    const all = sumExp(e.expenses);
    const stock = sumExp(e.expenses, "stock");
    const salary = sumExp(e.expenses, "salary");
    const rent = sumExp(e.expenses, "rent");
    const others = sumExp(e.expenses, "others");
    onlineTotal += pp - all.pp;
    cashTotal += cs - all.cs;
    const todaySale = pp + cs;
    const todayExpense = all.pp + all.cs;
    const closing = onlineTotal + cashTotal;
    return {
      ...e,
      expPhonepe: all.pp,
      expCash: all.cs,
      stock,
      salary,
      rent,
      others,
      todaySale,
      todayExpense,
      onlineTotal,
      cashTotal,
      closing,
    };
  });
}

export function downloadExcel() {
  const rows = computeRows(getEntries()).map((r) => ({
    Date: r.date,
    "Opening Balance": r.opening,
    "PhonePe (Today)": r.phonepe,
    "Cash (Today)": r.cash,
    "Total Today Sale": r.todaySale,
    "Stock PP": r.stock.pp,
    "Stock Cash": r.stock.cs,
    "Salary PP": r.salary.pp,
    "Salary Cash": r.salary.cs,
    "Rent PP": r.rent.pp,
    "Rent Cash": r.rent.cs,
    "Others PP": r.others.pp,
    "Others Cash": r.others.cs,
    "Others Notes": (r.expenses ?? [])
      .filter((i) => i.category === "others" && i.description)
      .map((i) => i.description)
      .join("; "),
    "Total Exp PhonePe": r.expPhonepe,
    "Total Exp Cash": r.expCash,
    "Total Today Expense": r.todayExpense,
    "Total Online (Net PhonePe)": r.onlineTotal,
    "Total Cash (Net All Days)": r.cashTotal,
    "Closing Balance": r.closing,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daily Sales");

  const monthly = computeMonthly(getEntries()).map((m) => ({
    Month: m.month,
    "Total Sale": m.sale,
    "Total PhonePe": m.phonepe,
    "Total Cash": m.cash,
    "Stock Exp": m.stock,
    "Salary Exp": m.salary,
    "Rent Exp": m.rent,
    "Others Exp": m.others,
    "Total Expense": m.expense,
    "Net Sale": m.net,
  }));
  const wsM = XLSX.utils.json_to_sheet(monthly);
  XLSX.utils.book_append_sheet(wb, wsM, "Monthly Sales");

  XLSX.writeFile(wb, `icecream-sales-${todayISO()}.xlsx`);
}

export function computeMonthly(entries: DayEntry[]) {
  const map = new Map<string, {
    month: string; phonepe: number; cash: number; sale: number;
    stock: number; salary: number; rent: number; others: number;
    expense: number; net: number;
  }>();
  for (const e of entries) {
    const month = e.date.slice(0, 7);
    const pp = Number(e.phonepe) || 0;
    const cs = Number(e.cash) || 0;
    const stock = sumExp(e.expenses, "stock");
    const salary = sumExp(e.expenses, "salary");
    const rent = sumExp(e.expenses, "rent");
    const others = sumExp(e.expenses, "others");
    const cur = map.get(month) ?? {
      month, phonepe: 0, cash: 0, sale: 0,
      stock: 0, salary: 0, rent: 0, others: 0, expense: 0, net: 0,
    };
    cur.phonepe += pp;
    cur.cash += cs;
    cur.sale += pp + cs;
    cur.stock += stock.pp + stock.cs;
    cur.salary += salary.pp + salary.cs;
    cur.rent += rent.pp + rent.cs;
    cur.others += others.pp + others.cs;
    cur.expense = cur.stock + cur.salary + cur.rent + cur.others;
    cur.net = cur.sale - cur.expense;
    map.set(month, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

