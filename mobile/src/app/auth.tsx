import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, Text, View } from 'react-native';
import { API_URL } from '../api';
import { Button, ErrorMessage, Field, Header, Screen, s } from '../components/ui';
import { useStore } from '../store';
import { theme as t } from '../theme';

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

export default function Auth() {
  const { login, register, forgotPassword, resetPassword, health, notify } = useStore();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(demo?: 'customer' | 'admin') {
    setError(null);
    setBusy(true);
    try {
      if (demo) {
        await login(demo === 'admin' ? 'shop@shopfit.local' : 'khach@shopfit.local', demo === 'admin' ? 'ShopfitAdmin123!' : 'Shopfit123!');
        notify('Đã đăng nhập tài khoản trải nghiệm.');
        if (router.canGoBack()) router.back(); else router.replace('/profile');
        return;
      }

      if (mode === 'login') {
        if (!email.trim() || password.length < 8) {
          setError('Vui lòng nhập email hợp lệ và mật khẩu ít nhất 8 ký tự.');
          return;
        }
        await login(email.trim(), password);
        notify('Đã đăng nhập. Chào mừng bạn trở lại.');
        if (router.canGoBack()) router.back(); else router.replace('/profile');
      } else if (mode === 'signup') {
        if (!email.trim() || password.length < 8 || name.trim().length < 2) {
          setError('Vui lòng nhập họ tên, email hợp lệ và mật khẩu ít nhất 8 ký tự.');
          return;
        }
        await register(name.trim(), email.trim(), password);
        notify('Chào mừng bạn đến với ShopFit.');
        if (router.canGoBack()) router.back(); else router.replace('/profile');
      } else if (mode === 'forgot') {
        if (!email.trim()) {
          setError('Vui lòng nhập email để nhận mã xác nhận OTP.');
          return;
        }
        const res = await forgotPassword(email.trim());
        notify(res.message || 'Mã xác thực OTP đã được gửi đến email của bạn.');
        setMode('reset');
      } else if (mode === 'reset') {
        if (!otp.trim() || newPassword.length < 8) {
          setError('Vui lòng nhập mã OTP và mật khẩu mới ít nhất 8 ký tự.');
          return;
        }
        const res = await resetPassword(email.trim(), otp.trim(), newPassword);
        notify(res.message || 'Đặt lại mật khẩu thành công!');
        setPassword('');
        setMode('login');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<AuthMode, { kicker: string; title: string; subtitle: string }> = {
    login: {
      kicker: 'YOUR STYLE STARTS HERE',
      title: 'Chào bạn,\nlại là mình đây.',
      subtitle: 'Đăng nhập để tiếp tục câu chuyện phong cách của bạn.',
    },
    signup: {
      kicker: 'JOIN SHOPFIT STUDIO',
      title: 'Một khởi đầu\nrất riêng.',
      subtitle: 'Tạo tài khoản để lưu những lần thử và tìm phong cách của bạn.',
    },
    forgot: {
      kicker: 'PASSWORD RECOVERY',
      title: 'Lấy lại\nmật khẩu.',
      subtitle: 'Nhập email của bạn để nhận mã OTP xác thực đặt lại mật khẩu.',
    },
    reset: {
      kicker: 'SET NEW PASSWORD',
      title: 'Tạo mật khẩu\nmới.',
      subtitle: `Nhập mã OTP vừa gửi đến ${email} và mật khẩu mới.`,
    },
  };

  const current = titles[mode];

  return (
    <Screen>
      <Header title="ShopFit Studio" back />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 440, alignSelf: 'center', paddingTop: 20 }}>
        <Text style={s.kicker}>{current.kicker}</Text>
        <Text style={[s.title, { fontSize: 44, lineHeight: 48, marginTop: 10 }]}>{current.title}</Text>
        <Text style={[s.muted, { marginTop: 14, marginBottom: 26 }]}>{current.subtitle}</Text>

        {mode === 'signup' && (
          <Field label="Họ và tên" value={name} onChangeText={setName} autoComplete="name" placeholder="Tên bạn muốn được gọi" />
        )}

        {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="ban@email.com"
          />
        )}

        {(mode === 'login' || mode === 'signup') && (
          <View>
            <Field
              label="Mật khẩu"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!visible}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="Ít nhất 8 ký tự"
              style={{ paddingRight: 52 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              onPress={() => setVisible(v => !v)}
              style={{ position: 'absolute', right: 4, top: 28, width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}
            >
              <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={21} color={t.colors.muted} />
            </Pressable>
          </View>
        )}

        {mode === 'login' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => { setMode('forgot'); setError(null); }}
            style={{ alignSelf: 'flex-end', marginBottom: 18, marginTop: -6 }}
          >
            <Text style={{ fontFamily: t.fonts.medium, color: t.colors.green, fontSize: 13 }}>Quên mật khẩu?</Text>
          </Pressable>
        )}

        {mode === 'reset' && (
          <>
            <Field
              label="Mã xác thực OTP (6 chữ số)"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="Ví dụ: 123456"
            />
            <View>
              <Field
                label="Mật khẩu mới"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!visible}
                autoComplete="new-password"
                placeholder="Mật khẩu mới ít nhất 8 ký tự"
                style={{ paddingRight: 52 }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                onPress={() => setVisible(v => !v)}
                style={{ position: 'absolute', right: 4, top: 28, width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}
              >
                <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={21} color={t.colors.muted} />
              </Pressable>
            </View>
          </>
        )}

        {mode === 'signup' && (
          <View style={{ marginBottom: 18, marginTop: 4 }}>
            <Text style={[s.muted, { fontSize: 12, lineHeight: 18 }]}>
              Bằng cách tạo tài khoản, bạn đồng ý với{' '}
              <Text
                onPress={() => void Linking.openURL(`${API_URL}/terms`)}
                style={{ color: t.colors.green, fontFamily: t.fonts.medium, textDecorationLine: 'underline' }}
              >
                Điều khoản dịch vụ
              </Text>{' '}
              và{' '}
              <Text
                onPress={() => void Linking.openURL(`${API_URL}/privacy`)}
                style={{ color: t.colors.green, fontFamily: t.fonts.medium, textDecorationLine: 'underline' }}
              >
                Chính sách quyền riêng tư
              </Text>{' '}
              của ShopFit.
            </Text>
          </View>
        )}

        <ErrorMessage message={error} />

        <Button loading={busy} onPress={() => void submit()} icon="arrow-forward">
          {mode === 'login' && 'Đăng nhập'}
          {mode === 'signup' && 'Tạo tài khoản'}
          {mode === 'forgot' && 'Gửi mã xác thực'}
          {mode === 'reset' && 'Xác nhận mật khẩu mới'}
        </Button>

        {mode === 'login' && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => { setMode('signup'); setError(null); }}
            style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', marginTop: 10 }}
          >
            <Text style={s.muted}>
              Lần đầu đến ShopFit?{' '}
              <Text style={{ fontFamily: t.fonts.bold, color: t.colors.green }}>Đăng ký</Text>
            </Text>
          </Pressable>
        )}

        {mode === 'signup' && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => { setMode('login'); setError(null); }}
            style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', marginTop: 10 }}
          >
            <Text style={s.muted}>
              Đã có tài khoản?{' '}
              <Text style={{ fontFamily: t.fonts.bold, color: t.colors.green }}>Đăng nhập</Text>
            </Text>
          </Pressable>
        )}

        {(mode === 'forgot' || mode === 'reset') && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => { setMode('login'); setError(null); }}
            style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', marginTop: 10 }}
          >
            <Text style={{ fontFamily: t.fonts.medium, color: t.colors.green }}>Quay lại đăng nhập</Text>
          </Pressable>
        )}

        {health?.demo_accounts && (mode === 'login' || mode === 'signup') && (
          <View style={{ marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: t.colors.line }}>
            <Text style={[s.kicker, { textAlign: 'center', marginBottom: 12 }]}>TÀI KHOẢN TRẢI NGHIỆM</Text>
            <View style={s.row}>
              <Button variant="secondary" disabled={busy} onPress={() => void submit('customer')} style={{ flex: 1 }}>
                Khách hàng
              </Button>
              <Button variant="outline" disabled={busy} onPress={() => void submit('admin')} style={{ flex: 1 }}>
                Chủ shop
              </Button>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
