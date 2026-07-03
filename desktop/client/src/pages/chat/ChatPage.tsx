import { useEffect, useState } from 'react';
import { Card, Select, Typography, List, Spin, Empty, Drawer, message } from 'antd';
import api from '../../services/api';
import { tokens } from '../../theme/tokens';
import { formatTime } from '../../utils/timeFormat';

const { Text, Paragraph } = Typography;

interface StoreInfo {
  id: string;
  name: string;
}

interface ConversationItem {
  id: string;
  context: string;
  status: string;
  title: string | null;
  lastMessage: string;
  lastMessageRole: string | null;
  updatedAt: string;
}

interface StoreSummary {
  name: string;
  todayConversationCount: number;
  activeConversationCount: number;
  recentConversations: ConversationItem[];
}

interface MessageItem {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  context: string;
  title: string | null;
  status: string;
  messages: MessageItem[];
}

const orderContextLabels: Record<string, { label: string; scene: keyof typeof tokens.scene }> = {
  presale: { label: '售前咨询', scene: 'presale' },
  insale: { label: '订单跟踪', scene: 'insale' },
  aftersale: { label: '售后处理', scene: 'aftersale' },
};

// Rounded scene pill matching the design system (售前/售中/售后).
function ScenePill({ context, label }: { context: string; label?: string }) {
  const info = orderContextLabels[context];
  const palette = info ? tokens.scene[info.scene] : { bg: tokens.surfaceSoft, color: tokens.inkSoft };
  const text = label ?? info?.label ?? context;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 10px', borderRadius: tokens.radiusSm,
      background: palette.bg, color: palette.color,
      fontSize: 11, fontWeight: 800, lineHeight: '18px',
    }}>
      {text}
    </span>
  );
}

function ChatPage() {
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [storeSummary, setStoreSummary] = useState<StoreSummary | null>(null);
  const [loading, setLoading] = useState(false);

  // Detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api.get('/dashboard/overview').then((res) => {
      const list = res.data.data.map((s: any) => ({ id: s.id, name: s.name }));
      setStores(list);
      if (list.length > 0 && !selectedStore) setSelectedStore(list[0].id);
    }).catch(() => message.error('加载店铺列表失败'));
  }, []);

  useEffect(() => {
    if (!selectedStore) return;
    // Guard against a slow response for a previous store rendering onto the
    // newly selected one. Clear the summary so we don't show stale numbers.
    let cancelled = false;
    setStoreSummary(null);
    setLoading(true);
    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      api.get(`/dashboard/stores/${selectedStore}/summary`)
        .then((res) => { if (!cancelled) setStoreSummary(res.data.data); })
        .catch(() => { /* keep last known on transient error */ })
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    load(true);
    // Poll so new conversations / message progress show up without a manual
    // refresh (the monitor was static before — looked like nothing happened).
    const timer = setInterval(() => load(false), 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [selectedStore]);

  const openDetail = (convId: string) => {
    setDetailLoading(true);
    setDrawerOpen(true);
    api.get(`/chat/conversations/${convId}`)
      .then((res) => setDetail(res.data.data))
      .catch(() => message.error('加载对话详情失败'))
      .finally(() => setDetailLoading(false));
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 22,
        paddingBottom: 16,
        borderBottom: `1px solid ${tokens.line}`,
      }}>
        <div>
          <h1 style={{ fontSize: 23, fontWeight: 900, color: tokens.ink, margin: 0, letterSpacing: 0.3 }}>对话监控</h1>
          <p style={{ fontSize: 13, fontWeight: 700, color: tokens.inkSoft, margin: '5px 0 0' }}>
            实时查看 AI 客服对话，场景自动识别（售前/售中/售后）
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {storeSummary && (
            <>
              <span style={{ fontSize: 13, fontWeight: 700, color: tokens.inkSoft }}>
                今日对话：<b style={{ color: tokens.ink }}>{storeSummary.todayConversationCount}</b>
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: tokens.red }}>
                进行中：<b>{storeSummary.activeConversationCount}</b>
              </span>
            </>
          )}
          <Select
            value={selectedStore}
            onChange={setSelectedStore}
            style={{ width: 200 }}
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="选择店铺"
          />
        </div>
      </div>

      {/* Conversation list */}
      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin /></div>
      ) : storeSummary && storeSummary.recentConversations.length > 0 ? (
        <Card
          style={{ borderRadius: tokens.radiusLg, border: `1px solid ${tokens.line}`, boxShadow: tokens.shadowCard }}
          styles={{ body: { padding: 10 } }}
        >
          <List
            split={false}
            dataSource={storeSummary.recentConversations}
            renderItem={(item) => {
              const ctxInfo = orderContextLabels[item.context];
              const isActive = item.status === 'active';
              const isPendingHuman = item.status === 'pending_human';
              const lastIsUser = item.lastMessageRole === 'user';

              return (
                <List.Item
                  onClick={() => openDetail(item.id)}
                  style={{
                    padding: '14px 16px',
                    marginBottom: 8,
                    borderRadius: tokens.radius,
                    background: tokens.surfaceSoft,
                    border: `1px solid ${tokens.line}`,
                    borderLeft: isActive ? `3px solid ${tokens.red}` : `1px solid ${tokens.line}`,
                    cursor: 'pointer',
                    transition: 'background 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = tokens.surface; e.currentTarget.style.boxShadow = tokens.shadowCard; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = tokens.surfaceSoft; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ width: '100%' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Text strong style={{ fontSize: 13.5, fontWeight: 800, color: tokens.ink }}>{item.title || '对话'}</Text>
                        <ScenePill context={item.context} label={ctxInfo?.label} />
                        {isPendingHuman ? (
                          <span style={{ fontSize: 11, color: '#FAAD14', fontWeight: 800 }}>待人工</span>
                        ) : isActive ? (
                          <span style={{ fontSize: 11, color: tokens.red, fontWeight: 800 }}>进行中</span>
                        ) : (
                          <span style={{ fontSize: 11, color: tokens.green, fontWeight: 700 }}>已结束</span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: tokens.inkFaint }}>
                        {formatTime(item.updatedAt)}
                      </span>
                    </div>
                    <Paragraph ellipsis={{ rows: 1 }} style={{ margin: 0, fontSize: 13, color: tokens.inkSoft }}>
                      {lastIsUser ? '客户：' : 'AI：'}
                      {item.lastMessage || '(无消息)'}
                    </Paragraph>
                  </div>
                </List.Item>
              );
            }}
          />
        </Card>
      ) : (
        <Card style={{ borderRadius: tokens.radiusLg, border: `1px solid ${tokens.line}`, boxShadow: tokens.shadowCard }}>
          <Empty description="暂无对话" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      )}

      {/* Detail Drawer */}
      <Drawer
        title={
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: tokens.ink }}>
              {detail?.title || '对话详情'}
            </div>
            {detail && (
              <div style={{ marginTop: 6 }}>
                <ScenePill context={detail.context} label={orderContextLabels[detail.context]?.label} />
              </div>
            )}
          </div>
        }
        placement="right"
        width={520}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDetail(null); }}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin /></div>
        ) : detail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {detail.messages.map((msg) => {
              const isUser = msg.role === 'user';
              const isSystem = msg.role === 'system';
              if (isSystem) return null;

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{
                    maxWidth: '85%',
                    padding: '11px 15px',
                    borderRadius: tokens.radius,
                    background: isUser ? tokens.gradient : tokens.surfaceSoft,
                    border: isUser ? 'none' : `1px solid ${tokens.line}`,
                    fontSize: 13,
                    lineHeight: '22px',
                    fontWeight: isUser ? 700 : 500,
                    color: isUser ? '#fff' : tokens.ink,
                    boxShadow: isUser ? tokens.shadowBrand : 'none',
                  }}>
                    {msg.content}
                  </div>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: tokens.inkFaint,
                    marginTop: 5,
                    paddingLeft: 4,
                    paddingRight: 4,
                  }}>
                    {isUser ? '客户' : 'AI'} · {formatTime(msg.createdAt)}
                  </span>
                </div>
              );
            })}
            {detail.messages.length === 0 && (
              <Empty description="暂无消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

export default ChatPage;
