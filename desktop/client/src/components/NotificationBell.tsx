import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Dropdown, Button, List, Tag, Empty, Tooltip } from 'antd';
import { BellOutlined, LoginOutlined, ExclamationCircleOutlined, WarningOutlined, CustomerServiceOutlined, ReloadOutlined, CheckOutlined } from '@ant-design/icons';
import api from '../services/api';

interface PddAlert {
  storeId: string;
  storeName: string;
  type: 'needs_login' | 'needs_captcha' | 'error' | 'login_expired' | 'needs_human';
  message: string;
  timestamp: string;
  conversationId?: string;
}

/** Format relative time in Chinese */
function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

/**
 * Global notification bell shown in the header on every page. Polls /pdd/alerts
 * (login-needed, captcha-verification-needed, connection error, needs-human handoff)
 * so the store owner is reminded to act no matter which page they're on.
 */
function NotificationBell() {
  const [alerts, setAlerts] = useState<PddAlert[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAlerts = useCallback(() => {
    api.get('/pdd/alerts')
      .then((res) => setAlerts(res.data.data || []))
      .catch(() => { /* transient — keep last known */ });
  }, []);

  useEffect(() => {
    fetchAlerts();
    intervalRef.current = setInterval(fetchAlerts, 10000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchAlerts]);

  // Force refresh when opening the dropdown
  const handleOpenChange = (visible: boolean) => {
    setOpen(visible);
    if (visible) fetchAlerts();
  };

  const handleAlertClick = (a: PddAlert) => {
    setOpen(false);
    if (a.type === 'needs_human' && a.conversationId) {
      // Navigate to the specific conversation
      navigate(`/chat?conversationId=${a.conversationId}`);
    } else {
      navigate(`/stores/${a.storeId}`);
    }
  };

  const handleAck = (e: React.MouseEvent, a: PddAlert) => {
    e.stopPropagation();
    // Call ack endpoint to dismiss store alerts
    if (a.type !== 'needs_human') {
      api.post(`/pdd/alerts/${a.storeId}/ack`).catch(() => {});
    }
    // Remove from local state immediately for responsiveness
    setAlerts((prev) => prev.filter((item) =>
      !(item.storeId === a.storeId && item.type === a.type && item.conversationId === a.conversationId)
    ));
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

  const panel = (
    <div style={{
      width: 360, maxHeight: 440, overflow: 'auto', background: '#fff',
      borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', border: '1px solid #f0f0f0',
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #f0f0f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 500, fontSize: 14 }}>
          通知{alerts.length > 0 ? ` (${alerts.length})` : ''}
        </span>
        <Tooltip title="刷新">
          <Button type="text" size="small" icon={<ReloadOutlined />} onClick={fetchAlerts} />
        </Tooltip>
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
              onClick={() => handleAlertClick(a)}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAF9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {iconFor(a.type)}
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A', flex: 1 }}>{a.storeName}</span>
                  {labelFor(a.type)}
                  <Tooltip title="忽略">
                    <Button
                      type="text"
                      size="small"
                      icon={<CheckOutlined style={{ fontSize: 12 }} />}
                      onClick={(e) => handleAck(e, a)}
                      style={{ opacity: 0.6 }}
                    />
                  </Tooltip>
                </div>
                <div style={{ fontSize: 12, color: '#8A8A8A', paddingLeft: 22 }}>{a.message}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 22, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: '#1677ff' }}>点击前往处理 →</span>
                  <span style={{ fontSize: 11, color: '#BFBFBF' }}>{relativeTime(a.timestamp)}</span>
                </div>
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
      onOpenChange={handleOpenChange}
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
