'use client';

import React from 'react';
import type { ProgramsContainerProps } from '../types';
import TwoColumnProgramsTable from '../shared/TwoColumnProgramsTable';
import { DEFAULT_ACUMATICA_PROGRAMS, type AcumaticaProgram } from './index';

export default function AcumaticaProgramsContainer({ programs, onChange, disabled }: ProgramsContainerProps<AcumaticaProgram>) {
  return (
    <TwoColumnProgramsTable<AcumaticaProgram>
      programs={programs}
      onChange={onChange}
      defaults={DEFAULT_ACUMATICA_PROGRAMS}
      secondKey="endpointOrEntity"
      secondLabel="Endpoint / Entity"
      secondPlaceholder="e.g. ARInvoices"
      helpText="Map each Corelytics data domain to an Acumatica contract-based REST endpoint or entity name. Selected rows are included in syncs; endpoint availability can vary by tenant customization."
      showEnabledToggle
      disabled={disabled}
    />
  );
}
