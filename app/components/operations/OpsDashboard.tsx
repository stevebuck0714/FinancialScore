'use client';

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface OpsDashboardProps {
  selectedCompanyId: string;
  companyName: string;
}

const COLORS = ['#667eea', '#2563eb', '#16a34a', '#f59e0b', '#ec4899', '#6366f1'];

export default function OpsDashboard({ selectedCompanyId, companyName }: OpsDashboardProps) {
  // Individual frequency state for each widget
  const [customerFreq, setCustomerFreq] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [arFreq, setArFreq] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [apFreq, setApFreq] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [productFreq, setProductFreq] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [inventoryFreq, setInventoryFreq] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [cashFreq, setCashFreq] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  // Data state for each widget
  const [customerData, setCustomerData] = useState<any>(null);
  const [arData, setArData] = useState<any>(null);
  const [apData, setApData] = useState<any>(null);
  const [productData, setProductData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [cashData, setCashData] = useState<any>(null);

  // Loading states
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [loadingAr, setLoadingAr] = useState(false);
  const [loadingAp, setLoadingAp] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingCash, setLoadingCash] = useState(false);

  // Helper to get date range based on frequency
  const getDateRange = (frequency: string) => {
    const end = new Date();
    const start = new Date();
    
    if (frequency === 'daily') {
      start.setDate(start.getDate() - 90);
    } else if (frequency === 'weekly') {
      start.setDate(start.getDate() - (16 * 7));
    } else {
      start.setMonth(start.getMonth() - 12);
    }
    
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format date based on frequency
  const formatDate = (dateString: string, frequency: string) => {
    const date = new Date(dateString);
    if (frequency === 'daily') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (frequency === 'weekly') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    }
  };

  // Load data functions
  const loadCustomerData = async () => {
    setLoadingCustomer(true);
    try {
      const { startDate, endDate } = getDateRange(customerFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'customers',
        frequency: customerFreq,
        startDate,
        endDate
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setCustomerData(data);
    } catch (error) {
      console.error('Error loading customer data:', error);
    } finally {
      setLoadingCustomer(false);
    }
  };

  const loadArData = async () => {
    setLoadingAr(true);
    try {
      const { startDate, endDate } = getDateRange(arFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'ar-aging',
        frequency: arFreq,
        startDate,
        endDate
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setArData(data);
    } catch (error) {
      console.error('Error loading AR data:', error);
    } finally {
      setLoadingAr(false);
    }
  };

  const loadApData = async () => {
    setLoadingAp(true);
    try {
      const { startDate, endDate } = getDateRange(apFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'ap-aging',
        frequency: apFreq,
        startDate,
        endDate
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setApData(data);
    } catch (error) {
      console.error('Error loading AP data:', error);
    } finally {
      setLoadingAp(false);
    }
  };

  const loadProductData = async () => {
    setLoadingProduct(true);
    try {
      const { startDate, endDate } = getDateRange(productFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'products',
        frequency: productFreq,
        startDate,
        endDate
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setProductData(data);
    } catch (error) {
      console.error('Error loading product data:', error);
    } finally {
      setLoadingProduct(false);
    }
  };

  const loadInventoryData = async () => {
    setLoadingInventory(true);
    try {
      const { startDate, endDate } = getDateRange(inventoryFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'inventory',
        frequency: inventoryFreq,
        startDate,
        endDate
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setInventoryData(data);
    } catch (error) {
      console.error('Error loading inventory data:', error);
    } finally {
      setLoadingInventory(false);
    }
  };

  const loadCashData = async () => {
    setLoadingCash(true);
    try {
      const { startDate, endDate } = getDateRange(cashFreq);
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type: 'cash',
        frequency: cashFreq,
        startDate,
        endDate
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      const data = await response.json();
      setCashData(data);
    } catch (error) {
      console.error('Error loading cash data:', error);
    } finally {
      setLoadingCash(false);
    }
  };

  // Load data on mount and when frequency changes
  useEffect(() => { loadCustomerData(); }, [selectedCompanyId, customerFreq]);
  useEffect(() => { loadArData(); }, [selectedCompanyId, arFreq]);
  useEffect(() => { loadApData(); }, [selectedCompanyId, apFreq]);
  useEffect(() => { loadProductData(); }, [selectedCompanyId, productFreq]);
  useEffect(() => { loadInventoryData(); }, [selectedCompanyId, inventoryFreq]);
  useEffect(() => { loadCashData(); }, [selectedCompanyId, cashFreq]);

  // Frequency selector component
  const FrequencySelector = ({ value, onChange }: { value: string, onChange: (v: any) => void }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as any)}
      style={{
        padding: '6px 12px',
        border: '1px solid #e2e8f0',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '500',
        color: '#475569',
        cursor: 'pointer',
        background: 'white'
      }}
    >
      <option value="daily">Daily</option>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
    </select>
  );

  // Prepare chart data
  const prepareCustomerChartData = () => {
    if (!customerData?.records) return [];
    const periodTrend = customerData.records.reduce((acc: any, record: any) => {
      const period = formatDate(record.snapshotDate, customerFreq);
      if (!acc[period]) {
        acc[period] = { period, revenue: 0 };
      }
      acc[period].revenue += record.revenue;
      return acc;
    }, {});
    return Object.values(periodTrend);
  };

  const prepareArChartData = () => {
    if (!arData?.records) return [];
    return arData.records.map((record: any) => ({
      period: formatDate(record.snapshotDate, arFreq),
      totalAR: record.totalAR,
      current: record.current,
      over30: record.days1to30 + record.days31to60 + record.days61to90 + record.days90plus
    }));
  };

  const prepareApChartData = () => {
    if (!apData?.records) return [];
    return apData.records.map((record: any) => ({
      period: formatDate(record.snapshotDate, apFreq),
      totalAP: record.totalAP,
      current: record.current,
      over30: record.days1to30 + record.days31to60 + record.days61to90 + record.days90plus
    }));
  };

  const prepareProductChartData = () => {
    if (!productData?.records) return [];
    const periodTrend = productData.records.reduce((acc: any, record: any) => {
      const period = formatDate(record.snapshotDate, productFreq);
      if (!acc[period]) {
        acc[period] = { period, revenue: 0 };
      }
      acc[period].revenue += record.revenue;
      return acc;
    }, {});
    return Object.values(periodTrend);
  };

  const prepareInventoryChartData = () => {
    if (!inventoryData?.records) return [];
    const periodValue: any = {};
    inventoryData.records.forEach((record: any) => {
      const period = formatDate(record.snapshotDate, inventoryFreq);
      if (!periodValue[period]) {
        periodValue[period] = { period, value: 0 };
      }
      periodValue[period].value += record.assetValue;
    });
    return Object.values(periodValue);
  };

  const prepareCashChartData = () => {
    if (!cashData?.records) return [];
    const periodTrend = cashData.records.reduce((acc: any, record: any) => {
      const period = formatDate(record.snapshotDate, cashFreq);
      if (!acc[period]) {
        acc[period] = { period, totalCash: 0 };
      }
      acc[period].totalCash += record.cashBalance;
      return acc;
    }, {});
    return Object.values(periodTrend);
  };

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', marginBottom: '24px' }}>
          Operations Dashboard
        </h1>

        {/* Dashboard Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '24px' }}>
          
          {/* Customer Sales Widget */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                📊 Customer Sales
              </h3>
              <FrequencySelector value={customerFreq} onChange={setCustomerFreq} />
            </div>
            {loadingCustomer ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={prepareCustomerChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => [formatCurrency(value), 'Revenue']} />
                  <Line type="monotone" dataKey="revenue" stroke="#667eea" strokeWidth={2} dot={{ fill: '#667eea', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* AR Aging Widget */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                💰 AR Aging
              </h3>
              <FrequencySelector value={arFreq} onChange={setArFreq} />
            </div>
            {loadingAr ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={prepareArChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Bar dataKey="current" stackId="a" fill="#16a34a" name="Current" />
                  <Bar dataKey="over30" stackId="a" fill="#f59e0b" name="Over 30 Days" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* AP Aging Widget */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                💳 AP Aging
              </h3>
              <FrequencySelector value={apFreq} onChange={setApFreq} />
            </div>
            {loadingAp ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={prepareApChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Bar dataKey="current" stackId="a" fill="#16a34a" name="Current" />
                  <Bar dataKey="over30" stackId="a" fill="#f59e0b" name="Over 30 Days" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Product Sales Widget */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                📦 Product Sales
              </h3>
              <FrequencySelector value={productFreq} onChange={setProductFreq} />
            </div>
            {loadingProduct ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={prepareProductChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => [formatCurrency(value), 'Revenue']} />
                  <Line type="monotone" dataKey="revenue" stroke="#ec4899" strokeWidth={2} dot={{ fill: '#ec4899', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Inventory Widget */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                🏭 Inventory
              </h3>
              <FrequencySelector value={inventoryFreq} onChange={setInventoryFreq} />
            </div>
            {loadingInventory ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={prepareInventoryChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => [formatCurrency(value), 'Value']} />
                  <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Cash Widget */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                💵 Cash Balance
              </h3>
              <FrequencySelector value={cashFreq} onChange={setCashFreq} />
            </div>
            {loadingCash ? (
              <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={prepareCashChartData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => [formatCurrency(value), 'Total Cash']} />
                  <Bar dataKey="totalCash" fill="#10b981" name="Total Cash" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

