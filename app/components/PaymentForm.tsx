'use client';

import { useState } from 'react';
import { CreditCard, Lock, Loader2 } from 'lucide-react';

interface PaymentFormProps {
  amount: number;
  companyId: string;
  subscriptionPlan: string;
  billingPeriod: string;
  onSuccess: (result: any) => void;
  onError: (error: string) => void;
  onCancel: () => void;
}

export default function PaymentForm({
  amount,
  companyId,
  subscriptionPlan,
  billingPeriod,
  onSuccess,
  onError,
  onCancel
}: PaymentFormProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    cardNumber: '',
    cardHolder: '',
    expirationMonth: '',
    expirationYear: '',
    cvv: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'US'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Format card number with spaces
    if (name === 'cardNumber') {
      const cleaned = value.replace(/\s/g, '');
      const formatted = cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
      setFormData(prev => ({ ...prev, [name]: formatted }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Card number validation
    const cardNumberClean = formData.cardNumber.replace(/\s/g, '');
    if (!cardNumberClean || cardNumberClean.length < 13 || cardNumberClean.length > 19) {
      newErrors.cardNumber = 'Invalid card number';
    }

    // Cardholder name
    if (!formData.cardHolder.trim()) {
      newErrors.cardHolder = 'Cardholder name is required';
    }

    // Expiration month
    const month = parseInt(formData.expirationMonth);
    if (!month || month < 1 || month > 12) {
      newErrors.expirationMonth = 'Invalid month';
    }

    // Expiration year
    const currentYear = new Date().getFullYear();
    const year = parseInt(formData.expirationYear);
    if (!year || year < currentYear || year > currentYear + 20) {
      newErrors.expirationYear = 'Invalid year';
    }

    // CVV
    if (!formData.cvv || formData.cvv.length < 3 || formData.cvv.length > 4) {
      newErrors.cvv = 'Invalid CVV';
    }

    // Billing address
    if (!formData.street.trim()) newErrors.street = 'Street address is required';
    if (!formData.city.trim()) newErrors.city = 'City is required';
    if (!formData.state.trim()) newErrors.state = 'State is required';
    if (!formData.zip.trim()) newErrors.zip = 'ZIP code is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('/api/payments/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount,
          companyId,
          subscriptionPlan,
          billingPeriod,
          cardDetails: {
            cardNumber: formData.cardNumber.replace(/\s/g, ''),
            cardHolder: formData.cardHolder,
            expirationMonth: formData.expirationMonth.padStart(2, '0'),
            expirationYear: formData.expirationYear,
            cvv: formData.cvv
          },
          billingAddress: {
            street: formData.street,
            city: formData.city,
            state: formData.state,
            zip: formData.zip,
            country: formData.country
          }
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        onSuccess(result);
      } else {
        onError(result.error || 'Payment failed');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      onError('Payment processing failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => currentYear + i);
  const months = [
    '01', '02', '03', '04', '05', '06',
    '07', '08', '09', '10', '11', '12'
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Card Information */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg p-6 text-white">
        <div className="flex items-center mb-4">
          <CreditCard className="w-6 h-6 mr-2" />
          <h3 className="text-lg font-semibold">Payment Information</h3>
        </div>

        <div className="space-y-4">
          {/* Card Number */}
          <div>
            <label className="block text-sm font-medium mb-2">Card Number</label>
            <input
              type="text"
              name="cardNumber"
              value={formData.cardNumber}
              onChange={handleInputChange}
              placeholder="1234 5678 9012 3456"
              maxLength={19}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
            {errors.cardNumber && <p className="text-red-200 text-sm mt-1">{errors.cardNumber}</p>}
          </div>

          {/* Cardholder Name */}
          <div>
            <label className="block text-sm font-medium mb-2">Cardholder Name</label>
            <input
              type="text"
              name="cardHolder"
              value={formData.cardHolder}
              onChange={handleInputChange}
              placeholder="John Doe"
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
            {errors.cardHolder && <p className="text-red-200 text-sm mt-1">{errors.cardHolder}</p>}
          </div>

          {/* Expiration and CVV */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Month</label>
              <select
                name="expirationMonth"
                value={formData.expirationMonth}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <option value="">MM</option>
                {months.map(month => (
                  <option key={month} value={month} className="text-gray-900">{month}</option>
                ))}
              </select>
              {errors.expirationMonth && <p className="text-red-200 text-sm mt-1">{errors.expirationMonth}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Year</label>
              <select
                name="expirationYear"
                value={formData.expirationYear}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                <option value="">YYYY</option>
                {years.map(year => (
                  <option key={year} value={year} className="text-gray-900">{year}</option>
                ))}
              </select>
              {errors.expirationYear && <p className="text-red-200 text-sm mt-1">{errors.expirationYear}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">CVV</label>
              <input
                type="text"
                name="cvv"
                value={formData.cvv}
                onChange={handleInputChange}
                placeholder="123"
                maxLength={4}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
              />
              {errors.cvv && <p className="text-red-200 text-sm mt-1">{errors.cvv}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Billing Address */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Billing Address</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
            <input
              type="text"
              name="street"
              value={formData.street}
              onChange={handleInputChange}
              placeholder="123 Main St"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.street && <p className="text-red-600 text-sm mt-1">{errors.street}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                placeholder="City"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.city && <p className="text-red-600 text-sm mt-1">{errors.city}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleInputChange}
                placeholder="CA"
                maxLength={2}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.state && <p className="text-red-600 text-sm mt-1">{errors.state}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ZIP Code</label>
              <input
                type="text"
                name="zip"
                value={formData.zip}
                onChange={handleInputChange}
                placeholder="12345"
                maxLength={10}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.zip && <p className="text-red-600 text-sm mt-1">{errors.zip}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
              <select
                name="country"
                value={formData.country}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <span className="text-lg font-semibold text-gray-900">Total Amount:</span>
          <span className="text-3xl font-bold text-blue-600">${amount.toFixed(2)}</span>
        </div>
        <p className="text-sm text-gray-600">{subscriptionPlan} - Billed {billingPeriod}</p>
      </div>

      {/* Security Note */}
      <div className="flex items-center justify-center text-sm text-gray-600">
        <Lock className="w-4 h-4 mr-2" />
        <span>Secured by USAePay - Your payment information is encrypted</span>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 py-3 px-6 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isProcessing}
          className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5 mr-2" />
              Pay ${amount.toFixed(2)}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

