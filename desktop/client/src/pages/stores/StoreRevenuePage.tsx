import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Row, Col, Statistic, message, Empty, Spin, Tag } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined, ShopOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { tokens } from '../../theme/tokens';

interface StoreStats {
  gmvToday: string;
  orderCountToday: string;
  avgPriceToday: string;
  refundAmountToday: string;
  refundCountToday: string;
  waitPay: number;
  unshipped: number;
  shipped: number;
  refunding: number;
  fetchedAt: number;
}

// PDD returns "" when there are no sales yet — show 0 / ¥0 instead of blank.
const num = (v: string) => (v && v.trim() !== '' ? v : '0');
const money = (v: string) => `¥${v && v.trim() !== '' ? v : '0.00'}`;

function StoreRevenuePage() {
  const { id: storeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Tracks the currently-mounted store id so an in-flight refresh can detect a
  // switch and discard its (now stale) response.
  const storeIdRef = useRef(storeId);
  storeIdRef.current = storeId;

  // Reset when switching stores (same component instance, only :id changes) so we
  // never show the previous store's numbers under a new store's header.
  useEffect(() => {
    setStats(null);
    setLoaded(false);
    setLoading(false);
  }, [storeId]);

  const refresh = () => {
    if (!storeId) return;
    // Capture the store this request is for; if the user switches stores while
    // it's in flight, ignore the late response so A's data never lands on B.
    const reqStoreId = storeId;
    setLoading(true);
    api
      .get(`/dashboard/stores/${storeId}/revenue`)
      .then((res) => {
        if (reqStoreId !== storeIdRef.current) return;
        setStats(res.data.data); setLoaded(true);
      })
      .catch((e) => {
        if (reqStoreId !== storeIdRef.current) return;
        const msg2 = e?.response?.data?.error || '获取失败';
        message.error(msg2);
        // 503 → store not running / companion offline
        if (e?.response?.status === 503) setLoaded(true);
      })
      .finally(() => { if (reqStoreId === storeIdRef.current) setLoading(false); });
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
        paddingBottom: 18, borderBottom: `1px solid ${tokens.line}`,
      }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/stores/${storeId}`)} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: tokens.ink, margin: 0, letterSpacing: 0.3 }}>门店数据</h1>
          <span style={{ fontSize: 13, fontWeight: 600, color: tokens.inkSoft }}>
            实时从拼多多拉取今日营收与订单数据{stats ? ` · 更新于 ${new Date(stats.fetchedAt * 1000).toLocaleTimeString('zh-CN')}` : ''}
          </span>
        </div>
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={refresh}
          style={{
            background: tokens.gradient, border: 'none', fontWeight: 800,
            borderRadius: tokens.radius, height: 40, boxShadow: tokens.shadowBrand,
          }}
        >
          {loaded ? '刷新数据' : '获取数据'}
        </Button>
      </div>

      {!loaded ? (
        <Card style={{ borderRadius: tokens.radiusLg, border: `1px solid ${tokens.line}`, boxShadow: tokens.shadowCard }}>
          <div style={{ padding: 60, textAlign: 'center' }}>
            <ShopOutlined style={{ fontSize: 40, color: tokens.inkFaint }} />
            <div style={{ marginTop: 16, fontSize: 15, fontWeight: 700, color: tokens.inkSoft }}>
              点击右上角「获取数据」拉取门店今日营收与订单
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: tokens.inkFaint }}>
              需要店铺已启动并登录
            </div>
          </div>
        </Card>
      ) : loading && !stats ? (
        <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin size="large" /></div>
      ) : !stats ? (
        <Card style={{ borderRadius: tokens.radiusLg, border: `1px solid ${tokens.line}`, boxShadow: tokens.shadowCard }}>
          <Empty description="未获取到数据，请确认店铺已启动并登录后重试" />
        </Card>
      ) : (
        <>
          {/* Today revenue — tinted stat cards */}
          <div style={{ fontSize: 16, fontWeight: 900, color: tokens.ink, marginBottom: 14 }}>今日成交</div>
          <Row gutter={[16, 16]} style={{ marginBottom: 22 }}>
            {([
              { key: 'green' as const, label: '成交金额 (GMV)', value: money(stats.gmvToday), icon: <span style={{ fontWeight: 900 }}>¥</span> },
              { key: 'orange' as const, label: '成交订单数', value: num(stats.orderCountToday), icon: <ShopOutlined /> },
              { key: 'pink' as const, label: '客单价', value: money(stats.avgPriceToday), icon: <span style={{ fontWeight: 900 }}>¥</span> },
            ]).map((s) => {
              const c = tokens.cards[s.key];
              return (
                <Col xs={24} sm={8} key={s.label}>
                  <div style={{ background: c.bg, borderRadius: tokens.radiusLg, padding: '18px 19px' }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: tokens.radius, background: c.iconBg, color: c.accent,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, marginBottom: 13,
                    }}>{s.icon}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1, color: tokens.ink, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: tokens.inkSoft, marginTop: 7 }}>{s.label}</div>
                  </div>
                </Col>
              );
            })}
          </Row>

          {/* Order status breakdown */}
          <Card
            title={<span style={{ fontSize: 15, fontWeight: 900, color: tokens.ink }}>订单状态</span>}
            style={{ borderRadius: tokens.radiusLg, marginBottom: 16, border: `1px solid ${tokens.line}`, boxShadow: tokens.shadowCard }}
          >
            <Row gutter={[24, 24]}>
              <Col span={6}><Statistic title="待付款" value={stats.waitPay} valueStyle={{ fontWeight: 900, color: tokens.ink }} /></Col>
              <Col span={6}><Statistic title="待发货" value={stats.unshipped} valueStyle={{ fontWeight: 900, color: stats.unshipped > 0 ? tokens.amber : tokens.ink }} /></Col>
              <Col span={6}><Statistic title="已发货" value={stats.shipped} valueStyle={{ fontWeight: 900, color: tokens.ink }} /></Col>
              <Col span={6}><Statistic title="退款中" value={stats.refunding} valueStyle={{ fontWeight: 900, color: stats.refunding > 0 ? tokens.red : tokens.ink }} /></Col>
            </Row>
          </Card>

          {/* Refund */}
          <Card
            title={<span style={{ fontSize: 15, fontWeight: 900, color: tokens.ink }}>今日退款 <Tag color="default" style={{ fontSize: 11 }}>售后</Tag></span>}
            style={{ borderRadius: tokens.radiusLg, border: `1px solid ${tokens.line}`, boxShadow: tokens.shadowCard }}
          >
            <Row gutter={[24, 24]}>
              <Col span={12}><Statistic title="退款金额" value={money(stats.refundAmountToday)} valueStyle={{ fontWeight: 900, color: tokens.ink }} /></Col>
              <Col span={12}><Statistic title="退款订单数" value={num(stats.refundCountToday)} valueStyle={{ fontWeight: 900, color: tokens.ink }} /></Col>
            </Row>
          </Card>
        </>
      )}
    </div>
  );
}

export default StoreRevenuePage;
