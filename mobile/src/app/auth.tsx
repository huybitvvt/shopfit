import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { Button, ErrorMessage, Field, Header, Screen, s } from '../components/ui';
import { useStore } from '../store';
import { theme as t } from '../theme';

export default function Auth() {
  const { login, register, health, notify } = useStore();
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(demo?: 'customer' | 'admin') {
    setError(null);
    if (!demo && (!email.trim() || password.length < 8 || (signup && name.trim().length < 2))) { setError('Nhập email hợp lệ, mật khẩu ít nhất 8 ký tự và họ tên nếu đăng ký.'); return; }
    setBusy(true);
    try {
      if (demo) await login(demo === 'admin' ? 'shop@shopfit.local' : 'khach@shopfit.local', demo === 'admin' ? 'ShopfitAdmin123!' : 'Shopfit123!');
      else if (signup) await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      notify(signup ? 'Chào mừng bạn đến với ShopFit.' : 'Đã đăng nhập. Chào mừng bạn trở lại.');
      if (router.canGoBack()) router.back(); else router.replace('/profile');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Screen><Header title="ShopFit Studio" back /><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 440, alignSelf: 'center', paddingTop: 24 }}><Text style={s.kicker}>YOUR STYLE STARTS HERE</Text><Text style={[s.title, { fontSize: 47, lineHeight: 49, marginTop: 12 }]}>{signup ? 'Một khởi đầu\nrất riêng.' : 'Chào bạn,\nlại là mình đây.'}</Text><Text style={[s.muted, { marginTop: 16, marginBottom: 30 }]}>{signup ? 'Tạo tài khoản để lưu những lần thử và tìm phong cách của bạn.' : 'Đăng nhập để tiếp tục câu chuyện phong cách của bạn.'}</Text>
    {signup && <Field label="Họ và tên" value={name} onChangeText={setName} autoComplete="name" placeholder="Tên bạn muốn được gọi" />}
    <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="ban@email.com" />
    <View><Field label="Mật khẩu" value={password} onChangeText={setPassword} secureTextEntry={!visible} autoComplete={signup ? 'new-password' : 'current-password'} placeholder="Ít nhất 8 ký tự" style={{ paddingRight: 52 }} /><Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onPress={() => setVisible(v => !v)} style={{ position: 'absolute', right: 4, top: 28, width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}><Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={21} color={t.colors.muted} /></Pressable></View>
    <ErrorMessage message={error} /><Button loading={busy} onPress={() => void submit()} icon="arrow-forward">{signup ? 'Tạo tài khoản' : 'Đăng nhập'}</Button>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setSignup(v => !v); setError(null); }} style={{ minHeight: 54, justifyContent: 'center', alignItems: 'center', marginTop: 10 }}><Text style={s.muted}>{signup ? 'Đã có tài khoản? ' : 'Lần đầu đến ShopFit? '}<Text style={{ fontFamily: t.fonts.bold, color: t.colors.green }}>{signup ? 'Đăng nhập' : 'Đăng ký'}</Text></Text></Pressable>
    {health?.demo_accounts && <View style={{ marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: t.colors.line }}><Text style={[s.kicker, { textAlign: 'center', marginBottom: 14 }]}>TÀI KHOẢN TRẢI NGHIỆM</Text><View style={s.row}><Button variant="secondary" disabled={busy} onPress={() => void submit('customer')} style={{ flex: 1 }}>Khách hàng</Button><Button variant="outline" disabled={busy} onPress={() => void submit('admin')} style={{ flex: 1 }}>Chủ shop</Button></View></View>}
  </KeyboardAvoidingView></Screen>;
}
