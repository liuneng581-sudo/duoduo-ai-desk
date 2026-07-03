import { useState } from 'react';
import { Modal, Button, Typography, Space } from 'antd';
import { CustomerServiceOutlined, TeamOutlined } from '@ant-design/icons';
import { tokens } from '../theme/tokens';

const { Title, Paragraph, Text } = Typography;

/**
 * "联系客服/进群求助" 入口按钮 + 弹窗。
 * 展示飞书售后群二维码/群链接，方便商家遇问题时快速进群。
 */
function SupportModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="text"
        icon={<CustomerServiceOutlined style={{ fontSize: 18, color: tokens.inkSoft }} />}
        onClick={() => setOpen(true)}
        title="联系客服"
        aria-label="联系客服"
      />
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        centered
        width={420}
        title={null}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: tokens.cards.orange.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <TeamOutlined style={{ fontSize: 28, color: tokens.cards.orange.accent }} />
          </div>

          <Title level={4} style={{ marginBottom: 8 }}>加入售后服务群</Title>
          <Paragraph type="secondary" style={{ marginBottom: 24 }}>
            遇到使用问题？扫码加入飞书售后群，专人协助解决。
          </Paragraph>

          {/* TODO: 替换为实际的飞书群二维码图片 URL */}
          <div style={{
            width: 200, height: 200, margin: '0 auto 16px',
            border: `2px dashed ${tokens.line}`,
            borderRadius: tokens.radius,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: tokens.surfaceSoft,
          }}>
            <Space direction="vertical" align="center">
              <CustomerServiceOutlined style={{ fontSize: 36, color: tokens.inkFaint }} />
              <Text type="secondary" style={{ fontSize: 12 }}>飞书群二维码</Text>
            </Space>
          </div>

          {/* TODO: 替换为实际的飞书群链接 */}
          <Button
            type="primary"
            href="https://applink.feishu.cn/client/chat/open?openId=TODO_REPLACE_WITH_ACTUAL_GROUP_LINK"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: tokens.gradient, border: 'none',
              borderRadius: tokens.radiusSm, fontWeight: 600,
            }}
          >
            点击加入飞书群
          </Button>

          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
            服务时间：工作日 9:00 - 18:00
          </Paragraph>
        </div>
      </Modal>
    </>
  );
}

export default SupportModal;
