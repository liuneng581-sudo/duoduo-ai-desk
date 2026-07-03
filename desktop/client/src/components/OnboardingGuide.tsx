import { useState, useEffect, useRef } from 'react';
import { Tour, TourProps } from 'antd';

const ONBOARDING_KEY = 'duoduo_onboarding_completed';

/**
 * 首次使用分步引导组件。
 * 新用户首次进入后，高亮引导核心操作流程：添加店铺 → 同步商品 → 配置问答。
 * 使用 localStorage 记录是否已完成引导，不会重复展示。
 */
function OnboardingGuide() {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<{
    store: HTMLElement | null;
    products: HTMLElement | null;
    qa: HTMLElement | null;
  }>({ store: null, products: null, qa: null });

  // Use a ref to avoid re-triggering
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Check if user already completed onboarding
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (completed) return;

    // Wait for DOM to render sidebar nav items
    const timer = setTimeout(() => {
      const navItems = document.querySelectorAll<HTMLElement>('nav > div');
      // menuItems order: 工作台(0), 店铺管理(1), 对话监控(2), 商品知识库(3), 问答知识库(4), ...
      const store = navItems[1] || null;
      const products = navItems[3] || null;
      const qa = navItems[4] || null;

      if (store && products && qa) {
        setTargets({ store, products, qa });
        setOpen(true);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setOpen(false);
    localStorage.setItem(ONBOARDING_KEY, 'true');
  };

  const steps: TourProps['steps'] = [
    {
      title: '第 1 步：添加店铺',
      description: '点击「店铺管理」添加您的拼多多店铺，填写登录信息后系统会自动连接。',
      target: () => targets.store!,
      nextButtonProps: { children: '下一步' },
    },
    {
      title: '第 2 步：同步商品',
      description: '进入「商品知识库」导入或同步店铺商品信息，AI 客服回答时会参考这些商品资料。',
      target: () => targets.products!,
      nextButtonProps: { children: '下一步' },
      prevButtonProps: { children: '上一步' },
    },
    {
      title: '第 3 步：配置问答',
      description: '在「问答知识库」设置常见问题与标准答案（如退换货政策、发货时效），AI 会优先使用这些回答。',
      target: () => targets.qa!,
      nextButtonProps: { children: '开始使用' },
      prevButtonProps: { children: '上一步' },
    },
  ];

  if (!open || !targets.store) return null;

  return (
    <Tour
      open={open}
      onClose={handleClose}
      onFinish={handleClose}
      steps={steps}
      indicatorsRender={(current, total) => (
        <span style={{ color: '#999', fontSize: 12 }}>
          {current + 1} / {total}
        </span>
      )}
    />
  );
}

export default OnboardingGuide;
