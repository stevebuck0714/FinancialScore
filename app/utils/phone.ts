/**
 * Formats a phone number to (XXX) XXX-XXXX format
 * @param value - The input value to format
 * @returns Formatted phone number string
 */
export function formatPhoneNumber(value: string): string {
  // Remove all non-numeric characters
  const numbers = value.replace(/\D/g, '');
  
  // Limit to 10 digits
  const limited = numbers.slice(0, 10);
  
  // Format based on length
  if (limited.length === 0) {
    return '';
  } else if (limited.length <= 3) {
    return `(${limited}`;
  } else if (limited.length <= 6) {
    return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  } else {
    return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
  }
}

/**
 * Extracts only the numeric digits from a formatted phone number
 * @param formattedPhone - The formatted phone number
 * @returns Just the digits
 */
export function extractPhoneDigits(formattedPhone: string): string {
  return formattedPhone.replace(/\D/g, '');
}

