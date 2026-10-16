import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * English / Tagalog for the cashier screens. English text is the key, so a
 * missing translation simply shows the English. Owner-only screens stay in
 * English. Use {name} placeholders for values: t("{n} left", { n: 5 }).
 */
export type Lang = "en" | "tl";
type Vars = Record<string, string | number>;

const STORAGE_KEY = "bakery-pos-lang";

const TL: Record<string, string> = {
  // Navigation + header
  Sell: "Magbenta",
  Sales: "Mga Benta",
  Orders: "Mga Order",
  Drawer: "Kaha",
  Stock: "Stock",
  Transfers: "Transfer",
  Dashboard: "Dashboard",
  Reports: "Ulat",
  Products: "Produkto",
  Staff: "Staff",
  More: "Iba pa",
  "Sign out": "Mag-sign out",
  Online: "Online",
  Offline: "Offline",
  "Offline, {n} sale(s) saved on this device": "Offline, {n} benta ang naka-save sa device",
  "Uploading {n} sale(s)": "Ina-upload ang {n} benta",
  "{n} sale(s) need review": "{n} benta ang kailangang suriin",
  Close: "Isara",
  "Low stock": "Paubos na",
  "Nothing is running low.": "Walang paubos na stock.",
  "See stock": "Tingnan ang stock",
  "Choose a branch": "Pumili ng branch",
  "Pick the branch you are selling for.": "Piliin ang branch kung saan ka magbebenta.",

  // Login
  "Welcome!": "Maligayang pagdating!",
  "Sign in to start selling.": "Mag-sign in para magsimulang magbenta.",
  Password: "Password",
  "Sign in": "Mag-sign in",
  "Signing in...": "Nagsa-sign in...",
  "Visit our Facebook page": "Bisitahin ang aming Facebook page",
  "Email or password is incorrect. Ask your branch manager to reset it if needed.":
    "Mali ang email o password. Magpa-reset sa branch manager kung kailangan.",

  // Open drawer
  "Open the cash drawer": "Buksan ang kaha",
  "Do this once at the start of your shift. Count the cash in the {branch} drawer and enter it below, so the cash can be checked when you close the drawer.":
    "Gawin ito isang beses sa simula ng shift mo. Bilangin ang pera sa kaha ng {branch} at ilagay sa ibaba, para ma-check ang pera pagsara ng kaha.",
  "Starting cash": "Panimulang pera",
  "Open drawer with {amount}": "Buksan ang kaha na may {amount}",
  "Just monitoring?": "Titingin lang?",
  "You don't need to open a drawer to see this branch's sales and stock.":
    "Hindi kailangang buksan ang kaha para makita ang benta at stock ng branch na ito.",
  "Today's sales": "Benta ngayon",

  // Selling
  "Search item or scan barcode": "Hanapin o i-scan ang barcode",
  All: "Lahat",
  "{n} left": "{n} natitira",
  "Only {n} left": "{n} na lang",
  "Sold out": "Ubos na",
  "in this order": "sa order na ito",
  'No products match "{q}". Check the spelling or scan again.':
    'Walang produktong tugma sa "{q}". Tingnan ang spelling o i-scan ulit.',
  "Loading products...": "Kinukuha ang mga produkto...",
  "Offline: showing the last saved stock list": "Offline: huling na-save na listahan ng stock",
  "No product with code {code}": "Walang produkto na may code na {code}",
  "Current order": "Kasalukuyang order",
  "Clear all": "Burahin lahat",
  "Remove all items from this order?": "Alisin lahat ng item sa order na ito?",
  "No items yet": "Wala pang item",
  "Tap a product to add it to this order.": "Pindutin ang produkto para idagdag sa order.",
  "{price} each": "{price} bawat isa",
  "Remove one {name}": "Bawasan ng isa ang {name}",
  "Add one {name}": "Dagdagan ng isa ang {name}",
  "Remove {name} from sale": "Alisin ang {name} sa benta",
  "{n} item": "{n} item",
  "{n} items": "{n} item",
  "Subtotal ({items})": "Subtotal ({items})",
  Discount: "Diskwento",
  Total: "Kabuuan",
  "Pay {amount}": "Bayaran {amount}",
  "Add items to start": "Magdagdag muna ng item",
  "Open the cash drawer before selling.": "Buksan muna ang kaha bago magbenta.",

  // Payment
  Payment: "Bayad",
  "Back to order": "Balik sa order",
  "Amount to pay": "Babayaran",
  "includes {amount} discount": "kasama ang {amount} na diskwento",
  None: "Wala",
  "How is the customer paying?": "Paano magbabayad ang customer?",
  Cash: "Cash",
  "Cash received": "Tinanggap na pera",
  Change: "Sukli",
  "{method} reference no.": "Reference no. ng {method}",
  "From the customer's receipt": "Mula sa resibo ng customer",
  "Customer name": "Pangalan ng customer",
  "Senior citizen ID no.": "Senior citizen ID no.",
  "PWD ID no.": "PWD ID no.",
  "Complete sale": "Tapusin ang benta",
  "Saving sale...": "Sine-save ang benta...",
  "Add at least one item.": "Magdagdag ng kahit isang item.",
  "Enter the cash received, or tap an amount.": "Ilagay ang tinanggap na pera, o pumili ng halaga.",
  "Cash is short by {amount}.": "Kulang ng {amount} ang pera.",
  "Enter the reference number from the customer's receipt.":
    "Ilagay ang reference number mula sa resibo ng customer.",
  "Enter the customer's name and ID number for the discount.":
    "Ilagay ang pangalan at ID number ng customer para sa diskwento.",

  // Sale complete + receipts
  "Sale complete": "Tapos na ang benta",
  "{amount} paid by {method}": "{amount} bayad sa {method}",
  "Give change": "Ibigay ang sukli",
  "Receipt no. {no}": "Resibo no. {no}",
  "Saved on this device. It will upload when the internet is back.":
    "Naka-save sa device na ito. Ia-upload kapag may internet na.",
  "Start new sale": "Bagong benta",
  "Print receipt": "I-print ang resibo",

  // Sales list
  Today: "Ngayon",
  Yesterday: "Kahapon",
  Receipt: "Resibo",
  Time: "Oras",
  Cashier: "Cashier",
  Items: "Item",
  Voided: "Na-void",
  Method: "Paraan",
  "No sales for this day yet.": "Wala pang benta sa araw na ito.",
  "Tap a sale to see its items.": "Pindutin ang benta para makita ang mga item.",
  "Void sale": "I-void ang benta",
  "Why is this sale being voided?": "Bakit iv-void ang benta na ito?",
  "Reason (required)": "Dahilan (kailangan)",
  "Void this sale": "I-void ang benta",
  "Voided sales put the items back in stock.": "Ibinabalik sa stock ang mga item ng na-void na benta.",
  "Only a manager or the owner can void sales.": "Manager o may-ari lang ang puwedeng mag-void.",
  "Voided: {reason}": "Na-void: {reason}",
  Tendered: "Tinanggap",
  "Reference no.": "Reference no.",
  Back: "Bumalik",
  Cancel: "Kanselahin",

  // Special orders
  "Special orders": "Mga special order",
  "Cakes and bulk orders with a deposit and pickup date.":
    "Mga cake at maramihang order na may deposito at petsa ng pagkuha.",
  "New order": "Bagong order",
  Phone: "Telepono",
  "What they ordered": "Ano ang in-order",
  "Order price": "Presyo ng order",
  "Deposit now": "Deposito ngayon",
  "Paid by": "Bayad sa",
  "Pickup date and time": "Petsa at oras ng pagkuha",
  Notes: "Tala",
  "Save order": "I-save ang order",
  Pending: "Hinihintay",
  Ready: "Handa na",
  "Picked up": "Nakuha na",
  Cancelled: "Kinansela",
  Upcoming: "Paparating",
  Done: "Tapos na",
  Paid: "Bayad na",
  Balance: "Balanse",
  Pickup: "Pagkuha",
  "Record payment": "Itala ang bayad",
  "Mark ready": "Handa na",
  "Mark picked up": "Nakuha na",
  "Cancel order": "Kanselahin ang order",
  "Cancel this order? Refund any deposit from the drawer as a pay-out.":
    "Kanselahin ang order? Ibalik ang deposito mula sa kaha bilang pay-out.",
  "No orders here.": "Walang order dito.",
  "Cash goes into your open drawer.": "Mapupunta ang cash sa bukas mong kaha.",
  "You have no open drawer here, so this cash will not be counted in a drawer.":
    "Wala kang bukas na kaha dito, kaya hindi ito mabibilang sa kaha.",
  Save: "I-save",
  Amount: "Halaga",

  // End of day
  "End of day": "Pagsasara ng araw",
  "End-of-day leftovers": "Tira sa pagsasara",
  "Count unsold items you will throw away or won't sell tomorrow. They are removed from stock and counted as waste.":
    "Bilangin ang hindi nabentang itatapon o hindi na ibebenta bukas. Aalisin ito sa stock at bibilangin bilang sayang.",
  "In stock": "Nasa stock",
  "Throw away": "Itatapon",
  "Save leftovers": "I-save ang tira",
  "Saved {n} item(s) as leftovers.": "Na-save ang {n} item bilang tira.",
  "Nothing to save. Enter at least one quantity.": "Walang ise-save. Maglagay ng kahit isang dami.",
  "Before closing: record leftovers": "Bago magsara: itala ang tira",
  "Only cashiers, managers, or the owner can record leftovers.":
    "Cashier, manager, o may-ari lang ang puwedeng magtala ng tira.",

  // Drawer page
  "Drawer opened {time}": "Binuksan ang kaha {time}",
  "Print X report": "I-print ang X report",
  "Cash in / out": "Pasok / labas ng pera",
  "Pay-out (supplier, expense)": "Pay-out (supplier, gastos)",
  "Pay-in (added change)": "Pay-in (dagdag na panukli)",
  "Cash drop (to safe)": "Cash drop (sa safe)",
  "Note (e.g. ice supplier)": "Tala (hal. supplier ng yelo)",
  "Record {amount}": "Itala ang {amount}",
  "Close drawer (Z report)": "Isara ang kaha (Z report)",
  "Counted cash": "Nabilang na pera",
  "Close drawer": "Isara ang kaha",
  "No open drawer. Open one from the Sell screen.": "Walang bukas na kaha. Magbukas sa Magbenta.",
  "Pick a branch to see its cash drawer.": "Pumili ng branch para makita ang kaha nito.",
  "Opening float": "Panimulang pera",
  "Gross sales": "Kabuuang benta",
  "Net sales": "Netong benta",
  "Pay-ins": "Pay-in",
  "Pay-outs": "Pay-out",
  "Cash drops": "Cash drop",
  "Expected cash in drawer": "Dapat na pera sa kaha",
  "Over / short": "Sobra / kulang",
  "Sales / voids": "Benta / void",
  "X report (shift so far)": "X report (sa ngayon)",
  "Z report (end of day)": "Z report (pagsasara)",
};

const fill = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

type LangContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (text: string, vars?: Vars) => string;
};

const LangContext = createContext<LangContextValue | null>(null);

function readLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "tl" ? "tl" : "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the choice just won't be remembered.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "tl" ? "tl" : "en";
  }, [lang]);

  const t = useCallback((text: string, vars?: Vars) => fill(lang === "tl" ? (TL[text] ?? text) : text, vars), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useT must be used inside <LanguageProvider>");
  return ctx;
}
