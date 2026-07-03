import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Spin, message, Alert, Button } from 'antd';
import {
  ShopOutlined,
  MessageOutlined,
  WarningOutlined,
  LoginOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import { tokens } from '../../theme/tokens';

interface PddAlert {
  storeId: string;
  storeName: string;
  type: 'needs_login' | 'needs_captcha' | 'login_expired' | 'error';
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

interface StoreCard {
  id: string;
  name: string;
  status: string;
  browserState: string;
  totalConversations: number;
  activeConversations: number;
  resolvedConversations: number;
  todayOrders: number;
  todayRevenue: number;
  todayConversations: number;
  needsAttention: number;
}

// Mini sparkline SVG — placeholder for now (will render real trends later)
const Sparkline = ({ color = '#d9d9d9' }: { color?: string }) => (
  <svg width="80" height="20" style={{ display: 'block' }}>
    <polyline
      fill="none"
      stroke={color}
      strokeWidth="1"
      points="0,15 10,12 20,13 30,8 40,6 50,10 60,5 70,3 80,4"
    />
  </svg>
);

function DashboardPage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<StoreCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<PddAlert[]>([]);

  // Fetch dashboard data
  useEffect(() => {
    let cancelled = false;
    api
      .get('/dashboard/overview')
      .then((res) => {
        if (cancelled) return;
        setStores(res.data.data);
      })
      .catch(() => {
        if (cancelled) return;
        message.error('加载仪表盘失败，请先登录');
        navigate('/login');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [navigate]);

  // Poll for PDD alerts (manual login, captcha, etc.)
  const fetchAlerts = useCallback(() => {
    api.get('/pdd/alerts').then((res) => {
      setAlerts(res.data.data || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000); // poll every 10s
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const dismissAlert = async (storeId: string) => {
    try {
      await api.post(`/pdd/alerts/${storeId}/ack`);
    } catch {
      message.error('确认失败');
      return;
    }
    setAlerts((prev) => prev.filter((a) => a.storeId !== storeId));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </div>
    );
  }

  const totalOrders = stores.reduce((s, st) => s + st.todayOrders, 0);
  const totalRevenue = stores.reduce((s, st) => s + st.todayRevenue, 0);
  const totalConvs = stores.reduce((s, st) => s + st.todayConversations, 0);
  const totalAttention = stores.reduce((s, st) => s + st.needsAttention, 0);

  return (
    <div>
      {/* Hero — surfaces the product's selling points */}
      <div style={{
        background: tokens.gradient, borderRadius: tokens.radiusXl, padding: '24px 28px',
        color: '#fff', position: 'relative', overflow: 'hidden', marginBottom: 22,
        boxShadow: tokens.shadowHero,
      }}>
        <div style={{ position: 'absolute', right: -40, top: -60, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.13)' }} />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.95, marginBottom: 6 }}>
            {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} · 今天有 {stores.length} 家店铺由 AI 守护中
          </div>
          <h1 style={{ fontSize: 25, fontWeight: 900, margin: 0, letterSpacing: 0.4 }}>让 AI 替你接待每一位顾客</h1>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            {['AI 全自动回复 · 7×24 不打烊', '多店统一管理', '知识库加持，回复准确不胡说'].map((pt) => (
              <div key={pt} style={{
                display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.16)',
                padding: '9px 14px', borderRadius: tokens.radius, fontSize: 13, fontWeight: 800,
              }}>
                <CheckCircleOutlined style={{ fontSize: 15 }} />{pt}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary stat cards (tinted) */}
      <Row gutter={[16, 16]} style={{ marginBottom: 22 }}>
        {[
          { key: 'pink' as const, label: '今日对话数', value: totalConvs.toLocaleString(), icon: <MessageOutlined /> },
          { key: 'orange' as const, label: '今日订单', value: totalOrders.toLocaleString(), icon: <ShopOutlined /> },
          { key: 'green' as const, label: '今日营收', value: `¥${totalRevenue.toLocaleString()}`, icon: <span style={{ fontWeight: 900 }}>¥</span> },
          { key: 'blue' as const, label: totalAttention > 0 ? '需关注' : '活跃店铺', value: (totalAttention > 0 ? totalAttention : stores.length).toLocaleString(), icon: <WarningOutlined /> },
        ].map((s) => {
          const c = tokens.cards[s.key];
          return (
            <Col xs={12} lg={6} key={s.label}>
              <div style={{ background: c.bg, borderRadius: tokens.radiusLg, padding: '18px 19px' }}>
                <div style={{
                  width: 42, height: 42, borderRadius: tokens.radius, background: c.iconBg, color: c.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, marginBottom: 13,
                }}>{s.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: tokens.ink, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: tokens.inkSoft, marginTop: 7 }}>{s.label}</div>
              </div>
            </Col>
          );
        })}
      </Row>

      {/* PDD Alerts — Strong notification for manual action needed */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {alerts.map((alert) => {
            const isLogin = alert.type === 'needs_login' || alert.type === 'login_expired';
            const isCaptcha = alert.type === 'needs_captcha';
            const isError = alert.type === 'error';

            return (
              <Alert
                key={alert.storeId}
                type={isError ? 'error' : 'warning'}
                showIcon
                icon={isLogin ? <LoginOutlined /> : isCaptcha ? <ExclamationCircleOutlined /> : <WarningOutlined />}
                message={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>
                        {isLogin && `店铺「${alert.storeName}」需要登录`}
                        {isCaptcha && `店铺「${alert.storeName}」需要完成验证`}
                        {isError && `店铺「${alert.storeName}」连接异常`}
                      </strong>
                      <span style={{ marginLeft: 12, color: '#666', fontSize: 13 }}>
                        {alert.message}
                      </span>
                    </div>
                    <Button size="small" onClick={() => dismissAlert(alert.storeId)}>
                      知道了
                    </Button>
                  </div>
                }
                style={{
                  marginBottom: 8,
                  borderRadius: tokens.radius,
                  border: isError ? '1px solid #ffccc7' : '1px solid #ffe58f',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Store cards */}
      <div style={{ fontSize: 16, fontWeight: 900, color: tokens.ink, marginBottom: 14 }}>店铺概览</div>
      <Row gutter={[16, 16]}>
        {stores.map((store) => {
          const isWarning = store.needsAttention > 0;
          return (
            <Col xs={24} sm={12} lg={12} xl={6} key={store.id}>
              <Card
                hoverable
                onClick={() => navigate(`/stores/${store.id}`)}
                style={{
                  borderTop: isWarning ? `2px solid ${tokens.red}` : `1px solid ${tokens.line}`,
                  borderRadius: tokens.radiusLg,
                  boxShadow: tokens.shadowCard,
                  cursor: 'pointer',
                }}
                styles={{ body: { padding: '20px 20px 16px' } }}
              >
                {/* Store name + status dot */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#1A1A1A',
                  }}>
                    {store.name}
                  </span>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: isWarning ? '#E53E3E' : '#389E0D',
                    display: 'inline-block',
                  }} />
                </div>

                {/* Stats row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px 16px',
                  marginBottom: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#8A8A8A' }}>对话</div>
                    <div style={{ fontSize: 18, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      {store.todayConversations.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8A8A8A' }}>订单</div>
                    <div style={{ fontSize: 18, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      {store.todayOrders.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#8A8A8A' }}>营收</div>
                    <div style={{ fontSize: 18, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      ¥{store.todayRevenue.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: isWarning ? '#E53E3E' : '#8A8A8A' }}>
                      {isWarning ? '需关注' : '正常'}
                    </div>
                    <div style={{
                      fontSize: 18,
                      fontWeight: isWarning ? 600 : 500,
                      color: isWarning ? '#E53E3E' : '#1A1A1A',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {store.needsAttention || '0'}
                    </div>
                  </div>
                </div>

                {/* Sparkline + state */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: 8,
                  borderTop: '1px solid #F5F5F5',
                }}>
                  <Sparkline color={isWarning ? '#E53E3E' : '#389E0D'} />
                  <span style={{
                    fontSize: 10,
                    color: store.browserState === 'online' ? '#389E0D' : '#8A8A8A',
                  }}>
                    {store.browserState === 'online' ? '在线' : '离线'}
                  </span>
                </div>
              </Card>
            </Col>
          );
        })}

        {stores.length === 0 && (
          <Col span={24}>
            <Card style={{ textAlign: 'center', padding: 60, color: '#8A8A8A' }}>
              <p style={{ fontSize: 15, color: '#4A4A4A' }}>暂无店铺</p>
              <p style={{ fontSize: 13 }}>
                前往「店铺管理」添加你的第一个拼多多店铺，开始 AI 客服之旅
              </p>
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
}

export default DashboardPage;
