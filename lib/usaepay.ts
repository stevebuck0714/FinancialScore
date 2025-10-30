import crypto from 'crypto';

// USAePay API Configuration
const USAEPAY_API_KEY = process.env.USAEPAY_API_KEY || '';
const USAEPAY_PIN = process.env.USAEPAY_PIN || '';
const USAEPAY_SOURCE_KEY = process.env.USAEPAY_SOURCE_KEY || '';
const USAEPAY_SANDBOX = process.env.USAEPAY_SANDBOX === 'true';

// USAePay API Endpoints
// The API key is part of the URL path
const USAEPAY_API_URL = USAEPAY_SANDBOX 
  ? `https://sandbox.usaepay.com/api/${USAEPAY_API_KEY}`
  : `https://secure.usaepay.com/api/${USAEPAY_API_KEY}`;

export interface PaymentDetails {
  amount: number;
  cardNumber: string;
  expirationMonth: string;
  expirationYear: string;
  cvv: string;
  cardholderName: string;
  billingAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  description?: string;
  invoice?: string;
  customerId?: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  message?: string;
  error?: string;
  amount?: number;
  cardType?: string;
  last4?: string;
}

/**
 * Process a credit card payment through USAePay
 */
export async function processPayment(paymentDetails: PaymentDetails): Promise<PaymentResponse> {
  try {
    // Validate environment variables
    if (!USAEPAY_API_KEY || !USAEPAY_PIN) {
      console.error('USAePay credentials not configured');
      return {
        success: false,
        error: 'Payment processing is not configured. Please contact support.',
      };
    }

    // Format expiration date (MMYY format)
    const expiration = `${paymentDetails.expirationMonth.padStart(2, '0')}${paymentDetails.expirationYear.slice(-2)}`;

    // Build the transaction request (matching USAePay API format)
    const transactionData = {
      command: 'cc:sale',
      amount: paymentDetails.amount.toFixed(2),
      creditcard: {
        cardholder: paymentDetails.cardholderName,
        number: paymentDetails.cardNumber.replace(/\s/g, ''),
        expiration: expiration,
        cvc: paymentDetails.cvv,
        avs_street: paymentDetails.billingAddress.street,
        avs_zip: paymentDetails.billingAddress.zip,
      },
      invoice: paymentDetails.invoice || `INV-${Date.now()}`,
    };

    // Make API request to USAePay
    // The API key is in the URL path, PIN is in Authorization header
    const base64Pin = Buffer.from(`:${USAEPAY_PIN}`).toString('base64');
    
    console.log('USAePay Request:', {
      url: `${USAEPAY_API_URL}/transactions`,
      sandbox: USAEPAY_SANDBOX,
      hasApiKey: !!USAEPAY_API_KEY,
      hasPin: !!USAEPAY_PIN,
    });
    
    const response = await fetch(`${USAEPAY_API_URL}/transactions`, {
      method: 'POST',
      headers: {
        'User-Agent': 'uelib v6.8',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${base64Pin}`,
      },
      body: JSON.stringify(transactionData),
    });

    const result = await response.json();
    
    console.log('USAePay Response:', {
      status: response.status,
      ok: response.ok,
      result: result,
    });

    // Check if transaction was successful
    if (response.ok && result.status === 'Approved') {
      return {
        success: true,
        transactionId: result.key || result.refnum,
        authCode: result.authcode,
        message: result.result || 'Payment processed successfully',
        amount: paymentDetails.amount,
        cardType: result.cardtype,
        last4: result.cc_number ? result.cc_number.slice(-4) : undefined,
      };
    } else {
      // Transaction failed
      return {
        success: false,
        error: result.error || result.result || 'Payment was declined',
        message: result.error_description || result.result || 'Please check your payment information',
      };
    }
  } catch (error) {
    console.error('USAePay API Error:', error);
    return {
      success: false,
      error: 'Payment processing error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Validate card number using Luhn algorithm
 */
export function validateCardNumber(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\s/g, '');
  
  if (!/^\d+$/.test(digits) || digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Get card type from card number
 */
export function getCardType(cardNumber: string): string {
  const digits = cardNumber.replace(/\s/g, '');
  
  if (/^4/.test(digits)) return 'Visa';
  if (/^5[1-5]/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^6(?:011|5)/.test(digits)) return 'Discover';
  
  return 'Unknown';
}

/**
 * Format card number with spaces
 */
export function formatCardNumber(cardNumber: string): string {
  const digits = cardNumber.replace(/\s/g, '');
  const groups = digits.match(/.{1,4}/g);
  return groups ? groups.join(' ') : digits;
}

/**
 * Validate expiration date
 */
export function validateExpirationDate(month: string, year: string): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const expMonth = parseInt(month, 10);
  const expYear = parseInt(year, 10);

  if (expMonth < 1 || expMonth > 12) {
    return false;
  }

  // Handle 2-digit or 4-digit year
  const fullYear = expYear < 100 ? 2000 + expYear : expYear;

  if (fullYear < currentYear) {
    return false;
  }

  if (fullYear === currentYear && expMonth < currentMonth) {
    return false;
  }

  return true;
}

/**
 * Check if USAePay is configured
 */
export function isUsaepayConfigured(): boolean {
  return !!(USAEPAY_API_KEY && USAEPAY_PIN);
}

/**
 * Get USAePay configuration status
 */
export function getUsaepayStatus() {
  return {
    configured: isUsaepayConfigured(),
    sandbox: USAEPAY_SANDBOX,
    message: isUsaepayConfigured() 
      ? `USAePay configured (${USAEPAY_SANDBOX ? 'Sandbox' : 'Production'} mode)`
      : 'USAePay credentials not configured in environment variables',
  };
}
