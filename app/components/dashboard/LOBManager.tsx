interface LOBData {
  name: string;
  headcountPercentage: number;
}

interface LOBManagerProps {
  lobs: LOBData[];
  onChange: (lobs: LOBData[]) => void;
  maxLOBs?: number;
}

export default function LOBManager({ lobs, onChange, maxLOBs = 5 }: LOBManagerProps) {
  const updateLOB = (index: number, field: keyof LOBData, value: string | number) => {
    const updated = [...lobs];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const addLOB = () => {
    if (lobs.length < maxLOBs) {
      onChange([...lobs, { name: '', headcountPercentage: 0 }]);
    }
  };

  const removeLOB = (index: number) => {
    const updated = lobs.filter((_, i) => i !== index);
    onChange(updated);
  };

  const totalHeadcountPercentage = lobs.reduce((sum, lob) => sum + (lob.headcountPercentage || 0), 0);

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b' }}>
          Lines of Business
        </h2>
        {lobs.length < maxLOBs && (
          <button
            onClick={addLOB}
            style={{
              padding: '6px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Add LOB
          </button>
        )}
      </div>

      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
        Define your lines of business and their estimated headcount percentages for allocation
      </p>

      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 50px',
        gap: '12px',
        marginBottom: '8px',
        paddingBottom: '8px',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Line of Business</div>
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Headcount %</div>
        <div></div>
      </div>

      {/* LOB Rows */}
      {lobs.map((lob, index) => (
        <div key={index} style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 50px',
          gap: '12px',
          marginBottom: '8px',
          alignItems: 'center'
        }}>
          <input
            type="text"
            value={lob.name}
            onChange={(e) => updateLOB(index, 'name', e.target.value)}
            placeholder={`e.g., ${index === 0 ? 'Consulting' : index === 1 ? 'Products' : index === 2 ? 'Services' : 'Other'}`}
            style={{
              padding: '8px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '13px'
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={lob.headcountPercentage || ''}
              onChange={(e) => updateLOB(index, 'headcountPercentage', parseFloat(e.target.value) || 0)}
              placeholder="0.0"
              style={{
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '13px',
                width: '100%'
              }}
            />
            <span style={{ fontSize: '12px', color: '#64748b' }}>%</span>
          </div>

          <button
            onClick={() => removeLOB(index)}
            disabled={lobs.length <= 1}
            style={{
              padding: '6px',
              background: lobs.length <= 1 ? '#f1f5f9' : '#ef4444',
              color: lobs.length <= 1 ? '#94a3b8' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: lobs.length <= 1 ? 'not-allowed' : 'pointer',
              fontSize: '12px'
            }}
            title="Remove LOB"
          >
            ×
          </button>
        </div>
      ))}

      {/* Summary */}
      <div style={{
        marginTop: '16px',
        padding: '12px',
        background: '#f8fafc',
        borderRadius: '6px',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
          <strong>Total Headcount Allocation:</strong> {totalHeadcountPercentage.toFixed(1)}%
        </div>
        {Math.abs(totalHeadcountPercentage - 100) > 0.1 && (
          <div style={{
            fontSize: '11px',
            color: Math.abs(totalHeadcountPercentage - 100) > 5 ? '#dc2626' : '#d97706'
          }}>
            ⚠️ Headcount percentages should total 100% for accurate allocation
          </div>
        )}
        {lobs.length === maxLOBs && (
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
            Maximum of {maxLOBs} lines of business reached
          </div>
        )}
      </div>
    </div>
  );
}
