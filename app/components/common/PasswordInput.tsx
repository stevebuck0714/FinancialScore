'use client';

import React, { useState } from 'react';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  name?: string;
  autoComplete?: string;
  style?: React.CSSProperties;
  required?: boolean;
}

export default function PasswordInput({
  value,
  onChange,
  placeholder = 'Password',
  name,
  autoComplete = 'off',
  style,
  required = false
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type={showPassword ? 'text' : 'password'}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        style={{
          width: '100%',
          paddingRight: '40px',
          ...style
        }}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '18px',
          color: '#64748b',
          padding: '4px'
        }}
        title={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword ? '👁️' : '👁️‍🗨️'}
      </button>
    </div>
  );
}

