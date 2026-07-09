import * as XLSX from "xlsx";

export type ExpenseCategory = "stock" | "salary" | "rent" | "others";

export type ExpenseItem = {
  category: ExpenseCategory;
  description?: string;
  phonepe?: number;
  cash?: number;
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
const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

type SaleDocument = {
  _id?: string;
  date: string | Date;
  opening: number;
  phonepe: number;
  cash: number;
  sale?: number;
  closing?: number;
};

type ExpenseDocument = {
  date: string | Date;
  stock?: { phonepe?: number; cash?: number };
  salary?: { phonepe?: number; cash?: number };
  rent?: { phonepe?: number; cash?: number };
  others?: Array<{ _id?: string; type?: string; phonepe?: number; cash?: number }>;
};

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

export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function toISODate(value: string | Date | undefined): string {
  if (!value) return todayISO();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayISO();
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : await response.text().catch(() => null);

  if (!response.ok) {
    const message =
      typeof body === "object" && body && "message" in body
        ? String((body as { message?: string }).message)
        : "Request failed";
    throw new Error(message);
  }

  return (body ?? {}) as T;
}

function normalizeExpenses(doc: ExpenseDocument | null | undefined): ExpenseItem[] {
  const items: ExpenseItem[] = [];

  const addIfPresent = (category: ExpenseCategory, phonepe: number, cash: number, description?: string) => {
    if (phonepe !== undefined && cash !== undefined && (phonepe > 0 || cash > 0)) {
      items.push({ category, description, phonepe, cash });
    }
  };

  if (doc?.stock) {
    addIfPresent("stock", Number(doc.stock.phonepe) || 0, Number(doc.stock.cash) || 0);
  }
  if (doc?.salary) {
    addIfPresent("salary", Number(doc.salary.phonepe) || 0, Number(doc.salary.cash) || 0);
  }
  if (doc?.rent) {
    addIfPresent("rent", Number(doc.rent.phonepe) || 0, Number(doc.rent.cash) || 0);
  }
  if (doc?.others?.length) {
    for (const item of doc.others) {
      const phonepe = Number(item.phonepe) || 0;
      const cash = Number(item.cash) || 0;
      if (phonepe > 0 || cash > 0) {
        items.push({
          category: "others",
          description: item.type || "Other expense",
          phonepe,
          cash,
        });
      }
    }
  }

  return items;
}

async function fetchEntriesFromServer(): Promise<DayEntry[]> {
  const [sales, expenses] = await Promise.all([
    request<SaleDocument[]>("/sales?limit=1000"),
    request<ExpenseDocument[]>("/expenses?limit=1000"),
  ]);

  const merged = new Map<string, DayEntry>();

  for (const sale of sales) {
    const date = toISODate(sale.date);
    merged.set(date, {
      date,
      opening: Number(sale.opening) || 0,
      phonepe: Number(sale.phonepe) || 0,
      cash: Number(sale.cash) || 0,
      expenses: [],
    });
  }

  for (const expense of expenses) {
    const date = toISODate(expense.date);
    const existing = merged.get(date) ?? {
      date,
      opening: 0,
      phonepe: 0,
      cash: 0,
      expenses: [],
    };
    existing.expenses = normalizeExpenses(expense);
    merged.set(date, existing);
  }

  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getEntries(): Promise<DayEntry[]> {
  return fetchEntriesFromServer();
}

export function saveEntries(entries: DayEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
}

export async function upsertEntry(entry: DayEntry) {
  await request("/sales", {
    method: "POST",
    body: JSON.stringify({
      date: entry.date,
      opening: entry.opening,
      phonepe: entry.phonepe,
      cash: entry.cash,
    }),
  });
}

export async function addExpense(date: string, item: ExpenseItem) {
  if (item.category === "others") {
    await request(`/expenses/${date}/others`, {
      method: "POST",
      body: JSON.stringify({
        type: item.description || "Other expense",
        phonepe: item.phonepe ?? 0,
        cash: item.cash ?? 0,
      }),
    });
    return;
  }

  const body: Record<string, number> = {};
  if (item.phonepe !== undefined) body.phonepe = item.phonepe;
  if (item.cash !== undefined) body.cash = item.cash;

  await request(`/expenses/${date}/${item.category}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteEntry(date: string) {
  const sale = await request<SaleDocument>(`/sales/${date}`);
  if (sale?._id) {
    await request(`/sales/${sale._id}`, { method: "DELETE" });
  }
  try {
    await request(`/expenses/${date}`, { method: "DELETE" });
  } catch {
    // Ignore missing expense docs; the sale delete already handled the main record.
  }
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

export function downloadExcel(entries: DayEntry[]) {
  const rows = computeRows(entries).map((r) => ({
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

  const monthly = computeMonthly(entries).map((m) => ({
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

