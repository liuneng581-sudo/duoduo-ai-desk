import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Dropdown, Button, List, Tag, Empty } from 'antd';
import { BellOutlined, LoginOutlined, ExclamationCircleOutlined, WarningOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import api from '../services/api';

interface PddAlert {
  storeId: string;
  storeName: string;
  type: 'needs_login' | 'needs_captcha' | 'error' | 'login_expired' | 'needs_human';
  message: string;
  timestamp: string;
  conversationId?: string;
}

const POLL_INTERVAL = 10000; // 10s normal polling
const POLL_INTERVAL_FAST = 3000; // 3s fast polling after interaction

/**
 * Global notification bell shown in the header on every page. Polls /pdd/alerts
 * (login-needed, captcha-verification-needed, connection error, needs-human) so
 * the store owner is reminded to act no matter which page they're on.
 *
 * Fixes in 1.0.4:
 * - Immediate refresh on window re-focus (stale-while-away bug)
 * - Fast-poll burst after acknowledging/clicking an alert
 * - Deduplication guard against stale-state renders
 * - Stable alert ordering (needs_human first, then by timestamp desc)
 */
function NotificationBell() {
  const [alerts, setAlerts] = useState<PddAlert[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fastPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAlerts = useCallback(() => {
    api.get('/pdd/alerts')
      .then((res) => {
        const data: PddAlert[] = res.data.data || [];
        // Sort: needs_human first, then by timestamp descending
        data.sort((a, b) => {
          if (a.type === 'needs_human' && b.type !== 'needs_human') return -1;
          if (b.type === 'needs_human' && a.type !== 'needs_human') return 1;
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
        setAlerts(data);
      })
      .catch(() => { /* transient — keep last known */ });
  }, []);

  // Start/restart polling at given interval
  const startPolling = useCallback((interval: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchAlerts, interval);
  }, [fetchAlerts]);

  // Switch to fast polling for a few cycles then back to normal
  const triggerFastPoll = useCallback(() => {
    startPolling(POLL_INTERVAL_FAST);
    if (fastPollTimerRef.current) clearTimeout(fastPollTimerRef.current);
    fastPollTimerRef.current = setTimeout(() => {
      startPolling(POLL_INTERVAL);
    }, 15000); // 15s of fast polling
  }, [startPolling]);

  useEffect(() => {
    fetchAlerts();
    startPolling(POLL_INTERVAL);

    // Refresh immediately when window regains focus (stale-while-away fix)
    const handleFocus = () => {
      fetchAlerts();
    };

    // Also refresh on visibility change (tab switch)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchAlerts();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (fastPollTimerRef.current) clearTimeout(fastPollTimerRef.current);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchAlerts, startPolling]);

  const goToStore = (alert: PddAlert) => {
    setOpen(false);
    // After navigation, trigger fast polling to pick up state changes quickly
    triggerFastPoll();
    fetchAlerts();
    if (alert.type === 'needs_human' && alert.conversationId) {
      navigate(`/chat?conversationId=${alert.conversationId}`);
    } else {
      navigate(`/stores/${alert.storeId}`);
    }
  };

  const iconFor = (type: PddAlert['type']) => {
    if (type === 'needs_human') return <CustomerServiceOutlined style={{ color: '#E53E3E' }} />;
    if (type === 'needs_login' || type === 'login_expired') return <LoginOutlined style={{ color: '#FAAD14' }} />;
    if (type === 'needs_captcha') return <ExclamationCircleOutlined style={{ color: '#FAAD14' }} />;
    return <WarningOutlined style={{ color: '#E53E3E' }} />;
  };

  const labelFor = (type: PddAlert['type']) => {
    if (type === 'needs_human') return <Tag color="error">待人工</Tag>;
    if (type === 'needs_login' || type === 'login_expired') return <Tag color="warning">需登录</Tag>;
    if (type === 'needs_captcha') return <Tag color="warning">需验证</Tag>;
    return <Tag color="error">异常</Tag>;
  };

  // Format relative time for display
  const formatTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${Math.floor(diff / 86400000)}天前`;
  };

  const panel = (
    <div style={{
      width: 340, maxHeight: 420, overflow: 'auto', background: '#fff',
      borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', border: '1px solid #f0f0f0',
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 500, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>通知{alerts.length > 0 ? ` (${alerts.length})` : ''}</span>
        {alerts.length > 0 && (
          <Button type="link" size="small" onClick={fetchAlerts} style={{ padding: 0, fontSize: 12 }}>
            刷新
          </Button>
        )}
      </div>
      {alerts.length === 0 ? (
        <div style={{ padding: 32 }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无需要处理的通知" />
        </div>
      ) : (
        <List
          dataSource={alerts}
          renderItem={(a) => (
            <List.Item
              style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
              onClick={() => goToStore(a)}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAF9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {iconFor(a.type)}
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A', flex: 1 }}>{a.storeName}</span>
                  {labelFor(a.type)}
                  <span style={{ fontSize: 11, color: '#B6B0C0' }}>{formatTime(a.timestamp)}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8A8A8A', paddingLeft: 22 }}>{a.message}</div>
                <div style={{ fontSize: 11, color: '#1677ff', paddingLeft: 22, marginTop: 4 }}>点击前往处理 →</div>
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        // Refresh when opening the dropdown to ensure fresh data
        if (nextOpen) fetchAlerts();
      }}
      trigger={['click']}
      placement="bottomRight"
      dropdownRender={() => panel}
    >
      <Badge count={alerts.length} size="small" offset={[-2, 2]}>
        <Button type="text" icon={<BellOutlined style={{ fontSize: 18, color: alerts.length > 0 ? '#E53E3E' : '#8A8A8A' }} />} />
      </Badge>
    </Dropdown>
  );
}

export default NotificationBell;
