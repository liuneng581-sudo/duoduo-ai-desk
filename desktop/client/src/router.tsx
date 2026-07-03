import { Routes, Route, Navigate } from 'react-router-dom';
import AuthLayout from './layouts/AuthLayout';
import DashboardLayout from './layouts/DashboardLayout';
import ActivatePage from './pages/auth/ActivatePage';
import DashboardPage from './pages/dashboard/DashboardPage';
import StoreListPage from './pages/stores/StoreListPage';
import StoreDetailPage from './pages/stores/StoreDetailPage';
import ProductsPage from './pages/stores/ProductsPage';
import QAPage from './pages/stores/QAPage';
import StoreRevenuePage from './pages/stores/StoreRevenuePage';
import StorePickerPage from './pages/stores/StorePickerPage';
import ChatPage from './pages/chat/ChatPage';
import ImageGeneratePage from './pages/images/ImageGeneratePage';
import ImageHistoryPage from './pages/images/ImageHistoryPage';
import SettingsPage from './pages/settings/SettingsPage';
import HelpCenterPage from './pages/help/HelpCenterPage';

function AppRouter() {
  return (
    <Routes>
      {/* Activation (replaces account login) */}
      <Route element={<AuthLayout />}>
        <Route path="/activate" element={<ActivatePage />} />
      </Route>

      {/* Protected pages */}
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/stores" element={<StoreListPage />} />
        <Route path="/products" element={<StorePickerPage title="商品知识库" subtitle="管理各店铺的商品库，AI 客服回复时据此检索商品并发送链接" target="products" />} />
        <Route path="/qa" element={<StorePickerPage title="问答知识库" subtitle="管理各店铺的常见问答，AI 客服遇到政策/活动/售后问题时优先照此回答" target="qa" />} />
        <Route path="/revenue" element={<StorePickerPage title="门店数据" subtitle="查看各店铺的实时营收与订单数据" target="revenue" />} />
        <Route path="/stores/:id" element={<StoreDetailPage />} />
        <Route path="/stores/:id/products" element={<ProductsPage />} />
        <Route path="/stores/:id/qa" element={<QAPage />} />
        <Route path="/stores/:id/revenue" element={<StoreRevenuePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/images" element={<ImageGeneratePage />} />
        <Route path="/images/history" element={<ImageHistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpCenterPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRouter;
