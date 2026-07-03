import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Tabs, Input, Button, Select, Typography, Space, Image,
  message, Spin, Row, Col, Upload, AutoComplete,
} from 'antd';
import {
  ThunderboltOutlined, UploadOutlined, PictureOutlined,
  DeleteOutlined, HistoryOutlined, DownloadOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface StoreOption {
  id: string;
  name: string;
}

function ImageGeneratePage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'text2img' | 'img2img'>('text2img');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('dall-e-3');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('standard');
  const [n, setN] = useState(1);
  const [storeId, setStoreId] = useState<string | undefined>();
  const [generating, setGenerating] = useState(false);

  // Results
  const [results, setResults] = useState<string[]>([]);
  const [lastPrompt, setLastPrompt] = useState('');

  // Store list
  const [stores, setStores] = useState<StoreOption[]>([]);

  // Source image for img2img (base64 data URI from local upload)
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourcePreview, setSourcePreview] = useState('');

  useEffect(() => {
    api.get('/stores').then((res) => {
      setStores(res.data.data.map((s: any) => ({ id: s.id, name: s.name })));
    }).catch(() => message.error('加载店铺列表失败'));
    // Load saved defaults
    api.get('/settings').then((res) => {
      const d = res.data.data;
      if (d.defaultImageModel) setModel(d.defaultImageModel);
      if (d.defaultImageSize) setSize(d.defaultImageSize);
      if (d.defaultImageQuality) setQuality(d.defaultImageQuality);
    }).catch(() => {});
  }, []);

  // Save a generated image to the user's computer. data: URIs download directly;
  // remote URLs are fetched to a blob (falls back to opening in a tab if the host
  // blocks cross-origin fetch).
  const downloadImage = async (url: string, idx: number) => {
    const filename = `商品图_${Date.now()}_${idx + 1}.png`;
    try {
      if (url.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        return;
      }
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl; a.download = filename; a.click();
      window.URL.revokeObjectURL(objUrl);
    } catch {
      // CORS-blocked remote image — open in a new tab so the user can right-click save.
      window.open(url, '_blank');
      message.info('图片在新标签页打开,可右键另存为');
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      message.warning('请输入图片描述');
      return;
    }
    if (mode === 'img2img' && !sourceUrl.trim()) {
      message.warning('图生图模式请先上传原图');
      return;
    }

    setGenerating(true);
    setResults([]);
    try {
      const body: any = { mode, prompt: prompt.trim(), model, size, quality, n };
      if (storeId) body.storeId = storeId;
      if (mode === 'img2img') body.sourceImageUrl = sourceUrl.trim();

      const res = await api.post('/images/generate', body);
      const urls = res.data.data?.urls || [];
      setResults(urls);
      setLastPrompt(prompt.trim());
      message.success(`生成成功，${urls.length} 张图片`);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #E8E8E8',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1A1A1A', margin: 0 }}>
            商品图片生成
          </h1>
          <p style={{ fontSize: 12, color: '#8A8A8A', margin: '4px 0 0' }}>
            文生图 / 图生图，生成结果自动保存到历史
          </p>
        </div>
        <Button icon={<HistoryOutlined />} onClick={() => navigate('/images/history')}>
          生成历史
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        {/* Control panel */}
        <Col xs={24} lg={10}>
          <Card style={{ borderRadius: 4 }} styles={{ body: { padding: '20px 24px' } }}>
            <Tabs
              activeKey={mode}
              onChange={(k) => setMode(k as 'text2img' | 'img2img')}
              items={[
                { key: 'text2img', label: '文生图' },
                { key: 'img2img', label: '图生图' },
              ]}
              style={{ marginBottom: 16 }}
            />

            {/* Mode-specific input */}
            {mode === 'img2img' && (
              <div style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 12, color: '#8A8A8A', display: 'block', marginBottom: 6 }}>
                  原图（从本地上传）
                </Text>
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    if (file.size > 8 * 1024 * 1024) {
                      message.error('图片过大，请压缩到 8MB 以内');
                      return false;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setSourceUrl(reader.result as string); // data:image/...;base64,...
                      setSourcePreview(reader.result as string);
                    };
                    reader.readAsDataURL(file);
                    return false; // 阻止 antd 自动上传,只取 base64
                  }}
                >
                  <Button icon={<UploadOutlined />}>选择图片</Button>
                </Upload>
                {sourcePreview && (
                  <div style={{ marginTop: 10 }}>
                    <Image src={sourcePreview} width={90} height={90} style={{ objectFit: 'cover', borderRadius: 6 }} />
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: '#8A8A8A', display: 'block', marginBottom: 6 }}>
                {mode === 'text2img' ? '图片描述 (Prompt)' : '修改描述'}
              </Text>
              <TextArea
                placeholder={mode === 'text2img'
                  ? '例如：一件米白色夏季女士连衣裙，碎花图案，V领设计，A字裙摆，纯色背景，电商白底图，高清产品摄影'
                  : '例如：将背景改为纯白色，增强光影对比度'}
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <Space wrap style={{ marginBottom: 16 }}>
              <AutoComplete
                value={model}
                onChange={(v) => { setModel(v); if (v === 'dall-e-2') setQuality('standard'); }}
                style={{ width: 200 }}
                placeholder="选择或输入模型名"
                options={[
                  { value: 'dall-e-3' },
                  { value: 'dall-e-2' },
                  { value: 'gpt-image-1' },
                ]}
                filterOption={(input, opt) => (opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}
              />
              <Select
                value={size}
                onChange={setSize}
                style={{ width: 220 }}
                options={[
                  { value: '1024x1024', label: '主图 / 方图 1:1（1024×1024）' },
                  { value: '1024x1792', label: '详情图 / 竖图（1024×1792）' },
                  { value: '1792x1024', label: '横版 / banner（1792×1024）' },
                  { value: '512x512', label: '小方图（512×512）' },
                ]}
              />
              {model === 'dall-e-3' && (
                <Select
                  value={quality}
                  onChange={setQuality}
                  style={{ width: 120 }}
                  options={[
                    { value: 'standard', label: '标准质量' },
                    { value: 'hd', label: '高清质量' },
                  ]}
                />
              )}
              <Select
                value={n}
                onChange={setN}
                style={{ width: 100 }}
                options={[
                  { value: 1, label: '1 张' },
                  { value: 2, label: '2 张' },
                ]}
              />
              {stores.length > 0 && (
                <Select
                  value={storeId}
                  onChange={setStoreId}
                  allowClear
                  placeholder="关联店铺"
                  style={{ width: 160 }}
                  options={stores.map((s) => ({ value: s.id, label: s.name }))}
                />
              )}
            </Space>

            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              size="large"
              loading={generating}
              onClick={handleGenerate}
              block
            >
              {generating ? '生成中...' : '生成图片'}
            </Button>

            <div style={{
              marginTop: 12, padding: 12, background: '#FFFBE6', borderRadius: 4,
              fontSize: 12, color: '#8A6D3B',
            }}>
              💡 提示：商品图建议使用「纯色背景、高清产品摄影、电商白底图」等关键词，横版图适合主图和详情页。
            </div>
          </Card>
        </Col>

        {/* Results panel */}
        <Col xs={24} lg={14}>
          <Card
            title={<span style={{ fontSize: 14, fontWeight: 500 }}>
              生成结果
              {lastPrompt && <span style={{ fontSize: 12, color: '#8A8A8A', fontWeight: 400, marginLeft: 8 }}>"{lastPrompt.slice(0, 40)}..."</span>}
            </span>}
            style={{ borderRadius: 4 }}
          >
            {generating ? (
              <div style={{ textAlign: 'center', padding: 80 }}>
                <Spin size="large" />
                <p style={{ marginTop: 16, color: '#8A8A8A', fontSize: 13 }}>AI 正在生成图片，请稍候...</p>
              </div>
            ) : results.length > 0 ? (
              <Image.PreviewGroup>
                <Row gutter={[12, 12]}>
                  {results.map((url, i) => (
                    <Col span={12} key={i}>
                      <Image
                        src={url}
                        alt={`生成结果 ${i + 1}`}
                        style={{ borderRadius: 4, objectFit: 'cover' }}
                        fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjVmNWY1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjYmZiZmJmIj7lm77niYfliqDovb0uLi48L3RleHQ+PC9zdmc+"
                      />
                      <Button
                        icon={<DownloadOutlined />}
                        size="small"
                        block
                        style={{ marginTop: 6 }}
                        onClick={() => downloadImage(url, i)}
                      >
                        下载
                      </Button>
                    </Col>
                  ))}
                </Row>
              </Image.PreviewGroup>
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#BFBFBF' }}>
                <PictureOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <p style={{ fontSize: 13 }}>输入描述后点击生成，图片将显示在这里</p>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default ImageGeneratePage;
