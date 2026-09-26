import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export const formatPeso = (n: number): string => peso.format(n);

/** Round to centavos without floating point drift. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const formatQty = (n: number, unit: string): string =>
  `${Number.isInteger(n) ? n : n.toFixed(2)} ${unit}`;

export const newId = (): string => crypto.randomUUID();

/** Parses user-typed numbers; returns 0 for blanks or junk. */
export const toNumber = (s: string): number => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
