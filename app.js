const STORAGE_RATE = "bali-cc-rate-idr-per-usd";
const STORAGE_CURRENCY = "bali-cc-calc-currency";
const STORAGE_RUNNING = "bali-cc-running-entries";

const els = {
  rate: document.getElementById("rate"),
  refreshRate: document.getElementById("refresh-rate"),
  calcCurrency: document.getElementById("calc-currency"),
  displayMain: document.getElementById("display-main"),
  lineUsd: document.getElementById("line-usd"),
  lineIdr: document.getElementById("line-idr"),
  error: document.getElementById("error"),
  keypad: document.querySelector(".keypad"),
  btnConvert: document.getElementById("btn-convert"),
  btnAddRt: document.getElementById("btn-add-rt"),
  rtList: document.getElementById("rt-list"),
  rtSumUsd: document.getElementById("rt-sum-usd"),
  rtSumIdr: document.getElementById("rt-sum-idr"),
  rtClear: document.getElementById("rt-clear"),
};

/**
 * @typedef {{ id: string, amount: number, currency: 'USD'|'IDR', rateIdrPerUsd: number }} RtEntry
 */

/** @type {RtEntry[]} */
let runningEntries = [];

let accumulator = null;
/** @type {'+' | '-' | '*' | '/' | null} */
let pendingOp = null;
/** After an operator or =, next digit/dot replaces the display. */
let replaceEntry = false;

let displayDigits = "0";
let dotUsed = false;

function getRate() {
  const r = Number.parseFloat(String(els.rate.value).replace(/,/g, ""));
  return Number.isFinite(r) && r > 0 ? r : NaN;
}

function loadRunningEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_RUNNING);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return;
    runningEntries = data.filter(isValidRtEntry);
  } catch {
    runningEntries = [];
  }
}

/** @param {unknown} x */
function isValidRtEntry(x) {
  if (!x || typeof x !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (x);
  return (
    typeof o.id === "string" &&
    typeof o.amount === "number" &&
    Number.isFinite(o.amount) &&
    (o.currency === "USD" || o.currency === "IDR") &&
    typeof o.rateIdrPerUsd === "number" &&
    Number.isFinite(o.rateIdrPerUsd) &&
    o.rateIdrPerUsd > 0
  );
}

function persistRunningEntries() {
  localStorage.setItem(STORAGE_RUNNING, JSON.stringify(runningEntries));
}

/** @param {RtEntry} e */
function entryUsdEquivalent(e) {
  if (e.currency === "USD") return e.amount;
  return Math.round(e.amount) / e.rateIdrPerUsd;
}

function load() {
  const savedRate = localStorage.getItem(STORAGE_RATE);
  if (savedRate) els.rate.value = savedRate;

  const cur = localStorage.getItem(STORAGE_CURRENCY);
  if (cur === "IDR" || cur === "USD") els.calcCurrency.value = cur;

  loadRunningEntries();
}

function persistRateOnly() {
  localStorage.setItem(STORAGE_RATE, String(els.rate.value));
}

function persistCurrency() {
  localStorage.setItem(STORAGE_CURRENCY, String(els.calcCurrency.value));
}

function showError(msg) {
  els.error.textContent = msg;
  els.error.classList.add("visible");
  clearTimeout(showError._t);
  showError._t = setTimeout(() => els.error.classList.remove("visible"), 4000);
}

function formatUsd(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatIdr(n) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function truncateDisplayDigits() {
  if (displayDigits.length > 16) displayDigits = displayDigits.slice(-16);
}

function displayNumberParsed() {
  if (displayDigits === "" || displayDigits === "-" || displayDigits === "." || displayDigits === "-.")
    return NaN;
  return Number.parseFloat(displayDigits);
}

function applyDual(nOverride) {
  const rate = getRate();
  const as = els.calcCurrency.value;

  const n =
    typeof nOverride === "number" && Number.isFinite(nOverride) ? nOverride : displayNumberParsed();

  if (!Number.isFinite(rate)) {
    els.lineUsd.textContent = "USD — set rate above";
    els.lineIdr.textContent = "IDR —";
    return;
  }
  if (!Number.isFinite(n)) {
    els.lineUsd.textContent = "USD —";
    els.lineIdr.textContent = "IDR —";
    return;
  }

  let usd;
  let idr;
  if (as === "IDR") {
    idr = Math.round(n);
    usd = idr / rate;
  } else {
    usd = n;
    idr = Math.round(usd * rate);
  }

  els.lineUsd.textContent = formatUsd(usd);
  els.lineIdr.textContent = formatIdr(idr);
}

function renderRunningTotal() {
  const sumUsd = runningEntries.reduce((s, e) => s + entryUsdEquivalent(e), 0);
  const rateNow = getRate();

  els.rtSumUsd.textContent = formatUsd(sumUsd);
  if (!Number.isFinite(rateNow)) {
    els.rtSumIdr.textContent = "IDR — set rate above";
  } else {
    els.rtSumIdr.textContent = `≈ ${formatIdr(sumUsd * rateNow)} at current rate`;
  }

  els.rtList.replaceChildren();

  if (runningEntries.length === 0) {
    const li = document.createElement("li");
    li.className = "rt-empty";
    li.textContent =
      "Nothing added yet. Enter or calculate a number, then click Add to running total.";
    els.rtList.appendChild(li);
    return;
  }

  for (const e of runningEntries) {
    const li = document.createElement("li");
    li.className = "rt-item";

    const body = document.createElement("div");
    body.className = "rt-item-body";

    const primary = document.createElement("p");
    primary.className = "rt-item-primary";
    primary.textContent = e.currency === "USD" ? formatUsd(e.amount) : formatIdr(Math.round(e.amount));

    const sub = document.createElement("p");
    sub.className = "rt-item-sub";
    if (e.currency === "USD") {
      sub.textContent = `≈ ${formatIdr(Math.round(e.amount * e.rateIdrPerUsd))} when added`;
    } else {
      sub.textContent = `≈ ${formatUsd(entryUsdEquivalent(e))} when added`;
    }

    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "rt-remove";
    rm.setAttribute("aria-label", "Remove this amount from running total");
    rm.dataset.removeId = e.id;
    rm.textContent = "×";

    body.append(primary, sub);
    li.append(body, rm);
    els.rtList.appendChild(li);
  }
}

function render() {
  els.displayMain.textContent = displayDigits === "" ? "0" : displayDigits;
  applyDual();
  renderRunningTotal();
}

function formatResultString(n) {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 1e12) / 1e12;
  let s = String(rounded);
  if (Math.abs(Number(s)) >= 1e14) return n.toPrecision(10);
  if (s.length > 14) return String(Number.parseFloat(s).toPrecision(12));
  return s;
}

function applyPendingOp(left, right, op) {
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? NaN : left / right;
    default:
      return right;
  }
}

function digit(d) {
  if (replaceEntry) {
    displayDigits = d;
    dotUsed = displayDigits.includes(".");
    replaceEntry = false;
    truncateDisplayDigits();
    render();
    return;
  }
  if (displayDigits === "0" && d !== ".") {
    displayDigits = d;
  } else if (displayDigits === "-0" && d !== ".") {
    displayDigits = "-" + d;
  } else {
    displayDigits += d;
  }
  truncateDisplayDigits();
  render();
}

function dot() {
  if (replaceEntry) {
    displayDigits = "0.";
    dotUsed = true;
    replaceEntry = false;
    render();
    return;
  }
  if (!dotUsed) {
    dotUsed = true;
    if (displayDigits === "" || displayDigits === "-" || displayDigits === "0" || displayDigits === "-0")
      displayDigits = displayDigits.startsWith("-") ? "-0." : "0.";
    else if (!displayDigits.includes(".")) displayDigits += ".";
  }
  render();
}

function backspace() {
  if (replaceEntry) return;
  displayDigits = displayDigits.slice(0, -1);
  if (displayDigits === "" || displayDigits === "-") displayDigits = "0";
  dotUsed = displayDigits.includes(".");
  render();
}

function allClear() {
  accumulator = null;
  pendingOp = null;
  replaceEntry = false;
  displayDigits = "0";
  dotUsed = false;
  render();
}

function operator(sym) {
  const opMap = { add: "+", sub: "-", mul: "*", div: "/" };
  const op = opMap[sym];

  const rightNow = displayNumberParsed();
  if (!Number.isFinite(rightNow)) {
    replaceEntry = true;
    pendingOp = op;
    displayDigits = "0";
    dotUsed = false;
    render();
    return;
  }

  if (accumulator === null || replaceEntry) {
    accumulator = rightNow;
  } else if (pendingOp !== null) {
    const left = accumulator;
    let out = applyPendingOp(left, rightNow, pendingOp);
    if (!Number.isFinite(out)) {
      showError("Cannot divide by zero.");
      allClear();
      return;
    }
    accumulator = out;
    displayDigits = formatResultString(out);
    dotUsed = displayDigits.includes(".");
  } else {
    accumulator = rightNow;
  }

  pendingOp = op;
  replaceEntry = true;
  render();
}

function equals() {
  if (pendingOp === null || accumulator === null) {
    replaceEntry = true;
    render();
    return;
  }

  const rightNow = displayNumberParsed();
  if (!Number.isFinite(rightNow)) {
    render();
    return;
  }

  const out = applyPendingOp(accumulator, rightNow, pendingOp);
  if (!Number.isFinite(out)) {
    showError("Cannot divide by zero.");
    allClear();
    return;
  }

  displayDigits = formatResultString(out);
  dotUsed = displayDigits.includes(".");
  accumulator = null;
  pendingOp = null;
  replaceEntry = true;
  render();
}

function onConvert() {
  const n = displayNumberParsed();
  if (!Number.isFinite(n)) {
    showError("Enter a valid number to convert.");
    return;
  }
  if (!Number.isFinite(getRate())) {
    showError("Set a positive USD → IDR rate first.");
    return;
  }
  replaceEntry = false;
  applyDual(n);
}

function addToRunningTotal() {
  const n = displayNumberParsed();
  if (!Number.isFinite(n)) {
    showError("Enter a valid number on the calculator before adding.");
    return;
  }
  const rate = getRate();
  if (!Number.isFinite(rate)) {
    showError("Set a valid USD → IDR rate before adding to the running total.");
    return;
  }

  const cur = els.calcCurrency.value === "IDR" ? "IDR" : "USD";
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  runningEntries.push({
    id,
    amount: n,
    currency: cur,
    rateIdrPerUsd: rate,
  });
  persistRunningEntries();
  renderRunningTotal();
}

function isTypingInFormControl() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

function onCalcKeydown(e) {
  if (isTypingInFormControl()) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const code = e.code;
  const key = e.key;

  const numpadDigit = /^Numpad(\d)$/.exec(code);
  if (numpadDigit) {
    e.preventDefault();
    digit(numpadDigit[1]);
    return;
  }

  if (key.length === 1 && key >= "0" && key <= "9") {
    e.preventDefault();
    digit(key);
    return;
  }

  if (key === "." || key === "," || code === "NumpadDecimal") {
    e.preventDefault();
    dot();
    return;
  }

  switch (key) {
    case "+":
    case "*":
    case "/":
      e.preventDefault();
      if (key === "+") operator("add");
      else if (key === "*") operator("mul");
      else operator("div");
      return;
    case "-":
      e.preventDefault();
      operator("sub");
      return;
    case "Enter":
    case "=":
      e.preventDefault();
      equals();
      return;
    case "Escape":
      e.preventDefault();
      allClear();
      return;
    case "Backspace":
      e.preventDefault();
      backspace();
      return;
    case "Delete":
      e.preventDefault();
      backspace();
      return;
    default:
      break;
  }

  switch (code) {
    case "NumpadAdd":
      e.preventDefault();
      operator("add");
      return;
    case "NumpadSubtract":
      e.preventDefault();
      operator("sub");
      return;
    case "NumpadMultiply":
      e.preventDefault();
      operator("mul");
      return;
    case "NumpadDivide":
      e.preventDefault();
      operator("div");
      return;
    case "NumpadEnter":
      e.preventDefault();
      equals();
      return;
    default:
      break;
  }
}

document.addEventListener("keydown", onCalcKeydown);

els.calcCurrency.addEventListener("change", () => {
  persistCurrency();
  render();
});

els.rate.addEventListener("input", () => {
  persistRateOnly();
  render();
});
els.rate.addEventListener("change", () => {
  persistRateOnly();
  render();
});

els.refreshRate.addEventListener("click", async () => {
  els.refreshRate.disabled = true;
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=IDR");
    if (!res.ok) throw new Error("Rate request failed");
    const data = await res.json();
    const rate = data?.rates?.IDR;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0)
      throw new Error("Unexpected response");
    els.rate.value = String(Math.round(rate * 100) / 100);
    els.error.classList.remove("visible");
    persistRateOnly();
    render();
  } catch {
    showError("Could not fetch rate. Adjust manually or try again.");
  } finally {
    els.refreshRate.disabled = false;
  }
});

els.keypad.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const d = btn.dataset.digit;
  if (d !== undefined) {
    digit(d);
    return;
  }
  switch (btn.dataset.act) {
    case "dot":
      dot();
      break;
    case "backspace":
      backspace();
      break;
    case "ac":
      allClear();
      break;
    case "add":
      operator("add");
      break;
    case "sub":
      operator("sub");
      break;
    case "mul":
      operator("mul");
      break;
    case "div":
      operator("div");
      break;
    case "eq":
      equals();
      break;
    default:
      break;
  }
});

els.btnConvert.addEventListener("click", onConvert);
els.btnAddRt.addEventListener("click", addToRunningTotal);

els.rtList.addEventListener("click", (e) => {
  const btn = e.target.closest(".rt-remove");
  if (!btn) return;
  const id = btn.dataset.removeId;
  if (!id) return;
  runningEntries = runningEntries.filter((x) => x.id !== id);
  persistRunningEntries();
  renderRunningTotal();
});

els.rtClear.addEventListener("click", () => {
  runningEntries = [];
  persistRunningEntries();
  renderRunningTotal();
});

load();
render();
