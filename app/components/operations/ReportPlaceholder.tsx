type Props = {
  title: string;
  description: string;
  needs: string[];
};

/** A planned report that cannot be built until its source data is loaded. */
export default function ReportPlaceholder({ title, description, needs }: Props) {
  return (
    <div style={{ background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, color: '#0f172a' }}>{title}</h3>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', background: '#f1f5f9', borderRadius: 999, padding: '3px 9px', textTransform: 'uppercase' }}>Planned</span>
      </div>
      <p style={{ color: '#475569', margin: '8px 0 10px' }}>{description}</p>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Needed to build</div>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#64748b', fontSize: 13 }}>
        {needs.map((need) => <li key={need}>{need}</li>)}
      </ul>
    </div>
  );
}
