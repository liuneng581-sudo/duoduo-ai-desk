import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Row, Col, Spin, Tag, Typography, Button, Empty, List, Drawer, message, Switch, Tooltip, Input } from 'antd';
import { ArrowLeftOutlined, ShoppingOutlined, QuestionCircleOutlined, BarChartOutlined, RobotOutlined, SendOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { storeService } from '../../services/storeService';
import { tokens } from '../../theme/tokens';
import StoreBrowserPanel from './StoreBrowserPanel';

const { Paragraph } = Typography;

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
  id: string;
  name: string;
  status: string;
  browserState: string;
  todayOrderCount: number;
  todayRevenue: number;
  todayConversationCount: number;
  activeConversationCount: number;
  recentConversations: ConversationItem[];
  recentOrders: Array<{
    id: string;
    status: string;
    totalAmount: number;
    createdAt: string;
  }>;
}

const contextLabels: Record<string, string> = {
  presale: '售前',
  insale: '售中',
  aftersale: '售后',
};

const contextColors: Record<string, string> = {
  presale: '#1677ff',
  insale: tokens.green,
  aftersale: '#FAAD14',
};

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
  orderSn?: string | null;
  relatedProducts?: Array<{ name: string; price: number; productUrl: string | null }>;
  messages: MessageItem[];
}

const orderStatusLabels: Record<string, string> = {
  pending: '待付款',
  paid: '已付款',
  shipped: '已发货',
  delivered: '已签收',
  completed: '已完成',
  refunded: '已退款',
  cancelled: '已取消',
};

function StoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [aiToggling, setAiToggling] = useState(false);
  // "敏感场景转人工" toggle — when off, AI handles adversarial scenes too (the
  // 非必要不转人工 extreme). Default comes from the store record.
  const [aiPauseOnSensitive, setAiPauseOnSensitive] = useState<boolean | null>(null);
  const [pauseToggling, setPauseToggling] = useState(false);
  // Live browser state from the companion (the summary's DB value is a snapshot
  // taken at page load and goes stale once the store connects/disconnects).
  const [liveState, setLiveState] = useState<string | null>(null);

  // Detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Manual reply (human takeover) — only used when AI handed off
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    if (!id) return;
    // Reset loading on store switch (same component, only :id changes) so we
    // don't briefly show the previous store's data. `cancelled` guards against
    // a slow response landing after the user already switched/left.
    let cancelled = false;
    setLoading(true);
    setStore(null);
    setAiEnabled(null);
    setAiPauseOnSensitive(null);
    // Load the AI on/off state alongside the summary.
    storeService.get(id)
      .then((res) => { if (!cancelled) { setAiEnabled(res.data.data.aiEnabled); setAiPauseOnSensitive(res.data.data.aiPauseOnSensitive); } })
      .catch(() => { /* non-fatal — switch just won't show */ });
    api
      .get(`/dashboard/stores/${id}/summary`)
      .then((res) => { if (!cancelled) setStore(res.data.data); })
      .catch(() => {
        if (cancelled) return;
        // Don't bounce to home on a transient summary error — that unmounts the
        // embedded browser panel and traps the user. Show a minimal shell so the
        // store browser (login/verification) still works; stats just stay empty.
        message.warning('店铺统计数据加载失败，浏览器仍可使用');
        setStore((prev) => prev || {
          id: id!, name: '店铺', status: 'idle', browserState: 'connecting',
          todayOrderCount: 0, todayRevenue: 0, todayConversationCount: 0,
          activeConversationCount: 0, recentConversations: [], recentOrders: [],
        });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Poll the companion's live browser state so the 在线/离线 indicator reflects
  // reality (the summary's browserState is only a load-time snapshot).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const tick = () => {
      storeService.getStatus(id)
        .then((res) => { if (!cancelled) setLiveState(res.data.data.state); })
        .catch(() => { /* transient — keep last known */ });
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </div>
    );
  }

  const openDetail = (convId: string) => {
    setDetailLoading(true);
    setDrawerOpen(true);
    setReplyText('');
    api.get(`/chat/conversations/${convId}`)
      .then((res) => setDetail(res.data.data))
      .catch(() => message.error('加载对话详情失败'))
      .finally(() => setDetailLoading(false));
  };

  // Human takeover: send one manual reply to the customer (only surfaced when the
  // AI handed this conversation off). Reloads the thread so the sent message shows.
  const sendManualReply = async () => {
    if (!detail) return;
    const text = replyText.trim();
    if (!text) return;
    setReplying(true);
    try {
      await api.post(`/chat/conversations/${detail.id}/reply`, { content: text });
      setReplyText('');
      message.success('已发送');
      const res = await api.get(`/chat/conversations/${detail.id}`);
      setDetail(res.data.data);
    } catch (e: any) {
      message.error(e?.response?.data?.error || '发送失败');
    } finally {
      setReplying(false);
    }
  };

  const toggleAi = async (checked: boolean) => {
    if (!id) return;
    setAiToggling(true);
    try {
      await storeService.update(id, { aiEnabled: checked });
      setAiEnabled(checked);
      message.success(checked ? 'AI 自动回复已开启' : 'AI 自动回复已关闭，消息将等待人工处理');
    } catch {
      message.error('切换失败');
    } finally {
      setAiToggling(false);
    }
  };

  const togglePauseOnSensitive = async (checked: boolean) => {
    if (!id) return;
    setPauseToggling(true);
    try {
      await storeService.update(id, { aiPauseOnSensitive: checked });
      setAiPauseOnSensitive(checked);
      message.success(checked ? '遇到投诉/纠纷等对抗场景将转人工' : '已关闭：对抗场景也由 AI 自动应对');
    } catch {
      message.error('切换失败');
    } finally {
      setPauseToggling(false);
    }
  };

  if (!store) return null;

  // Prefer the live companion state; fall back to the summary snapshot.
  const effectiveState = liveState || store.browserState;
  const attentionCount = store.activeConversationCount;
  const hasWarning = attentionCount > 0;

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 22,
      }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/stores')}
        />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: tokens.ink, margin: 0, letterSpacing: 0.3 }}>
            {store.name}
          </h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              backgroundColor: effectiveState === 'online' ? tokens.green : tokens.inkFaint,
              display: 'inline-block',
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: tokens.inkSoft }}>
              {effectiveState === 'online' ? '在线' : '离线'}
            </span>
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <Stat label="今日对话" value={store.todayConversationCount} />
          <Stat label="活跃中" value={store.activeConversationCount} warn={hasWarning} />
          <Stat label="今日订单" value={store.todayOrderCount} />
          <Stat label="今日营收" value={`¥${store.todayRevenue.toLocaleString()}`} />
          {aiEnabled !== null && (
            <Tooltip title={aiEnabled ? 'AI 正在自动回复客户。关闭后消息将等待人工处理' : 'AI 已关闭，新消息不会自动回复'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RobotOutlined style={{ color: aiEnabled ? tokens.green : tokens.inkFaint, fontSize: 15 }} />
                <span style={{ fontSize: 12, color: tokens.inkSoft }}>AI 自动回复</span>
                <Switch size="small" checked={aiEnabled} loading={aiToggling} onChange={toggleAi} />
              </div>
            </Tooltip>
          )}
          {aiEnabled && aiPauseOnSensitive !== null && (
            <Tooltip title={aiPauseOnSensitive ? '遇到投诉/纠纷/差评/举报等对抗场景时转人工处理。关闭后这些场景也由 AI 应对' : '已关闭：所有场景（含投诉/纠纷）都由 AI 自动应对，不转人工'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: tokens.inkSoft }}>对抗场景转人工</span>
                <Switch size="small" checked={aiPauseOnSensitive} loading={pauseToggling} onChange={togglePauseOnSensitive} />
              </div>
            </Tooltip>
          )}
          <Button icon={<ShoppingOutlined />} onClick={() => navigate(`/stores/${id}/products`)}>
            商品知识库
          </Button>
          <Button icon={<QuestionCircleOutlined />} onClick={() => navigate(`/stores/${id}/qa`)}>
            问答知识库
          </Button>
          <Button icon={<BarChartOutlined />} onClick={() => navigate(`/stores/${id}/revenue`)}>
            门店数据
          </Button>
        </div>
      </div>

      {/* Embedded store browser — the PDD session runs inside the app here.
          Manual login / captcha verification happens directly in this view. */}
      <Card
        title={<span style={{ fontSize: 14, fontWeight: 500 }}>店铺浏览器</span>}
        style={{ borderRadius: 13, marginBottom: 16 }}
        styles={{ body: { padding: 8 } }}
      >
        {id && <StoreBrowserPanel storeId={id} />}
      </Card>

      <Row gutter={[16, 16]}>
        {/* Conversation timeline */}
        <Col span={16}>
          <Card
            title={
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                对话时间线
                <span style={{ fontSize: 12, color: tokens.inkSoft, fontWeight: 400, marginLeft: 8 }}>
                  AI 自动判断售前/售中/售后
                </span>
              </span>
            }
            style={{ borderRadius: 13 }}
            styles={{ body: { padding: 0 } }}
          >
            {store.recentConversations.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <Empty description="暂无对话" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              <List
                dataSource={store.recentConversations}
                renderItem={(item) => {
                  const contextLabel = contextLabels[item.context] || item.context;
                  const contextColor = contextColors[item.context] || tokens.inkSoft;
                  const isActive = item.status === 'active';
                  const isPendingHuman = item.status === 'pending_human';
                  const lastIsUser = item.lastMessageRole === 'user';

                  return (
                    <List.Item
                      onClick={() => openDetail(item.id)}
                      style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #F0F0F0',
                        borderLeft: isPendingHuman ? '2px solid #FAAD14' : isActive ? '2px solid #E53E3E' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAF9')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4,
                        }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Tag
                              color={contextColor}
                              style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}
                            >
                              {contextLabel}
                            </Tag>
                            {isPendingHuman && (
                              <span style={{ fontSize: 10, color: '#FAAD14', fontWeight: 700 }}>待人工</span>
                            )}
                            {isActive && (
                              <span style={{
                                fontSize: 10,
                                color: '#E53E3E',
                                fontWeight: 500,
                              }}>
                                进行中
                              </span>
                            )}
                            {!isActive && !isPendingHuman && (
                              <span style={{ fontSize: 10, color: tokens.green }}>已解决</span>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: tokens.inkSoft }}>
                            {new Date(item.updatedAt).toLocaleTimeString('zh-CN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <Paragraph
                          ellipsis={{ rows: 1 }}
                          style={{
                            margin: 0,
                            fontSize: 13,
                            color: lastIsUser ? tokens.ink : '#4A4A4A',
                          }}
                        >
                          {lastIsUser ? '客户：' : 'AI：'}
                          {item.lastMessage || '(图片消息)'}
                        </Paragraph>
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>

        {/* Recent orders sidebar */}
        <Col span={8}>
          <Card
            title={<span style={{ fontSize: 14, fontWeight: 500 }}>今日订单</span>}
            style={{ borderRadius: 13 }}
            styles={{ body: { padding: 0 } }}
          >
            {store.recentOrders.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Empty description="暂无订单" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              <List
                dataSource={store.recentOrders}
                renderItem={(order) => (
                  <List.Item style={{ padding: '12px 20px', borderBottom: '1px solid #F0F0F0' }}>
                    <div style={{ width: '100%' }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 2,
                      }}>
                        <span style={{ fontSize: 12, color: tokens.inkSoft }}>
                          {orderStatusLabels[order.status] || order.status}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                          ¥{order.totalAmount.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: tokens.inkFaint }}>
                        {new Date(order.createdAt).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Detail Drawer */}
      <Drawer
        title={
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{detail?.title || '对话详情'}</div>
            {detail && (
              <Tag color={contextColors[detail.context]} style={{ marginTop: 4 }}>
                {contextLabels[detail.context] || detail.context}
              </Tag>
            )}
          </div>
        }
        placement="right"
        width={520}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDetail(null); }}
        footer={detail ? (
          <div>
            {detail.status === 'pending_human' && (
              <div style={{ fontSize: 12, color: '#E53E3E', marginBottom: 8 }}>
                此对话 AI 已转人工，请手动回复客户
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Input.TextArea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="输入回复，直接发送给客户…"
                autoSize={{ minRows: 1, maxRows: 4 }}
                maxLength={1000}
                onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); sendManualReply(); } }}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={replying}
                disabled={!replyText.trim()}
                onClick={sendManualReply}
              >
                发送
              </Button>
            </div>
          </div>
        ) : null}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin /></div>
        ) : detail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Order / product linkage for this conversation */}
            {(detail.orderSn || (detail.relatedProducts && detail.relatedProducts.length > 0)) && (
              <div style={{
                padding: '12px 14px', background: '#FAFAF9', border: '1px solid #E8E8E8',
                borderRadius: 8, fontSize: 12,
              }}>
                {detail.orderSn && (
                  <div style={{ marginBottom: detail.relatedProducts?.length ? 8 : 0 }}>
                    <span style={{ color: tokens.inkSoft }}>关联订单：</span>
                    <span style={{ color: tokens.ink, fontVariantNumeric: 'tabular-nums' }}>{detail.orderSn}</span>
                  </div>
                )}
                {detail.relatedProducts && detail.relatedProducts.length > 0 && (
                  <div>
                    <span style={{ color: tokens.inkSoft }}>关联商品：</span>
                    {detail.relatedProducts.map((p, i) => (
                      <div key={i} style={{ marginTop: 4, paddingLeft: 8 }}>
                        {p.productUrl
                          ? <a href={p.productUrl} target="_blank" rel="noreferrer">{p.name}</a>
                          : <span style={{ color: tokens.ink }}>{p.name}</span>}
                        <span style={{ color: '#E53E3E', marginLeft: 8 }}>¥{Number(p.price ?? 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {detail.messages.map((msg) => {
              const isUser = msg.role === 'user';
              if (msg.role === 'system') return null;
              return (
                <div key={msg.id} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: isUser ? '#F0F0F0' : '#FAFAF9',
                    border: isUser ? 'none' : '1px solid #E8E8E8',
                    fontSize: 13,
                    lineHeight: '22px',
                    color: tokens.ink,
                  }}>
                    {msg.content}
                  </div>
                  <span style={{ fontSize: 10, color: tokens.inkFaint, marginTop: 4, paddingLeft: 4, paddingRight: 4 }}>
                    {isUser ? '客户' : 'AI'} · {new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

// Mini stat component
function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, color: warn ? '#E53E3E' : tokens.inkSoft, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontSize: 16,
        fontWeight: warn ? 600 : 500,
        color: warn ? '#E53E3E' : tokens.ink,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  );
}

export default StoreDetailPage;
