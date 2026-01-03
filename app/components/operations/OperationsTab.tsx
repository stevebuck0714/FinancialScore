'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, Package, DollarSign, Warehouse, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface OperationsTabProps {
  selectedCompanyId: string;
  companyName: string;
}

const COLORS = ['#667eea', '#2563eb', '#16a34a', '#f59e0b', '#ec4899', '#6366f1', '#8b5cf6', '#14b8a6'];

export default function OperationsTab({ selectedCompanyId, companyName }: OperationsTabProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'customers' | 'ar' | 'ap' | 'products' | 'inventory'>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [customerData, setCustomerData] = useState<any>(null);
  const [arData, setArData] = useState<any>(null);
  const [apData, setApData] = useState<any>(null);
  const [productData, setProductData] = useState<any>(null);
  const [inventoryData, setInventoryData] = useState<any>(null);
  
  // Date range and frequency filters
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() - 90); // Default to 90 days ago
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    loadSummary();
  }, [selectedCompanyId]);

  useEffect(() => {
    if (activeTab !== 'overview') {
      loadTabData(activeTab);
    }
  }, [activeTab, selectedCompanyId, frequency, startDate, endDate]);

  const loadSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operational-data?companyId=${selectedCompanyId}`);
      if (!response.ok) throw new Error('Failed to load operational data');
      const data = await response.json();
      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTabData = async (tab: string) => {
    setLoading(true);
    setError(null);
    try {
      // Map tab names to API type parameter
      const typeMap: Record<string, string> = {
        'customers': 'customers',
        'ar': 'ar-aging',
        'ap': 'ap-aging',
        'products': 'products',
        'inventory': 'inventory'
      };
      
      const type = typeMap[tab];
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        type,
        frequency,
        startDate,
        endDate,
      });
      
      const response = await fetch(`/api/operational-data?${params}`);
      if (!response.ok) throw new Error(`Failed to load ${type} data`);
      const data = await response.json();
      
      switch (tab) {
        case 'customers':
          setCustomerData(data);
          break;
        case 'ar':
          setArData(data);
          break;
        case 'ap':
          setApData(data);
          break;
        case 'products':
          setProductData(data);
          break;
        case 'inventory':
          setInventoryData(data);
          break;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  };

  const renderFilters = () => {
    if (activeTab === 'overview') return null;

    return (
      <div style={{ 
        background: 'white', 
        borderBottom: '1px solid #e2e8f0',
        padding: '10px 24px',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Frequency Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
            Frequency:
          </label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as any)}
            style={{
              padding: '6px 10px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#1e293b',
              cursor: 'pointer',
              background: 'white'
            }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        {/* Date Range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
            From:
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#1e293b'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
            To:
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: '6px 10px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#1e293b'
            }}
          />
        </div>

        {/* Quick Date Range Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button
            onClick={() => {
              const end = new Date();
              const start = new Date();
              start.setDate(start.getDate() - 30);
              setStartDate(start.toISOString().split('T')[0]);
              setEndDate(end.toISOString().split('T')[0]);
            }}
            style={{
              padding: '6px 12px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => {
              const end = new Date();
              const start = new Date();
              start.setDate(start.getDate() - 90);
              setStartDate(start.toISOString().split('T')[0]);
              setEndDate(end.toISOString().split('T')[0]);
            }}
            style={{
              padding: '6px 12px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            Last 90 Days
          </button>
          <button
            onClick={() => {
              const end = new Date();
              const start = new Date();
              start.setMonth(start.getMonth() - 6);
              setStartDate(start.toISOString().split('T')[0]);
              setEndDate(end.toISOString().split('T')[0]);
            }}
            style={{
              padding: '6px 12px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            Last 6 Months
          </button>
        </div>
      </div>
    );
  };

  // Overview Tab
  const renderOverview = () => (
    <div style={{ padding: '16px 24px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
        Operational Data Overview
      </h2>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          Loading operational data...
        </div>
      )}

      {error && (
        <div style={{ 
          background: '#fef2f2', 
          border: '1px solid #fecaca', 
          borderRadius: '8px', 
          padding: '16px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          marginBottom: '24px'
        }}>
          <AlertCircle style={{ width: '20px', height: '20px', color: '#ef4444' }} />
          <span style={{ color: '#dc2626' }}>{error}</span>
        </div>
      )}

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => setActiveTab('customers')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#dbeafe', padding: '8px', borderRadius: '6px' }}>
                <Users style={{ width: '20px', height: '20px', color: '#2563eb' }} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#475569' }}>Customer Sales</h3>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              {summary.customerSalesRecords || 0}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Sales records tracked</p>
          </div>

          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => setActiveTab('ar')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#dcfce7', padding: '8px', borderRadius: '6px' }}>
                <TrendingUp style={{ width: '20px', height: '20px', color: '#16a34a' }} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#475569' }}>AR Aging</h3>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              {summary.arAgingRecords || 0}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Monthly snapshots</p>
          </div>

          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => setActiveTab('ap')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#fef3c7', padding: '8px', borderRadius: '6px' }}>
                <DollarSign style={{ width: '20px', height: '20px', color: '#f59e0b' }} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#475569' }}>AP Aging</h3>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              {summary.apAgingRecords || 0}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Monthly snapshots</p>
          </div>

          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => setActiveTab('products')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#fce7f3', padding: '8px', borderRadius: '6px' }}>
                <Package style={{ width: '20px', height: '20px', color: '#ec4899' }} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#475569' }}>Product Sales</h3>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              {summary.productSalesRecords || 0}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Product records</p>
          </div>

          <div style={{ 
            background: 'white', 
            borderRadius: '8px', 
            padding: '16px', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}
          onClick={() => setActiveTab('inventory')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: '#e0e7ff', padding: '8px', borderRadius: '6px' }}>
                <Warehouse style={{ width: '20px', height: '20px', color: '#6366f1' }} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#475569' }}>Inventory</h3>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>
              {summary.inventoryRecords || 0}
            </div>
            <p style={{ fontSize: '13px', color: '#64748b' }}>Inventory records</p>
          </div>
        </div>
      )}

      <div style={{ 
        marginTop: '20px', 
        background: '#f8fafc', 
        border: '1px solid #e2e8f0', 
        borderRadius: '8px', 
        padding: '16px' 
      }}>
        <h3 style={{ fontSize: '17px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
          About Operational Data
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
          <div>
            <h4 style={{ fontSize: '21px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              📊 Customer Analytics
            </h4>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.5' }}>
              Track customer revenue trends, invoice patterns, and identify your top customers and revenue concentration.
            </p>
          </div>
          <div>
            <h4 style={{ fontSize: '21px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              💰 AR & AP Aging
            </h4>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.5' }}>
              Monitor accounts receivable and payable aging to optimize cash flow and working capital management.
            </p>
          </div>
          <div>
            <h4 style={{ fontSize: '21px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              📦 Product Performance
            </h4>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.5' }}>
              Analyze product sales, margins, and trends to identify your best performers and optimization opportunities.
            </p>
          </div>
          <div>
            <h4 style={{ fontSize: '21px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
              🏭 Inventory Management
            </h4>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.5' }}>
              Track inventory levels, values, and turnover to optimize stock levels and reduce carrying costs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Customer Analytics Tab
  const renderCustomers = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading customer data...</div>;
    }

    if (!customerData) return null;

    const { records, summary } = customerData;

    // Aggregate data by period for trend chart
    const periodTrend = records.reduce((acc: any, record: any) => {
      const period = formatDate(record.snapshotDate);
      if (!acc[period]) {
        acc[period] = { month: period, revenue: 0, invoices: 0 };
      }
      acc[period].revenue += record.revenue;
      acc[period].invoices += record.invoiceCount;
      return acc;
    }, {});

    const trendData = Object.values(periodTrend);

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Customer Sales Analytics
        </h2>

        {/* KPI Cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Customers</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
              {summary.topCustomers.length}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Revenue</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>
              {formatCurrency(summary.topCustomers.reduce((sum: number, c: any) => sum + c.totalRevenue, 0))}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Invoices</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
              {summary.topCustomers.reduce((sum: number, c: any) => sum + c.totalInvoices, 0)}
            </div>
          </div>
        </div>

        {/* Revenue Trend Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Monthly Revenue Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any) => [formatCurrency(value), 'Revenue']}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#667eea" strokeWidth={2} dot={{ fill: '#667eea', r: 4 }} name="Revenue" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top Customers Table */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Top Customers by Revenue
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Rank</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Customer</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Total Revenue</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Invoices</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Avg Invoice</th>
                </tr>
              </thead>
              <tbody>
                {summary.topCustomers.map((customer: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b' }}>#{index + 1}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{customer.name}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#16a34a', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(customer.totalRevenue)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#64748b', textAlign: 'right' }}>{customer.totalInvoices}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#64748b', textAlign: 'right' }}>
                      {formatCurrency(customer.totalRevenue / customer.totalInvoices)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Customer Revenue Distribution Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Revenue Distribution by Customer
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={summary.topCustomers}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: ${((entry.totalRevenue / summary.topCustomers.reduce((sum: number, c: any) => sum + c.totalRevenue, 0)) * 100).toFixed(1)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="totalRevenue"
              >
                {summary.topCustomers.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  // AR Aging Tab
  const renderARaging = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading AR data...</div>;
    }

    if (!arData) return null;

    const { records, summary } = arData;

    // Prepare stacked area chart data
    const chartData = records.map((record: any) => ({
      month: formatDate(record.snapshotDate),
      Current: record.current,
      '1-30 Days': record.days1to30,
      '31-60 Days': record.days31to60,
      '61-90 Days': record.days61to90,
      '90+ Days': record.days90plus,
      total: record.totalAR
    }));

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Accounts Receivable Aging
        </h2>

        {/* KPI Cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Total AR</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
                {formatCurrency(summary.totalAR)}
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Current %</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {summary.currentPct.toFixed(1)}%
                {summary.currentPct >= 70 ? <ArrowUp size={20} /> : <ArrowDown size={20} color="#ef4444" />}
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 30 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
                {summary.over30Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 90 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: summary.over90Pct > 5 ? '#ef4444' : '#64748b' }}>
                {summary.over90Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>DSO (Days)</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
                {summary.dso.toFixed(0)}
              </div>
            </div>
          </div>
        )}

        {/* AR Aging Trend Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            AR Aging Trend
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="Current" stackId="a" fill="#16a34a" />
              <Bar dataKey="1-30 Days" stackId="a" fill="#f59e0b" />
              <Bar dataKey="31-60 Days" stackId="a" fill="#f97316" />
              <Bar dataKey="61-90 Days" stackId="a" fill="#ef4444" />
              <Bar dataKey="90+ Days" stackId="a" fill="#991b1b" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* AR Aging Table */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Monthly AR Aging Detail
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Month</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Total AR</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Current</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>1-30 Days</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>31-60 Days</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>61-90 Days</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>90+ Days</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{formatDate(record.month)}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(record.totalAR)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#16a34a', textAlign: 'right' }}>
                      {formatCurrency(record.current)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#f59e0b', textAlign: 'right' }}>
                      {formatCurrency(record.days1to30)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#f97316', textAlign: 'right' }}>
                      {formatCurrency(record.days31to60)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#ef4444', textAlign: 'right' }}>
                      {formatCurrency(record.days61to90)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#991b1b', textAlign: 'right', fontWeight: record.days90plus > record.totalAR * 0.1 ? '700' : '400' }}>
                      {formatCurrency(record.days90plus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // AP Aging Tab
  const renderAPaging = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading AP data...</div>;
    }

    if (!apData) return null;

    const { records, summary } = apData;

    const chartData = records.map((record: any) => ({
      month: formatDate(record.snapshotDate),
      Current: record.current,
      '1-30 Days': record.days1to30,
      '31-60 Days': record.days31to60,
      '61-90 Days': record.days61to90,
      '90+ Days': record.days90plus,
      total: record.totalAP
    }));

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Accounts Payable Aging
        </h2>

        {/* KPI Cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Total AP</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
                {formatCurrency(summary.totalAP)}
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Current %</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>
                {summary.currentPct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 30 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
                {summary.over30Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>Over 90 Days</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: summary.over90Pct > 5 ? '#ef4444' : '#64748b' }}>
                {summary.over90Pct.toFixed(1)}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>DPO (Days)</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
                {summary.dpo.toFixed(0)}
              </div>
            </div>
          </div>
        )}

        {/* AP Aging Trend Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            AP Aging Trend
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="Current" stackId="a" fill="#16a34a" />
              <Bar dataKey="1-30 Days" stackId="a" fill="#f59e0b" />
              <Bar dataKey="31-60 Days" stackId="a" fill="#f97316" />
              <Bar dataKey="61-90 Days" stackId="a" fill="#ef4444" />
              <Bar dataKey="90+ Days" stackId="a" fill="#991b1b" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* AP Aging Table */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Monthly AP Aging Detail
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Month</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Total AP</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Current</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>1-30 Days</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>31-60 Days</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>61-90 Days</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>90+ Days</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{formatDate(record.month)}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(record.totalAP)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#16a34a', textAlign: 'right' }}>
                      {formatCurrency(record.current)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#f59e0b', textAlign: 'right' }}>
                      {formatCurrency(record.days1to30)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#f97316', textAlign: 'right' }}>
                      {formatCurrency(record.days31to60)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#ef4444', textAlign: 'right' }}>
                      {formatCurrency(record.days61to90)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#991b1b', textAlign: 'right' }}>
                      {formatCurrency(record.days90plus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Product Sales Tab  
  const renderProducts = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading product data...</div>;
    }

    if (!productData) return null;

    const { records, summary } = productData;

    // Aggregate revenue by product over time
    const productTrends: any = {};
    records.forEach((record: any) => {
      const period = formatDate(record.snapshotDate);
      if (!productTrends[period]) {
        productTrends[period] = { month: period };
      }
      productTrends[period][record.itemName] = record.revenue;
    });

    const trendData = Object.values(productTrends);
    const productNames = Array.from(new Set(records.map((r: any) => r.itemName)));

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Product Sales Performance
        </h2>

        {/* KPI Cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Products</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
              {summary.topProducts.length}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Revenue</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>
              {formatCurrency(summary.topProducts.reduce((sum: number, p: any) => sum + p.totalRevenue, 0))}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Avg Margin %</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
              {(summary.topProducts.reduce((sum: number, p: any) => sum + p.grossMarginPct, 0) / summary.topProducts.length).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Product Revenue Trend */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Revenue Trend by Product
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              {productNames.map((name: any, index: number) => (
                <Line 
                  key={name} 
                  type="monotone" 
                  dataKey={name} 
                  stroke={COLORS[index % COLORS.length]} 
                  strokeWidth={2} 
                  dot={{ r: 3 }} 
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top Products Table */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Product Performance Summary
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Rank</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Product</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Total Revenue</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Units Sold</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Gross Margin</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Margin %</th>
                </tr>
              </thead>
              <tbody>
                {summary.topProducts.map((product: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b' }}>#{index + 1}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{product.name}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#16a34a', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(product.totalRevenue)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#64748b', textAlign: 'right' }}>{product.totalQuantity}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#2563eb', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(product.grossMargin)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: product.grossMarginPct >= 50 ? '#16a34a' : '#f59e0b', textAlign: 'right', fontWeight: '600' }}>
                      {product.grossMarginPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Inventory Tab
  const renderInventory = () => {
    if (loading) {
      return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading inventory data...</div>;
    }

    if (!inventoryData) return null;

    const { records, summary } = inventoryData;

    // Get latest snapshot data
    const latestSnapshot = Math.max(...records.map((r: any) => new Date(r.snapshotDate).getTime()));
    const latestRecords = records.filter((r: any) => new Date(r.snapshotDate).getTime() === latestSnapshot);

    // Aggregate inventory value over time
    const periodValue: any = {};
    records.forEach((record: any) => {
      const period = formatDate(record.snapshotDate);
      if (!periodValue[period]) {
        periodValue[period] = { month: period, value: 0, quantity: 0 };
      }
      periodValue[period].value += record.assetValue;
      periodValue[period].quantity += record.qtyOnHand;
    });

    const trendData = Object.values(periodValue);

    return (
      <div style={{ padding: '8px 32px 32px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>
          Inventory Management
        </h2>

        {/* KPI Cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Items</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b' }}>
              {summary.itemCount}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Value</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#16a34a' }}>
              {formatCurrency(summary.totalValue)}
            </div>
          </div>
          <div style={{ background: 'white', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', flex: '1', minWidth: '0' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Total Units</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
              {latestRecords.reduce((sum: number, item: any) => sum + item.qtyOnHand, 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Inventory Value Trend */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Inventory Value Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: any, name: string) => [
                  name === 'value' ? formatCurrency(value) : value.toLocaleString(),
                  name === 'value' ? 'Value' : 'Quantity'
                ]}
                contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
              />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="#667eea" strokeWidth={2} dot={{ fill: '#667eea', r: 4 }} name="Value" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Current Inventory Table */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Current Inventory (Latest Month)
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Item Name</th>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>SKU</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Qty on Hand</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Avg Cost</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>Asset Value</th>
                </tr>
              </thead>
              <tbody>
                {latestRecords.map((item: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{item.itemName}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>{item.sku}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#2563eb', textAlign: 'right', fontWeight: '600' }}>
                      {item.qtyOnHand.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#64748b', textAlign: 'right' }}>
                      {formatCurrency(item.avgCost)}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#16a34a', textAlign: 'right', fontWeight: '600' }}>
                      {formatCurrency(item.assetValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inventory Distribution Chart */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
            Inventory Value Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={latestRecords}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.itemName}: ${formatCurrency(entry.assetValue)}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="assetValue"
              >
                {latestRecords.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div style={{ 
      maxWidth: '1600px', 
      margin: '0 auto', 
      minHeight: '100vh',
      background: '#f8fafc'
    }}>
      {/* Spacer for main nav */}
      <div style={{ height: '60px' }}></div>

      {/* Tabs */}
      <div style={{ 
        background: 'white', 
        borderBottom: '1px solid #e2e8f0',
        padding: '0 24px',
        display: 'flex',
        gap: '20px'
      }}>
        {['overview', 'customers', 'ar', 'ap', 'products', 'inventory'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            style={{
              background: 'none',
              border: 'none',
              padding: '10px 0',
              fontSize: '19px',
              fontWeight: '600',
              color: activeTab === tab ? '#667eea' : '#64748b',
              cursor: 'pointer',
              borderBottom: activeTab === tab ? '3px solid #667eea' : '3px solid transparent',
              transition: 'all 0.2s',
              textTransform: 'capitalize'
            }}
          >
            {tab === 'ar' ? 'AR Aging' : tab === 'ap' ? 'AP Aging' : tab}
          </button>
        ))}
      </div>

      {/* Filters */}
      {renderFilters()}

      {/* Content */}
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'customers' && renderCustomers()}
      {activeTab === 'ar' && renderARaging()}
      {activeTab === 'ap' && renderAPaging()}
      {activeTab === 'products' && renderProducts()}
      {activeTab === 'inventory' && renderInventory()}
    </div>
  );
}
