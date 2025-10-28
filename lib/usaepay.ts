/**
 * USAePay Payment Processing Library
 * Handles credit card processing through USAePay API
 */

export interface CardDetails {
  cardNumber: string;
  expirationMonth: string;
  expirationYear: string;
  cvv: string;
  cardHolder: string;
}

export interface BillingAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

export interface PaymentRequest {
  amount: number;
  cardDetails: CardDetails;
  billingAddress: BillingAddress;
  description: string;
  customerEmail?: string;
  orderId?: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  message: string;
  error?: string;
  rawResponse?: any;
}

/**
 * Process a payment through USAePay
 */
export async function processPayment(
  paymentRequest: PaymentRequest
): Promise<PaymentResponse> {
  const apiKey = process.env.USAEPAY_API_KEY;
  const pin = process.env.USAEPAY_API_PIN;
  const environment = process.env.USAEPAY_ENVIRONMENT || 'sandbox';
  const endpoint = environment === 'production' 
    ? 'https://secure.usaepay.com/api/v2'
    : 'https://sandbox.usaepay.com/api/v2';

  if (!apiKey || !pin) {
    return {
      success: false,
      message: 'USAePay credentials not configured',
      error: 'CONFIGURATION_ERROR'
    };
  }

  try {
    // Format card expiration
    const expiration = `${paymentRequest.cardDetails.expirationMonth.padStart(2, '0')}${paymentRequest.cardDetails.expirationYear.slice(-2)}`;

    // Build USAePay request
    const usaepayRequest = {
      command: 'sale',
      amount: paymentRequest.amount.toFixed(2),
      creditcard: {
        cardholder: paymentRequest.cardDetails.cardHolder,
        number: paymentRequest.cardDetails.cardNumber.replace(/\s/g, ''),
        expiration: expiration,
        cvv2: paymentRequest.cardDetails.cvv
      },
      billing: {
        street: paymentRequest.billingAddress.street,
        postalcode: paymentRequest.billingAddress.zip,
        city: paymentRequest.billingAddress.city,
        state: paymentRequest.billingAddress.state,
        country: paymentRequest.billingAddress.country || 'US'
      },
      description: paymentRequest.description,
      orderId: paymentRequest.orderId,
      email: paymentRequest.customerEmail,
      software: 'Corelytics Financial Score v1.0'
    };

    // Make API request to USAePay
    const response = await fetch(`${endpoint}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${apiKey}:${pin}`).toString('base64')}`
      },
      body: JSON.stringify(usaepayRequest)
    });

    const data = await response.json();

    // Handle response
    if (response.ok && data.result === 'Approved') {
      return {
        success: true,
        transactionId: data.refnum || data.transactionId,
        authCode: data.authcode,
        message: 'Payment processed successfully',
        rawResponse: data
      };
    } else {
      return {
        success: false,
        message: data.error || 'Payment declined',
        error: data.errorCode || 'PAYMENT_DECLINED',
        rawResponse: data
      };
    }
  } catch (error: any) {
    console.error('USAePay payment error:', error);
    return {
      success: false,
      message: 'Payment processing failed',
      error: error.message || 'SYSTEM_ERROR'
    };
  }
}

/**
 * Validate credit card number using Luhn algorithm
 */
export function validateCardNumber(cardNumber: string): boolean {
  const cleaned = cardNumber.replace(/\s/g, '');
  
  if (!/^\d+$/.test(cleaned)) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i]);

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
  const cleaned = cardNumber.replace(/\s/g, '');
  
  if (/^4/.test(cleaned)) return 'Visa';
  if (/^5[1-5]/.test(cleaned)) return 'Mastercard';
  if (/^3[47]/.test(cleaned)) return 'American Express';
  if (/^6(?:011|5)/.test(cleaned)) return 'Discover';
  
  return 'Unknown';
}

/**
 * Format card number for display (with spaces)
 */
export function formatCardNumber(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\s/g, '');
  const groups = cleaned.match(/.{1,4}/g) || [];
  return groups.join(' ');
}

