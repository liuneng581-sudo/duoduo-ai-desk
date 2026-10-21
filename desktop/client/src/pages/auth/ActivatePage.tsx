import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button, message, Spin, Typography, Tag, Alert } from 'antd';
import { CopyOutlined, KeyOutlined, CustomerServiceOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { licenseService, LicenseStatus } from '../../services/licenseService';
import { tokens } from '../../theme/tokens';
import { SUPPORT_CONTACT_URL, hasSupportContactUrl } from '../../config/supportContact';

const { Paragraph } = Typography;

/** Format date string to local display */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function ActivatePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [licenseInfo, setLicenseInfo] = useState<LicenseStatus | null>(null);
  const [code, setCode] = useState('');
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    licenseService.status()
      .then((res) => {
        if (cancelled) return;
        const data = res.data.data;
        if (data.activated) {
          navigate('/', { replace: true });
          return;
        }
        setLicenseInfo(data);
      })
      .catch(() => { if (!cancelled) message.error('无法获取激活状态，请重启应用'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [navigate]);

  const copyMachineId = async () => {
    try {
      await navigator.clipboard.writeText(licenseInfo?.machineId || '');
      message.success('机器码已复制');
    } catch {
      message.warning('复制失败，请手动选择复制');
    }
  };

  const handleActivate = async () => {
    const trimmed = code.trim();
    if (!trimmed) { message.warning('请输入激活码'); return; }
    setActivating(true);
    try {
      await licenseService.activate(trimmed);
      message.success('激活成功');
      navigate('/', { replace: true });
    } catch (e: any) {
      message.error(e?.response?.data?.error || '激活失败，请检查激活码');
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  }

  const isExpired = licenseInfo?.plan === 'expired';

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <KeyOutlined style={{ fontSize: 28, color: tokens.red }} />
        <h2 style={{ fontSize: 20, fontWeight: 900, color: tokens.ink, margin: '10px 0 4px' }}>应用激活</h2>
        <p style={{ fontSize: 13, color: tokens.inkSoft, margin: 0 }}>一机一码，请将下方机器码发给客服获取激活码</p>
      </div>

      {/* 授权过期提示 */}
      {isExpired && (
        <Alert
          type="warning"
          showIcon
          icon={<ClockCircleOutlined />}
          style={{ marginBottom: 18, borderRadius: tokens.radius }}
          message="授权已过期"
          description={
            <div style={{ fontSize: 12 }}>
              <div>激活时间：{formatDate(licenseInfo?.activatedAt)}</div>
              <div>到期时间：{formatDate(licenseInfo?.expiresAt)}</div>
              <div>授权天数：{licenseInfo?.days}天</div>
              <div style={{ marginTop: 4, color: tokens.red }}>请联系客服获取新的激活码以续期。</div>
            </div>
          }
        />
      )}

      {/* 机器码 */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: tokens.inkSoft, marginBottom: 6 }}>本机机器码</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: tokens.surfaceSoft, border: `1px solid ${tokens.line}`,
          borderRadius: tokens.radius, padding: '10px 12px',
        }}>
          <code style={{ flex: 1, fontSize: 12.5, color: tokens.ink, wordBreak: 'break-all', fontFamily: 'monospace' }}>
            {licenseInfo?.machineId}
          </code>
          <Button size="small" icon={<CopyOutlined />} onClick={copyMachineId}>复制</Button>
        </div>
      </div>

      {/* 激活码输入 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: tokens.inkSoft, marginBottom: 6 }}>激活码</div>
        <Input.TextArea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="粘贴客服发给你的激活码"
          autoSize={{ minRows: 2, maxRows: 4 }}
          style={{ fontFamily: 'monospace', fontSize: 12.5 }}
        />
      </div>

      <Button type="primary" block size="large" loading={activating} onClick={handleActivate} style={{ fontWeight: 800 }}>
        {isExpired ? '重新激活' : '激活'}
      </Button>

      {/* 联系方式 */}
      <Paragraph style={{ textAlign: 'center', marginTop: 18, marginBottom: 0, fontSize: 13 }}>
        <CustomerServiceOutlined style={{ marginRight: 6, color: tokens.inkSoft }} />
        还没有激活码？
        {hasSupportContactUrl() ? (
          <a href={SUPPORT_CONTACT_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>联系客服获取</a>
        ) : (
          <span>请联系软件提供方获取（构建时配置 SUPPORT_CONTACT_URL）</span>
        )}
      </Paragraph>
    </div>
  );
}

export default ActivatePage;
