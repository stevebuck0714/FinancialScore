'use client';

import React from 'react';
import { LineChart } from './charts/Charts';

interface SimpleChartProps {
  data: Array<{ month: string; [key: string]: any }>;
  valueKey?: string;
  title: string;
  color: string;
  formatter?: (val: number) => string;
}

export default function SimpleChart({ data, valueKey = 'value', title, color, formatter }: SimpleChartProps) {
  // Transform data to have a 'value' property based on valueKey
  const transformedData = data.map(item => ({
    month: item.month,
    value: item[valueKey] || 0
  }));

  return (
    <LineChart
      title={title}
      data={transformedData}
      color={color}
      formatter={formatter}
      compact={true}
    />
  );
}


