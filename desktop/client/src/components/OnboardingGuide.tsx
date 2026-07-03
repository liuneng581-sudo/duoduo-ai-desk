import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, Steps, Typography, Space } from 'antd';
import {
  ShopOutlined,
  ShoppingOutlined,
  QuestionCircleOutlined,
  CheckCircleOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { tokens } from '../theme/tokens';

const { Title, Paragraph, Text } = Typography;

const STORAGE_KEY = 'duoduo_onboarding_complete';

const steps = [
  {
    icon: <ShopOutlined style={{ fontSize: 36, color: tokens.cards.orange.accent }} />,
    title: '第 1 步：添加店铺',
    description: '前往「店铺管理」，点击添加店铺，使用拼多多商家账号扫码登录。连接成功后，系统将自动监听该店铺的买家消息。',
    action: '/stores',
    actionText: '去添加店铺',
  },
  {
    icon: <ShoppingOutlined style={{ fontSize: 36, color: tokens.cards.pink.accent }} />,
    title: '第 2 步：同步商品',
    description: '店铺连接后，进入该店铺的「商品知识库」，点击"同步商品"按钮拉取在售商品。建议手动补充运费说明、材质信息和发货时效，让 AI 回答更准确。',
    action: '/products',
    actionText: '去同步商品',
  },
  {
    icon: <QuestionCircleOutlined style={{ fontSize: 36, color: tokens.cards.green.accent }} />,
    title: '第 3 步：配置问答',
    description: '进入该店铺的「问答知识库」，添加常见的售前/售后问题与标准答案。AI 遇到相似问题时会优先使用你预设的回答，保证回复准确性。',
    action: '/qa',
    actionText: '去配置问答',
  },
  {
    icon: <CheckCircleOutlined style={{ fontSize: 36, color: tokens.green }} />,
    title: '配置完成！',
    description: 'AI 客服已准备就绪，将自动回复买家消息。你可以随时在「对话监控」中查看 AI 的回复情况，也可在各知识库中持续优化回答内容。',
    action: '/chat',
    actionText: '查看对话监控',
  },
];

/**
 * 首次使用分步引导组件。
 * 新用户首次进入 Dashboard 时弹出，引导完成：添加店铺 → 同步商品 → 配置问答。
 * 用 localStorage 记录是否已完成引导，已完成则不再弹出。
 */
function OnboardingGuide() {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      // 延迟 500ms 展示，避免与页面加载动画冲突
      const timer = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleFinish = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  const handleGoToStep = () => {
    const step = steps[current];
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
    navigate(step.action);
  };

  const handleNext = () => {
    if (current < steps.length - 1) {
      setCurrent(current + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (current > 0) {
      setCurrent(current - 1);
    }
  };

  if (!visible) return null;

  const step = steps[current];
  const isLast = current === steps.length - 1;

  return (
    <Modal
      open={visible}
      onCancel={handleSkip}
      centered
      width={500}
      footer={null}
      title={null}
      closable
    >
      <div style={{ padding: '12px 0' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Space align="center" size={8}>
            <RocketOutlined style={{ fontSize: 20, color: tokens.red }} />
            <Title level={4} style={{ margin: 0 }}>欢迎使用多多AI客服</Title>
          </Space>
          <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
            只需 3 步，让 AI 开始帮你回复买家
          </Paragraph>
        </div>

        {/* Steps indicator */}
        <Steps
          current={current}
          size="small"
          style={{ marginBottom: 28 }}
          items={steps.map((s, i) => ({ title: i < steps.length - 1 ? `步骤 ${i + 1}` : '完成' }))}
        />

        {/* Current step content */}
        <div style={{
          textAlign: 'center',
          padding: '24px 16px',
          background: tokens.surfaceSoft,
          borderRadius: tokens.radiusSm,
          marginBottom: 24,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: tokens.shadowCard,
          }}>
            {step.icon}
          </div>
          <Title level={5} style={{ marginBottom: 8 }}>{step.title}</Title>
          <Paragraph style={{ marginBottom: 0, maxWidth: 380, margin: '0 auto' }}>
            {step.description}
          </Paragraph>
        </div>

        {/* Footer buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button type="link" onClick={handleSkip} style={{ padding: 0 }}>
            <Text type="secondary">跳过引导</Text>
          </Button>

          <Space>
            {current > 0 && (
              <Button onClick={handlePrev}>上一步</Button>
            )}
            <Button onClick={handleGoToStep}>
              {step.actionText}
            </Button>
            <Button
              type="primary"
              onClick={isLast ? handleFinish : handleNext}
              style={isLast ? { background: tokens.gradient, border: 'none' } : {}}
            >
              {isLast ? '开始使用' : '下一步'}
            </Button>
          </Space>
        </div>
      </div>
    </Modal>
  );
}

export default OnboardingGuide;
