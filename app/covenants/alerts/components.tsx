/**
 * Covenant Alert Components
 *
 * UI components for displaying and managing covenant alerts
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingDown,
  Bell,
  BellOff,
  Check,
  X,
  Clock,
  Mail,
  MessageSquare
} from 'lucide-react';
import { CovenantAlert, AlertSeverity, AlertType, getAlertSeverityColor } from '../data/models';
import { CovenantAlertService } from './service';

interface AlertItemProps {
  alert: CovenantAlert;
  onAcknowledge: (alertId: string) => void;
  onResolve: (alertId: string) => void;
  showActions?: boolean;
}

export function AlertItem({ alert, onAcknowledge, onResolve, showActions = true }: AlertItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getAlertIcon = (type: AlertType) => {
    switch (type) {
      case AlertType.BREACH:
        return <XCircle size={20} style={{ color: '#EF4444' }} />;
      case AlertType.APPROACHING_LIMIT:
        return <AlertTriangle size={20} style={{ color: '#F59E0B' }} />;
      case AlertType.TRENDING_NEGATIVE:
        return <TrendingDown size={20} style={{ color: '#F59E0B' }} />;
      case AlertType.COMPLIANCE_RESTORED:
        return <CheckCircle size={20} style={{ color: '#10B981' }} />;
      default:
        return <Bell size={20} style={{ color: '#6B7280' }} />;
    }
  };

  const getSeverityBadge = (severity: AlertSeverity) => {
    const colors = {
      [AlertSeverity.LOW]: '#10B981',
      [AlertSeverity.MEDIUM]: '#F59E0B',
      [AlertSeverity.HIGH]: '#EF4444',
      [AlertSeverity.CRITICAL]: '#7C2D12'
    };

    return (
      <span style={{
        background: colors[severity],
        color: 'white',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500'
      }}>
        {severity.toUpperCase()}
      </span>
    );
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div style={{
      background: 'white',
      borderRadius: '8px',
      border: `1px solid ${getAlertSeverityColor(alert.severity)}`,
      padding: '16px',
      marginBottom: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {getAlertIcon(alert.alertType)}
          <div>
            <h4 style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#1e293b',
              margin: '0 0 4px 0'
            }}>
              {alert.title}
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {getSeverityBadge(alert.severity)}
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {formatTimeAgo(alert.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {showActions && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {!alert.acknowledgedAt && (
              <button
                onClick={() => onAcknowledge(alert.id)}
                style={{
                  padding: '6px 12px',
                  background: '#3B82F6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Check size={14} />
                Acknowledge
              </button>
            )}
            <button
              onClick={() => onResolve(alert.id)}
              style={{
                padding: '6px 12px',
                background: '#10B981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Check size={14} />
              Resolve
            </button>
          </div>
        )}
      </div>

      {/* Message */}
      <p style={{
        fontSize: '14px',
        color: '#475569',
        margin: '8px 0',
        lineHeight: '1.5'
      }}>
        {alert.message}
      </p>

      {/* Status Indicators */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b' }}>
        {alert.actualValue !== undefined && (
          <span>Actual: <strong>{alert.actualValue.toFixed(2)}</strong></span>
        )}
        {alert.thresholdValue !== undefined && (
          <span>Threshold: <strong>{alert.thresholdValue.toFixed(2)}</strong></span>
        )}
        {alert.breachAmount !== undefined && alert.breachAmount > 0 && (
          <span>Breach: <strong style={{ color: '#EF4444' }}>
            {alert.breachAmount > 0 ? '+' : ''}{alert.breachAmount.toFixed(2)}
          </strong></span>
        )}
      </div>

      {/* Acknowledgment Status */}
      {alert.acknowledgedAt && (
        <div style={{
          marginTop: '8px',
          padding: '6px 12px',
          background: '#F0FDF4',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#166534',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <CheckCircle size={14} />
          Acknowledged {formatTimeAgo(alert.acknowledgedAt)}
          {alert.acknowledgedBy && ` by ${alert.acknowledgedBy}`}
        </div>
      )}

      {/* Resolution Status */}
      {alert.resolvedAt && (
        <div style={{
          marginTop: '8px',
          padding: '6px 12px',
          background: '#F0FDF4',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#166534',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <CheckCircle size={14} />
          Resolved {formatTimeAgo(alert.resolvedAt)}
        </div>
      )}
    </div>
  );
}

interface AlertSummaryProps {
  alerts: CovenantAlert[];
  onAcknowledge: (alertId: string) => void;
  onResolve: (alertId: string) => void;
}

export function AlertSummary({ alerts, onAcknowledge, onResolve }: AlertSummaryProps) {
  const stats = CovenantAlertService.getAlertStats(alerts);

  const activeAlerts = alerts.filter(a => a.isActive && !a.resolvedAt);

  if (activeAlerts.length === 0) {
    return (
      <div style={{
        background: '#F0FDF4',
        border: '1px solid #BBF7D0',
        borderRadius: '8px',
        padding: '16px',
        textAlign: 'center',
        color: '#166534'
      }}>
        <CheckCircle size={24} style={{ margin: '0 auto 8px' }} />
        <div style={{ fontSize: '14px', fontWeight: '500' }}>No active alerts</div>
        <div style={{ fontSize: '12px', color: '#16A34A' }}>All covenants are within acceptable ranges</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
      {/* Active Alerts */}
      <div style={{
        background: stats.active > 0 ? '#FEF2F2' : '#F0FDF4',
        border: `1px solid ${stats.active > 0 ? '#FECACA' : '#BBF7D0'}`,
        borderRadius: '8px',
        padding: '16px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '24px',
          fontWeight: '700',
          color: stats.active > 0 ? '#DC2626' : '#16A34A',
          marginBottom: '4px'
        }}>
          {stats.active}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>Active Alerts</div>
      </div>

      {/* By Severity */}
      <div style={{
        background: '#FEF3C7',
        border: '1px solid #FDE68A',
        borderRadius: '8px',
        padding: '16px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '24px',
          fontWeight: '700',
          color: '#D97706',
          marginBottom: '4px'
        }}>
          {stats.bySeverity[AlertSeverity.CRITICAL] + stats.bySeverity[AlertSeverity.HIGH]}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>Critical/High</div>
      </div>

      {/* Acknowledged */}
      <div style={{
        background: '#DBEAFE',
        border: '1px solid #BFDBFE',
        borderRadius: '8px',
        padding: '16px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '24px',
          fontWeight: '700',
          color: '#2563EB',
          marginBottom: '4px'
        }}>
          {stats.acknowledged}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>Acknowledged</div>
      </div>

      {/* Resolved */}
      <div style={{
        background: '#D1FAE5',
        border: '1px solid #A7F3D0',
        borderRadius: '8px',
        padding: '16px',
        textAlign: 'center'
      }}>
        <div style={{
          fontSize: '24px',
          fontWeight: '700',
          color: '#059669',
          marginBottom: '4px'
        }}>
          {stats.resolved}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>Resolved</div>
      </div>
    </div>
  );
}

interface AlertListProps {
  alerts: CovenantAlert[];
  onAcknowledge: (alertId: string) => void;
  onResolve: (alertId: string) => void;
  filter?: 'all' | 'active' | 'acknowledged' | 'resolved';
  maxItems?: number;
}

export function AlertList({
  alerts,
  onAcknowledge,
  onResolve,
  filter = 'active',
  maxItems
}: AlertListProps) {

  const filteredAlerts = alerts.filter(alert => {
    switch (filter) {
      case 'active':
        return alert.isActive && !alert.resolvedAt;
      case 'acknowledged':
        return alert.acknowledgedAt && !alert.resolvedAt;
      case 'resolved':
        return !!alert.resolvedAt;
      default:
        return true;
    }
  });

  const displayAlerts = maxItems ? filteredAlerts.slice(0, maxItems) : filteredAlerts;

  if (displayAlerts.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '32px',
        color: '#64748b',
        background: '#F9FAFB',
        borderRadius: '8px',
        border: '1px solid #E5E7EB'
      }}>
        <BellOff size={32} style={{ margin: '0 auto 12px' }} />
        <div>No alerts match the current filter</div>
      </div>
    );
  }

  return (
    <div>
      {displayAlerts.map(alert => (
        <AlertItem
          key={alert.id}
          alert={alert}
          onAcknowledge={onAcknowledge}
          onResolve={onResolve}
        />
      ))}
    </div>
  );
}

interface AlertSettingsProps {
  config: {
    emailEnabled: boolean;
    inAppEnabled: boolean;
    notifyUsers: string[];
    alertOnBreach: boolean;
    alertOnApproaching: boolean;
    alertOnTrending: boolean;
    approachingThreshold: number;
    trendPeriod: number;
    trendThreshold: number;
  };
  onUpdate: (updates: Partial<typeof config>) => void;
  availableUsers: Array<{ id: string; name: string; email: string }>;
}

export function AlertSettings({ config, onUpdate, availableUsers }: AlertSettingsProps) {
  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '24px' }}>
        Alert Configuration
      </h3>

      {/* Alert Types */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
          Alert Types
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={config.alertOnBreach}
              onChange={(e) => onUpdate({ alertOnBreach: e.target.checked })}
            />
            <span style={{ fontSize: '14px' }}>Covenant Breaches</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={config.alertOnApproaching}
              onChange={(e) => onUpdate({ alertOnApproaching: e.target.checked })}
            />
            <span style={{ fontSize: '14px' }}>Approaching Limits</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={config.alertOnTrending}
              onChange={(e) => onUpdate({ alertOnTrending: e.target.checked })}
            />
            <span style={{ fontSize: '14px' }}>Negative Trends</span>
          </label>
        </div>
      </div>

      {/* Thresholds */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
          Alert Thresholds
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
              Approaching Threshold (%)
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={config.approachingThreshold}
              onChange={(e) => onUpdate({ approachingThreshold: Number(e.target.value) })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
              Trend Period (months)
            </label>
            <input
              type="number"
              min="2"
              max="12"
              value={config.trendPeriod}
              onChange={(e) => onUpdate({ trendPeriod: Number(e.target.value) })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
              Trend Threshold
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={config.trendThreshold}
              onChange={(e) => onUpdate({ trendThreshold: Number(e.target.value) })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>
        </div>
      </div>

      {/* Notification Methods */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
          Notification Methods
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={config.emailEnabled}
              onChange={(e) => onUpdate({ emailEnabled: e.target.checked })}
            />
            <Mail size={16} />
            <span style={{ fontSize: '14px' }}>Email Notifications</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={config.inAppEnabled}
              onChange={(e) => onUpdate({ inAppEnabled: e.target.checked })}
            />
            <MessageSquare size={16} />
            <span style={{ fontSize: '14px' }}>In-App Notifications</span>
          </label>
        </div>
      </div>

      {/* Notification Recipients */}
      <div>
        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
          Notification Recipients
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {availableUsers.map(user => (
            <label key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={config.notifyUsers.includes(user.id)}
                onChange={(e) => {
                  const newUsers = e.target.checked
                    ? [...config.notifyUsers, user.id]
                    : config.notifyUsers.filter(id => id !== user.id);
                  onUpdate({ notifyUsers: newUsers });
                }}
              />
              <span style={{ fontSize: '14px' }}>{user.name} ({user.email})</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
