'use client';

import { useState } from 'react';
import { CreditCard, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

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
  onCancel,
}: PaymentFormProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    cardNumber: '',
    cardholderName: '',
    expirationMonth: '',
    expirationYear: '',
    cvv: '',
    billingStreet: '',
    billingCity: '',
    billingState: '',
    billingZip: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Format card number with spaces
  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(' ');
    } else {
      return value;
    }
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'cardNumber') {
      value = formatCardNumber(value);
      if (value.replace(/\s/g, '').length > 16) return;
    }
    if (field === 'cvv' && value.length > 4) return;
    if (field === 'expirationMonth' && value.length > 2) return;
    if (field === 'expirationYear' && value.length > 4) return;

    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Card number validation
    const cardDigits = formData.cardNumber.replace(/\s/g, '');
    if (!cardDigits) {
      newErrors.cardNumber = 'Card number is required';
    } else if (cardDigits.length < 13 || cardDigits.length > 19) {
      newErrors.cardNumber = 'Invalid card number';
    }

    // Cardholder name
    if (!formData.cardholderName.trim()) {
      newErrors.cardholderName = 'Cardholder name is required';
    }

    // Expiration date
    if (!formData.expirationMonth) {
      newErrors.expirationMonth = 'Month required';
    } else {
      const month = parseInt(formData.expirationMonth);
      if (month < 1 || month > 12) {
        newErrors.expirationMonth = 'Invalid month';
      }
    }

    if (!formData.expirationYear) {
      newErrors.expirationYear = 'Year required';
    } else {
      const year = parseInt(formData.expirationYear);
      const currentYear = new Date().getFullYear();
      const fullYear = year < 100 ? 2000 + year : year;
      if (fullYear < currentYear) {
        newErrors.expirationYear = 'Card expired';
      }
    }

    // CVV
    if (!formData.cvv) {
      newErrors.cvv = 'CVV is required';
    } else if (formData.cvv.length < 3) {
      newErrors.cvv = 'Invalid CVV';
    }

    // Billing address
    if (!formData.billingStreet.trim()) {
      newErrors.billingStreet = 'Street address is required';
    }
    if (!formData.billingCity.trim()) {
      newErrors.billingCity = 'City is required';
    }
    if (!formData.billingState.trim()) {
      newErrors.billingState = 'State is required';
    }
    if (!formData.billingZip.trim()) {
      newErrors.billingZip = 'ZIP code is required';
    }

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
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          companyId,
          subscriptionPlan,
          billingPeriod,
          cardNumber: formData.cardNumber.replace(/\s/g, ''),
          cardholderName: formData.cardholderName,
          expirationMonth: formData.expirationMonth.padStart(2, '0'),
          expirationYear: formData.expirationYear,
          cvv: formData.cvv,
          billingAddress: {
            street: formData.billingStreet,
            city: formData.billingCity,
            state: formData.billingState,
            zip: formData.billingZip,
          },
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        onSuccess(result);
      } else {
        onError(result.error || 'Payment processing failed. Please try again.');
      }
    } catch (error) {
      console.error('Payment error:', error);
      onError('An unexpected error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Card Information */}
      <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <CreditCard className="w-5 h-5 mr-2 text-blue-600" />
          Card Information
        </h3>

        <div className="space-y-4">
          {/* Card Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Card Number
            </label>
            <input
              type="text"
              value={formData.cardNumber}
              onChange={(e) => handleInputChange('cardNumber', e.target.value)}
              placeholder="1234 5678 9012 3456"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.cardNumber ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isProcessing}
            />
            {errors.cardNumber && (
              <p className="text-red-500 text-sm mt-1">{errors.cardNumber}</p>
            )}
          </div>

          {/* Cardholder Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cardholder Name
            </label>
            <input
              type="text"
              value={formData.cardholderName}
              onChange={(e) => handleInputChange('cardholderName', e.target.value)}
              placeholder="John Doe"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.cardholderName ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isProcessing}
            />
            {errors.cardholderName && (
              <p className="text-red-500 text-sm mt-1">{errors.cardholderName}</p>
            )}
          </div>

          {/* Expiration and CVV */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Month
              </label>
              <input
                type="text"
                value={formData.expirationMonth}
                onChange={(e) => handleInputChange('expirationMonth', e.target.value)}
                placeholder="MM"
                maxLength={2}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.expirationMonth ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isProcessing}
              />
              {errors.expirationMonth && (
                <p className="text-red-500 text-xs mt-1">{errors.expirationMonth}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Year
              </label>
              <input
                type="text"
                value={formData.expirationYear}
                onChange={(e) => handleInputChange('expirationYear', e.target.value)}
                placeholder="YYYY"
                maxLength={4}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.expirationYear ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isProcessing}
              />
              {errors.expirationYear && (
                <p className="text-red-500 text-xs mt-1">{errors.expirationYear}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CVV
              </label>
              <input
                type="text"
                value={formData.cvv}
                onChange={(e) => handleInputChange('cvv', e.target.value)}
                placeholder="123"
                maxLength={4}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.cvv ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isProcessing}
              />
              {errors.cvv && (
                <p className="text-red-500 text-xs mt-1">{errors.cvv}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Billing Address */}
      <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Billing Address
        </h3>

        <div className="space-y-4">
          {/* Street Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Street Address
            </label>
            <input
              type="text"
              value={formData.billingStreet}
              onChange={(e) => handleInputChange('billingStreet', e.target.value)}
              placeholder="123 Main St"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.billingStreet ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isProcessing}
            />
            {errors.billingStreet && (
              <p className="text-red-500 text-sm mt-1">{errors.billingStreet}</p>
            )}
          </div>

          {/* City, State, ZIP */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={formData.billingCity}
                onChange={(e) => handleInputChange('billingCity', e.target.value)}
                placeholder="City"
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.billingCity ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isProcessing}
              />
              {errors.billingCity && (
                <p className="text-red-500 text-sm mt-1">{errors.billingCity}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <input
                type="text"
                value={formData.billingState}
                onChange={(e) => handleInputChange('billingState', e.target.value)}
                placeholder="State"
                maxLength={2}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.billingState ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isProcessing}
              />
              {errors.billingState && (
                <p className="text-red-500 text-sm mt-1">{errors.billingState}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ZIP Code
            </label>
            <input
              type="text"
              value={formData.billingZip}
              onChange={(e) => handleInputChange('billingZip', e.target.value)}
              placeholder="12345"
              maxLength={10}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.billingZip ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isProcessing}
            />
            {errors.billingZip && (
              <p className="text-red-500 text-sm mt-1">{errors.billingZip}</p>
            )}
          </div>
        </div>
      </div>

      {/* Order Summary */}
      <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-700">Subscription Plan:</span>
          <span className="font-semibold text-gray-900">{subscriptionPlan}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-700">Billing Period:</span>
          <span className="font-semibold text-gray-900 capitalize">{billingPeriod}</span>
        </div>
        <div className="border-t border-blue-300 pt-2 mt-2">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-900">Total:</span>
            <span className="text-2xl font-bold text-blue-600">${amount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <div className="flex items-start space-x-2 text-sm text-gray-600 bg-green-50 p-4 rounded-lg border border-green-200">
        <Lock className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
        <p>
          Your payment information is encrypted and secure. We use industry-standard SSL encryption to protect your data.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isProcessing}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            <>
              <Lock className="w-5 h-5 mr-2" />
              Pay ${amount.toFixed(2)}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
