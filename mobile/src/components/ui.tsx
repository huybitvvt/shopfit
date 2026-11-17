import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaUrl } from '../api';
import { useStore } from '../store';
import { money, theme as t } from '../theme';
import type { Product } from '../types';

export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: t.colors.background },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 40 },
  text: { color: t.colors.ink, fontFamily: t.fonts.regular, fontSize: 14, lineHeight: 22 },
  muted: { color: t.colors.muted, fontFamily: t.fonts.regular, fontSize: 13, lineHeight: 21 },
  title: { color: t.colors.ink, fontFamily: t.fonts.serif, fontSize: 40, lineHeight: 46 },
  kicker: { color: t.colors.green, fontFamily: t.fonts.bold, fontSize: 10, letterSpacing: 2.2, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  divider: { height: 1, backgroundColor: t.colors.line, marginVertical: 24 },
  card: { backgroundColor: t.colors.paper, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: t.colors.line },
  error: {
    color: t.colors.error,
    backgroundColor: t.colors.errorLight,
    padding: 14,
    borderRadius: 10,
    fontFamily: t.fonts.regular,
    lineHeight: 21,
    fontSize: 13,
  },
  label: { fontFamily: t.fonts.medium, fontSize: 13, color: t.colors.ink, marginBottom: 9 },
});

export function ToastOverlay() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', bottom: 92, left: 24, right: 24, alignItems: 'center', zIndex: 9999, elevation: 99 }}
    >
      <View
        style={{
          backgroundColor: t.colors.ink,
          paddingHorizontal: 22,
          paddingVertical: 14,
          borderRadius: 12,
          maxWidth: 500,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 10,
          elevation: 8,
        }}
      >
        <Text accessibilityLiveRegion="polite" style={{ color: 'white', fontFamily: t.fonts.medium, fontSize: 13, lineHeight: 20 }}>
          {toast}
        </Text>
      </View>
    </View>
  );
}

export function Screen({
  children,
  scroll = true,
  style,
  scrollRef,
  onRefresh,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  scrollRef?: React.RefObject<ScrollView | null>;
  onRefresh?: () => Promise<void> | void;
}) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  const contentPaddingBottom = 40 + Math.max(0, insets.bottom);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={s.page}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            refreshControl={
              onRefresh && Platform.OS !== 'web' ? (
                <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={t.colors.green} colors={[t.colors.green]} />
              ) : undefined
            }
            contentContainerStyle={[s.content, { paddingBottom: contentPaddingBottom }, style]}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[s.content, { flex: 1, paddingBottom: contentPaddingBottom }, style]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function IconButton({
  name,
  label,
  onPress,
  active = false,
  style,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        {
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 24,
          backgroundColor: active ? t.colors.greenLight : 'transparent',
          opacity: pressed ? 0.55 : 1,
        },
        style,
      ]}
    >
      <Ionicons accessible={false} aria-hidden name={name} size={23} color={t.colors.ink} />
    </Pressable>
  );
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const primary = variant === 'primary';
  const color = primary ? '#FFFFFF' : t.colors.green;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 52,
          paddingHorizontal: 22,
          paddingVertical: 14,
          borderRadius: 9,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          backgroundColor: primary ? t.colors.green : variant === 'secondary' ? t.colors.greenLight : 'transparent',
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: t.colors.line,
          opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : icon ? (
        <Ionicons accessible={false} aria-hidden name={icon} size={18} color={color} />
      ) : null}
      <Text style={{ fontFamily: t.fonts.medium, fontSize: 13, color, textAlign: 'center', flexShrink: 1 }}>{children}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.colors.muted}
        {...props}
        style={[
          {
            backgroundColor: t.colors.paper,
            borderWidth: 1,
            borderColor: t.colors.line,
            borderRadius: 9,
            minHeight: 52,
            paddingHorizontal: 15,
            paddingVertical: 13,
            color: t.colors.ink,
            fontFamily: t.fonts.regular,
            fontSize: 14,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function Header({
  title,
  subtitle,
  back = false,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <View style={[s.between, { paddingTop: 18, paddingBottom: 24 }]}>
      <View style={[s.row, { flex: 1 }]}>
        {back && (
          <IconButton
            name="arrow-back"
            label="Quay lại"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={{ marginLeft: -12 }}
          />
        )}
        <View style={{ flex: 1 }}>
          {subtitle && <Text style={[s.kicker, { marginBottom: 5 }]}>{subtitle}</Text>}
          <Text style={[s.title, { fontSize: 32, lineHeight: 39 }]}>{title}</Text>
        </View>
      </View>
      {right}
    </View>
  );
}

export function CartButton() {
  const { cart } = useStore();
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <View>
      <IconButton name="bag-outline" label={`Giỏ hàng, ${count} sản phẩm`} onPress={() => router.push('/cart')} />
      {count > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 3,
            right: 2,
            borderRadius: 10,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.colors.green,
          }}
        >
          <Text style={{ color: 'white', fontSize: 10, fontFamily: t.fonts.bold }}>{count}</Text>
        </View>
      )}
    </View>
  );
}

export function Empty({
  icon = 'shirt-outline',
  title,
  description,
  action,
  onPress,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={{ paddingVertical: 52, alignItems: 'center', gap: 15, maxWidth: 420, alignSelf: 'center' }}>
      <View style={{ width: 80, height: 80, backgroundColor: t.colors.greenLight, borderRadius: 40, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={30} color={t.colors.green} />
      </View>
      <Text style={[s.title, { fontSize: 30, textAlign: 'center' }]}>{title}</Text>
      <Text style={[s.muted, { textAlign: 'center', marginBottom: 8 }]}>{description}</Text>
      {action && onPress && <Button onPress={onPress}>{action}</Button>}
    </View>
  );
}

export function ProductCard({ product, width }: { product: Product; width: number | `${number}%` }) {
  const { favorites, toggleFavorite } = useStore();
  const favorite = favorites.includes(product.id);
  const soldOut = product.stock <= 0;
  return (
    <View style={{ width, marginBottom: 24 }}>
      <View style={{ position: 'relative' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Xem ${product.name}`}
          onPress={() => router.push(`/product/${product.id}`)}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <Image
            source={mediaUrl(product.image_url)}
            contentFit="cover"
            transition={180}
            style={{ aspectRatio: 0.77, width: '100%', borderRadius: 12, backgroundColor: t.colors.sand, opacity: soldOut ? 0.75 : 1 }}
            accessibilityLabel={product.name}
          />
        </Pressable>
        {soldOut ? (
          <View
            style={{
              position: 'absolute',
              top: 12,
              left: 10,
              backgroundColor: '#1C2421E6',
              paddingVertical: 5,
              paddingHorizontal: 9,
              borderRadius: 4,
            }}
          >
            <Text style={{ fontFamily: t.fonts.bold, fontSize: 9, letterSpacing: 1.1, color: '#FFFFFF' }}>HẾT HÀNG</Text>
          </View>
        ) : product.tag ? (
          <View
            style={{
              position: 'absolute',
              top: 12,
              left: 10,
              backgroundColor: '#FFFFFFED',
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 4,
              maxWidth: '70%',
            }}
          >
            <Text style={{ fontFamily: t.fonts.bold, fontSize: 9, letterSpacing: 1.2, color: t.colors.green }}>{product.tag}</Text>
          </View>
        ) : null}
        <IconButton
          name={favorite ? 'heart' : 'heart-outline'}
          active={favorite}
          label={favorite ? `Bỏ yêu thích ${product.name}` : `Yêu thích ${product.name}`}
          onPress={() => toggleFavorite(product.id)}
          style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: '#FFFFFFEF', width: 40, height: 40 }}
        />
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push(`/product/${product.id}`)} style={{ paddingTop: 13, gap: 5 }}>
        <Text style={{ fontFamily: t.fonts.regular, color: t.colors.muted, fontSize: 10, letterSpacing: 0.5 }}>{product.material}</Text>
        <Text numberOfLines={2} style={{ fontFamily: t.fonts.medium, fontSize: 14, color: t.colors.ink, lineHeight: 20 }}>
          {product.name}
        </Text>
        <View style={[s.row, { gap: 7, flexWrap: 'wrap' }]}>
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.green }}>{money(product.price)}</Text>
          {product.original_price && (
            <Text style={{ fontFamily: t.fonts.regular, fontSize: 11, color: t.colors.muted, textDecorationLine: 'line-through' }}>
              {money(product.original_price)}
            </Text>
          )}
        </View>
        <View style={[s.row, { gap: 5, marginTop: 3 }]}>
          {product.colors.map(c => (
            <View
              key={c.name}
              accessibilityLabel={c.name}
              style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.hex, borderWidth: 1, borderColor: '#00000015' }}
            />
          ))}
        </View>
      </Pressable>
    </View>
  );
}

export function SectionHeading({
  title,
  caption,
  action,
  onPress,
}: {
  title: string;
  caption?: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={[s.between, { marginTop: 32, marginBottom: 22 }]}>
      <View style={{ flex: 1 }}>
        {caption && <Text style={[s.kicker, { marginBottom: 5 }]}>{caption}</Text>}
        <Text style={[s.title, { fontSize: 32, lineHeight: 38 }]}>{title}</Text>
      </View>
      {action && (
        <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 48, justifyContent: 'center' }}>
          <Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: t.colors.green }}>
            {action} <Ionicons name="arrow-forward" size={13} />
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <Text accessibilityRole="alert" style={[s.error, { marginBottom: 16 }]}>
      {message}
    </Text>
  ) : null;
}
