import { useEffect, useState } from 'react';
import {
  Card, Table, Tag, Typography, Image, Button, Space, Popconfirm,
  message, Spin,
} from 'antd';
import { DeleteOutlined, EyeOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const { Title } = Typography;

interface GenerationItem {
  id: string;
  mode: string;
  prompt: string;
  sourceImageUrl?: string;
  resultUrls: string[];
  provider: string;
  modelVersion?: string;
  status: string;
  storeId?: string;
  productId?: string;
  createdAt: string;
}

const modeLabels: Record<string, { label: string; color: string }> = {
  text2img: { label: '文生图', color: '#1677ff' },
  img2img: { label: '图生图', color: '#389E0D' },
};

function ImageHistoryPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<GenerationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  const loadData = (p: number = page) => {
    setLoading(true);
    api.get('/images/history', { params: { page: p, pageSize } })
      .then((res) => {
        setData(res.data.data || []);
        setTotal(res.data.total || 0);
        setPage(p);
      })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleDelete = async (id: string) => {
    await api.delete(`/images/${id}`);
    message.success('已删除');
    loadData(page);
  };

  const columns = [
    {
      title: '预览',
      key: 'preview',
      width: 80,
      render: (_: unknown, record: GenerationItem) => {
        const urls = record.resultUrls || [];
        if (urls.length === 0) return <span style={{ color: '#BFBFBF', fontSize: 12 }}>—</span>;
        return (
          <Image
            src={urls[0]}
            width={48}
            height={48}
            style={{ borderRadius: 4, objectFit: 'cover' }}
            preview={{ mask: <EyeOutlined /> }}
            fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2YwZjBmMCIvPjwvc3ZnPg=="
          />
        );
      },
    },
    {
      title: '模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 90,
      render: (m: string) => {
        const info = modeLabels[m] || { label: m, color: '#8A8A8A' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '提示词',
      dataIndex: 'prompt',
      key: 'prompt',
      ellipsis: true,
      render: (v: string) => (
        <span style={{ fontSize: 12 }} title={v}>{v.slice(0, 60)}{v.length > 60 ? '...' : ''}</span>
      ),
    },
    {
      title: '模型',
      dataIndex: 'modelVersion',
      key: 'modelVersion',
      width: 100,
      render: (v: string) => v || '—',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s: string) => {
        const map: Record<string, { color: string; text: string }> = {
          pending: { color: 'blue', text: '生成中' },
          completed: { color: 'green', text: '已完成' },
          failed: { color: 'red', text: '失败' },
        };
        const info = map[s] || { color: 'default', text: s };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: GenerationItem) => (
        <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #E8E8E8',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/images')} />
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>图片生成历史</h1>
            <p style={{ fontSize: 12, color: '#8A8A8A', margin: '4px 0 0' }}>
              共 {total} 条记录
            </p>
          </div>
        </div>
      </div>

      <Card style={{ borderRadius: 4 }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: loadData,
            showTotal: (t) => `共 ${t} 条`,
            showSizeChanger: false,
          }}
          locale={{ emptyText: '暂无生成记录，前往「图片生成」创建第一张' }}
        />
      </Card>
    </div>
  );
}

export default ImageHistoryPage;
