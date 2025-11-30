import type { Mappings } from '../types';

export const renderColumnSelector = (
  label: string, 
  mappingKey: keyof Mappings,
  mapping: Mappings,
  setMapping: (mapping: Mappings) => void,
  columns: string[]
) => (
  <div style={{ marginBottom: '15px' }}>
    <label style={{ display: 'block', fontWeight: '500', marginBottom: '5px', color: '#475569' }}>{label}:</label>
    <select 
      value={mapping[mappingKey] || ''} 
      onChange={(e) => setMapping({ ...mapping, [mappingKey]: e.target.value })} 
      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
    >
      <option value="">-- Select --</option>
      {columns.map(col => <option key={col} value={col}>{col}</option>)}
    </select>
  </div>
);

