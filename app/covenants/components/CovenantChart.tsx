'use client';

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
  Bar
} from 'recharts';
import { CovenantTestResult, CovenantConfig, CovenantStatus, getCovenantStatusColor, formatCovenantValue } from '../data/models';

interface CovenantChartProps {
  covenantConfig: CovenantConfig;
  historicalResults: CovenantTestResult[];
  height?: number;
  showThresholds?: boolean;
  showTrend?: boolean;
}

interface ChartDataPoint {
  date: string;
  month: string;
  value: number;
  threshold: number;
  status: CovenantStatus;
  compliancePercentage: number;
  breachAmount?: number;
}

export default function CovenantChart({
  covenantConfig,
  historicalResults,
  height = 300,
  showThresholds = true,
  showTrend = true
}: CovenantChartProps) {

  // Prepare chart data from historical results
  const chartData = useMemo(() => {
    return historicalResults
      .sort((a, b) => a.testDate.getTime() - b.testDate.getTime())
      .map(result => ({
        date: result.testDate.toISOString().split('T')[0],
        month: result.testDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        value: result.actualValue || 0,
        threshold: result.thresholdValue || 0,
        status: result.status,
        compliancePercentage: result.compliancePercentage || 0,
        breachAmount: result.breachAmount
      }));
  }, [historicalResults]);

  // Calculate trend line (simple moving average)
  const trendData = useMemo(() => {
    if (!showTrend || chartData.length < 3) return [];

    const windowSize = Math.min(3, chartData.length);
    return chartData.map((point, index) => {
      if (index < windowSize - 1) return { ...point, trend: null };

      const window = chartData.slice(index - windowSize + 1, index + 1);
      const trend = window.reduce((sum, p) => sum + p.value, 0) / window.length;

      return { ...point, trend };
    });
  }, [chartData, showTrend]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;
    const value = payload.find((p: any) => p.dataKey === 'value')?.value;
    const threshold = payload.find((p: any) => p.dataKey === 'threshold')?.value;

    return (
      <div style={{
        background: 'white',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        fontSize: '14px'
      }}>
        <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1e293b' }}>
          {data.month}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ color: '#64748b' }}>Actual:</span>
            <span style={{ fontWeight: '500' }}>
              {formatCovenantValue(value, covenantConfig.covenantType)}
            </span>
          </div>
          {showThresholds && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: '#64748b' }}>Threshold:</span>
              <span style={{ fontWeight: '500' }}>
                {formatCovenantValue(threshold, covenantConfig.covenantType)}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ color: '#64748b' }}>Status:</span>
            <span style={{
              fontWeight: '500',
              color: getCovenantStatusColor(data.status),
              textTransform: 'capitalize'
            }}>
              {data.status}
            </span>
          </div>
          {data.breachAmount && data.breachAmount !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: '#64748b' }}>Breach:</span>
              <span style={{
                fontWeight: '500',
                color: data.breachAmount > 0 ? '#EF4444' : '#10B981'
              }}>
                {data.breachAmount > 0 ? '+' : ''}{formatCovenantValue(data.breachAmount, covenantConfig.covenantType)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Color scheme based on status
  const getLineColor = (data: ChartDataPoint[]) => {
    // Use the most recent status for the line color
    const latestStatus = data[data.length - 1]?.status || CovenantStatus.COMPLIANT;
    return getCovenantStatusColor(latestStatus);
  };

  const lineColor = getLineColor(chartData);

  if (chartData.length === 0) {
    return (
      <div style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F9FAFB',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        color: '#64748b',
        fontSize: '14px'
      }}>
        No historical data available for this covenant
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={trendData.length > 0 ? trendData : chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />

          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={{ stroke: '#D1D5DB' }}
          />

          <YAxis
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={{ stroke: '#D1D5DB' }}
            tickFormatter={(value) => formatCovenantValue(value, covenantConfig.covenantType)}
          />

          <Tooltip content={<CustomTooltip />} />

          <Legend />

          {/* Threshold reference lines */}
          {showThresholds && chartData.length > 0 && (
            <>
              {covenantConfig.minimumValue !== undefined && (
                <ReferenceLine
                  y={covenantConfig.minimumValue}
                  stroke="#10B981"
                  strokeDasharray="5 5"
                  label={{
                    value: `Min: ${formatCovenantValue(covenantConfig.minimumValue, covenantConfig.covenantType)}`,
                    position: 'topRight',
                    fontSize: 12,
                    fill: '#10B981'
                  }}
                />
              )}

              {covenantConfig.maximumValue !== undefined && (
                <ReferenceLine
                  y={covenantConfig.maximumValue}
                  stroke="#EF4444"
                  strokeDasharray="5 5"
                  label={{
                    value: `Max: ${formatCovenantValue(covenantConfig.maximumValue, covenantConfig.covenantType)}`,
                    position: 'bottomRight',
                    fontSize: 12,
                    fill: '#EF4444'
                  }}
                />
              )}

              {covenantConfig.thresholdValue !== undefined && (
                <ReferenceLine
                  y={covenantConfig.thresholdValue}
                  stroke="#F59E0B"
                  strokeDasharray="3 3"
                  label={{
                    value: `Target: ${formatCovenantValue(covenantConfig.thresholdValue, covenantConfig.covenantType)}`,
                    position: 'topLeft',
                    fontSize: 12,
                    fill: '#F59E0B'
                  }}
                />
              )}
            </>
          )}

          {/* Breach area (for visual emphasis) */}
          <Area
            type="monotone"
            dataKey={(entry: ChartDataPoint) => {
              if (entry.status === CovenantStatus.BREACHED) {
                return entry.value;
              }
              return null;
            }}
            stroke="none"
            fill="#FECACA"
            fillOpacity={0.3}
          />

          {/* Warning area */}
          <Area
            type="monotone"
            dataKey={(entry: ChartDataPoint) => {
              if (entry.status === CovenantStatus.WARNING) {
                return entry.value;
              }
              return null;
            }}
            stroke="none"
            fill="#FED7AA"
            fillOpacity={0.3}
          />

          {/* Actual values line */}
          <Line
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={2}
            dot={{ fill: lineColor, strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: lineColor, strokeWidth: 2 }}
            name={`${covenantConfig.name} Value`}
          />

          {/* Trend line */}
          {showTrend && trendData.length > 0 && (
            <Line
              type="monotone"
              dataKey="trend"
              stroke="#8B5CF6"
              strokeWidth={1}
              strokeDasharray="8 4"
              dot={false}
              name="3-Month Trend"
            />
          )}

          {/* Threshold line (if different from reference lines) */}
          {showThresholds && chartData.length > 0 && (
            <Line
              type="monotone"
              dataKey="threshold"
              stroke="#6B7280"
              strokeWidth={1}
              strokeDasharray="2 2"
              dot={false}
              name="Threshold"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Chart Legend/Key */}
      <div style={{
        marginTop: '12px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        fontSize: '12px',
        color: '#64748b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '12px', height: '2px', background: lineColor }}></div>
          <span>Actual Values</span>
        </div>

        {showTrend && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '12px', height: '2px', background: '#8B5CF6', borderStyle: 'dashed' }}></div>
            <span>3-Month Trend</span>
          </div>
        )}

        {showThresholds && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '12px', height: '2px', background: '#6B7280', borderStyle: 'dotted' }}></div>
            <span>Threshold</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '12px', height: '8px', background: '#FECACA', opacity: 0.3, border: '1px solid #FECACA' }}></div>
          <span>Breach Period</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '12px', height: '8px', background: '#FED7AA', opacity: 0.3, border: '1px solid #FED7AA' }}></div>
          <span>Warning Period</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPLIANCE OVERVIEW CHART
// ============================================================================

interface ComplianceOverviewChartProps {
  covenantResults: CovenantTestResult[];
  timeRange?: '3months' | '6months' | '12months' | 'all';
  height?: number;
}

export function ComplianceOverviewChart({
  covenantResults,
  timeRange = '6months',
  height = 250
}: ComplianceOverviewChartProps) {

  const chartData = useMemo(() => {
    // Group results by month and calculate compliance metrics
    const monthlyData: Record<string, {
      month: string;
      compliant: number;
      warning: number;
      breached: number;
      total: number;
      complianceRate: number;
    }> = {};

    covenantResults.forEach(result => {
      const monthKey = result.testDate.toISOString().slice(0, 7); // YYYY-MM format

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: result.testDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          compliant: 0,
          warning: 0,
          breached: 0,
          total: 0,
          complianceRate: 0
        };
      }

      monthlyData[monthKey].total++;
      switch (result.status) {
        case CovenantStatus.COMPLIANT:
          monthlyData[monthKey].compliant++;
          break;
        case CovenantStatus.WARNING:
          monthlyData[monthKey].warning++;
          break;
        case CovenantStatus.BREACHED:
          monthlyData[monthKey].breached++;
          break;
      }

      monthlyData[monthKey].complianceRate =
        ((monthlyData[monthKey].compliant + monthlyData[monthKey].warning * 0.5) / monthlyData[monthKey].total) * 100;
    });

    // Convert to array and sort by date
    return Object.values(monthlyData)
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
      .slice(-6); // Last 6 months by default
  }, [covenantResults]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;

    return (
      <div style={{
        background: 'white',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        fontSize: '14px'
      }}>
        <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1e293b' }}>
          {label}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ color: '#10B981' }}>✓ Compliant:</span>
            <span style={{ fontWeight: '500' }}>{data.compliant}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ color: '#F59E0B' }}>⚠ Warning:</span>
            <span style={{ fontWeight: '500' }}>{data.warning}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <span style={{ color: '#EF4444' }}>✗ Breached:</span>
            <span style={{ fontWeight: '500' }}>{data.breached}</span>
          </div>
          <div style={{ borderTop: '1px solid #E5E7EB', margin: '4px 0', paddingTop: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: '#64748b' }}>Compliance Rate:</span>
              <span style={{ fontWeight: '600', color: data.complianceRate >= 80 ? '#10B981' : data.complianceRate >= 60 ? '#F59E0B' : '#EF4444' }}>
                {data.complianceRate.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (chartData.length === 0) {
    return (
      <div style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F9FAFB',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        color: '#64748b',
        fontSize: '14px'
      }}>
        No compliance data available
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />

          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={{ stroke: '#D1D5DB' }}
          />

          <YAxis
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={{ stroke: '#D1D5DB' }}
            domain={[0, 'dataMax']}
          />

          <Tooltip content={<CustomTooltip />} />

          <Legend />

          {/* Stacked bars for status breakdown */}
          <Bar
            dataKey="compliant"
            stackId="status"
            fill="#10B981"
            name="Compliant"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="warning"
            stackId="status"
            fill="#F59E0B"
            name="Warning"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="breached"
            stackId="status"
            fill="#EF4444"
            name="Breached"
            radius={[2, 2, 0, 0]}
          />

          {/* Compliance rate line */}
          <Line
            type="monotone"
            dataKey="complianceRate"
            stroke="#667EEA"
            strokeWidth={2}
            dot={{ fill: '#667EEA', strokeWidth: 2, r: 4 }}
            name="Compliance Rate (%)"
            yAxisId="right"
          />

          {/* Secondary Y-axis for compliance rate */}
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12, fill: '#66748b' }}
            axisLine={{ stroke: '#D1D5DB' }}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
