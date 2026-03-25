interface LOBData {
  name: string;
  headcountPercentage: number;
}

interface LOBManagerProps {
  lobs: LOBData[];
  onChange: (lobs: LOBData[]) => void;
  maxLOBs?: number;
  compact?: boolean;
}

export default function LOBManager({ lobs, onChange, maxLOBs = 5, compact = false }: LOBManagerProps) {
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

  if (compact) {
    return (
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '10px',
          border: '1px solid #e2e8f0',
          marginBottom: '4px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#334155' }}>
            Lines of Business
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={addLOB}
              disabled={lobs.length >= maxLOBs}
              style={{
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: lobs.length >= maxLOBs ? '#f8fafc' : '#eff6ff',
                color: lobs.length >= maxLOBs ? '#94a3b8' : '#1d4ed8',
                fontSize: '11px',
                cursor: lobs.length >= maxLOBs ? 'not-allowed' : 'pointer',
              }}
            >
              + LOB
            </button>
            <button
              onClick={() => removeLOB(lobs.length - 1)}
              disabled={lobs.length <= 1}
              style={{
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                background: lobs.length <= 1 ? '#f8fafc' : '#fef2f2',
                color: lobs.length <= 1 ? '#94a3b8' : '#b91c1c',
                fontSize: '11px',
                cursor: lobs.length <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              - LOB
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(1, lobs.length)}, minmax(140px, 1fr))`,
            gap: '8px',
            alignItems: 'start',
          }}
        >
          {lobs.map((lob, index) => (
            <div key={index} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px', background: '#f8fafc' }}>
              <input
                type="text"
                value={lob.name}
                onChange={(e) => updateLOB(index, 'name', e.target.value)}
                placeholder={`LOB ${index + 1}`}
                style={{
                  width: '100%',
                  padding: '5px 6px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '11px',
                  marginBottom: '6px',
                  background: 'white',
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
                  placeholder="%"
                  style={{
                    width: '100%',
                    padding: '5px 6px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '11px',
                    background: 'white',
                  }}
                />
                <span style={{ fontSize: '11px', color: '#64748b' }}>%</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '8px', fontSize: '11px', color: '#475569' }}>
          Total: <strong>{totalHeadcountPercentage.toFixed(1)}%</strong>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'white',
        borderRadius: compact ? '8px' : '12px',
        padding: compact ? '12px' : '24px',
        boxShadow: compact ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
        border: compact ? '1px solid #e2e8f0' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ fontSize: compact ? '14px' : '20px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
          Lines of Business
        </h2>
        {lobs.length < maxLOBs && (
          <button
            onClick={addLOB}
            style={{
              padding: compact ? '4px 8px' : '6px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: compact ? '11px' : '12px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Add LOB
          </button>
        )}
      </div>

      <p style={{ fontSize: compact ? '11px' : '13px', color: '#64748b', marginBottom: compact ? '10px' : '16px' }}>
        Define your lines of business and their estimated headcount percentages for allocation
      </p>

      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 50px',
        gap: '12px',
        marginBottom: compact ? '6px' : '8px',
        paddingBottom: compact ? '6px' : '8px',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <div style={{ fontSize: compact ? '11px' : '12px', fontWeight: '600', color: '#475569' }}>Line of Business</div>
        <div style={{ fontSize: compact ? '11px' : '12px', fontWeight: '600', color: '#475569' }}>Headcount %</div>
        <div></div>
      </div>

      {/* LOB Rows */}
      {lobs.map((lob, index) => (
        <div key={index} style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 50px',
          gap: '12px',
          marginBottom: compact ? '6px' : '8px',
          alignItems: 'center'
        }}>
          <input
            type="text"
            value={lob.name}
            onChange={(e) => updateLOB(index, 'name', e.target.value)}
            placeholder={`e.g., ${index === 0 ? 'Consulting' : index === 1 ? 'Products' : index === 2 ? 'Services' : 'Other'}`}
            style={{
              padding: compact ? '6px 8px' : '8px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: compact ? '12px' : '13px'
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
                padding: compact ? '6px 8px' : '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: compact ? '12px' : '13px',
                width: '100%'
              }}
            />
            <span style={{ fontSize: compact ? '11px' : '12px', color: '#64748b' }}>%</span>
          </div>

          <button
            onClick={() => removeLOB(index)}
            disabled={lobs.length <= 1}
            style={{
              padding: compact ? '4px' : '6px',
              background: lobs.length <= 1 ? '#f1f5f9' : '#ef4444',
              color: lobs.length <= 1 ? '#94a3b8' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: lobs.length <= 1 ? 'not-allowed' : 'pointer',
              fontSize: compact ? '11px' : '12px'
            }}
            title="Remove LOB"
          >
            ×
          </button>
        </div>
      ))}

      {/* Summary */}
      <div style={{
        marginTop: compact ? '10px' : '16px',
        padding: compact ? '8px' : '12px',
        background: '#f8fafc',
        borderRadius: '6px',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ fontSize: compact ? '11px' : '12px', color: '#475569', marginBottom: '4px' }}>
          <strong>Total Headcount Allocation:</strong> {totalHeadcountPercentage.toFixed(1)}%
        </div>
        {Math.abs(totalHeadcountPercentage - 100) > 0.1 && (
          <div style={{
            fontSize: compact ? '10px' : '11px',
            color: Math.abs(totalHeadcountPercentage - 100) > 5 ? '#dc2626' : '#d97706'
          }}>
            ⚠️ Headcount percentages should total 100% for accurate allocation
          </div>
        )}
        {lobs.length === maxLOBs && (
          <div style={{ fontSize: compact ? '10px' : '11px', color: '#6b7280', marginTop: '4px' }}>
            Maximum of {maxLOBs} lines of business reached
          </div>
        )}
      </div>
    </div>
  );
}









