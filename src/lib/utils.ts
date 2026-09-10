import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes any Indian phone number into a standard 10-digit number.
 * Handles inputs like "7994875491", "+917994875491", "07994875491", "917994875491".
 */
export function getCleanIndianPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  if (digits.length === 10) {
    return digits;
  }
  return digits;
}

/**
 * Formats an Indian phone number as +91 XXXXX XXXXX.
 */
export function formatIndianPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const clean = getCleanIndianPhone(phone);
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  if (clean.length > 0) {
    return `+91 ${clean}`;
  }
  return phone;
}

/**
 * Returns standard international dialing URL (tel:+91XXXXXXXXXX)
 */
export function getTelLink(phone: string | null | undefined): string {
  const clean = getCleanIndianPhone(phone);
  return clean ? `tel:+91${clean}` : "";
}

/**
 * Returns WhatsApp click-to-chat URL (https://wa.me/91XXXXXXXXXX)
 */
export function getWhatsAppLink(phone: string | null | undefined): string {
  const clean = getCleanIndianPhone(phone);
  return clean ? `https://wa.me/91${clean}` : "";
}
