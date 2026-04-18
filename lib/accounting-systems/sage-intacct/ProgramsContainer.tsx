'use client';

import React from 'react';
import type { ProgramsContainerProps } from '../types';
import TwoColumnProgramsTable from '../shared/TwoColumnProgramsTable';
import { DEFAULT_SAGE_INTACCT_PROGRAMS, type SageIntacctProgram } from './index';

export default function SageIntacctProgramsContainer({ programs, onChange, disabled }: ProgramsContainerProps<SageIntacctProgram>) {
  return (
    <TwoColumnProgramsTable<SageIntacctProgram>
      programs={programs}
      onChange={onChange}
      defaults={DEFAULT_SAGE_INTACCT_PROGRAMS}
      secondKey="objectName"
      secondLabel="Object Name (Intacct)"
      secondPlaceholder="e.g. GLACCOUNT"
      helpText="Map each Corelytics data domain to a Sage Intacct object name (e.g. CUSTOMER, ARINVOICE, GLACCOUNT)."
      disabled={disabled}
    />
  );
}
