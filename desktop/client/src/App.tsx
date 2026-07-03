import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppRouter from './router';
import { tokens } from './theme/tokens';

const theme = {
  token: {
    colorPrimary: tokens.red,
    borderRadius: tokens.radius,
    fontFamily: tokens.fontFamily,
    colorBgLayout: tokens.bg,
  },
};

function App() {
  return (
    <ConfigProvider theme={theme} locale={zhCN}>
      <AntApp>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
