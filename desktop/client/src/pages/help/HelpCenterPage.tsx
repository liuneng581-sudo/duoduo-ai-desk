import { Typography, Card, Collapse, Steps } from 'antd';
import {
  ShopOutlined,
  ShoppingOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  RocketOutlined,
  SyncOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';

const { Title, Paragraph, Text } = Typography;

const cardStyle = {
  borderRadius: tokens.radiusLg,
  boxShadow: tokens.shadowCard,
  border: `1px solid ${tokens.line}`,
  marginBottom: 20,
};

const sectionTitleStyle = {
  fontWeight: 800,
  fontSize: 16,
  color: tokens.ink,
  marginBottom: 12,
};

/**
 * F4-help-center: 图文帮助中心页面
 * 讲清 全局配置 / 门店问答库 / 商品知识库 的区别与用法
 */
function HelpCenterPage() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <Title level={3} style={{ color: tokens.ink, marginBottom: 6 }}>
        <RocketOutlined style={{ marginRight: 8, color: tokens.orange }} />
        使用教程
      </Title>
      <Paragraph style={{ color: tokens.inkSoft, marginBottom: 28 }}>
        快速了解多多AI客服的核心功能，掌握 全局配置、商品知识库、问答知识库 的区别与使用方法。
      </Paragraph>

      {/* 快速开始流程 */}
      <Card style={cardStyle}>
        <div style={sectionTitleStyle}>🚀 快速开始</div>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            {
              title: <Text strong>添加店铺</Text>,
              description: '进入「店铺管理」，点击添加店铺，输入拼多多商家后台的 Cookie 完成绑定。系统会自动连接并开始接管对话。',
              icon: <ShopOutlined style={{ color: tokens.red }} />,
            },
            {
              title: <Text strong>同步商品</Text>,
              description: '进入「商品知识库」选择对应店铺，点击同步按钮拉取店铺商品。也可通过 Excel 批量导入商品的运费、材质、规格等详细信息。',
              icon: <SyncOutlined style={{ color: tokens.orange }} />,
            },
            {
              title: <Text strong>配置问答库</Text>,
              description: '进入「问答知识库」选择对应店铺，添加常见问题和标准回复。AI 遇到匹配问题时会优先使用这里的答案。',
              icon: <QuestionCircleOutlined style={{ color: tokens.blue }} />,
            },
            {
              title: <Text strong>开始接管</Text>,
              description: '配置完成后，AI 即自动回复买家消息。进入「对话监控」可实时查看 AI 的回复情况并随时介入。',
              icon: <MessageOutlined style={{ color: tokens.green }} />,
            },
          ]}
        />
      </Card>

      {/* 三大知识库区别 */}
      <Card style={cardStyle}>
        <div style={sectionTitleStyle}>📚 三大核心模块区别</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <div style={{ padding: 16, borderRadius: tokens.radius, background: tokens.cards.orange.bg }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}><SettingOutlined style={{ color: tokens.cards.orange.accent }} /></div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>全局配置</Text>
            <Text style={{ color: tokens.inkSoft, fontSize: 13 }}>
              设置 AI 模型、飞书通知 Webhook、默认回复风格等。对所有店铺生效。
            </Text>
          </div>
          <div style={{ padding: 16, borderRadius: tokens.radius, background: tokens.cards.blue.bg }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}><ShoppingOutlined style={{ color: tokens.cards.blue.accent }} /></div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>商品知识库</Text>
            <Text style={{ color: tokens.inkSoft, fontSize: 13 }}>
              每个店铺独立。存储商品的标题、价格、运费、材质、规格等信息。AI 据此回答商品相关问题并推荐链接。
            </Text>
          </div>
          <div style={{ padding: 16, borderRadius: tokens.radius, background: tokens.cards.green.bg }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}><QuestionCircleOutlined style={{ color: tokens.cards.green.accent }} /></div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>问答知识库</Text>
            <Text style={{ color: tokens.inkSoft, fontSize: 13 }}>
              每个店铺独立。存储常见问答对（如退换货政策、发货时间），AI 遇到匹配场景时优先按此回答，减少幻觉。
            </Text>
          </div>
        </div>
      </Card>

      {/* 常见问题 FAQ */}
      <Card style={cardStyle}>
        <div style={sectionTitleStyle}>❓ 常见问题</div>
        <Collapse
          ghost
          items={[
            {
              key: '1',
              label: <Text strong>AI 回复不准确怎么办？</Text>,
              children: (
                <Paragraph style={{ color: tokens.inkSoft }}>
                  1. 检查「问答知识库」是否覆盖了该类问题，添加标准答案可显著提升准确率。<br />
                  2. 检查「商品知识库」信息是否完整（运费、发货时效等字段）。<br />
                  3. 在「系统设置」中调整 AI 模型或回复风格。
                </Paragraph>
              ),
            },
            {
              key: '2',
              label: <Text strong>如何批量导入商品信息？</Text>,
              children: (
                <Paragraph style={{ color: tokens.inkSoft }}>
                  进入「商品知识库」，选择对应店铺后点击「导入」按钮，下载 Excel 模板填写商品信息（含运费、材质、规格、发货时效等列），然后上传即可批量更新。
                </Paragraph>
              ),
            },
            {
              key: '3',
              label: <Text strong>店铺掉线了怎么办？</Text>,
              children: (
                <Paragraph style={{ color: tokens.inkSoft }}>
                  进入「店铺管理」查看店铺状态，如显示离线，点击「重新连接」。若持续掉线，可能是 Cookie 过期，需重新获取并更新。
                </Paragraph>
              ),
            },
            {
              key: '4',
              label: <Text strong>飞书通知怎么配置？</Text>,
              children: (
                <Paragraph style={{ color: tokens.inkSoft }}>
                  进入「系统设置」→ 通知设置，粘贴飞书群机器人的 Webhook 地址。配置后，需要人工介入的对话（如改价、开票等报备场景）会自动推送到飞书群。
                </Paragraph>
              ),
            },
            {
              key: '5',
              label: <Text strong>商品知识库和问答知识库有什么区别？</Text>,
              children: (
                <Paragraph style={{ color: tokens.inkSoft }}>
                  商品知识库存储商品的结构化信息（名称、价格、运费等），AI 用来回答"这个多少钱""包邮吗"等商品维度的问题。<br />
                  问答知识库存储通用问答对（退换货政策、活动规则等），AI 用来回答政策/流程类问题。两者互补，建议都配置。
                </Paragraph>
              ),
            },
            {
              key: '6',
              label: <Text strong>能同时管理多个店铺吗？</Text>,
              children: (
                <Paragraph style={{ color: tokens.inkSoft }}>
                  可以。在「店铺管理」中添加多个店铺，每个店铺有独立的商品知识库和问答知识库。AI 会根据消息来源店铺自动使用对应知识库。
                </Paragraph>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

export default HelpCenterPage;
