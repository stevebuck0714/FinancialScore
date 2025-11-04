import crypto from 'crypto';

// USAePay API Configuration
const USAEPAY_API_KEY = process.env.USAEPAY_API_KEY || '';
const USAEPAY_PIN = process.env.USAEPAY_PIN || '';
const USAEPAY_SOURCE_KEY = process.env.USAEPAY_SOURCE_KEY || '';
const USAEPAY_SANDBOX = process.env.USAEPAY_SANDBOX === 'true';

// USAePay API Endpoints
const USAEPAY_API_URL = USAEPAY_SANDBOX 
  ? `https://sandbox.usaepay.com/api/v2`
  : `https://usaepay.com/api/v2`;

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
    if (!USAEPAY_SOURCE_KEY || !USAEPAY_PIN) {
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
    // USAePay v2 REST API uses source key authentication with seed-based hashing
    const seed = Math.random().toString(36).substring(2, 15);
    const prehash = `${USAEPAY_SOURCE_KEY}${seed}${USAEPAY_PIN || ''}`;
    const hash = crypto.createHash('sha256').update(prehash).digest('hex');
    const apiHash = `s2/${seed}/${hash}`;
    const authString = `${USAEPAY_SOURCE_KEY}:${apiHash}`;
    const base64Auth = Buffer.from(authString).toString('base64');
    
    console.log('USAePay Request:', {
      url: `${USAEPAY_API_URL}/transactions`,
      sandbox: USAEPAY_SANDBOX,
      hasSourceKey: !!USAEPAY_SOURCE_KEY,
      hasPin: !!USAEPAY_PIN,
      transactionData: transactionData,
      authMethod: 'Basic (source key + seed-based hash)',
    });
    
    const response = await fetch(`${USAEPAY_API_URL}/transactions`, {
      method: 'POST',
      headers: {
        'User-Agent': 'uelib v6.8',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${base64Auth}`,
      },
      body: JSON.stringify(transactionData),
    });

    // Get response text first to handle empty responses
    const responseText = await response.text();
    console.log('USAePay Raw Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      body: responseText,
    });

    // Try to parse JSON
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('Failed to parse USAePay response:', parseError);
      return {
        success: false,
        error: 'Invalid response from payment processor',
        message: `Status: ${response.status} - ${response.statusText}`,
      };
    }
    
    console.log('USAePay Parsed Response:', {
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
    } else if (response.ok && (!result || Object.keys(result).length === 0)) {
      // Empty response - likely gateway configuration issue
      return {
        success: false,
        error: 'Gateway configuration error',
        message: 'The payment gateway returned an empty response. Please verify your USAePay account is configured with a payment processor (First Data/Fiserv) and the API key is active.',
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
 * Create authentication hash for USAePay API
 */
function createAuthHash(): string {
  const seed = Math.random().toString(36).substring(2, 15);
  const prehash = `${USAEPAY_SOURCE_KEY}${seed}${USAEPAY_PIN || ''}`;
  const hash = crypto.createHash('sha256').update(prehash).digest('hex');
  return `s2/${seed}/${hash}`;
}

/**
 * Make authenticated request to USAePay API
 */
async function usaepayRequest(endpoint: string, method: string = 'GET', data?: any) {
  try {
    if (!USAEPAY_SOURCE_KEY || !USAEPAY_PIN) {
      throw new Error('USAePay credentials not configured');
    }

    const apiHash = createAuthHash();
    const authString = `${USAEPAY_SOURCE_KEY}:${apiHash}`;
    const base64Auth = Buffer.from(authString).toString('base64');

    const options: RequestInit = {
      method,
      headers: {
        'User-Agent': 'uelib v6.8',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${base64Auth}`,
      },
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${USAEPAY_API_URL}${endpoint}`, options);
    const responseText = await response.text();
    
    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('Failed to parse USAePay response:', parseError);
      throw new Error('Invalid response from payment processor');
    }

    if (!response.ok) {
      throw new Error(result.error || result.message || `API Error: ${response.status}`);
    }

    return result;
  } catch (error) {
    console.error('USAePay API Error:', error);
    throw error;
  }
}

// ============= CUSTOMER VAULT =============

export interface CustomerVaultData {
  companyId: string;
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
  email?: string;
  phone?: string;
}

export interface CustomerVaultResponse {
  success: boolean;
  customerId?: string;
  cardLast4?: string;
  cardType?: string;
  error?: string;
}

/**
 * Add customer to vault (securely store payment method)
 */
export async function addCustomerToVault(customerData: CustomerVaultData): Promise<CustomerVaultResponse> {
  try {
    const expiration = `${customerData.expirationMonth.padStart(2, '0')}${customerData.expirationYear.slice(-2)}`;

    const vaultData = {
      command: 'cc:save',
      creditcard: {
        cardholder: customerData.cardholderName,
        number: customerData.cardNumber.replace(/\s/g, ''),
        expiration: expiration,
        cvc: customerData.cvv,
        avs_street: customerData.billingAddress.street,
        avs_zip: customerData.billingAddress.zip,
      },
      billing_address: {
        street: customerData.billingAddress.street,
        city: customerData.billingAddress.city,
        state: customerData.billingAddress.state,
        zip: customerData.billingAddress.zip,
      },
      customer_id: customerData.companyId,
      ...(customerData.email && { email: customerData.email }),
      ...(customerData.phone && { phone: customerData.phone }),
    };

    const result = await usaepayRequest('/customers', 'POST', vaultData);

    return {
      success: true,
      customerId: result.key || result.customer_number,
      cardLast4: result.cc_number ? result.cc_number.slice(-4) : undefined,
      cardType: result.cardtype,
    };
  } catch (error) {
    console.error('Customer Vault Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save payment method',
    };
  }
}

/**
 * Update customer payment method in vault
 */
export async function updateCustomerVault(
  customerId: string,
  customerData: Partial<CustomerVaultData>
): Promise<CustomerVaultResponse> {
  try {
    const updateData: any = {};

    if (customerData.cardNumber) {
      const expiration = `${customerData.expirationMonth?.padStart(2, '0')}${customerData.expirationYear?.slice(-2)}`;
      updateData.creditcard = {
        cardholder: customerData.cardholderName,
        number: customerData.cardNumber.replace(/\s/g, ''),
        expiration: expiration,
        cvc: customerData.cvv,
      };
    }

    if (customerData.billingAddress) {
      updateData.billing_address = {
        street: customerData.billingAddress.street,
        city: customerData.billingAddress.city,
        state: customerData.billingAddress.state,
        zip: customerData.billingAddress.zip,
      };
    }

    const result = await usaepayRequest(`/customers/${customerId}`, 'PUT', updateData);

    return {
      success: true,
      customerId: result.key || customerId,
      cardLast4: result.cc_number ? result.cc_number.slice(-4) : undefined,
      cardType: result.cardtype,
    };
  } catch (error) {
    console.error('Update Customer Vault Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update payment method',
    };
  }
}

/**
 * Delete customer from vault
 */
export async function deleteCustomerFromVault(customerId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await usaepayRequest(`/customers/${customerId}`, 'DELETE');
    return { success: true };
  } catch (error) {
    console.error('Delete Customer Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete customer',
    };
  }
}

// ============= RECURRING BILLING =============

export interface RecurringBillingData {
  customerId: string;
  amount: number;
  schedule: 'monthly' | 'quarterly' | 'annual';
  description: string;
  startDate?: Date;
}

export interface RecurringBillingResponse {
  success: boolean;
  billingId?: string;
  nextBillingDate?: Date;
  error?: string;
}

/**
 * Create recurring billing schedule
 */
export async function createRecurringBilling(billingData: RecurringBillingData): Promise<RecurringBillingResponse> {
  try {
    // Map schedule to USAePay frequency
    const scheduleMap = {
      monthly: 'monthly',
      quarterly: 'quarterly',
      annual: 'annually',
    };

    const recurringData = {
      customer: billingData.customerId,
      amount: billingData.amount.toFixed(2),
      schedule: scheduleMap[billingData.schedule],
      description: billingData.description,
      enabled: true,
      next: billingData.startDate || new Date(),
    };

    const result = await usaepayRequest('/recurring', 'POST', recurringData);

    return {
      success: true,
      billingId: result.key || result.schedule_id,
      nextBillingDate: result.next ? new Date(result.next) : undefined,
    };
  } catch (error) {
    console.error('Create Recurring Billing Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create recurring billing',
    };
  }
}

/**
 * Update recurring billing schedule
 */
export async function updateRecurringBilling(
  billingId: string,
  updates: Partial<RecurringBillingData>
): Promise<RecurringBillingResponse> {
  try {
    const updateData: any = {};

    if (updates.amount !== undefined) {
      updateData.amount = updates.amount.toFixed(2);
    }

    if (updates.schedule) {
      const scheduleMap = {
        monthly: 'monthly',
        quarterly: 'quarterly',
        annual: 'annually',
      };
      updateData.schedule = scheduleMap[updates.schedule];
    }

    if (updates.description) {
      updateData.description = updates.description;
    }

    const result = await usaepayRequest(`/recurring/${billingId}`, 'PUT', updateData);

    return {
      success: true,
      billingId: result.key || billingId,
      nextBillingDate: result.next ? new Date(result.next) : undefined,
    };
  } catch (error) {
    console.error('Update Recurring Billing Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update recurring billing',
    };
  }
}

/**
 * Cancel recurring billing schedule
 */
export async function cancelRecurringBilling(billingId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // USAePay disables recurring billing by setting enabled=false
    await usaepayRequest(`/recurring/${billingId}`, 'PUT', { enabled: false });
    return { success: true };
  } catch (error) {
    console.error('Cancel Recurring Billing Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel recurring billing',
    };
  }
}

/**
 * Get recurring billing status
 */
export async function getRecurringBillingStatus(billingId: string) {
  try {
    const result = await usaepayRequest(`/recurring/${billingId}`, 'GET');
    return {
      success: true,
      enabled: result.enabled,
      amount: result.amount,
      schedule: result.schedule,
      next: result.next ? new Date(result.next) : null,
      last: result.last ? new Date(result.last) : null,
    };
  } catch (error) {
    console.error('Get Recurring Billing Status Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get billing status',
    };
  }
}

/**
 * Check if USAePay is configured
 */
export function isUsaepayConfigured(): boolean {
  return !!(USAEPAY_SOURCE_KEY && USAEPAY_PIN);
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
