import React from 'react';
import type { HubTabSource } from '@/lib/operations/operational-hub-overlay';
import type { SectorCatalogTab } from '@/lib/operations/sector-hub-catalog';

type TabOption = {
  key: string;
  label: string;
  moduleKey: string;
  source: HubTabSource;
};

type ReportOption = {
  key: string;
  label: string;
};

const SOURCE_LABEL: Record<HubTabSource | 'sector', string> = {
  master: 'Sector standard',
  current: 'Also included',
  company: 'This company',
  sector: 'Sector custom',
};

const paneButton = (args: { color: string; disabled?: boolean; fill?: boolean }): React.CSSProperties => ({
  padding: '5px 8px',
  border: `1px solid ${args.color}`,
  borderRadius: '6px',
  background: args.fill === false ? 'white' : args.color,
  color: args.fill === false ? args.color : 'white',
  fontSize: '11px',
  fontWeight: 600,
  cursor: args.disabled ? 'not-allowed' : 'pointer',
  whiteSpace: 'nowrap',
});

function sourceNames(names?: string[]): string {
  if (!names || names.length === 0) return '';
  return `from ${names.join(', ')}`;
}

export default function OperationalHubCustomizationCard(props: {
  companyId: string;
  sectorName: string;
  industryName: string;
  draft: Record<string, boolean>;
  selectedModuleKey: string;
  selectedTabLabel: string;
  selectedTabSource: HubTabSource | 'sector';
  selectedTabOnCompany: boolean;
  masterTabOptions: TabOption[];
  currentTabOptions: TabOption[];
  companyTabOptions: TabOption[];
  availableSectorTabs: SectorCatalogTab[];
  selectedSectorTab?: SectorCatalogTab;
  standardReportOptions: ReportOption[];
  assignedCatalogOptions: ReportOption[];
  ownedCustomOptions: ReportOption[];
  unassignedCatalogReports: ReportOption[];
  newTabName: string;
  newReportName: string;
  busy: boolean;
  saving: boolean;
  onSelectTab: (moduleKey: string) => void;
  onToggleSection: (key: string, enabled: boolean) => void;
  onNewTabName: (value: string) => void;
  onAddTab: () => void;
  onAddSectorTab: (tab: SectorCatalogTab) => void;
  onAddCatalogReport: (key: string) => void;
  onNewReportName: (value: string) => void;
  onAddReport: () => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const {
    companyId,
    sectorName,
    industryName,
    draft,
    selectedModuleKey,
    selectedTabLabel,
    selectedTabSource,
    selectedTabOnCompany,
    masterTabOptions,
    currentTabOptions,
    companyTabOptions,
    availableSectorTabs,
    selectedSectorTab,
    standardReportOptions,
    assignedCatalogOptions,
    ownedCustomOptions,
    unassignedCatalogReports,
    newTabName,
    newReportName,
    busy,
    saving,
    onSelectTab,
    onToggleSection,
    onNewTabName,
    onAddTab,
    onAddSectorTab,
    onAddCatalogReport,
    onNewReportName,
    onAddReport,
    onReset,
    onSave,
  } = props;

  const renderOwnedTabRow = (option: TabOption) => {
    const selected = option.moduleKey === selectedModuleKey;
    return (
      <div
        key={`${companyId}-${option.key}`}
        role="button"
        tabIndex={0}
        onClick={() => onSelectTab(option.moduleKey)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelectTab(option.moduleKey);
          }
        }}
        style={{
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
          padding: '5px 6px',
          borderRadius: '6px',
          cursor: 'pointer',
          background: selected ? '#dbeafe' : 'transparent',
          border: selected ? '1px solid #93c5fd' : '1px solid transparent',
        }}
      >
        <input
          type="checkbox"
          checked={Boolean(draft[option.key])}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onToggleSection(option.key, event.target.checked)}
        />
        <span style={{ fontSize: '12px', color: '#334155', fontWeight: selected ? 700 : 500 }}>{option.label}</span>
      </div>
    );
  };

  const renderReportCheckbox = (option: ReportOption) => (
    <label
      key={`${companyId}-${option.key}`}
      style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', color: '#334155' }}
    >
      <input
        type="checkbox"
        checked={Boolean(draft[option.key])}
        disabled={!selectedTabOnCompany}
        onChange={(event) => onToggleSection(option.key, event.target.checked)}
      />
      <span>{option.label}</span>
    </label>
  );

  return (
    <div style={{ padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Operational Hub Customization</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            Pick a tab to see its standard sector reports. Custom reports are created and assigned for this company only. Save never deletes existing tabs or reports.
          </div>
          <div style={{ marginTop: '6px', display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
            <span style={{ color: '#1e3a8a' }}>Sector: {sectorName}</span>
            <span style={{ color: '#1e3a8a' }}>Industry: {industryName}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={onReset} disabled={saving} style={paneButton({ color: '#64748b', fill: false, disabled: saving })}>
            Reset
          </button>
          <button onClick={onSave} disabled={saving} style={paneButton({ color: '#1d4ed8', disabled: saving })}>
            Save
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 280px) minmax(0, 1fr)', gap: '8px' }}>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Tabs</div>
          <div style={{ display: 'grid', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', marginBottom: '4px' }}>
                Sector standard
              </div>
              <div style={{ display: 'grid', gap: '2px' }}>{masterTabOptions.map(renderOwnedTabRow)}</div>
            </div>
            {currentTabOptions.length > 0 && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Also included
                </div>
                <div style={{ display: 'grid', gap: '2px' }}>{currentTabOptions.map(renderOwnedTabRow)}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', marginBottom: '4px' }}>
                Sector custom
              </div>
              {availableSectorTabs.length > 0 ? (
                <div style={{ display: 'grid', gap: '2px' }}>
                  {availableSectorTabs.map((tab) => {
                    const selected = tab.key === selectedModuleKey;
                    return (
                      <div
                        key={`${companyId}-sector-tab-${tab.key}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectTab(tab.key)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onSelectTab(tab.key);
                          }
                        }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 6px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: selected ? '#ede9fe' : 'transparent',
                          border: selected ? '1px solid #c4b5fd' : '1px solid transparent',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: '#334155', fontWeight: selected ? 700 : 500 }}>{tab.label}</div>
                          {tab.sourceCompanyNames.length > 0 && (
                            <div style={{ fontSize: '10px', color: '#7c3aed' }}>{sourceNames(tab.sourceCompanyNames)}</div>
                          )}
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onAddSectorTab(tab);
                          }}
                          disabled={busy}
                          style={paneButton({ color: '#6d28d9', disabled: busy })}
                        >
                          Add
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>No other custom tabs in this sector yet.</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', marginBottom: '4px' }}>
                This company
              </div>
              <div style={{ display: 'grid', gap: '2px' }}>
                {companyTabOptions.length > 0 ? (
                  companyTabOptions.map(renderOwnedTabRow)
                ) : (
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>No company-only tabs yet.</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <input
                  type="text"
                  value={newTabName}
                  onChange={(event) => onNewTabName(event.target.value)}
                  placeholder="New company tab name"
                  style={{ fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', background: 'white', minWidth: 0, flex: 1 }}
                />
                <button onClick={onAddTab} disabled={busy} style={paneButton({ color: '#0f766e', disabled: busy })}>
                  Add Tab
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline', marginBottom: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{selectedTabLabel}</div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
              {SOURCE_LABEL[selectedTabSource]}
            </div>
          </div>

          {!selectedTabOnCompany && selectedSectorTab && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
                alignItems: 'center',
                padding: '8px',
                marginBottom: '10px',
                borderRadius: '6px',
                background: '#f5f3ff',
                border: '1px solid #ddd6fe',
              }}
            >
              <div style={{ fontSize: '11px', color: '#5b21b6' }}>
                This tab exists on other {sectorName} companies{selectedSectorTab.sourceCompanyNames.length ? ` (${selectedSectorTab.sourceCompanyNames.join(', ')})` : ''}. Add it before enabling reports here.
              </div>
              <button onClick={() => onAddSectorTab(selectedSectorTab)} disabled={busy} style={paneButton({ color: '#6d28d9', disabled: busy })}>
                Add tab
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#1e3a8a', textTransform: 'uppercase', marginBottom: '4px' }}>
                Standard reports
              </div>
              {standardReportOptions.length > 0 ? (
                <div style={{ display: 'grid', gap: '6px' }}>{standardReportOptions.map(renderReportCheckbox)}</div>
              ) : (
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {selectedTabOnCompany ? 'No standard reports on this tab.' : 'Add this tab to see its standard reports.'}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', marginBottom: '4px' }}>
                Available company reports
              </div>
              {unassignedCatalogReports.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>No unused company reports for this tab.</div>
              ) : (
                <div style={{ display: 'grid', gap: '6px' }}>
                  {unassignedCatalogReports.map((report) => (
                    <div key={`${companyId}-catalog-${report.key}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#334155' }}>{report.label}</div>
                        <div style={{ fontSize: '10px', color: '#7c3aed' }}>Assign to this company only</div>
                      </div>
                      <button
                        onClick={() => onAddCatalogReport(report.key)}
                        disabled={busy}
                        style={paneButton({ color: '#1d4ed8', disabled: busy })}
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', marginBottom: '4px' }}>
                This company's custom reports
              </div>
              {assignedCatalogOptions.length === 0 && ownedCustomOptions.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>No custom reports on this tab yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: '6px' }}>
                  {assignedCatalogOptions.map(renderReportCheckbox)}
                  {ownedCustomOptions.map(renderReportCheckbox)}
                </div>
              )}
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={newReportName}
                  onChange={(event) => onNewReportName(event.target.value)}
                  placeholder="New company report name"
                  style={{ fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', background: 'white', minWidth: '180px', flex: 1 }}
                />
                <button onClick={onAddReport} disabled={busy || !selectedTabOnCompany} style={paneButton({ color: '#0f766e', disabled: busy || !selectedTabOnCompany })}>
                  Add Report
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
