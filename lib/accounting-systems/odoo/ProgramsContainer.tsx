'use client';

import React from 'react';
import type { ProgramsContainerProps } from '../types';
import TwoColumnProgramsTable from '../shared/TwoColumnProgramsTable';
import { DEFAULT_ODOO_PROGRAMS, type OdooProgram } from './index';

export default function OdooProgramsContainer({ programs, onChange, disabled }: ProgramsContainerProps<OdooProgram>) {
  return (
    <TwoColumnProgramsTable<OdooProgram>
      programs={programs}
      onChange={onChange}
      defaults={DEFAULT_ODOO_PROGRAMS}
      secondKey="modelOrEndpoint"
      secondLabel="Odoo Model / Endpoint"
      secondPlaceholder="e.g. account.move (out_invoice)"
      helpText="Map each Corelytics data domain to an Odoo model name (e.g. account.account, sale.order)."
      disabled={disabled}
    />
  );
}
