import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { tokens } from '../theme/tokens';

const { Content } = Layout;

function AuthLayout() {
  return (
    <Layout style={{ minHeight: '100vh', background: tokens.gradient }}>
      <Content style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 24,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28, color: '#fff' }}>
          <img src="/logo.png" alt="多多AI客服" style={{
            width: 72, height: 72, borderRadius: '50%', marginBottom: 14,
            boxShadow: '0 8px 24px rgba(0,0,0,0.22)', objectFit: 'cover',
          }} />
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: 0.5 }}>多多AI客服</h1>
          <p style={{ opacity: 0.92, marginTop: 8, fontSize: 14, fontWeight: 700 }}>让 AI 替你接待每一位顾客</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['7×24 全自动回复', '多店统一管理', '知识库回复准'].map((pt) => (
              <span key={pt} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.16)',
                padding: '7px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 800,
              }}>
                <CheckCircleOutlined style={{ fontSize: 13 }} />{pt}
              </span>
            ))}
          </div>
        </div>
        <div style={{
          width: '100%', maxWidth: 420, background: '#fff', borderRadius: tokens.radiusXl,
          padding: '40px 32px', boxShadow: '0 12px 48px rgba(0,0,0,0.18)',
        }}>
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}

export default AuthLayout;
