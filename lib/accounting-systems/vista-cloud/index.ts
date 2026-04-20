import type { AccountingSystemModule } from '../types';
import {
  DEFAULT_VISTA_CLOUD_SETTINGS,
  sanitizeVistaCloudSettings,
  type VistaCloudSettings,
} from './settings';
import {
  DEFAULT_VISTA_CLOUD_PROGRAMS,
  sanitizeVistaCloudPrograms,
  type VistaCloudProgram,
} from './programs';
import IntegrationContainer from './IntegrationContainer';
import ProgramsContainer from './ProgramsContainer';

export type { VistaCloudSettings } from './settings';
export type { VistaCloudProgram } from './programs';

const vistaCloud: AccountingSystemModule<VistaCloudSettings, VistaCloudProgram> = {
  key: 'VISTA_CLOUD',
  label: 'Viewpoint Vista Cloud',
  tagline: 'Trimble Construction ERP — Direct REST API (X-Application-Key)',
  platform: 'VISTA_CLOUD',
  badge: { initials: 'VV', bg: '#1e3a8a', fg: '#ffffff' },
  layout: {
    variant: 'side-by-side',
    credentialsWidth: '40%',
    programsWidth: '60%',
    scheduleAbove: true,
  },
  capabilities: {
    connect: true,
    disconnect: true,
    syncNow: true,
    backfill: true,
  },
  defaultSettings: DEFAULT_VISTA_CLOUD_SETTINGS,
  defaultPrograms: DEFAULT_VISTA_CLOUD_PROGRAMS,
  sanitizeSettings: sanitizeVistaCloudSettings,
  sanitizePrograms: sanitizeVistaCloudPrograms,
  IntegrationContainer,
  ProgramsContainer,
};

export default vistaCloud;
