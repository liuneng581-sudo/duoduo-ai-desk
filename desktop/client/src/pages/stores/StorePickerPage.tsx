import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Select, Spin, Empty, message } from 'antd';
import { ShopOutlined } from '@ant-design/icons';
import { storeService, Store } from '../../services/storeService';
import { tokens } from '../../theme/tokens';

/**
 * Sidebar entry for a store-scoped feature (商品知识库 / 门店数据). These features
 * belong to a specific store, but the sidebar is global — so we ask the user to
 * pick a store first, then route into the existing store-scoped page. This keeps
 * the per-store pages unchanged while giving the feature a top-level entry.
 */
function StorePickerPage({ title, subtitle, target }: {
  title: string;
  subtitle: string;
  target: 'products' | 'revenue' | 'qa';
}) {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    storeService.list()
      .then((res) => {
        if (cancelled) return;
        const list = res.data.data;
        setStores(list);
        // With exactly one store, the picker is a pointless extra click — go
        // straight in. `replace` so Back doesn't bounce the user onto the picker.
        if (list.length === 1) {
          navigate(`/stores/${list[0].id}/${target}`, { replace: true });
        }
      })
      .catch(() => { if (!cancelled) message.error('加载店铺列表失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [navigate, target]);

  const go = (storeId: string) => navigate(`/stores/${storeId}/${target}`);

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: tokens.ink, margin: 0, letterSpacing: 0.3 }}>{title}</h1>
        <span style={{ fontSize: 13, fontWeight: 600, color: tokens.inkSoft }}>{subtitle}</span>
      </div>

      <Card style={{ borderRadius: tokens.radiusLg, border: `1px solid ${tokens.line}`, boxShadow: tokens.shadowCard }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
        ) : stores.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Empty description="还没有店铺，请先到「店铺管理」添加" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: tokens.ink, marginBottom: 12 }}>选择一个店铺</div>
            <Select
              showSearch
              size="large"
              style={{ width: 360, maxWidth: '100%' }}
              placeholder="选择店铺后查看"
              optionFilterProp="label"
              onChange={(v) => go(v)}
              options={stores.map((s) => ({ value: s.id, label: s.name }))}
            />
            {/* Quick-pick cards for fewer stores */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 20 }}>
              {stores.map((s) => (
                <div
                  key={s.id}
                  onClick={() => go(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    padding: '12px 16px', borderRadius: tokens.radius, border: `1px solid ${tokens.line}`,
                    background: tokens.surfaceSoft, minWidth: 200, transition: '0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = tokens.red)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = tokens.line)}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: tokens.radius, background: tokens.gradientWarm,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                    fontWeight: 800, flexShrink: 0,
                  }}>{(s.name || '店')[0]}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: tokens.ink }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: tokens.inkSoft }}>
                      <ShopOutlined style={{ marginRight: 4 }} />点击查看
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export default StorePickerPage;
