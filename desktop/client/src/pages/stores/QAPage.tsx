import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Table, Button, Input, Modal, Form, Space, Tag, Popconfirm,
  Upload, message, Alert, Switch, Select,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, UploadOutlined, DownloadOutlined,
  SearchOutlined, ExportOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { qaService, QAEntry, QAImportResult } from '../../services/qaService';
import { storeService } from '../../services/storeService';
import { tokens } from '../../theme/tokens';

function QAPage() {
  const { id: storeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<QAEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    storeService.list()
      .then((res) => setStoreList(res.data.data.map((s: any) => ({ id: s.id, name: s.name }))))
      .catch(() => {});
  }, []);

  // Edit/create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QAEntry | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // Import result
  const [importResult, setImportResult] = useState<QAImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    setLoading(true);
    qaService
      .list(storeId, query ? { search: query } : undefined)
      .then((res) => { if (!cancelled) setEntries(res.data.data); })
      .catch(() => { if (!cancelled) message.error('加载问答失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [storeId, query]);

  const reload = useCallback(() => {
    if (!storeId) return;
    qaService
      .list(storeId, query ? { search: query } : undefined)
      .then((res) => setEntries(res.data.data))
      .catch(() => message.error('加载问答失败'));
  }, [storeId, query]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true });
    setModalOpen(true);
  };

  const openEdit = (q: QAEntry) => {
    setEditing(q);
    form.setFieldsValue({
      question: q.question, answer: q.answer,
      keywords: q.keywords, category: q.category, enabled: q.enabled,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!storeId) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await qaService.update(storeId, editing.id, values);
        message.success('已更新');
      } else {
        await qaService.create(storeId, values);
        message.success('已添加');
      }
      setModalOpen(false);
      reload();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (q: QAEntry) => {
    if (!storeId) return;
    try {
      await qaService.remove(storeId, q.id);
      message.success('已删除');
      reload();
    } catch {
      message.error('删除失败');
    }
  };

  // Toggle enabled inline without opening the modal.
  const handleToggle = async (q: QAEntry, enabled: boolean) => {
    if (!storeId) return;
    try {
      await qaService.update(storeId, q.id, { enabled });
      setEntries((prev) => prev.map((e) => (e.id === q.id ? { ...e, enabled } : e)));
    } catch {
      message.error('操作失败');
    }
  };

  const downloadBlob = (data: BlobPart, filename: string) => {
    const url = window.URL.createObjectURL(new Blob([data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = async () => {
    if (!storeId) return;
    try {
      const res = await qaService.downloadTemplate(storeId);
      downloadBlob(res.data, '问答导入模板.xlsx');
    } catch {
      message.error('模板下载失败');
    }
  };

  const handleExport = async () => {
    if (!storeId) return;
    try {
      const res = await qaService.exportAll(storeId);
      downloadBlob(res.data, '问答库导出.xlsx');
    } catch {
      message.error('导出失败');
    }
  };

  const uploadProps: UploadProps = {
    accept: '.xlsx',
    showUploadList: false,
    beforeUpload: (file) => {
      if (!storeId) return false;
      setImporting(true);
      setImportResult(null);
      qaService
        .importExcel(storeId, file as File)
        .then((res) => {
          const r = res.data.data;
          setImportResult(r);
          if (r.imported > 0) message.success(`成功导入 ${r.imported} 条问答`);
          if (r.failed > 0) message.warning(`${r.failed} 行未导入，见下方明细`);
          reload();
        })
        .catch((e) => message.error(e?.response?.data?.error || '导入失败'))
        .finally(() => setImporting(false));
      return false;
    },
  };

  const columns = [
    {
      title: '问题',
      dataIndex: 'question',
      key: 'question',
      width: 280,
      render: (question: string, q: QAEntry) => (
        <div>
          <div style={{ fontSize: 13, color: tokens.ink, fontWeight: 600 }}>{question}</div>
          {q.category && (
            <Tag style={{ fontSize: 11, marginTop: 4, borderRadius: tokens.radiusSm, border: 'none', background: tokens.surfaceSoft, color: tokens.inkSoft }}>
              {q.category}
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: '答案',
      dataIndex: 'answer',
      key: 'answer',
      render: (answer: string) => (
        <span style={{ fontSize: 13, color: tokens.inkSoft }}>{answer}</span>
      ),
    },
    {
      title: '关键词',
      dataIndex: 'keywords',
      key: 'keywords',
      width: 160,
      render: (kw: string | null) =>
        kw ? <span style={{ fontSize: 12, color: tokens.inkSoft }}>{kw}</span>
          : <span style={{ color: tokens.inkFaint, fontSize: 12 }}>—</span>,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean, q: QAEntry) => (
        <Switch size="small" checked={enabled} onChange={(v) => handleToggle(q, v)} />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      render: (_: unknown, q: QAEntry) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => openEdit(q)}>编辑</Button>
          <Popconfirm title="确认删除该问答?" onConfirm={() => handleDelete(q)} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/stores/${storeId}`)} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: tokens.ink, margin: 0, letterSpacing: 0.3 }}>问答知识库</h1>
          <span style={{ fontSize: 13, fontWeight: 600, color: tokens.inkSoft }}>
            店铺政策、活动、售后等常见问题的标准答复，AI 客服遇到对应问题时优先照这里回答
          </span>
        </div>
        {storeList.length > 1 && (
          <Select
            value={storeId}
            style={{ width: 200 }}
            onChange={(v) => navigate(`/stores/${v}/qa`)}
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
            placeholder="搜索问题/答案/关键词后按回车"
            prefix={<SearchOutlined style={{ color: tokens.inkFaint }} />}
            value={search}
            onChange={(e) => {
              const v = e.target.value;
              setSearch(v);
              if (v === '') setQuery('');
            }}
            onPressEnter={() => setQuery(search.trim())}
            style={{ width: 280 }}
            allowClear
          />
          <Space wrap>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>下载模板</Button>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />} loading={importing}>批量导入</Button>
            </Upload>
            <Button icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加问答</Button>
          </Space>
        </div>

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
          dataSource={entries}
          columns={columns}
          size="middle"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: '暂无问答，点击「添加问答」或「批量导入」' }}
        />
      </Card>

      {/* Create/Edit modal */}
      <Modal
        title={editing ? '编辑问答' : '添加问答'}
        open={modalOpen}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        forceRender
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="question" label="问题" rules={[{ required: true, message: '请输入问题' }]}>
            <Input placeholder="例如：你们开通退货包运费吗" maxLength={500} />
          </Form.Item>
          <Form.Item
            name="answer"
            label="标准答案"
            rules={[{ required: true, message: '请输入答案' }]}
            extra="AI 会用口语把这个答案说给客户，不会照搬书面语"
          >
            <Input.TextArea rows={3} placeholder="例如：亲，本店已开通退货包运费，退货运费由保险承担，可以放心买哈" maxLength={2000} showCount />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="keywords" label="关键词（可选）" style={{ flex: 1 }} extra="多个用空格隔开，方便检索">
              <Input placeholder="退货包运费 运费险" maxLength={200} />
            </Form.Item>
            <Form.Item name="category" label="分类（可选）" style={{ width: 140 }}>
              <Input placeholder="如：售后" maxLength={50} />
            </Form.Item>
          </Space>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default QAPage;
