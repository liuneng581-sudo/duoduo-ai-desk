import { Link, useNavigate } from 'react-router-dom';
import { Form, Input, Button, message } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';

interface RegisterForm {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

function RegisterPage() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const [form] = Form.useForm<RegisterForm>();

  const onFinish = async (values: RegisterForm) => {
    if (values.password !== values.confirm) {
      message.error('两次密码输入不一致');
      return;
    }
    try {
      await register(values.email, values.password, values.name);
      message.success('注册成功');
      navigate('/');
    } catch (err: any) {
      message.error(err?.response?.data?.error || '注册失败');
    }
  };

  return (
    <div>
      <h2 style={{ textAlign: 'center', marginBottom: 32 }}>注册</h2>
      <Form form={form} onFinish={onFinish} size="large">
        <Form.Item name="name" rules={[{ required: true, message: '请输入姓名' }]}>
          <Input prefix={<UserOutlined />} placeholder="姓名" />
        </Form.Item>
        <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email' }]}>
          <Input prefix={<MailOutlined />} placeholder="邮箱" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="密码" />
        </Form.Item>
        <Form.Item name="confirm" rules={[{ required: true, message: '请确认密码' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" block>
            注 册
          </Button>
        </Form.Item>
        <div style={{ textAlign: 'center' }}>
          已有账号？ <Link to="/login">返回登录</Link>
        </div>
      </Form>
    </div>
  );
}

export default RegisterPage;
