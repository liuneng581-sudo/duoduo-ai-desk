import { useState, useEffect } from 'react';
import { Alert, Space } from 'antd';
import { NotificationOutlined, WarningOutlined } from '@ant-design/icons';
import api from '../services/api';

interface Announcement {
  id: string;
  title: string;
  content: string;
  level: 'info' | 'warning';
  publishedAt: string;
}

/**
 * 软件内公告横幅。登录后拉取当前有效公告，显示在页面顶部。
 * 用户可逐条关闭（本次会话内不再显示）。
 */
function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get('/announcements')
      .then((res) => setAnnouncements(res.data.data || []))
      .catch(() => { /* 静默，不影响正常使用 */ });
  }, []);

  const handleClose = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
      {visible.map((a) => (
        <Alert
          key={a.id}
          type={a.level === 'warning' ? 'warning' : 'info'}
          icon={a.level === 'warning' ? <WarningOutlined /> : <NotificationOutlined />}
          showIcon
          closable
          onClose={() => handleClose(a.id)}
          message={a.title}
          description={a.content}
          style={{ borderRadius: 8 }}
        />
      ))}
    </Space>
  );
}

export default AnnouncementBanner;
