import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

/**
 * 格式化时间为友好的相对时间显示。
 * - 1 小时内：显示"X 分钟前"
 * - 今天：显示"今天 HH:mm"
 * - 昨天：显示"昨天 HH:mm"
 * - 更早：显示"MM-DD HH:mm"
 * - 超过一年：显示"YYYY-MM-DD HH:mm"
 */
export function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = dayjs(dateStr);
  if (!d.isValid()) return '—';

  const now = dayjs();
  const diffMinutes = now.diff(d, 'minute');

  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;

  const diffDays = now.startOf('day').diff(d.startOf('day'), 'day');
  if (diffDays === 0) return `今天 ${d.format('HH:mm')}`;
  if (diffDays === 1) return `昨天 ${d.format('HH:mm')}`;
  if (now.year() === d.year()) return d.format('MM-DD HH:mm');
  return d.format('YYYY-MM-DD HH:mm');
}

/**
 * 格式化为完整日期时间（用于 tooltip 等需要精确时间的场景）。
 */
export function formatFullTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = dayjs(dateStr);
  if (!d.isValid()) return '—';
  return d.format('YYYY-MM-DD HH:mm:ss');
}
