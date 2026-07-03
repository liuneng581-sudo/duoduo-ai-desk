import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Button, Spin } from 'antd';
import {
  AppstoreOutlined,
  ShopOutlined,
  ShoppingOutlined,
  QuestionCircleOutlined,
  BarChartOutlined,
  MessageOutlined,
  PictureOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { licenseService } from '../services/licenseService';
import NotificationBell from '../components/NotificationBell';
import SupportModal from '../components/SupportModal';
import { tokens } from '../theme/tokens';

const { Header, Sider, Content } = Layout;

// "图片生成" intentionally placed last/secondary — it's a side tool, not core to
// the AI customer-service workflow (店铺 / 对话 / 知识库 lead).
const menuItems = [
  { key: '/', icon: <AppstoreOutlined />, label: '工作台' },
  { key: '/stores', icon: <ShopOutlined />, label: '店铺管理' },
  { key: '/chat', icon: <MessageOutlined />, label: '对话监控' },
  { key: '/products', icon: <ShoppingOutlined />, label: '商品知识库' },
  { key: '/qa', icon: <QuestionCircleOutlined />, label: '问答知识库' },
  { key: '/revenue', icon: <BarChartOutlined />, label: '门店数据' },
  { key: '/images', icon: <PictureOutlined />, label: '图片生成' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
];

function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    // License gate: only show the app when this machine is activated.
    licenseService.status()
      .then((res) => {
        if (!res.data.data.activated) {
          navigate('/activate', { replace: true });
        }
      })
      .catch(() => navigate('/activate', { replace: true }))
      .finally(() => setAuthChecked(true));
  }, [navigate]);

  // Active route matching. A store sub-feature path (/stores/:id/products|qa|revenue)
  // belongs to that feature's menu item, NOT 店铺管理 — so check those suffixes
  // first, otherwise the naive startsWith('/stores') would wrongly light up 店铺管理.
  const isActive = (key: string) => {
    const p = location.pathname;
    if (key === '/') return p === '/';
    if (p.startsWith('/stores/')) {
      if (p.endsWith('/products')) return key === '/products';
      if (p.endsWith('/qa')) return key === '/qa';
      if (p.endsWith('/revenue')) return key === '/revenue';
      // bare /stores/:id (store detail) belongs to 店铺管理
      return key === '/stores';
    }
    return p.startsWith(key);
  };

  if (!authChecked) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh', background: tokens.bg }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={232}
        collapsedWidth={84}
        style={{
          overflow: 'auto', height: '100vh', position: 'fixed', left: 0, top: 0, bottom: 0,
          zIndex: 10, background: tokens.surface, borderRight: `1px solid ${tokens.line}`,
          padding: '22px 16px',
        }}
        theme="light"
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 6px 22px' }}>
          <img src="/logo.png" alt="多多AI客服" style={{
            width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
            boxShadow: tokens.shadowBrand, objectFit: 'cover',
          }} />
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 900, fontSize: 18, color: tokens.ink, letterSpacing: 0.3 }}>多多AI客服</div>
              <div style={{ fontSize: 11, color: tokens.inkSoft, fontWeight: 700, marginTop: 1 }}>商家智能工作台</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {menuItems.map((item) => {
            const active = isActive(item.key);
            return (
              <div
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 13,
                  padding: collapsed ? '12px 0' : '12px 14px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: tokens.radius, cursor: 'pointer',
                  fontWeight: 700, fontSize: 14.5, transition: '0.15s',
                  color: active ? '#fff' : tokens.inkSoft,
                  background: active ? tokens.gradient : 'transparent',
                  boxShadow: active ? tokens.shadowBrand : 'none',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = tokens.surfaceSoft; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 19, display: 'flex' }}>{item.icon}</span>
                {!collapsed && item.label}
              </div>
            );
          })}
        </nav>
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 84 : 232, transition: 'margin-left 0.2s', background: tokens.bg }}>
        <Header style={{
          padding: '0 24px', background: tokens.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${tokens.line}`, position: 'sticky', top: 0, zIndex: 9, height: 58,
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button type="text" icon={<BookOutlined />} onClick={() => navigate('/help')} title="使用教程">使用教程</Button>
            <SupportModal />
            <NotificationBell />
          </div>
        </Header>

        <Content style={{ margin: 24, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default DashboardLayout;
