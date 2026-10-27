import { useState } from 'react';
import { Text, View } from 'react-native';
import { API_URL, DEFAULT_API_URL } from '../api';
import { Button, ErrorMessage, Field, Header, Screen, s } from '../components/ui';
import { useStore } from '../store';

export default function ConnectionScreen() {
  const { changeServer, notify } = useStore();
  const [url, setUrl] = useState(API_URL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    let normalized: string;
    try {
      const parsed = new URL(url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) throw new Error();
      normalized = parsed.origin;
    } catch { setError('Nhập địa chỉ http(s) của máy chủ, ví dụ http://192.168.1.10:8000, không kèm /api hay mật khẩu.'); return; }
    setBusy(true); setError(null);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
    try {
      // Never forward the current login token to a different host.
      const response = await fetch(`${normalized}/api/health`, { signal: controller.signal });
      const health = await response.json();
      if (!response.ok || health.status !== 'ok' || health.engine !== 'openvto') throw new Error();
      await changeServer(normalized); notify('Đã kết nối shop. Đăng nhập lại trên máy chủ vừa chọn.');
    } catch { setError('Chưa kết nối được ShopFit tại địa chỉ này. Kiểm tra cùng Wi-Fi, API đang chạy và firewall.'); }
    finally { clearTimeout(timer); setBusy(false); }
  }
  return <Screen><Header title="Kết nối shop" subtitle="ANDROID DEMO SETUP" back /><View style={{ maxWidth: 620, width: '100%', alignSelf: 'center', gap: 18 }}>
    <Text style={s.muted}>Điện thoại thật: nhập IPv4 LAN của máy đang chạy backend, cùng Wi-Fi. Android emulator dùng http://10.0.2.2:8000. Không dùng localhost trên điện thoại để trỏ về máy tính.</Text>
    <Field label="Địa chỉ backend ShopFit" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />
    <Text style={s.muted}>Đổi máy chủ sẽ đăng xuất và xóa giỏ hàng cục bộ để tránh dùng nhầm dữ liệu giữa các shop.</Text>
    <ErrorMessage message={error} /><Button loading={busy} onPress={() => void save()}>Kiểm tra & lưu kết nối</Button><Button variant="outline" disabled={busy} onPress={() => setUrl(DEFAULT_API_URL)}>Điền địa chỉ mặc định</Button>
    <Text style={s.muted}>HTTP chỉ dành cho bản demo trong mạng riêng. Khi triển khai thực tế dùng backend HTTPS và build không bật SHOPFIT_PREVIEW.</Text>
  </View></Screen>;
}
