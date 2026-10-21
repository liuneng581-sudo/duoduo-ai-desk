import { useState } from 'react';
import { Modal, Button, Typography, Space } from 'antd';
import { CustomerServiceOutlined, CopyOutlined } from '@ant-design/icons';
import { SUPPORT_CONTACT_URL, hasSupportContactUrl } from '../config/supportContact';

const { Title, Paragraph, Text } = Typography;

// Optional QR image. Leave empty unless you host a public image URL yourself.
const FEISHU_QR_IMAGE = (import.meta.env.VITE_SUPPORT_QR_IMAGE_URL || '').trim();

/**
 * 联系客服/进群求助弹窗。
 * 展示飞书售后群二维码或链接，方便商家遇到问题时快速联系。
 */
function SupportModal() {
  const [open, setOpen] = useState(false);

  const copyLink = () => {
    if (!hasSupportContactUrl()) return;
    navigator.clipboard.writeText(SUPPORT_CONTACT_URL).catch(() => {});
  };

  return (
    <>
      <Button
        type="text"
        icon={<CustomerServiceOutlined style={{ fontSize: 18, color: '#8A8A8A' }} />}
        onClick={() => setOpen(true)}
        title="联系客服"
      />

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        centered
        width={400}
        title={null}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Title level={4} style={{ marginBottom: 8 }}>联系客服 / 进群求助</Title>
          <Paragraph type="secondary" style={{ marginBottom: 24 }}>
            遇到问题？扫码加入飞书售后群，我们会尽快为您解答。
          </Paragraph>

          {FEISHU_QR_IMAGE ? (
            <img
              src={FEISHU_QR_IMAGE}
              alt="飞书售后群二维码"
              style={{ width: 200, height: 200, borderRadius: 8, marginBottom: 16 }}
            />
          ) : (
            <div style={{
              width: 200, height: 200, margin: '0 auto 16px',
              background: '#f5f5f5', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px dashed #d9d9d9',
            }}>
              <Text type="secondary" style={{ fontSize: 12 }}>二维码占位<br />（待配置）</Text>
            </div>
          )}

          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {hasSupportContactUrl() ? (
              <>
                <Paragraph style={{ fontSize: 13, color: '#666', marginBottom: 0 }}>
                  或复制客服链接打开：
                </Paragraph>
                <Button
                  icon={<CopyOutlined />}
                  onClick={copyLink}
                  block
                >
                  复制客服链接
                </Button>
              </>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                未配置客服链接。构建时设置 SUPPORT_CONTACT_URL（环境变量 VITE_SUPPORT_CONTACT_URL）。
              </Text>
            )}
          </Space>
        </div>
      </Modal>
    </>
  );
}

export default SupportModal;
