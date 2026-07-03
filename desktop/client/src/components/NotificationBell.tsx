import { useState, useEffect, useCallback } from 'react';
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

/**
 * Global notification bell shown in the header on every page. Polls /pdd/alerts
 * (login-needed, captcha-verification-needed, connection error) so the store
 * owner is reminded to act no matter which page they're on. Clicking an alert
 * jumps to that store so they can log in / complete verification.
 */
function NotificationBell() {
  const [alerts, setAlerts] = useState<PddAlert[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const fetchAlerts = useCallback(() => {
    api.get('/pdd/alerts')
      .then((res) => setAlerts(res.data.data || []))
      .catch(() => { /* transient — keep last known */ });
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const goToStore = (storeId: string) => {
    setOpen(false);
    navigate(`/stores/${storeId}`);
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
      width: 340, maxHeight: 420, overflow: 'auto', background: '#fff',
      borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', border: '1px solid #f0f0f0',
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 500, fontSize: 14 }}>
        通知{alerts.length > 0 ? ` (${alerts.length})` : ''}
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
              onClick={() => goToStore(a.storeId)}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAF9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {iconFor(a.type)}
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A1A' }}>{a.storeName}</span>
                  {labelFor(a.type)}
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
      onOpenChange={setOpen}
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
