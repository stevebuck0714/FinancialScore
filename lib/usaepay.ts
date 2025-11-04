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
  companyName?: string; // Company name for customer profile
  saveCustomer?: boolean; // Set to true to save customer and payment method
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
  custkey?: string; // USAePay customer ID (returned when save_customer is true)
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
    const transactionData: any = {
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

    // Add customer save flags if requested
    if (paymentDetails.saveCustomer) {
      transactionData.save_customer = true;
      transactionData.save_customer_paymethod = true;
      
      // Split cardholder name for customer profile
      const nameParts = paymentDetails.cardholderName.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Add billing address with customer details for profile
      transactionData.billing_address = {
        first_name: firstName,
        last_name: lastName,
        street: paymentDetails.billingAddress.street,
        city: paymentDetails.billingAddress.city,
        state: paymentDetails.billingAddress.state,
        postalcode: paymentDetails.billingAddress.zip,
        ...(paymentDetails.companyName && { company: paymentDetails.companyName }),
      };
      
      // Add customer ID for reference
      if (paymentDetails.customerId) {
        transactionData.customerid = paymentDetails.customerId;
      }
    }

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
    if (response.ok && (result.result === 'Approved' || result.result_code === 'A')) {
      return {
        success: true,
        transactionId: result.key || result.refnum,
        authCode: result.authcode,
        message: result.result || 'Payment processed successfully',
        amount: paymentDetails.amount,
        cardType: result.creditcard?.type || result.cardtype,
        last4: result.creditcard?.number ? result.creditcard.number.replace(/x/g, '').slice(-4) : undefined,
        custkey: result.customer?.custkey || result.custkey, // Customer ID if saved
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

    console.log(`📡 USAePay ${method} ${endpoint}`, data ? JSON.stringify(data, null, 2) : '');

    const response = await fetch(`${USAEPAY_API_URL}${endpoint}`, options);
    const responseText = await response.text();
    
    console.log(`📥 USAePay Response [${response.status}]:`, responseText);

    let result;
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      console.error('Failed to parse USAePay response:', parseError);
      throw new Error('Invalid response from payment processor');
    }

    if (!response.ok) {
      const errorMsg = result.error || result.message || `API Error: ${response.status}`;
      console.error(`❌ USAePay API Error [${response.status}]:`, result);
      throw new Error(errorMsg);
    }

    return result;
  } catch (error) {
    console.error('USAePay API Error:', error);
    throw error;
  }
}

// ============= CUSTOMER VAULT =============

/**
 * Retrieve customer details including payment methods
 */
export async function getCustomerPaymentMethod(custkey: string): Promise<{ success: boolean; paymentMethodKey?: string; error?: string }> {
  try {
    console.log(`🔍 Retrieving payment method for customer: ${custkey}`);
    
    // Request payment_methods and billing_schedules to be included in response
    const result = await usaepayRequest(`/customers/${custkey}?expand=payment_methods,billing_schedules`, 'GET');
    
    console.log('📥 Customer details retrieved:', result);
    console.log('📦 Payment methods count:', result.payment_methods?.length || 0);
    console.log('📅 Billing schedules count:', result.billing_schedules?.length || 0);
    console.log('📅 Billing schedules:', JSON.stringify(result.billing_schedules || [], null, 2));
    
    // Extract payment method key from the first payment method
    const paymentMethodKey = result.payment_methods?.[0]?.key || result.payment_methods?.[0]?.methodid;
    
    if (!paymentMethodKey) {
      console.error('❌ No payment method found for customer');
      return {
        success: false,
        error: 'No payment method found for customer',
      };
    }
    
    console.log(`✅ Payment method key retrieved: ${paymentMethodKey}`);
    
    return {
      success: true,
      paymentMethodKey,
    };
  } catch (error) {
    console.error('❌ Get Customer Payment Method Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve payment method',
    };
  }
}

export interface CustomerVaultData {
  companyId: string;
  companyName?: string;
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

    // Split cardholder name into first and last name
    // First word = first name, everything else = last name
    const nameParts = customerData.cardholderName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

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
      customer_id: customerData.companyId,
      first_name: firstName,
      last_name: lastName,
      ...(customerData.companyName && { company: customerData.companyName }),
      // Customer billing address (top-level fields for customer profile)
      street: customerData.billingAddress.street,
      city: customerData.billingAddress.city,
      state: customerData.billingAddress.state,
      zip: customerData.billingAddress.zip,
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
  customerId: string; // USAePay customer key (custkey)
  paymentMethodId: string; // USAePay payment method key
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

    // Format next billing date as YYYY-MM-DD
    const nextDate = billingData.startDate || new Date();
    const nextDateFormatted = nextDate.toISOString().split('T')[0];

    // Build recurring billing schedule (using USAePay API v2 format)
    // According to USAePay docs, use customer-specific endpoint
    const recurringData = {
      paymethod_key: billingData.paymentMethodId, // Payment method key (note: paymethod_key not paymethod)
      amount: billingData.amount.toFixed(2),
      frequency: scheduleMap[billingData.schedule], // Use 'frequency' not 'schedule'
      enabled: true,
      next_date: nextDateFormatted, // Use 'next_date' in YYYY-MM-DD format
      numleft: 0, // 0 = unlimited payments (runs until manually canceled)
      description: billingData.description,
    };

    console.log('🔄 Creating recurring billing schedule:', JSON.stringify(recurringData, null, 2));

    // Try legacy /recurring endpoint first (some accounts may not have billing_schedules enabled)
    // If this works, USAePay support can help migrate to the newer endpoint
    const legacyRecurringData = {
      custkey: billingData.customerId,
      paymethod: billingData.paymentMethodId,
      amount: billingData.amount.toFixed(2),
      schedule: scheduleMap[billingData.schedule],
      enabled: true,
      next: nextDateFormatted,
      numleft: 0,
      description: billingData.description,
    };
    
    console.log('🔄 Trying legacy /recurring endpoint:', JSON.stringify(legacyRecurringData, null, 2));
    
    let result;
    try {
      // Try customer-specific endpoint first: /customers/:custkey:/billing_schedules
      result = await usaepayRequest(`/customers/${billingData.customerId}/billing_schedules`, 'POST', recurringData);
    } catch (error: any) {
      console.warn('⚠️ Customer-specific billing_schedules endpoint failed, trying legacy /recurring endpoint');
      console.warn('Error:', error.message);
      // Fall back to legacy /recurring endpoint
      result = await usaepayRequest('/recurring', 'POST', legacyRecurringData);
    }

    console.log('✅ Recurring billing schedule created:', result);

    return {
      success: true,
      billingId: result.key || result.schedulekey,
      nextBillingDate: result.next ? new Date(result.next) : undefined,
    };
  } catch (error) {
    console.error('❌ Create Recurring Billing Error:', error);
    console.error('Error details:', error instanceof Error ? error.message : error);
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
      updateData.frequency = scheduleMap[updates.schedule]; // Use 'frequency' not 'schedule'
    }

    if (updates.description) {
      updateData.description = updates.description;
    }

    // If customerId is provided in updates, use customer-specific endpoint
    if (updates.customerId) {
      const result = await usaepayRequest(`/customers/${updates.customerId}/billing_schedules/${billingId}`, 'PUT', updateData);
      return {
        success: true,
        billingId: result.key || billingId,
        nextBillingDate: result.next_date ? new Date(result.next_date) : undefined,
      };
    }

    // Fall back to old endpoint for backwards compatibility
    const result = await usaepayRequest(`/recurring/${billingId}`, 'PUT', updateData);

    return {
      success: true,
      billingId: result.key || billingId,
      nextBillingDate: result.next_date || result.next ? new Date(result.next_date || result.next) : undefined,
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
 * @param billingId - The billing schedule ID
 * @param customerId - Optional customer ID for using customer-specific endpoint
 */
export async function cancelRecurringBilling(billingId: string, customerId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    // USAePay disables recurring billing by setting enabled=false
    if (customerId) {
      // Use customer-specific endpoint
      await usaepayRequest(`/customers/${customerId}/billing_schedules/${billingId}`, 'PUT', { enabled: false });
    } else {
      // Fall back to old endpoint for backwards compatibility
      await usaepayRequest(`/recurring/${billingId}`, 'PUT', { enabled: false });
    }
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
 * @param billingId - The billing schedule ID
 * @param customerId - Optional customer ID for using customer-specific endpoint
 */
export async function getRecurringBillingStatus(billingId: string, customerId?: string) {
  try {
    let result;
    if (customerId) {
      // Use customer-specific endpoint
      result = await usaepayRequest(`/customers/${customerId}/billing_schedules/${billingId}`, 'GET');
    } else {
      // Fall back to old endpoint for backwards compatibility
      result = await usaepayRequest(`/recurring/${billingId}`, 'GET');
    }
    
    return {
      success: true,
      enabled: result.enabled,
      amount: result.amount,
      schedule: result.schedule || result.frequency,
      next: result.next_date || result.next ? new Date(result.next_date || result.next) : null,
      last: result.last_date || result.last ? new Date(result.last_date || result.last) : null,
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
