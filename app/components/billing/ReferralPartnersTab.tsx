'use client';

import React, { useEffect, useState } from 'react';

type ReferralPartnerForm = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  addressCountry: string;
  defaultSetupFeePercentage: number;
  defaultRecurringFeePercentage: number;
  paymentMethod: string;
  taxId: string;
  notes: string;
};

type ReferralPartnerRow = ReferralPartnerForm & {
  id: string;
  active?: boolean;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  addressCountry: string | null;
  paymentMethod: string | null;
  taxId: string | null;
  notes: string | null;
};

const emptyReferralPartner: ReferralPartnerForm = {
  name: '',
  contactName: '',
  email: '',
  phone: '',
  addressStreet: '',
  addressCity: '',
  addressState: '',
  addressZip: '',
  addressCountry: 'US',
  defaultSetupFeePercentage: 0,
  defaultRecurringFeePercentage: 0,
  paymentMethod: '',
  taxId: '',
  notes: '',
};

function toForm(partner: ReferralPartnerRow): ReferralPartnerForm {
  return {
    name: partner.name || '',
    contactName: partner.contactName || '',
    email: partner.email || '',
    phone: partner.phone || '',
    addressStreet: partner.addressStreet || '',
    addressCity: partner.addressCity || '',
    addressState: partner.addressState || '',
    addressZip: partner.addressZip || '',
    addressCountry: partner.addressCountry || 'US',
    defaultSetupFeePercentage: Number(partner.defaultSetupFeePercentage || 0),
    defaultRecurringFeePercentage: Number(partner.defaultRecurringFeePercentage || 0),
    paymentMethod: partner.paymentMethod || '',
    taxId: partner.taxId || '',
    notes: partner.notes || '',
  };
}

function normalizePayload(form: ReferralPartnerForm) {
  return {
    ...form,
    name: form.name.trim(),
    contactName: form.contactName.trim() || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    addressStreet: form.addressStreet.trim() || null,
    addressCity: form.addressCity.trim() || null,
    addressState: form.addressState.trim() || null,
    addressZip: form.addressZip.trim() || null,
    addressCountry: form.addressCountry.trim() || null,
    paymentMethod: form.paymentMethod.trim() || null,
    taxId: form.taxId.trim() || null,
    notes: form.notes.trim() || null,
  };
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '3px' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
      />
    </div>
  );
}

function ReferralPartnerFormFields({
  form,
  setForm,
}: {
  form: ReferralPartnerForm;
  setForm: React.Dispatch<React.SetStateAction<ReferralPartnerForm>>;
}) {
  const update = (field: keyof ReferralPartnerForm, value: string | number) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const rowStyle = (columns: string): React.CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: columns,
    gap: '12px',
    alignItems: 'end',
    marginBottom: '10px',
    width: 'fit-content',
    maxWidth: '100%',
  });

  return (
    <div>
      <div style={rowStyle('220px 180px 240px 150px')}>
        <Field label="Partner Name" value={form.name} onChange={(value) => update('name', value)} placeholder="Marketing partner" />
        <Field label="Contact" value={form.contactName} onChange={(value) => update('contactName', value)} placeholder="Optional" />
        <Field label="Email" value={form.email} onChange={(value) => update('email', value)} placeholder="Optional" type="email" />
        <Field label="Phone" value={form.phone} onChange={(value) => update('phone', value)} placeholder="Optional" />
      </div>
      <div style={rowStyle('280px 170px 70px 90px 90px')}>
        <Field label="Address" value={form.addressStreet} onChange={(value) => update('addressStreet', value)} placeholder="Street address" />
        <Field label="City" value={form.addressCity} onChange={(value) => update('addressCity', value)} placeholder="City" />
        <Field label="State" value={form.addressState} onChange={(value) => update('addressState', value)} placeholder="ST" />
        <Field label="ZIP" value={form.addressZip} onChange={(value) => update('addressZip', value)} placeholder="ZIP" />
        <Field label="Country" value={form.addressCountry} onChange={(value) => update('addressCountry', value)} placeholder="US" />
      </div>
      <div style={rowStyle('80px 100px 170px 150px')}>
        <Field
          label="Setup %"
          value={form.defaultSetupFeePercentage}
          onChange={(value) => update('defaultSetupFeePercentage', parseFloat(value) || 0)}
          type="number"
        />
        <Field
          label="Recurring %"
          value={form.defaultRecurringFeePercentage}
          onChange={(value) => update('defaultRecurringFeePercentage', parseFloat(value) || 0)}
          type="number"
        />
        <Field label="Payment Method" value={form.paymentMethod} onChange={(value) => update('paymentMethod', value)} placeholder="ACH, check, wire" />
        <Field label="Tax ID" value={form.taxId} onChange={(value) => update('taxId', value)} placeholder="Optional" />
      </div>
      <div style={{ width: '100%' }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '3px' }}>Notes</label>
        <textarea
          value={form.notes}
          onChange={(event) => update('notes', event.target.value)}
          placeholder="Program name, contract terms, payment notes"
          rows={2}
          style={{ width: '100%', maxWidth: '620px', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', resize: 'vertical' }}
        />
      </div>
    </div>
  );
}

export default function ReferralPartnersTab() {
  const [referralPartners, setReferralPartners] = useState<ReferralPartnerRow[]>([]);
  const [newReferralPartner, setNewReferralPartner] = useState<ReferralPartnerForm>(emptyReferralPartner);
  const [isAddingReferralPartner, setIsAddingReferralPartner] = useState(false);
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [editingPartner, setEditingPartner] = useState<ReferralPartnerForm>(emptyReferralPartner);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReferralPartners = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await fetch('/api/referral-partners');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Failed to load referral partners');
      setReferralPartners(Array.isArray(data?.referralPartners) ? data.referralPartners : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load referral partners');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReferralPartners();
  }, []);

  const createReferralPartner = async () => {
    const payload = normalizePayload(newReferralPartner);
    if (!payload.name) {
      window.alert('Referral partner name is required.');
      return;
    }

    try {
      const response = await fetch('/api/referral-partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Failed to create referral partner');
      setReferralPartners((prev) => [...prev, result.referralPartner].sort((a, b) => a.name.localeCompare(b.name)));
      setNewReferralPartner(emptyReferralPartner);
      setIsAddingReferralPartner(false);
    } catch (err: any) {
      window.alert(err.message || 'Failed to create referral partner');
    }
  };

  const saveReferralPartner = async (id: string) => {
    const payload = normalizePayload(editingPartner);
    if (!payload.name) {
      window.alert('Referral partner name is required.');
      return;
    }

    try {
      const response = await fetch('/api/referral-partners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Failed to update referral partner');
      setReferralPartners((prev) =>
        prev.map((partner) => partner.id === id ? result.referralPartner : partner).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingPartnerId(null);
      setEditingPartner(emptyReferralPartner);
    } catch (err: any) {
      window.alert(err.message || 'Failed to update referral partner');
    }
  };

  const toggleReferralPartnerActive = async (referralPartner: ReferralPartnerRow) => {
    try {
      const response = await fetch('/api/referral-partners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: referralPartner.id,
          active: referralPartner.active === false,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Failed to update referral partner');
      setReferralPartners((prev) =>
        prev.map((partner) => partner.id === referralPartner.id ? result.referralPartner : partner)
      );
    } catch (err: any) {
      window.alert(err.message || 'Failed to update referral partner');
    }
  };

  if (isLoading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading referral partners...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '20px', background: '#fee2e2', borderRadius: '8px', color: '#991b1b' }}>
        Error loading referral partners: {error}
      </div>
    );
  }

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: '0 0 6px 0' }}>
            Add Non-Consultant Referral Partner
          </h3>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            Create referral partner payees that are not consultants and do not receive consultant dashboard access.
          </p>
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#475569' }}>
            Active partners: {referralPartners.filter((partner) => partner.active !== false).length}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsAddingReferralPartner(true)}
          style={{ padding: '8px 12px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
        >
          Add Referral Partner
        </button>
      </div>

      {isAddingReferralPartner && (
        <div style={{ marginBottom: '18px', padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
          <ReferralPartnerFormFields form={newReferralPartner} setForm={setNewReferralPartner} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={createReferralPartner}
              style={{ padding: '6px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
            >
              Save Referral Partner
            </button>
            <button
              type="button"
              onClick={() => {
                setNewReferralPartner(emptyReferralPartner);
                setIsAddingReferralPartner(false);
              }}
              style={{ padding: '6px 10px', background: '#f3f4f6', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
        <div style={{ fontSize: '12px', color: '#475569', fontWeight: 700, marginBottom: '8px' }}>Existing Referral Partners</div>
        {referralPartners.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>No referral partners have been added yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {referralPartners.map((partner) => {
              const isEditing = editingPartnerId === partner.id;
              const address = [partner.addressStreet, partner.addressCity, partner.addressState, partner.addressZip, partner.addressCountry]
                .filter(Boolean)
                .join(', ');

              return (
                <div key={partner.id} style={{ padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', background: partner.active === false ? '#f8fafc' : '#ffffff' }}>
                  {isEditing ? (
                    <>
                      <ReferralPartnerFormFields form={editingPartner} setForm={setEditingPartner} />
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button type="button" onClick={() => saveReferralPartner(partner.id)} style={{ padding: '6px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingPartnerId(null)} style={{ padding: '6px 10px', background: '#f3f4f6', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, max-content))', gap: '10px 18px', alignItems: 'center' }}>
                      <div style={{ minWidth: '150px', maxWidth: '210px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{partner.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{partner.contactName || 'No contact name'}</div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569', minWidth: '150px', maxWidth: '210px' }}>
                        <div>{partner.email || 'No email'}</div>
                        <div>{partner.phone || 'No phone'}</div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569', minWidth: '180px', maxWidth: '260px' }}>{address || 'No address'}</div>
                      <div style={{ fontSize: '12px', color: '#475569', minWidth: '120px', maxWidth: '150px' }}>
                        <div>Setup {partner.defaultSetupFeePercentage ?? 0}%</div>
                        <div>Recurring {partner.defaultRecurringFeePercentage ?? 0}%</div>
                      </div>
                      <div style={{ fontSize: '12px', color: partner.active === false ? '#991b1b' : '#166534', fontWeight: 700, minWidth: '70px' }}>
                        {partner.active === false ? 'Inactive' : 'Active'}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', minWidth: '160px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPartnerId(partner.id);
                            setEditingPartner(toForm(partner));
                          }}
                          style={{ padding: '6px 10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleReferralPartnerActive(partner)}
                          style={{ padding: '6px 10px', background: partner.active === false ? '#10b981' : '#f3f4f6', color: partner.active === false ? 'white' : '#1e293b', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          {partner.active === false ? 'Reactivate' : 'Deactivate'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
