import { useState, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { Form, Input, Button, message, Alert, Checkbox } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';

interface LoginForm {
  email: string;
  password: string;
}

const SAVED_EMAIL_KEY = 'pdd_saved_email';
const LEGACY_PASSWORD_STORAGE_KEY = 'pdd_saved_password';

function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [error, setError] = useState('');
  const [rememberAccount, setRememberAccount] = useState(false);
  const [form] = Form.useForm();

  // Redirect if already authenticated. Use <Navigate> (declarative) — calling
  // navigate() during render throws "Cannot update a component while rendering".
  if (accessToken) {
    return <Navigate to="/" replace />;
  }

  // Load saved account on mount and clear legacy stored credentials.
  useEffect(() => {
    const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY);
    localStorage.removeItem(LEGACY_PASSWORD_STORAGE_KEY);

    if (savedEmail) {
      setRememberAccount(true);
      form.setFieldsValue({ email: savedEmail });
    }
  }, []);

  const onFinish = async (values: LoginForm) => {
    setError('');
    try {
      if (rememberAccount) {
        localStorage.setItem(SAVED_EMAIL_KEY, values.email);
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }
      localStorage.removeItem(LEGACY_PASSWORD_STORAGE_KEY);

      await login(values.email, values.password);
      message.success('登录成功');
      navigate('/');
    } catch (err: any) {
      const msg = err?.response?.data?.error || '登录失败';
      setError(msg);
    }
  };

  return (
    <div>
      <h2 style={{ textAlign: 'center', marginBottom: 32, fontSize: 20, fontWeight: 500 }}>登录</h2>

      {error && (
        <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} closable onClose={() => setError('')} />
      )}

      <Form<LoginForm> form={form} onFinish={onFinish} size="large">
        <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }]}>
          <Input prefix={<MailOutlined />} placeholder="邮箱" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="密码" />
        </Form.Item>
        <Form.Item style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
            <Checkbox checked={rememberAccount} onChange={(e) => setRememberAccount(e.target.checked)}>
              记住账号
            </Checkbox>
          </div>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" block>
            登 录
          </Button>
        </Form.Item>
        <div style={{ textAlign: 'center', fontSize: 13, color: '#8A8A8A' }}>
          还没有账号？ <Link to="/register">立即注册</Link>
        </div>
      </Form>
    </div>
  );
}

export default LoginPage;
