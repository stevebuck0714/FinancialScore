'use client';

import { useState, useEffect } from 'react';
import { Check, ShoppingCart, CreditCard, Loader2 } from 'lucide-react';
import Navigation from '../components/Navigation';

type SubscriptionPlan = {
  id: string;
  name: string;
  price: number | null;
  billingPeriod: 'monthly' | 'quarterly' | 'annual';
  features: string[];
  popular?: boolean;
  savings?: string;
  disabled?: boolean;
};

type CartItem = {
  planId: string;
  planName: string;
  price: number;
  billingPeriod: string;
};

export default function BillingPage() {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string>('');
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load current company and subscription info
  useEffect(() => {
    loadCompanyInfo();
  }, []);

  const loadCompanyInfo = async () => {
    setIsLoading(true);
    try {
      // Get current user from session
      const response = await fetch('/api/auth/session');
      const session = await response.json();
      
      if (session?.user?.companyId) {
        setCompanyId(session.user.companyId);
        
        // Fetch company details
        const companyResponse = await fetch(`/api/companies?id=${session.user.companyId}`);
        const companyData = await companyResponse.json();
        
        if (companyData.companies && companyData.companies.length > 0) {
          const company = companyData.companies[0];
          
          // Set current selected plan
          setCurrentPlan(company.selectedSubscriptionPlan || null);
          
          // Build subscription plans from admin-configured prices
          const plans: SubscriptionPlan[] = [
            {
              id: 'monthly',
              name: 'Monthly Plan',
              price: company.subscriptionMonthlyPrice || null,
              billingPeriod: 'monthly',
              disabled: !company.subscriptionMonthlyPrice,
              features: [
                'Full financial analytics dashboard',
                'QuickBooks integration',
                'Industry benchmarking',
                'Management assessment tools',
                'Monthly reports',
                'Email support'
              ]
            },
            {
              id: 'quarterly',
              name: 'Quarterly Plan',
              price: company.subscriptionQuarterlyPrice || null,
              billingPeriod: 'quarterly',
              popular: true,
              disabled: !company.subscriptionQuarterlyPrice,
              savings: company.subscriptionMonthlyPrice && company.subscriptionQuarterlyPrice 
                ? `Save ${Math.round((1 - (company.subscriptionQuarterlyPrice / 3) / company.subscriptionMonthlyPrice) * 100)}%`
                : 'Best Value',
              features: [
                'All Monthly Plan features',
                'Quarterly strategic reviews',
                'Priority email support',
                'Advanced reporting',
                'Trend analysis',
                'Cost savings vs monthly'
              ]
            },
            {
              id: 'annual',
              name: 'Annual Plan',
              price: company.subscriptionAnnualPrice || null,
              billingPeriod: 'annual',
              disabled: !company.subscriptionAnnualPrice,
              savings: company.subscriptionMonthlyPrice && company.subscriptionAnnualPrice
                ? `Save ${Math.round((1 - (company.subscriptionAnnualPrice / 12) / company.subscriptionMonthlyPrice) * 100)}%`
                : 'Maximum Savings',
              features: [
                'All Quarterly Plan features',
                'Annual business health review',
                'Dedicated account manager',
                'Custom reporting',
                'API access',
                'Maximum cost savings'
              ]
            }
          ];
          
          setSubscriptionPlans(plans);
        }
      }
    } catch (error) {
      console.error('Error loading company info:', error);
      setMessage({ type: 'error', text: 'Failed to load subscription information' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    if (plan.disabled || plan.price === null) {
      setMessage({ type: 'error', text: 'This plan is not available. Please contact support.' });
      return;
    }

    setSelectedPlan(plan);
    
    // Add to cart
    const cartItem: CartItem = {
      planId: plan.id,
      planName: plan.name,
      price: plan.price,
      billingPeriod: plan.billingPeriod
    };
    
    // Replace existing cart item (only one subscription at a time)
    setCartItems([cartItem]);
    setMessage({ type: 'success', text: `${plan.name} added to cart!` });
  };

  const removeFromCart = () => {
    setCartItems([]);
    setSelectedPlan(null);
    setMessage(null);
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) {
      setMessage({ type: 'error', text: 'Please select a subscription plan' });
      return;
    }

    if (!companyId) {
      setMessage({ type: 'error', text: 'Company information not found' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const selectedItem = cartItems[0];

      // Update company with selected subscription plan (not the price - that's already set by admin)
      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: companyId,
          selectedSubscriptionPlan: selectedItem.billingPeriod
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update subscription');
      }

      setMessage({ 
        type: 'success', 
        text: `Successfully subscribed to ${selectedItem.planName}! Total charged: $${selectedItem.price.toFixed(2)}` 
      });
      
      setCurrentPlan(selectedItem.billingPeriod);
      setCartItems([]);
      setSelectedPlan(null);

      // Refresh company info after 2 seconds
      setTimeout(() => {
        loadCompanyInfo();
      }, 2000);

    } catch (error) {
      console.error('Error updating subscription:', error);
      setMessage({ 
        type: 'error', 
        text: 'Failed to update subscription. Please try again.' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + item.price, 0);

  if (isLoading) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading billing information...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your Subscription Plan
          </h1>
          <p className="text-xl text-gray-600">
            Select the plan that best fits your business needs
          </p>
          {currentPlan && (
            <div className="mt-4 inline-block bg-blue-100 text-blue-800 px-4 py-2 rounded-full">
              Current Plan: <span className="font-semibold capitalize">{currentPlan}</span>
            </div>
          )}
        </div>

        {/* Message Alert */}
        {message && (
          <div className={`mb-8 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            <p className={`text-center ${
              message.type === 'success' ? 'text-green-800' : 'text-red-800'
            }`}>
              {message.text}
            </p>
          </div>
        )}

        {/* Check if any plans are available */}
        {subscriptionPlans.every(p => p.disabled) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
            <p className="text-center text-yellow-800">
              No subscription plans have been configured for your account. Please contact your administrator or support.
            </p>
          </div>
        )}

        {/* Subscription Plans */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {subscriptionPlans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-xl shadow-lg overflow-hidden transform transition-all duration-200 ${
                plan.disabled ? 'opacity-50' : 'hover:scale-105'
              } ${
                plan.popular && !plan.disabled ? 'ring-4 ring-blue-500' : ''
              } ${selectedPlan?.id === plan.id ? 'ring-4 ring-green-500' : ''}`}
            >
              {plan.popular && !plan.disabled && (
                <div className="bg-blue-500 text-white text-center py-2 font-semibold">
                  Most Popular
                </div>
              )}
              {plan.savings && !plan.popular && !plan.disabled && (
                <div className="bg-green-500 text-white text-center py-2 font-semibold">
                  {plan.savings}
                </div>
              )}
              
              <div className="p-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  {plan.name}
                </h3>
                
                <div className="mb-6">
                  {plan.price !== null ? (
                    <>
                      <span className="text-5xl font-bold text-gray-900">
                        ${plan.price.toFixed(2)}
                      </span>
                      <span className="text-gray-600 ml-2">
                        /{plan.billingPeriod}
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-semibold text-gray-400">
                      Not Available
                    </span>
                  )}
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <Check className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={plan.disabled || currentPlan === plan.billingPeriod}
                  className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
                    plan.disabled
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : currentPlan === plan.billingPeriod
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : selectedPlan?.id === plan.id
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {plan.disabled
                    ? 'Not Available'
                    : currentPlan === plan.billingPeriod
                    ? 'Current Plan'
                    : selectedPlan?.id === plan.id
                    ? 'Selected'
                    : 'Select Plan'
                  }
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Shopping Cart */}
        {cartItems.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-2xl mx-auto">
            <div className="flex items-center mb-6">
              <ShoppingCart className="w-6 h-6 text-blue-600 mr-2" />
              <h2 className="text-2xl font-bold text-gray-900">Shopping Cart</h2>
            </div>

            <div className="space-y-4 mb-6">
              {cartItems.map((item, index) => (
                <div key={index} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-semibold text-gray-900">{item.planName}</h3>
                    <p className="text-sm text-gray-600 capitalize">Billed {item.billingPeriod}</p>
                  </div>
                  <div className="flex items-center">
                    <span className="text-xl font-bold text-gray-900 mr-4">
                      ${item.price.toFixed(2)}
                    </span>
                    <button
                      onClick={removeFromCart}
                      className="text-red-600 hover:text-red-800 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-6">
              <div className="flex justify-between items-center mb-6">
                <span className="text-xl font-semibold text-gray-900">Total:</span>
                <span className="text-3xl font-bold text-gray-900">
                  ${cartTotal.toFixed(2)}
                </span>
              </div>

              <button
                onClick={handleCheckout}
                disabled={isSaving}
                className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors flex items-center justify-center disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 mr-2" />
                    Proceed to Checkout
                  </>
                )}
              </button>

              <p className="text-sm text-gray-500 text-center mt-4">
                Your subscription will be activated immediately after checkout
              </p>
            </div>
          </div>
        )}

        {/* No items in cart message */}
        {cartItems.length === 0 && subscriptionPlans.some(p => !p.disabled) && (
          <div className="text-center text-gray-500 py-8">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg">Select a plan to add it to your cart</p>
          </div>
        )}
        </div>
      </div>
    </>
  );
}
