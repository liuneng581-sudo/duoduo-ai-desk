import { useEffect, useRef } from 'react';
import { Empty } from 'antd';

/**
 * Hosts the embedded store browser (an Electron WebContentsView managed by the
 * main process) over a placeholder div. The native view isn't part of the DOM,
 * so we measure this div's screen rect and tell main where to position the view,
 * keeping the two in sync on resize/scroll. The view is shown while this panel
 * is mounted and hidden when it unmounts (e.g. navigating away).
 *
 * Outside Electron (plain browser / dev), window.electronAPI is undefined and we
 * render a hint instead.
 */
function StoreBrowserPanel({ storeId }: { storeId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const api = typeof window !== 'undefined' ? window.electronAPI?.storeView : undefined;

  useEffect(() => {
    if (!api || !storeId) return;
    let cancelled = false;

    const reportBounds = () => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Skip degenerate rects (div not laid out yet) — sending a 0-size bound
      // makes the native view invisible (looks like a white screen).
      if (r.width < 2 || r.height < 2) return;
      api.setBounds(storeId, { x: r.left, y: r.top, width: r.width, height: r.height });
    };

    (async () => {
      await api.create(storeId);
      if (cancelled) return;
      // Wait for layout to settle before measuring, then show. Report a few
      // times over the first second to catch late layout (fonts/flex/scrollbars).
      requestAnimationFrame(() => {
        reportBounds();
        api.show(storeId);
      });
      for (const delay of [100, 300, 600, 1000]) {
        setTimeout(() => { if (!cancelled) reportBounds(); }, delay);
      }
    })();

    // Keep the native view aligned with this div as the layout changes.
    const ro = new ResizeObserver(reportBounds);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', reportBounds);
    window.addEventListener('scroll', reportBounds, true);

    return () => {
      cancelled = true;
      ro.disconnect();
      window.removeEventListener('resize', reportBounds);
      window.removeEventListener('scroll', reportBounds, true);
      // Hide (not close) so the session/login stays alive in the background and
      // keeps serving messages while the user is on other pages.
      api.hide(storeId);
    };
  }, [api, storeId]);

  if (!api) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Empty description="店铺浏览器需在桌面应用内运行" />
      </div>
    );
  }

  // Placeholder the native view is positioned over. Min-height ensures the view
  // has room even before data loads.
  return <div ref={containerRef} style={{ width: '100%', height: '70vh', minHeight: 480, background: '#F5F5F5', borderRadius: 8 }} />;
}

export default StoreBrowserPanel;
