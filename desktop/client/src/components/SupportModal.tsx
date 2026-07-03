import { useState } from 'react';
import { Modal, Button, Typography, Space } from 'antd';
import { CustomerServiceOutlined, CopyOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

// TODO: 替换为实际飞书群二维码图片 URL 和群链接
const FEISHU_GROUP_LINK = 'https://applink.feishu.cn/client/chat/open?openId=TODO_REPLACE_WITH_ACTUAL_GROUP_ID';
const FEISHU_QR_IMAGE = ''; // TODO: 替换为实际飞书群二维码图片地址

/**
 * 联系客服/进群求助弹窗。
 * 展示飞书售后群二维码或链接，方便商家遇到问题时快速联系。
 */
function SupportModal() {
  const [open, setOpen] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(FEISHU_GROUP_LINK).catch(() => {});
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
            <Paragraph style={{ fontSize: 13, color: '#666', marginBottom: 0 }}>
              或复制群链接在飞书中打开：
            </Paragraph>
            <Button
              icon={<CopyOutlined />}
              onClick={copyLink}
              block
            >
              复制飞书群链接
            </Button>
          </Space>
        </div>
      </Modal>
    </>
  );
}

export default SupportModal;
