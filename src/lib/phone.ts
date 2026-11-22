// Strips everything but digits and folds a leading UK "44" country code into "0",
// so "07700 900123", "+44 7700 900123" and "447700900123" all match the same
// customer record. Shared by the POS, the API and the website.
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("44")) return "0" + digits.slice(2);
  return digits;
}
