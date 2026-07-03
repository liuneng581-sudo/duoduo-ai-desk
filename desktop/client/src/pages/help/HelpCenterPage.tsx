import { Typography, Card, Collapse, Space, Tag, Divider } from 'antd';
import {
  SettingOutlined,
  ShopOutlined,
  ShoppingOutlined,
  QuestionCircleOutlined,
  RocketOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';

const { Title, Paragraph, Text } = Typography;

/**
 * 使用教程 / 帮助中心页面。
 * 图文讲解：全局配置、门店问答库、商品知识库 的区别与用法，
 * 帮助新用户快速上手。
 */

const sections = [
  {
    key: 'quickstart',
    icon: <RocketOutlined style={{ color: tokens.cards.orange.accent }} />,
    title: '快速开始',
    tag: '新手必看',
    tagColor: 'orange',
    content: (
      <>
        <Paragraph>初次使用多多AI客服，只需 3 步即可让 AI 开始帮你回复买家：</Paragraph>
        <ol style={{ paddingLeft: 20 }}>
          <li><Text strong>添加店铺</Text> — 前往「店铺管理」，扫码登录你的拼多多商家后台，系统将自动连接。</li>
          <li><Text strong>同步商品</Text> — 店铺连接后，进入该店铺的「商品知识库」，点击"同步商品"拉取在售商品信息。</li>
          <li><Text strong>配置问答</Text> — 进入该店铺的「问答知识库」，添加常见售前/售后问题及标准答案，AI 遇到相似问题时优先使用。</li>
        </ol>
        <Paragraph type="secondary">完成以上步骤后，AI 客服即开始工作。你可以在「对话监控」中实时查看 AI 的回复情况。</Paragraph>
      </>
    ),
  },
  {
    key: 'global-settings',
    icon: <SettingOutlined style={{ color: tokens.cards.blue.accent }} />,
    title: '全局配置',
    tag: '系统设置',
    tagColor: 'blue',
    content: (
      <>
        <Paragraph>
          全局配置（「系统设置」页面）控制 AI 客服的整体行为，对所有店铺生效：
        </Paragraph>
        <ul style={{ paddingLeft: 20 }}>
          <li><Text strong>AI 回复开关</Text> — 全局启停 AI 自动回复。</li>
          <li><Text strong>回复语气/风格</Text> — 设定 AI 的沟通风格（热情、专业、简洁等）。</li>
          <li><Text strong>报备话术</Text> — 当遇到改备注、催发货、改价合单、开票等场景时，AI 先安抚买家并报备飞书群。</li>
          <li><Text strong>通用兜底回复</Text> — AI 无法确定答案时的默认回复策略。</li>
        </ul>
        <Paragraph type="secondary">
          全局配置是"底线规则"，各店铺可在自己的知识库中覆盖更细致的回答。
        </Paragraph>
      </>
    ),
  },
  {
    key: 'qa-knowledge',
    icon: <QuestionCircleOutlined style={{ color: tokens.cards.green.accent }} />,
    title: '问答知识库',
    tag: '按店铺',
    tagColor: 'green',
    content: (
      <>
        <Paragraph>
          问答知识库是<Text strong>按店铺</Text>维护的"FAQ 库"。当买家问题匹配到库中条目时，AI 优先使用你预设的答案回复。
        </Paragraph>
        <Paragraph strong>适合放什么？</Paragraph>
        <ul style={{ paddingLeft: 20 }}>
          <li>退换货政策、保修说明</li>
          <li>活动规则（满减、优惠券使用条件）</li>
          <li>发货/物流常见问题</li>
          <li>特殊客情话术（投诉安抚、好评引导）</li>
        </ul>
        <Paragraph strong>与商品知识库的区别：</Paragraph>
        <Paragraph type="secondary">
          问答知识库解决"政策/流程/活动类"问题；商品知识库解决"这个商品怎么样"的问题。两者互补。
        </Paragraph>
      </>
    ),
  },
  {
    key: 'product-knowledge',
    icon: <ShoppingOutlined style={{ color: tokens.cards.pink.accent }} />,
    title: '商品知识库',
    tag: '按店铺',
    tagColor: 'red',
    content: (
      <>
        <Paragraph>
          商品知识库存储每个商品的详细信息（名称、价格、规格、材质、运费、发货时效等），AI 据此回答买家对具体商品的咨询。
        </Paragraph>
        <Paragraph strong>数据来源：</Paragraph>
        <ul style={{ paddingLeft: 20 }}>
          <li><Text strong>自动同步</Text> — 从拼多多后台拉取商品标题、价格、图片等基础信息。</li>
          <li><Text strong>手动补充</Text> — 运费说明、材质细节、发货时效等拼多多接口未提供的信息，需手动填写或通过 Excel 批量导入。</li>
        </ul>
        <Paragraph strong>小贴士：</Paragraph>
        <Paragraph type="secondary">
          商品信息填得越完整，AI 回答越准确。重点补充：运费说明、材质信息、发货时效——这三项是买家最常问的。
        </Paragraph>
      </>
    ),
  },
  {
    key: 'store-management',
    icon: <ShopOutlined style={{ color: tokens.amber }} />,
    title: '店铺管理',
    tag: '多店铺',
    tagColor: 'gold',
    content: (
      <>
        <Paragraph>
          支持同时管理多个拼多多店铺，每个店铺独立维护自己的商品库和问答库。
        </Paragraph>
        <ul style={{ paddingLeft: 20 }}>
          <li><Text strong>添加店铺</Text> — 点击"添加店铺"按钮，使用拼多多商家账号扫码登录。</li>
          <li><Text strong>连接状态</Text> — 绿色表示正常连接，黄色需要重新登录，红色表示异常。</li>
          <li><Text strong>切换店铺</Text> — 在商品知识库/问答知识库页面，可通过顶部选择切换不同店铺。</li>
        </ul>
        <Paragraph type="secondary">
          每个店铺的知识库相互独立，不同店铺可以配置不同的回复策略。
        </Paragraph>
      </>
    ),
  },
];

function HelpCenterPage() {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <Space align="center" size={12}>
          <BookOutlined style={{ fontSize: 24, color: tokens.red }} />
          <Title level={3} style={{ margin: 0 }}>使用教程</Title>
        </Space>
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          了解多多AI客服各模块的功能与用法，快速上手配置。
        </Paragraph>
      </div>

      <Divider style={{ margin: '0 0 24px' }} />

      <Collapse
        defaultActiveKey={['quickstart']}
        accordion={false}
        bordered={false}
        style={{ background: 'transparent' }}
        items={sections.map((s) => ({
          key: s.key,
          label: (
            <Space size={10}>
              {s.icon}
              <Text strong style={{ fontSize: 15 }}>{s.title}</Text>
              <Tag color={s.tagColor}>{s.tag}</Tag>
            </Space>
          ),
          children: (
            <Card
              bordered={false}
              style={{
                background: tokens.surfaceSoft,
                borderRadius: tokens.radiusSm,
              }}
              styles={{ body: { padding: '16px 20px' } }}
            >
              {s.content}
            </Card>
          ),
        }))}
      />
    </div>
  );
}

export default HelpCenterPage;
