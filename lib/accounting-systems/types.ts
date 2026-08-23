/**
 * Accounting system plugin contract.
 *
 * Each ERP we integrate (Vista Cloud, Sage Intacct, QBO, Dynamics, …) is
 * implemented as a self-contained plugin module conforming to this interface
 * and registered in `lib/accounting-systems/registry.ts`.
 *
 * The shared site-admin shell + generic API route discover plugins through
 * the registry, so adding a new ERP requires no edits to SiteAdminDashboard,
 * page.tsx, or any global switch statement.
 */

import type { AccountingPlatform } from '@prisma/client';
import type { ComponentType } from 'react';

/**
 * Universal sync schedule fields — present for every system, owned by the
 * shared shell (not the plugin). Plugins should NOT redeclare these in their
 * own settings shape; the shell reads/writes them on a sibling key.
 */
export type SharedSyncSchedule = {
  syncFrequency: 'daily' | 'weekly' | 'monthly' | '';
  syncTime: string;             // HH:MM Eastern Time (EST)
  initialSyncStartDate: string; // YYYY-MM-DD
  incrementalSync: 'YES' | 'NO' | '';
};

export const DEFAULT_SHARED_SYNC_SCHEDULE: SharedSyncSchedule = {
  syncFrequency: 'daily',
  syncTime: '08:00',
  initialSyncStartDate: '',
  incrementalSync: 'YES',
};

/**
 * Connection status surfaced in the shell header. Mirrors a useful subset of
 * the Prisma ConnectionStatus enum — kept loose because not every system uses
 * every state.
 */
export type ConnectionStatusLite =
  | 'NOT_CONNECTED'
  | 'INACTIVE'
  | 'CONNECTED'
  | 'ERROR'
  | string;

/**
 * Props the shell hands to a plugin's IntegrationContainer.
 *
 * The plugin renders its credential fields here. Editing should call
 * `onChange(next)` with the FULL next-state object — the shell is the
 * source of truth for unsaved state.
 */
export type IntegrationContainerProps<TSettings> = {
  companyId: string;
  settings: TSettings;
  onChange: (next: TSettings) => void;
  disabled?: boolean;
};

/**
 * Props the shell hands to a plugin's ProgramsContainer.
 *
 * The plugin renders its programs editor (table, list, whatever fits the
 * system). Add/remove/edit all flow through `onChange`.
 */
export type ProgramsContainerProps<TProgram> = {
  companyId: string;
  programs: TProgram[];
  onChange: (next: TProgram[]) => void;
  disabled?: boolean;

  /**
   * Per-program last-sync timestamps keyed by the program's primary identity
   * (for Sage Intacct: objectName). Populated by the shell from
   * `connectionMetadata.lastSyncedPerObject` so plugins can show freshness
   * badges without having to re-fetch.
   */
  lastSyncedByObject?: Record<string, string | undefined>;
};

/**
 * One plugin module. Built generically over the system's settings + program
 * row shapes so the registry stays type-safe per system.
 */
export type AccountingSystemModule<TSettings = unknown, TProgram = unknown> = {
  /** Stable string key — matches Company.accountingSystem (uppercase). */
  key: string;

  /**
   * Optional secondary keys this module also responds to. Useful when
   * historical Company.accountingSystem values use a different spelling than
   * the canonical key (e.g. legacy 'DYNAMICS' vs. plugin 'DYNAMICS_365').
   */
  aliases?: ReadonlyArray<string>;

  /** Human-readable label shown in the profile dropdown and shell header. */
  label: string;

  /** Optional one-liner shown under the label in the shell. */
  tagline?: string;

  /** Maps to the Prisma AccountingPlatform enum value. */
  platform: AccountingPlatform;

  /**
   * Inline badge rendered next to the label. Plugins use simple initials
   * + colors to avoid shipping image assets.
   */
  badge?: { initials: string; bg: string; fg: string };

  /**
   * Optional per-plugin shell layout. Defaults to stacked (header → integration
   * → schedule → programs). Use 'side-by-side' when the credentials form is
   * compact and the programs table is long enough to benefit from horizontal
   * splitting.
   */
  layout?: {
    variant: 'stacked' | 'side-by-side';
    /** Width of the integration column in side-by-side mode (e.g. '40%'). */
    credentialsWidth?: string;
    /** Width of the programs column in side-by-side mode (e.g. '60%'). */
    programsWidth?: string;
    /**
     * When true (and variant === 'side-by-side'), the Sync Schedule card —
     * together with the manual sync action buttons — is rendered as a
     * full-width row ABOVE the integration/programs grid instead of being
     * stacked under integration in the left column.
     */
    scheduleAbove?: boolean;
  };

  /**
   * Optional manual sync controls surfaced in the shared shell. When a
   * capability is enabled, the shell renders the corresponding button
   * (Connect/Disconnect/Sync Now/Backfill…) in the Sync Schedule card.
   *
   * The shell is responsible for the UI surface; wiring each button to a
   * plugin-specific endpoint is added incrementally and is independent of
   * this flag (a button declared here without a backing endpoint will be
   * rendered as a disabled "Coming soon" placeholder).
   */
  capabilities?: {
    connect?: boolean;
    disconnect?: boolean;
    syncNow?: boolean;
    backfill?: boolean;
  };

  /** Initial settings used when no row exists yet for a company. */
  defaultSettings: TSettings;

  /** Initial programs list used when no row exists yet for a company. */
  defaultPrograms: TProgram[];

  /** Server-side normalizer for untrusted settings input. */
  sanitizeSettings: (value: unknown) => TSettings;

  /** Server-side normalizer for untrusted programs input. */
  sanitizePrograms: (value: unknown) => TProgram[];

  /** Plugin-rendered credentials form. */
  IntegrationContainer: ComponentType<IntegrationContainerProps<TSettings>>;

  /** Plugin-rendered programs editor. */
  ProgramsContainer: ComponentType<ProgramsContainerProps<TProgram>>;
};
