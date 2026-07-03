import { useEffect, useState } from 'react';
import {
  Card, Form, Input, Select, Button, Table, Modal, Tabs,
  Typography, message, Popconfirm, Tag, Spin, Space, Divider,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, SendOutlined,
  SaveOutlined, ReloadOutlined,
  RobotOutlined, NotificationOutlined,
  ApiOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import { tokens } from '../../theme/tokens';

const { Title } = Typography;
const { TextArea } = Input;

// Shared card visual props matching the C+A design system
const cardStyle = {
  borderRadius: tokens.radiusLg,
  boxShadow: tokens.shadowCard,
  border: `1px solid ${tokens.line}`,
};

// ── Types ──

interface ProviderItem {
  id: string;
  name: string;
  type: 'chat' | 'image' | 'both';
  protocol: 'openai' | 'anthropic';
  apiBase: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
}

interface SettingsData {
  apiKeys: any[];
  feishuWebhookUrl: string;
  defaultAiProvider: string;
  defaultImageModel: string;
  defaultImageSize: string;
  defaultImageQuality: string;
}

interface StoreOption { id: string; name: string; }

// ── Helpers ──

const typeTag: Record<string, { color: string; label: string }> = {
  chat: { color: 'blue', label: '对话' },
  image: { color: 'green', label: '图片' },
  both: { color: 'purple', label: '对话+图片' },
};
const protoTag: Record<string, { color: string; label: string }> = {
  openai: { color: 'green', label: 'OpenAI 兼容' },
  anthropic: { color: 'orange', label: 'Anthropic 原生' },
};

// ── Provider Table ──

function ProviderTable({
  providers, onEdit, onDelete, onTest,
}: {
  providers: ProviderItem[];
  onEdit: (p: ProviderItem) => void;
  onDelete: (id: string) => void;
  onTest: (p: ProviderItem) => void;
}) {
  return (
    <Table
      dataSource={providers}
      rowKey="id"
      pagination={false}
      locale={{ emptyText: '暂无 Provider，点击右上角添加' }}
      columns={[
        { title: '名称', dataIndex: 'name', key: 'name', width: 120 },
        {
          title: '用途', dataIndex: 'type', key: 'type', width: 100,
          render: (v: string) => <Tag color={typeTag[v]?.color}>{typeTag[v]?.label}</Tag>,
        },
        {
          title: '协议', dataIndex: 'protocol', key: 'protocol', width: 120,
          render: (v: string) => <Tag color={protoTag[v]?.color}>{protoTag[v]?.label}</Tag>,
        },
        {
          title: 'API 地址', dataIndex: 'apiBase', key: 'apiBase', ellipsis: true,
          render: (v: string) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</span>,
        },
        {
          title: '模型', dataIndex: 'models', key: 'models', width: 200,
          render: (models: string[], r: ProviderItem) => (
            <span style={{ fontSize: 12 }}>
              {models.slice(0, 3).map((m) => (
                <Tag key={m} color={m === r.defaultModel ? 'blue' : 'default'} style={{ marginBottom: 2 }}>
                  {m}{m === r.defaultModel ? ' (默认)' : ''}
                </Tag>
              ))}
              {models.length > 3 && <span style={{ color: '#8A8A8A' }}>+{models.length - 3}</span>}
            </span>
          ),
        },
        {
          title: 'Key', dataIndex: 'apiKey', key: 'apiKey', width: 100,
          render: (v: string) => <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#8A8A8A' }}>{v || '—'}</span>,
        },
        {
          title: '操作', key: 'actions', width: 160,
          render: (_: any, r: ProviderItem) => (
            <Space size="small">
              <Button size="small" icon={<ThunderboltOutlined />} onClick={() => onTest(r)}>测试</Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(r)} />
              <Popconfirm title="确定删除？" onConfirm={() => onDelete(r.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          ),
        },
      ]}
    />
  );
}

// ── Provider Modal ──

function ProviderModal({
  open, editing, onCancel, onSave,
}: {
  open: boolean;
  editing: ProviderItem | null;
  onCancel: () => void;
  onSave: (values: any) => void;
}) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (editing) {
      form.setFieldsValue({ ...editing, modelsStr: editing.models.join(', ') });
    } else {
      form.resetFields();
    }
  }, [editing, open]);

  const handleFinish = (values: any) => {
    onSave({
      ...values,
      models: values.modelsStr.split(',').map((s: string) => s.trim()).filter(Boolean),
    });
  };

  return (
    <Modal
      title={editing ? '编辑 Provider' : '添加 Provider'}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText="保存"
      cancelText="取消"
      width={560}
    >
      <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 16 }}>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '输入显示名称' }]}>
          <Input placeholder="例如：Kimi、DeepSeek、千问" />
        </Form.Item>
        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item name="type" label="用途" rules={[{ required: true }]} style={{ flex: 1 }}>
            <Select options={[
              { value: 'chat', label: '对话' },
              { value: 'image', label: '图片生成' },
              { value: 'both', label: '对话 + 图片' },
            ]} />
          </Form.Item>
          <Form.Item name="protocol" label="协议" rules={[{ required: true }]} style={{ flex: 1 }}>
            <Select options={[
              { value: 'openai', label: 'OpenAI 兼容' },
              { value: 'anthropic', label: 'Anthropic 原生' },
            ]} />
          </Form.Item>
        </div>
        <Form.Item name="apiBase" label="API 地址" rules={[{ required: true, message: '输入 API Base URL' }]}>
          <Input placeholder="https://api.moonshot.cn/v1" style={{ fontFamily: 'monospace' }} />
        </Form.Item>
        <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: '输入 API Key' }]}
          help={editing && editing.apiKey?.startsWith('●●●●') ? '留空保持原 Key 不变' : undefined}>
          <Input.Password placeholder="sk-..." />
        </Form.Item>
        <Form.Item name="modelsStr" label="模型列表（逗号分隔）" rules={[{ required: true }]}
          help="第一个将作为默认模型">
          <Input placeholder="moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k" style={{ fontFamily: 'monospace' }} />
        </Form.Item>
        <Form.Item name="defaultModel" label="默认模型" rules={[{ required: true }]}>
          <Input placeholder="moonshot-v1-8k" style={{ fontFamily: 'monospace' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ── Page ──

function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Providers
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [providerModal, setProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderItem | null>(null);

  // Agent config
  const [agentConfig, setAgentConfig] = useState('');
  const [agentStoreId, setAgentStoreId] = useState<string | undefined>();
  const [agentSaving, setAgentSaving] = useState(false);
  const [stores, setStores] = useState<StoreOption[]>([]);

  // Forms
  const [notifyForm] = Form.useForm();

  // ── Load ──

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      api.get('/settings'),
      api.get('/settings/providers'),
      api.get('/stores'),
    ]).then(([settingsRes, providersRes, storesRes]) => {
      setSettings(settingsRes.data.data);
      setProviders(providersRes.data.data || []);
      setStores(storesRes.data.data.map((s: any) => ({ id: s.id, name: s.name })));
      notifyForm.setFieldsValue({ feishuWebhookUrl: settingsRes.data.data.feishuWebhookUrl });
    }).finally(() => setLoading(false));
  };

  const loadAgentConfig = (storeId?: string) => {
    api.get('/settings/agent-config', { params: storeId ? { storeId } : {} }).then((res) => {
      setAgentConfig(res.data.data?.config || '');
      setAgentStoreId(storeId);
    });
  };

  useEffect(() => { loadAll(); loadAgentConfig(); }, []);

  // ── Provider CRUD ──

  const saveProviders = async (newProviders: ProviderItem[]) => {
    await api.put('/settings/providers', { providers: newProviders });
    loadAll();
  };

  const handleAddProvider = () => {
    setEditingProvider(null);
    setProviderModal(true);
  };

  const handleEditProvider = (p: ProviderItem) => {
    setEditingProvider(p);
    setProviderModal(true);
  };

  const handleProviderSave = async (values: any) => {
    let newProviders: ProviderItem[];
    if (editingProvider) {
      newProviders = providers.map((p) => p.id === editingProvider.id
        ? { ...values, id: p.id, apiKey: values.apiKey || editingProvider.apiKey }
        : p);
    } else {
      const newProvider = { ...values, id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
      newProviders = [...providers, newProvider];
    }
    await saveProviders(newProviders);
    setProviderModal(false);
    message.success('已保存');
  };

  const handleDeleteProvider = async (id: string) => {
    await api.delete(`/settings/providers/${id}`);
    message.success('已删除');
    loadAll();
  };

  const handleTestProvider = async (p: ProviderItem) => {
    message.loading({ content: `正在测试 ${p.name}...`, key: 'test' });
    try {
      await api.post('/settings/providers/test', { provider: p });
      message.success({ content: `${p.name} 连接成功`, key: 'test' });
    } catch (err: any) {
      message.error({ content: `${p.name} 连接失败: ${err?.response?.data?.error || err.message}`, key: 'test', duration: 5 });
    }
  };

  // ── Save handlers ──

  const saveNotify = async (values: any) => {
    setSaving(true);
    try { await api.put('/settings', values); message.success('已保存'); }
    catch { message.error('保存失败'); }
    finally { setSaving(false); }
  };

  const saveAgentConfig = async () => {
    setAgentSaving(true);
    try {
      await api.put('/settings/agent-config', { storeId: agentStoreId, config: agentConfig });
      message.success('智能体配置已保存');
    } catch (err: any) { message.error(err?.response?.data?.error || '保存失败'); }
    finally { setAgentSaving(false); }
  };

  const testFeishu = async () => {
    try {
      await api.post('/settings/test-feishu');
      message.success('测试消息已通过服务端发送');
    } catch (err: any) {
      message.error(err?.response?.data?.error || '发送失败');
    }
  };

  if (loading) return <div style={{ textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>;

  // ── Tabs ──

  const tabs = [
    {
      key: 'providers',
      label: <span><ApiOutlined /> 模型配置</span>,
      children: (
        <Card
          title="AI 模型 Provider"
          extra={
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadAll}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAddProvider}>添加</Button>
            </Space>
          }
          style={cardStyle}
          styles={{ body: { padding: 0 }, header: { borderBottom: `1px solid ${tokens.line}` } }}
        >
          <ProviderTable
            providers={providers}
            onEdit={handleEditProvider}
            onDelete={handleDeleteProvider}
            onTest={handleTestProvider}
          />
          <div style={{ padding: '12px 16px', fontSize: 12, color: tokens.inkSoft, background: tokens.surfaceSoft, borderTop: `1px solid ${tokens.line}` }}>
            💡 支持所有 OpenAI 兼容 API（Kimi、DeepSeek、千问、豆包、MiniMax、GPT 等）和 Anthropic 原生 API。
            添加后，对话和图片生成会自动使用列表中第一个匹配类型的 Provider。
          </div>
          <div style={{ padding: '16px 24px', borderTop: `1px solid ${tokens.line}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: tokens.ink, marginBottom: 12 }}>🖼️ 图片生成默认参数</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Select
                value={settings?.defaultImageModel || 'dall-e-3'}
                onChange={(v) => api.put('/settings', { defaultImageModel: v }).then(() => { loadAll(); message.success('已保存'); })}
                style={{ width: 140 }}
                options={[{ value: 'dall-e-3', label: 'DALL-E 3' }, { value: 'dall-e-2', label: 'DALL-E 2' }]}
              />
              <Select
                value={settings?.defaultImageSize || '1024x1024'}
                onChange={(v) => api.put('/settings', { defaultImageSize: v }).then(() => { loadAll(); message.success('已保存'); })}
                style={{ width: 180 }}
                options={[{ value: '1024x1024', label: '1024×1024' }, { value: '1792x1024', label: '1792×1024' }, { value: '1024x1792', label: '1024×1792' }]}
              />
              <Select
                value={settings?.defaultImageQuality || 'standard'}
                onChange={(v) => api.put('/settings', { defaultImageQuality: v }).then(() => { loadAll(); message.success('已保存'); })}
                style={{ width: 120 }}
                options={[{ value: 'standard', label: '标准' }, { value: 'hd', label: '高清' }]}
              />
            </div>
            <div style={{ fontSize: 11, color: tokens.inkFaint, marginTop: 8 }}>图片生成页会自动读取这些默认值</div>
          </div>
        </Card>
      ),
    },
    {
      key: 'agent',
      label: <span><RobotOutlined /> 智能体</span>,
      children: (
        <Card
          title="客服行为配置"
          style={cardStyle}
          styles={{ header: { borderBottom: `1px solid ${tokens.line}` } }}
          extra={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Select
                value={agentStoreId}
                onChange={(v) => loadAgentConfig(v)}
                allowClear
                placeholder="全局默认"
                style={{ width: 160 }}
                options={[
                  { value: undefined as any, label: '全局默认（所有店铺）' },
                  ...stores.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
              <Button icon={<ReloadOutlined />} onClick={() => loadAgentConfig(agentStoreId)} />
              <Button type="primary" icon={<SaveOutlined />} onClick={saveAgentConfig} loading={agentSaving}>保存</Button>
            </div>
          }
        >
          <div style={{ marginBottom: 12, fontSize: 13, color: tokens.inkSoft }}>
            用 Markdown 定义 AI 在不同场景下的行为。此配置会注入到每次 AI 对话的 System Prompt 中。
          </div>
          <TextArea
            value={agentConfig}
            onChange={(e) => setAgentConfig(e.target.value)}
            rows={18}
            style={{ fontFamily: 'SF Mono, Menlo, monospace', fontSize: 13, borderRadius: tokens.radius }}
            placeholder="留空使用系统默认规则..."
          />
          <div style={{ marginTop: 8, fontSize: 11, color: tokens.inkFaint }}>
            {agentStoreId ? '仅对当前店铺生效' : '对所有未单独配置的店铺生效'} · 保存后有 1 分钟缓存
          </div>
        </Card>
      ),
    },
    {
      key: 'notify',
      label: <span><NotificationOutlined /> 通知</span>,
      children: (
        <Card title="飞书群通知" style={cardStyle} styles={{ header: { borderBottom: `1px solid ${tokens.line}` } }}>
          <Form form={notifyForm} layout="vertical" onFinish={saveNotify}>
            <Form.Item name="feishuWebhookUrl" label="Webhook 地址" style={{ maxWidth: 600 }}>
              <Input placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxx" />
            </Form.Item>
            <div style={{ fontSize: 12, color: tokens.inkSoft, marginTop: -16, marginBottom: 16 }}>
              飞书群 → 设置 → 群机器人 → 添加自定义机器人 → 复制 Webhook 地址
            </div>
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>保存</Button>
              <Button icon={<SendOutlined />} onClick={testFeishu}>发送测试消息</Button>
            </Space>
          </Form>
          <Divider />
          <div style={{ fontSize: 13, color: tokens.inkSoft }}>
            <p>配置后，以下事件将通过飞书推送通知：</p>
            <ul style={{ fontSize: 12, color: tokens.inkSoft, paddingLeft: 20 }}>
              <li>🔐 店铺需要重新登录拼多多商家后台</li>
              <li>❌ 浏览器连接异常或 Companion 离线</li>
              <li>🤖 AI 回复失败（模型 API 异常）</li>
            </ul>
          </div>
        </Card>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0, fontSize: 22, fontWeight: 900, color: tokens.ink }}>系统设置</Title>
        <p style={{ fontSize: 13, color: tokens.inkSoft, fontWeight: 600, margin: '5px 0 0' }}>
          配置 AI 模型接入、智能客服行为、消息通知
        </p>
      </div>

      <Tabs defaultActiveKey="providers" items={tabs} tabBarStyle={{ marginBottom: 24 }} />

      {/* Provider Modal */}
      <ProviderModal
        open={providerModal}
        editing={editingProvider}
        onCancel={() => setProviderModal(false)}
        onSave={handleProviderSave}
      />
    </div>
  );
}

export default SettingsPage;
