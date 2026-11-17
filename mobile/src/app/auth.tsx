import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Pressable, Text, View } from 'react-native';
import { API_URL } from '../api';
import { Button, ErrorMessage, Field, Header, Screen, s } from '../components/ui';
import { useStore } from '../store';
import { theme as t } from '../theme';

type AuthMode = 'login' | 'signup' | 'forgot' | 'otp' | 'reset';

export default function Auth() {
  const { login, register, forgotPassword, verifyOtp, resetPassword, notify } = useStore();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [visible, setVisible] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Resend OTP 60s countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Android hardware Back steps back cleanly inside multi-step recovery flow
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (mode === 'reset') {
        setMode('otp');
        setError(null);
        return true;
      }
      if (mode === 'otp') {
        setMode('forgot');
        setError(null);
        return true;
      }
      if (mode === 'forgot' || mode === 'signup') {
        setMode('login');
        setError(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [mode]);

  async function handleVerifyOtpCode(codeToVerify?: string) {
    const code = (codeToVerify ?? otp).trim();
    if (code.length < 6) {
      setError('Vui lòng nhập đủ 6 chữ số mã OTP.');
      return;
    }
    setError(null);
    setVerifyingOtp(true);
    try {
      await verifyOtp(email.trim(), code);
      notify('Mã OTP chính xác! Vui lòng đặt mật khẩu mới.');
      setMode('reset');
    } catch (e) {
      setError((e as Error).message || 'Mã OTP không chính xác. Vui lòng kiểm tra lại.');
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function handleResendOtp() {
    if (!email.trim() || cooldown > 0) return;
    setError(null);
    setBusy(true);
    try {
      const res = await forgotPassword(email.trim());
      notify(res.message || 'Mã OTP mới đã được gửi đến email của bạn.');
      setOtp('');
      setCooldown(60);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError(null);

    if (mode === 'signup' && !acceptedTerms) {
      setError('Vui lòng tích chọn đồng ý với Điều khoản dịch vụ và Chính sách quyền riêng tư để tạo tài khoản.');
      return;
    }

    if (mode === 'login') {
      if (!email.trim() || !password) {
        setError('Vui lòng nhập tài khoản/email và mật khẩu.');
        return;
      }
      setBusy(true);
      try {
        await login(email.trim(), password);
        notify('Đã đăng nhập. Chào mừng bạn trở lại.');
        if (router.canGoBack()) router.back();
        else router.replace('/profile');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    } else if (mode === 'signup') {
      if (!email.trim() || password.length < 6 || name.trim().length < 2) {
        setError('Vui lòng nhập họ tên, email hợp lệ và mật khẩu ít nhất 6 ký tự.');
        return;
      }
      setBusy(true);
      try {
        await register(name.trim(), email.trim(), password);
        notify('Chào mừng bạn đến với ShopFit.');
        if (router.canGoBack()) router.back();
        else router.replace('/profile');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    } else if (mode === 'forgot') {
      if (!email.trim()) {
        setError('Vui lòng nhập email để nhận mã xác nhận OTP.');
        return;
      }
      setBusy(true);
      try {
        const res = await forgotPassword(email.trim());
        notify(res.message || 'Mã xác thực OTP đã được gửi đến email của bạn.');
        setOtp('');
        setCooldown(60);
        setMode('otp');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    } else if (mode === 'otp') {
      await handleVerifyOtpCode();
    } else if (mode === 'reset') {
      if (newPassword.length < 6) {
        setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Mật khẩu xác nhận không trùng khớp.');
        return;
      }
      setBusy(true);
      try {
        const res = await resetPassword(email.trim(), otp.trim(), newPassword);
        notify(res.message || 'Đặt lại mật khẩu thành công!');
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setOtp('');
        setMode('login');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
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
    otp: {
      kicker: 'VERIFICATION CODE',
      title: 'Xác thực\nmã OTP.',
      subtitle: `Nhập mã 6 chữ số vừa gửi đến ${email}.`,
    },
    reset: {
      kicker: 'SET NEW PASSWORD',
      title: 'Tạo mật khẩu\nmới.',
      subtitle: `Mã OTP hợp lệ. Vui lòng tạo mật khẩu mới cho ${email}.`,
    },
  };

  const current = titles[mode];

  return (
    <Screen>
      <Header title="ShopFit Studio" back />
      <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', paddingTop: 20 }}>
        <Text style={s.kicker}>{current.kicker}</Text>
        <Text style={[s.title, { fontSize: 44, lineHeight: 48, marginTop: 10 }]}>{current.title}</Text>
        <Text style={[s.muted, { marginTop: 14, marginBottom: 26 }]}>{current.subtitle}</Text>

        {mode === 'signup' && (
          <Field label="Họ và tên" value={name} onChangeText={setName} autoComplete="name" placeholder="Tên bạn muốn được gọi" />
        )}

        {mode === 'login' && (
          <Field
            label="Email hoặc tên tài khoản"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            placeholder="ban@email.com hoặc chushop"
          />
        )}

        {(mode === 'signup' || mode === 'forgot') && (
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
              placeholder="Nhập mật khẩu"
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
            onPress={() => {
              setMode('forgot');
              setError(null);
            }}
            style={{ alignSelf: 'flex-end', marginBottom: 14, marginTop: -4 }}
          >
            <Text style={{ fontFamily: t.fonts.medium, color: t.colors.green, fontSize: 13 }}>Quên mật khẩu?</Text>
          </Pressable>
        )}

        {/* Mandatory Checkbox for Signup; clean passive links on Login */}
        {mode === 'signup' && (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Đồng ý điều khoản dịch vụ và chính sách quyền riêng tư"
            accessibilityState={{ checked: acceptedTerms }}
            onPress={() => setAcceptedTerms(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: acceptedTerms ? t.colors.green : t.colors.muted,
                backgroundColor: acceptedTerms ? t.colors.green : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {acceptedTerms && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </View>
            <Text style={[s.muted, { flex: 1, fontSize: 13, lineHeight: 19 }]}>
              Tôi đồng ý với{' '}
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
          </Pressable>
        )}

        {mode === 'login' && (
          <Text style={[s.muted, { fontSize: 12, lineHeight: 18, marginBottom: 14 }]}>
            Khi đăng nhập, bạn đồng ý với{' '}
            <Text onPress={() => void Linking.openURL(`${API_URL}/terms`)} style={{ color: t.colors.green, textDecorationLine: 'underline' }}>
              Điều khoản dịch vụ
            </Text>{' '}
            &{' '}
            <Text onPress={() => void Linking.openURL(`${API_URL}/privacy`)} style={{ color: t.colors.green, textDecorationLine: 'underline' }}>
              Chính sách quyền riêng tư
            </Text>
            .
          </Text>
        )}

        {/* STEP 2: ENTER OTP & AUTO-VERIFY */}
        {mode === 'otp' && (
          <View style={{ gap: 10 }}>
            <Field
              label="Mã xác thực OTP (6 chữ số)"
              value={otp}
              onChangeText={text => {
                const clean = text.replace(/[^0-9]/g, '');
                setOtp(clean);
                if (clean.length === 6) {
                  void handleVerifyOtpCode(clean);
                }
              }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="Nhập mã 6 chữ số (ví dụ: 390610)"
            />
            {verifyingOtp && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <ActivityIndicator size="small" color={t.colors.green} />
                <Text style={{ fontSize: 12, color: t.colors.green, fontFamily: t.fonts.medium }}>Đang kiểm tra mã OTP...</Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={busy || cooldown > 0}
              onPress={() => void handleResendOtp()}
              style={{ alignSelf: 'flex-start', marginBottom: 12, opacity: cooldown > 0 ? 0.55 : 1 }}
            >
              <Text style={{ fontSize: 13, color: t.colors.green, fontFamily: t.fonts.medium }}>
                {cooldown > 0 ? `Gửi lại mã OTP sau ${cooldown}s` : 'Chưa nhận được mã? Gửi lại OTP'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* STEP 3: ENTER NEW PASSWORD */}
        {mode === 'reset' && (
          <View style={{ gap: 4 }}>
            <View>
              <Field
                label="Mật khẩu mới"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!visible}
                autoComplete="new-password"
                placeholder="Ít nhất 6 ký tự"
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

            <View>
              <Field
                label="Xác nhận mật khẩu mới"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!visible}
                placeholder="Nhập lại mật khẩu mới"
                style={{ paddingRight: 52 }}
              />
            </View>
          </View>
        )}

        <ErrorMessage message={error} />

        <Button loading={busy || verifyingOtp} onPress={() => void submit()} icon="arrow-forward">
          {mode === 'login' && 'Đăng nhập'}
          {mode === 'signup' && 'Tạo tài khoản'}
          {mode === 'forgot' && 'Gửi mã xác thực'}
          {mode === 'otp' && 'Xác nhận mã OTP'}
          {mode === 'reset' && 'Lưu mật khẩu mới'}
        </Button>

        {mode === 'login' && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setMode('signup');
              setError(null);
            }}
            style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', marginTop: 10 }}
          >
            <Text style={s.muted}>
              Lần đầu đến ShopFit? <Text style={{ fontFamily: t.fonts.bold, color: t.colors.green }}>Đăng ký</Text>
            </Text>
          </Pressable>
        )}

        {mode === 'signup' && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setMode('login');
              setError(null);
            }}
            style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', marginTop: 10 }}
          >
            <Text style={s.muted}>
              Đã có tài khoản? <Text style={{ fontFamily: t.fonts.bold, color: t.colors.green }}>Đăng nhập</Text>
            </Text>
          </Pressable>
        )}

        {(mode === 'forgot' || mode === 'otp' || mode === 'reset') && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setMode('login');
              setError(null);
            }}
            style={{ minHeight: 50, justifyContent: 'center', alignItems: 'center', marginTop: 10 }}
          >
            <Text style={{ fontFamily: t.fonts.medium, color: t.colors.green }}>Quay lại đăng nhập</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}
