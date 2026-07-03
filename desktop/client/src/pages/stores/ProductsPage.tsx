import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Input, Modal, Form, InputNumber, Space, Tag, Popconfirm,
  Upload, message, Alert, Progress, Select,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, UploadOutlined, DownloadOutlined,
  SearchOutlined, LinkOutlined, ExportOutlined, CloudDownloadOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Tooltip } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { productService, Product, ImportResult, SyncTask } from '../../services/productService';
import { storeService } from '../../services/storeService';
import { tokens } from '../../theme/tokens';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

function ProductsPage() {
  const { id: storeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // 多店铺切换用的店铺列表
  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);

  // Edit/create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // Import result
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  // Background PDD sync task + progress polling
  const [syncTask, setSyncTask] = useState<SyncTask | null>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncing = syncTask?.status === 'running';

  // `search` is the input value; `query` is the committed term that actually
  // triggers a fetch (on Enter / clear). This avoids a request per keystroke.
  const [query, setQuery] = useState('');

  // Load store list for the switcher (lets a multi-store user jump between stores).
  useEffect(() => {
    storeService.list()
      .then((res) => setStoreList(res.data.data.map((s: any) => ({ id: s.id, name: s.name }))))
      .catch(() => { /* switcher just won't show */ });
  }, []);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    setLoading(true);
    productService
      .list(storeId, query ? { search: query } : undefined)
      .then((res) => { if (!cancelled) setProducts(res.data.data); })
      .catch(() => { if (!cancelled) message.error('加载商品失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storeId, query]);

  // Re-fetch after a create/edit/delete/import without changing the query.
  const reload = useCallback(() => {
    if (!storeId) return;
    let active = true;
    productService
      .list(storeId, query ? { search: query } : undefined)
      .then((res) => { if (active) setProducts(res.data.data); })
      .catch(() => { if (active) message.error('加载商品失败'); });
    return () => { active = false; };
  }, [storeId, query]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    form.setFieldsValue({
      name: p.name, price: p.price, stock: p.stock,
      category: p.category, productUrl: p.productUrl, description: p.description,
      freight: p.freight, material: p.material, specs: p.specs, shippingTime: p.shippingTime,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!storeId) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await productService.update(storeId, editing.id, values);
        message.success('已更新');
      } else {
        await productService.create(storeId, values);
        message.success('已添加');
      }
      setModalOpen(false);
      reload();
    } catch (err: any) {
      if (err?.errorFields) return; // form validation error, already shown
      message.error(err?.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Product) => {
    if (!storeId) return;
    try {
      await productService.remove(storeId, p.id);
      message.success('已删除');
      reload();
    } catch {
      message.error('删除失败');
    }
  };

  const handleDownloadTemplate = async () => {
    if (!storeId) return;
    try {
      const res = await productService.downloadTemplate(storeId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = '商品导入模板.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('模板下载失败');
    }
  };

  const handleExport = async () => {
    if (!storeId) return;
    try {
      const res = await productService.exportAll(storeId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = '商品库导出.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error('导出失败');
    }
  };

  // Poll the background sync task; stop + finalize when it finishes.
  const pollSync = useCallback(() => {
    if (!storeId) return;
    if (syncPollRef.current) clearInterval(syncPollRef.current);
    syncPollRef.current = setInterval(async () => {
      try {
        const res = await productService.syncStatus(storeId);
        const t = res.data.data;
        if (!t) return;
        setSyncTask(t);
        if (t.status !== 'running') {
          if (syncPollRef.current) { clearInterval(syncPollRef.current); syncPollRef.current = null; }
          if (t.status === 'done') {
            message.success(`同步完成：成功 ${t.synced} 个${t.failed > 0 ? `，跳过 ${t.failed} 个` : ''}`);
            reload();
          } else {
            message.error(t.error || '抓取失败,请确认店铺已连接并登录');
          }
        }
      } catch { /* transient — keep polling */ }
    }, 1500);
  }, [storeId, reload]);

  // Resume polling if a sync is already running (e.g. page revisit), and clean up.
  useEffect(() => {
    if (!storeId) return;
    productService.syncStatus(storeId).then((res) => {
      const t = res.data.data;
      if (t) { setSyncTask(t); if (t.status === 'running') pollSync(); }
    }).catch(() => {});
    return () => { if (syncPollRef.current) clearInterval(syncPollRef.current); };
  }, [storeId, pollSync]);

  const handleSyncFromPdd = (isRefresh: boolean) => {
    if (!storeId) return;
    Modal.confirm({
      title: isRefresh ? '刷新商品知识库' : '从拼多多抓取全部商品',
      content: isRefresh
        ? '将重新从拼多多拉取全部商品并按商品ID覆盖更新(已下架的不会删除)。需要店铺在线,商品多时需要几分钟,期间可离开本页。'
        : '将从拼多多商家后台拉取本店全部商品并保存(同款按商品ID覆盖,已下架的不删)。需要店铺在线,商品多时需要几分钟,期间可离开本页。',
      okText: isRefresh ? '开始刷新' : '开始抓取',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await productService.syncFromPdd(storeId);
          setSyncTask(res.data.data);
          pollSync();
        } catch (e: any) {
          message.error(e?.response?.data?.error || '启动抓取失败,请确认店铺已连接并登录');
        }
      },
    });
  };

  const uploadProps: UploadProps = {
    accept: '.xlsx',
    showUploadList: false,
    beforeUpload: (file) => {
      if (!storeId) return false;
      setImporting(true);
      setImportResult(null);
      productService
        .importExcel(storeId, file as File)
        .then((res) => {
          const r = res.data.data;
          setImportResult(r);
          if (r.imported > 0) message.success(`成功导入 ${r.imported} 个商品`);
          if (r.failed > 0) message.warning(`${r.failed} 行未导入，见下方明细`);
          reload();
        })
        .catch((e) => message.error(e?.response?.data?.error || '导入失败'))
        .finally(() => setImporting(false));
      return false; // prevent antd's own upload
    },
  };

  const columns = [
    {
      title: '商品名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, p: Product) => (
        <div>
          <div style={{ fontSize: 13, color: tokens.ink }}>{name}</div>
          {p.category && (
            <Tag style={{ fontSize: 11, marginTop: 2, borderRadius: tokens.radiusSm, border: 'none', background: tokens.surfaceSoft, color: tokens.inkSoft }}>
              {p.category}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      width: 110,
      render: (price: number) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>¥{Number(price ?? 0).toFixed(2)}</span>
      ),
    },
    { title: '库存', dataIndex: 'stock', key: 'stock', width: 90,
      render: (stock: number) => {
        const n = Number(stock ?? 0);
        const color = n === 0 ? tokens.red : n <= 10 ? '#FAAD14' : tokens.ink;
        const label = n === 0 ? '缺货' : n <= 10 ? `${n} 偏低` : n;
        return <span style={{ color, fontVariantNumeric: 'tabular-nums', fontWeight: n <= 10 ? 700 : 400 }}>{label}</span>;
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      render: (desc: string | null) =>
        desc ? (
          <Tooltip title={desc}>
            <span style={{ fontSize: 12, color: tokens.inkSoft, display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
              {desc}
            </span>
          </Tooltip>
        ) : (
          <span style={{ color: tokens.inkFaint, fontSize: 12 }}>未填</span>
        ),
    },
    {
      title: '商品链接',
      dataIndex: 'productUrl',
      key: 'productUrl',
      render: (url: string | null) =>
        url ? (
          <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
            <LinkOutlined /> 查看
          </a>
        ) : (
          <span style={{ color: tokens.inkFaint, fontSize: 12 }}>未填</span>
        ),
    },
    {
      title: '最后同步',
      dataIndex: 'lastSyncedAt',
      key: 'lastSyncedAt',
      width: 110,
      render: (t: string | null) =>
        t ? (
          <Tooltip title={dayjs(t).format('YYYY-MM-DD HH:mm')}>
            <span style={{ fontSize: 12, color: tokens.inkSoft }}>{dayjs(t).fromNow()}</span>
          </Tooltip>
        ) : (
          <span style={{ color: tokens.inkFaint, fontSize: 12 }}>手动</span>
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: unknown, p: Product) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openEdit(p)}>编辑</Button>
          <Popconfirm title="确认删除该商品?" onConfirm={() => handleDelete(p)} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22,
      }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/stores/${storeId}`)} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: tokens.ink, margin: 0, letterSpacing: 0.3 }}>商品知识库</h1>
          <span style={{ fontSize: 13, fontWeight: 600, color: tokens.inkSoft }}>
            AI 客服回复时从这里检索商品并发送链接，拼多多会自动渲染成商品卡片
          </span>
        </div>
        {/* 多店铺切换:直接跳到所选店铺的商品库 */}
        {storeList.length > 1 && (
          <Select
            value={storeId}
            style={{ width: 200 }}
            onChange={(v) => navigate(`/stores/${v}/products`)}
            options={storeList.map((s) => ({ value: s.id, label: s.name }))}
            placeholder="切换店铺"
          />
        )}
      </div>

      <Card
        style={{ borderRadius: tokens.radiusLg, border: `1px solid ${tokens.line}`, boxShadow: tokens.shadowCard }}
        styles={{ body: { padding: 18 } }}
      >
        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <Input
            placeholder="搜索商品名后按回车"
            prefix={<SearchOutlined style={{ color: tokens.inkFaint }} />}
            value={search}
            onChange={(e) => {
              const v = e.target.value;
              setSearch(v);
              if (v === '') setQuery(''); // clearing the box resets the list immediately
            }}
            onPressEnter={() => setQuery(search.trim())}
            style={{ width: 260 }}
            allowClear
          />
          <Space wrap>
            {products.length === 0 ? (
              <Button
                type="primary"
                icon={<CloudDownloadOutlined />}
                loading={syncing}
                disabled={syncing}
                onClick={() => handleSyncFromPdd(false)}
              >
                {syncing ? '抓取中…' : '一键抓取商品'}
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                loading={syncing}
                disabled={syncing}
                onClick={() => handleSyncFromPdd(true)}
              >
                {syncing ? '同步中…' : '刷新商品(重新抓取)'}
              </Button>
            )}
            <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>下载模板</Button>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />} loading={importing} disabled={syncing}>批量导入</Button>
            </Upload>
            <Button icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
            <Button icon={<PlusOutlined />} onClick={openCreate}>添加商品</Button>
          </Space>
        </div>

        {/* 抓取进度条(后台任务运行中显示) */}
        {syncTask && syncTask.status === 'running' && (
          <Alert
            style={{ marginBottom: 16, borderRadius: tokens.radius }}
            type="info"
            message={
              <div>
                <div style={{ marginBottom: 6, fontWeight: 700 }}>
                  正在从拼多多抓取商品… 已抓取 {syncTask.fetched}
                  {syncTask.total > 0 ? ` / ${syncTask.total}` : ''} 个(可离开本页,抓取在后台继续)
                </div>
                <Progress
                  percent={syncTask.total > 0 ? Math.min(100, Math.round((syncTask.fetched / syncTask.total) * 100)) : 0}
                  status="active"
                  showInfo={syncTask.total > 0}
                />
              </div>
            }
          />
        )}

        {/* 一键抓取说明 */}
        {!syncing && (
          <Alert
            style={{ marginBottom: 16, borderRadius: tokens.radius }}
            type="info"
            showIcon
            message="商品从拼多多后台同步到知识库,AI 回复时即可用真实价格、库存、链接作答。商品多时抓取需几分钟,期间可离开本页。需先在「店铺」页连接并登录该店铺。"
          />
        )}

        {/* Import result */}
        {importResult && (
          <Alert
            style={{ marginBottom: 16, borderRadius: tokens.radius }}
            type={importResult.failed > 0 ? 'warning' : 'success'}
            closable
            onClose={() => setImportResult(null)}
            message={`导入完成：成功 ${importResult.imported}，失败 ${importResult.failed}`}
            description={
              importResult.errors.length > 0 ? (
                <div style={{ maxHeight: 120, overflow: 'auto', fontSize: 12 }}>
                  {importResult.errors.map((e, i) => (
                    <div key={i}>第 {e.row} 行：{e.reason}</div>
                  ))}
                </div>
              ) : undefined
            }
          />
        )}

        <Table
          rowKey="id"
          loading={loading}
          dataSource={products}
          columns={columns}
          size="middle"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: '暂无商品，点击「添加商品」或「批量导入」' }}
        />
      </Card>

      {/* Create/Edit modal */}
      <Modal
        title={editing ? '编辑商品' : '添加商品'}
        open={modalOpen}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        forceRender
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="商品名" rules={[{ required: true, message: '请输入商品名' }]}>
            <Input placeholder="例如：纯棉短袖T恤" />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="price" label="价格" rules={[{ required: true, message: '请输入价格' }]} style={{ flex: 1 }}>
              <InputNumber min={0} precision={2} addonBefore="¥" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="stock" label="库存" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="category" label="分类" style={{ flex: 1 }}>
              <Input placeholder="如：服装" />
            </Form.Item>
          </Space>
          <Form.Item
            name="productUrl"
            label="商品链接"
            extra="粘贴拼多多商品链接，AI 回复时会原样发送，拼多多自动渲染成商品卡片"
          >
            <Input placeholder="https://mobile.yangkeduo.com/goods.html?goods_id=..." />
          </Form.Item>
          <Form.Item name="description" label="商品描述">
            <Input.TextArea rows={3} placeholder="卖点、材质、规格等，AI 回复时作为参考" />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="freight" label="运费" style={{ flex: 1 }}>
              <Input placeholder="如：包邮 / 满99包邮 / 运费10元" />
            </Form.Item>
            <Form.Item name="material" label="材质" style={{ flex: 1 }}>
              <Input placeholder="如：纯棉 / 不锈钢304" />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="specs" label="规格" style={{ flex: 1 }}>
              <Input placeholder="如：M/L/XL/XXL / 500ml" />
            </Form.Item>
            <Form.Item name="shippingTime" label="发货时效" style={{ flex: 1 }}>
              <Input placeholder="如：48小时内发货 / 预售7天" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}

export default ProductsPage;
