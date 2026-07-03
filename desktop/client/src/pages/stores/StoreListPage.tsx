import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Tag, Button, Space, Modal, Form, Input, Popconfirm, message, Spin, Checkbox } from 'antd';
import { PlusOutlined, PoweroffOutlined, LinkOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, KeyOutlined, SafetyOutlined } from '@ant-design/icons';
import { storeService, type Store } from '../../services/storeService';
import { tokens } from '../../theme/tokens';

const { TextArea } = Input;

const stateMap: Record<string, { color: string; label: string }> = {
  idle: { color: 'default', label: '未连接' },
  connecting: { color: 'processing', label: '连接中' },
  needs_login: { color: 'warning', label: '需登录' },
  needs_captcha: { color: 'warning', label: '需验证' },
  online: { color: 'green', label: '在线' },
  error: { color: 'red', label: '异常' },
};

// Status dot colors — mirrors the dashboard's online/offline language.
const stateDot: Record<string, string> = {
  idle: tokens.inkFaint,
  connecting: tokens.blue,
  needs_login: tokens.amber,
  needs_captcha: tokens.amber,
  online: tokens.green,
  error: tokens.red,
};

function StoreListPage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [form] = Form.useForm();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const storesRef = useRef<Store[]>([]);
  storesRef.current = stores;

  // Load stores
  const loadStores = () => {
    storeService
      .list()
      .then((res) => setStores(res.data.data))
      .catch(() => message.error('加载店铺失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStores(); }, []);

  // Poll status every 10s for stores that are connecting or online
  useEffect(() => {
    const interval = setInterval(() => {
      const currentStores = storesRef.current;
      const needsPolling = currentStores.filter(
        (s) => ['connecting', 'online', 'needs_login', 'needs_captcha', 'error'].includes(s.browserState),
      );
      if (needsPolling.length === 0) return;

      Promise.all(
        needsPolling.map((s) =>
          storeService
            .getStatus(s.id)
            .then((res) => ({ id: s.id, state: res.data.data?.state || s.browserState }))
            .catch(() => ({ id: s.id, state: s.browserState })),
        ),
      ).then((updates) => {
        setStores((prev) =>
          prev.map((s) => {
            const update = updates.find((u) => u.id === s.id);
            return update ? { ...s, browserState: update.state } : s;
          }),
        );
      });
    }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open add/edit modal
  const openAdd = () => {
    setEditingStore(null);
    form.resetFields();
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    form.resetFields();
  };

  const openEdit = (store: Store) => {
    setEditingStore(store);
    form.resetFields();
    form.setFieldsValue({ name: store.name, shopId: store.shopId, description: store.description });
    setModalOpen(true);
  };

  // Save store
  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editingStore) {
        await storeService.update(editingStore.id, values);
        message.success('已更新');
      } else {
        await storeService.create(values);
        message.success('已添加');
      }
      setModalOpen(false);
      loadStores();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '操作失败');
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    try {
      await storeService.remove(id);
      message.success('已删除');
      loadStores();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '删除失败');
    }
  };

  // Connect / Disconnect
  const handleConnect = async (store: Store) => {
    setActionLoading(store.id);
    try {
      // Go to the detail page FIRST so its StoreBrowserPanel creates the
      // embedded WebContentsView before the companion attaches over CDP and
      // navigates it. Then trigger the connect (start_store) on the server.
      navigate(`/stores/${store.id}`);
      await storeService.connect(store.id, store.name);
      message.info(`正在启动「${store.name}」，如需登录请在页面中的店铺浏览器内操作`);
      setStores((prev) => prev.map((s) => s.id === store.id ? { ...s, browserState: 'connecting' } : s));
    } catch (err: any) {
      message.error(err?.response?.data?.error || '连接失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (store: Store) => {
    setActionLoading(store.id);
    try {
      await storeService.disconnect(store.id);
      // Tear down the embedded browser view so it doesn't linger/leak.
      try { await window.electronAPI?.storeView?.close(store.id); } catch {}
      message.success('已断开');
      setStores((prev) => prev.map((s) => s.id === store.id ? { ...s, browserState: 'idle' } : s));
    } catch {
      message.error('断开失败');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 22,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: tokens.ink, letterSpacing: 0.3 }}>店铺管理</h1>
          <p style={{ fontSize: 13, fontWeight: 700, color: tokens.inkSoft, margin: '5px 0 0' }}>
            添加店铺并配置登录凭据，点击「连接」启动 AI 客服
          </p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadStores} style={{ borderRadius: tokens.radius, fontWeight: 700 }}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}
            style={{ borderRadius: tokens.radius, fontWeight: 800, background: tokens.gradient, border: 'none', boxShadow: tokens.shadowBrand }}>
            添加店铺
          </Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}>
          <Spin size="large" />
        </div>
      ) : stores.length === 0 ? (
        <Card style={{ borderRadius: tokens.radiusLg, boxShadow: tokens.shadowCard, border: `1px solid ${tokens.line}`, textAlign: 'center', padding: 60 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: tokens.ink, margin: 0 }}>暂无店铺</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: tokens.inkSoft, margin: '6px 0 0' }}>
            点击右上角「添加店铺」开始 AI 客服之旅
          </p>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {stores.map((store) => {
            const info = stateMap[store.browserState] || { color: 'default', label: store.browserState };
            const dotColor = stateDot[store.browserState] || tokens.inkFaint;
            const isOnline = store.browserState === 'online';
            const isBusy = ['connecting'].includes(store.browserState);
            return (
              <Col xs={24} sm={12} lg={12} xl={8} key={store.id}>
                <Card
                  style={{
                    borderRadius: tokens.radiusLg,
                    boxShadow: tokens.shadowCard,
                    border: `1px solid ${tokens.line}`,
                  }}
                  styles={{ body: { padding: '18px 20px 16px' } }}
                >
                  {/* Header: gradient logo chip + name/id + status dot */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: tokens.radius, flexShrink: 0,
                      background: tokens.gradientWarm, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, fontWeight: 900,
                    }}>
                      {(store.name || '店')[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        onClick={() => navigate(`/stores/${store.id}`)}
                        style={{
                          fontSize: 15, fontWeight: 800, color: tokens.ink, cursor: 'pointer',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {store.name}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: tokens.inkSoft, marginTop: 2 }}>
                        ID: {store.shopId || '—'}
                      </div>
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 800, color: dotColor,
                    }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
                      {info.label}
                    </span>
                  </div>

                  {/* Credential badge */}
                  <div style={{ marginBottom: 14 }}>
                    {store.hasLoginCredentials ? (
                      <Tag color="green" icon={<SafetyOutlined />} style={{ borderRadius: tokens.radiusSm, fontWeight: 700, margin: 0 }}>已配置凭据</Tag>
                    ) : (
                      <Tag style={{ borderRadius: tokens.radiusSm, fontWeight: 700, margin: 0, color: tokens.inkSoft, background: tokens.surfaceSoft, border: `1px solid ${tokens.line}` }}>未配置凭据</Tag>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    paddingTop: 12, borderTop: `1px solid ${tokens.line}`,
                  }}>
                    {isOnline ? (
                      <Button
                        size="small"
                        danger
                        icon={<PoweroffOutlined />}
                        loading={actionLoading === store.id}
                        onClick={() => handleDisconnect(store)}
                        style={{ borderRadius: tokens.radiusSm, fontWeight: 700 }}
                      >
                        断开
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        type="primary"
                        icon={<LinkOutlined />}
                        loading={actionLoading === store.id}
                        disabled={isBusy}
                        onClick={() => handleConnect(store)}
                        style={{ borderRadius: tokens.radiusSm, fontWeight: 700, background: isBusy ? undefined : tokens.gradient, border: 'none' }}
                      >
                        {store.browserState === 'needs_login' ? '重新连接' : '连接'}
                      </Button>
                    )}
                    <Space size={4}>
                      <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(store)} />
                      <Popconfirm title="确定删除该店铺？" onConfirm={() => handleDelete(store.id)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Add / Edit Modal */}
      <Modal
        title={<span style={{ fontSize: 17, fontWeight: 900, color: tokens.ink }}>{editingStore ? '编辑店铺' : '添加店铺'}</span>}
        open={modalOpen}
        onOk={handleSave}
        onCancel={closeModal}
        okText="保存"
        cancelText="取消"
        styles={{ content: { borderRadius: tokens.radiusLg } }}
        okButtonProps={{ style: { borderRadius: tokens.radius, fontWeight: 800, background: tokens.gradient, border: 'none' } }}
        cancelButtonProps={{ style: { borderRadius: tokens.radius, fontWeight: 700 } }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="店铺名称" rules={[{ required: true, message: '请输入店铺名称' }]}>
            <Input placeholder="例如：潮流女装馆" style={{ borderRadius: tokens.radiusSm }} />
          </Form.Item>
          <Form.Item name="shopId" label="拼多多店铺ID（可选）">
            <Input placeholder="拼多多店铺ID，用于关联订单等" style={{ borderRadius: tokens.radiusSm }} />
          </Form.Item>
          <Form.Item name="description" label="店铺描述（可选）">
            <TextArea rows={2} placeholder="简要描述，AI 客服会引用这些信息" style={{ borderRadius: tokens.radiusSm }} />
          </Form.Item>

          {/* Credential section */}
          <div style={{
            margin: '8px 0', padding: '14px', background: editingStore?.hasLoginCredentials ? tokens.greenBg : tokens.amberBg,
            borderRadius: tokens.radius, fontSize: 12, border: editingStore?.hasLoginCredentials ? `1px solid ${tokens.green}33` : `1px solid ${tokens.amber}33`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <SafetyOutlined style={{ color: editingStore?.hasLoginCredentials ? tokens.green : tokens.amber, fontSize: 16 }} />
              <span style={{ fontWeight: 800, color: editingStore?.hasLoginCredentials ? tokens.green : tokens.amber }}>
                {editingStore?.hasLoginCredentials ? '已配置登录凭据' : '未配置登录凭据'}
              </span>
            </div>
            <p style={{ margin: '0 0 10px', color: tokens.inkSoft, fontWeight: 600 }}>
              {editingStore?.hasLoginCredentials
                ? '账号密码已安全存储（不会回显）。可重新输入以更新凭据，或勾选清空以移除。'
                : '配置后，系统连接时将自动使用账号密码登录拼多多商家后台，无需扫码。'}
            </p>
            <Form.Item name="loginAccount" label="登录账号（手机号）" style={{ marginBottom: 8 }}>
              <Input placeholder={editingStore?.hasLoginCredentials ? '留空保持原账号' : '拼多多商家登录手机号'} prefix={<KeyOutlined />} style={{ borderRadius: tokens.radiusSm }} />
            </Form.Item>
            <Form.Item name="loginPassword" label="登录密码" style={{ marginBottom: 0 }}>
              <Input.Password placeholder={editingStore?.hasLoginCredentials ? '留空保持原密码' : '拼多多登录密码'} style={{ borderRadius: tokens.radiusSm }} />
            </Form.Item>
            {editingStore?.hasLoginCredentials && (
              <Form.Item name="clearCredentials" valuePropName="checked" style={{ marginBottom: 0, marginTop: 8 }}>
                <Checkbox style={{ color: tokens.red, fontSize: 12 }}>清空已保存的登录凭据</Checkbox>
              </Form.Item>
            )}
          </div>
        </Form>
      </Modal>
    </div>
  );
}

export default StoreListPage;
