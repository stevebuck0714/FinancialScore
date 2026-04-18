'use client';

import React from 'react';
import type { ProgramsContainerProps } from '../types';
import TwoColumnProgramsTable from '../shared/TwoColumnProgramsTable';
import { DEFAULT_DYNAMICS_365_PROGRAMS, type Dynamics365Program } from './index';

export default function Dynamics365ProgramsContainer({ programs, onChange, disabled }: ProgramsContainerProps<Dynamics365Program>) {
  return (
    <TwoColumnProgramsTable<Dynamics365Program>
      programs={programs}
      onChange={onChange}
      defaults={DEFAULT_DYNAMICS_365_PROGRAMS}
      secondKey="entityOrEndpoint"
      secondLabel="API Entity / Endpoint"
      secondPlaceholder="e.g. customerLedgerEntries"
      helpText="Map each Corelytics data domain to a Dynamics 365 OData entity name."
      disabled={disabled}
    />
  );
}
