import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaUrl } from '../api';
import { tapLight } from '../haptics';
import { theme as t } from '../theme';

export type LightboxImage = {
  url: string;
  label?: string;
};

export function ImageLightbox({
  visible,
  images,
  initialIndex = 0,
  onClose,
}: {
  visible: boolean;
  images: LightboxImage[];
  initialIndex?: number;
  onClose: () => void;
}) {
  if (!visible || images.length === 0) return null;
  const safeStart = initialIndex >= 0 && initialIndex < images.length ? initialIndex : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <LightboxContent key={`${safeStart}-${images.length}`} images={images} initialIndex={safeStart} onClose={onClose} />
    </Modal>
  );
}

function LightboxContent({
  images,
  initialIndex,
  onClose,
}: {
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);

  const current = images[index] || images[0];
  const fullUrl = mediaUrl(current.url);
  const stageHeight = Math.max(280, height - insets.top - insets.bottom - (images.length > 1 ? 185 : 110));

  function goTo(next: number) {
    tapLight();
    setZoomed(false);
    setIndex((next + images.length) % images.length);
  }

  function toggleZoom() {
    tapLight();
    setZoomed(z => !z);
  }

  async function shareImage() {
    tapLight();
    if (Platform.OS === 'web') {
      await Linking.openURL(fullUrl);
      return;
    }
    try {
      await Share.share({
        message: `${current.label ? `${current.label} — ` : ''}ShopFit Studio: ${fullUrl}`,
        url: fullUrl,
      });
    } catch {
      // dismissed
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'rgba(14, 18, 16, 0.96)',
        paddingTop: Math.max(insets.top, 14),
        paddingBottom: Math.max(insets.bottom, 16),
        justifyContent: 'space-between',
      }}
    >
      {/* Top Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 8,
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#FFFFFF', fontFamily: t.fonts.bold, fontSize: 14 }} numberOfLines={1}>
            {current.label || 'Xem chi tiết ảnh'}
          </Text>
          <Text style={{ color: '#A9B4AE', fontFamily: t.fonts.regular, fontSize: 11, marginTop: 2 }}>
            {index + 1} / {images.length} · {zoomed ? 'Đang phóng đại 2x (kéo để soi chi tiết)' : 'Chạm vào ảnh để phóng đại 2x'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={zoomed ? 'Thu nhỏ ảnh về 1x' : 'Phóng đại ảnh 2x'}
            onPress={toggleZoom}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 12,
              height: 40,
              borderRadius: 20,
              backgroundColor: zoomed ? t.colors.green : 'rgba(255,255,255,0.12)',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Ionicons name={zoomed ? 'contract-outline' : 'search-outline'} size={16} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontFamily: t.fonts.bold, fontSize: 12 }}>{zoomed ? '1x' : '2x'}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chia sẻ hoặc mở ảnh gốc"
            onPress={() => void shareImage()}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.12)',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Ionicons name="share-outline" size={18} color="#FFFFFF" />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng trình xem ảnh"
            onPress={onClose}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.18)',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* Main Image Stage */}
      <View style={{ height: stageHeight, width: '100%', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        {zoomed ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={true}
            contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }}
          >
            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ alignItems: 'center', justifyContent: 'center' }}
            >
              <Pressable accessibilityRole="button" accessibilityLabel="Thu nhỏ ảnh" onPress={toggleZoom}>
                <Image
                  source={fullUrl}
                  contentFit="contain"
                  style={{ width: width * 1.9, height: stageHeight * 1.9 }}
                />
              </Pressable>
            </ScrollView>
          </ScrollView>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chạm để phóng đại 2x"
            onPress={toggleZoom}
            style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}
          >
            <Image source={fullUrl} contentFit="contain" style={{ width: '100%', height: '100%' }} />
          </Pressable>
        )}

        {images.length > 1 && !zoomed && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ảnh trước"
              onPress={() => goTo(index - 1)}
              style={({ pressed }) => ({
                position: 'absolute',
                left: 12,
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: 'rgba(0,0,0,0.52)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ảnh tiếp theo"
              onPress={() => goTo(index + 1)}
              style={({ pressed }) => ({
                position: 'absolute',
                right: 12,
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: 'rgba(0,0,0,0.52)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
            </Pressable>
          </>
        )}
      </View>

      {/* Bottom Thumbnail Strip */}
      {images.length > 1 ? (
        <View style={{ paddingTop: 8 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10, justifyContent: 'center', flexGrow: 1 }}
          >
            {images.map((img, idx) => {
              const active = idx === index;
              return (
                <Pressable
                  key={`${img.url}-${idx}`}
                  accessibilityRole="button"
                  accessibilityLabel={img.label || `Ảnh ${idx + 1}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => goTo(idx)}
                  style={{
                    alignItems: 'center',
                    padding: 3,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: active ? '#6FCF97' : 'rgba(255,255,255,0.18)',
                    backgroundColor: active ? 'rgba(52, 78, 64, 0.55)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <Image
                    source={mediaUrl(img.url)}
                    contentFit="cover"
                    style={{ width: 46, height: 56, borderRadius: 6, backgroundColor: '#1E2421' }}
                  />
                  {img.label ? (
                    <Text
                      numberOfLines={1}
                      style={{
                        color: active ? '#FFFFFF' : '#A9B4AE',
                        fontFamily: active ? t.fonts.bold : t.fonts.regular,
                        fontSize: 10,
                        marginTop: 3,
                        maxWidth: 64,
                      }}
                    >
                      {img.label}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View style={{ height: 8 }} />
      )}
    </View>
  );
}
