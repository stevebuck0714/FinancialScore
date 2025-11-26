'use client';

import React from 'react';
import { LineChart } from './charts/Charts';

interface SimpleChartProps {
  data: Array<{ month: string; value: number }>;
  title: string;
  color: string;
  formatter?: (val: number) => string;
}

export default function SimpleChart({ data, title, color, formatter }: SimpleChartProps) {
  return (
    <LineChart
      title={title}
      data={data}
      color={color}
      formatter={formatter}
      compact={true}
    />
  );
}


