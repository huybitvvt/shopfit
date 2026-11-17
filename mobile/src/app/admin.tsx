import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { mediaUrl, photoForm, request } from '../api';
import { AdminDashboard, type AdminSummary } from '../components/admin-dashboard';
import { Button, Empty, ErrorMessage, Field, Header, IconButton, Screen, ToastOverlay, s } from '../components/ui';
import { useStore } from '../store';
import { money, normalizeVi, theme as t } from '../theme';
import type { AdminPayment, Color, PickedPhoto, Product, TryonAnalytics } from '../types';

interface CategoryOption {
  name: string;
  tryon_category: 'tops' | 'bottoms' | 'one-pieces';
}

const DEFAULT_CATEGORIES: CategoryOption[] = [
  { name: 'Áo', tryon_category: 'tops' },
  { name: 'Quần', tryon_category: 'bottoms' },
  { name: 'Váy', tryon_category: 'one-pieces' },
  { name: 'Áo khoác', tryon_category: 'tops' },
  { name: 'Sơ mi', tryon_category: 'tops' },
  { name: 'Chân váy', tryon_category: 'bottoms' },
  { name: 'Đầm liền', tryon_category: 'one-pieces' },
  { name: 'Set bộ', tryon_category: 'one-pieces' },
];

const POPULAR_COLORS: Color[] = [
  { name: 'Trắng', hex: '#FFFFFF' },
  { name: 'Đen', hex: '#1C2421' },
  { name: 'Xám ghi', hex: '#9CA3AF' },
  { name: 'Be sữa', hex: '#EEECE5' },
  { name: 'Nâu bò', hex: '#854D0E' },
  { name: 'Xanh Navy', hex: '#1E3A8A' },
  { name: 'Xanh rêu', hex: '#344E40' },
  { name: 'Đỏ đô', hex: '#991B1B' },
  { name: 'Vàng pastel', hex: '#F59E0B' },
  { name: 'Hồng phấn', hex: '#F472B6' },
  { name: 'Xanh dương nhạt', hex: '#93C5FD' },
];

const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];
const CUSTOM_CAT_STORAGE_KEY = 'shopfit-custom-categories';

export default function Admin() {
  const { user, refresh, notify } = useStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [analytics, setAnalytics] = useState<TryonAnalytics | null>(null);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'HIDDEN' | 'LOW_STOCK'>('ALL');

  // Form State (shared between Create & Full Edit)
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [category, setCategory] = useState('Áo');
  const [customCategories, setCustomCategories] = useState<CategoryOption[]>([]);
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatTryon, setNewCatTryon] = useState<'tops' | 'bottoms' | 'one-pieces'>('tops');

  const [description, setDescription] = useState('');
  const [material, setMaterial] = useState('Cotton');

  // Multi-Color palette selection
  const [selectedColors, setSelectedColors] = useState<Color[]>([{ name: 'Trắng', hex: '#FFFFFF' }]);
  const [customColorName, setCustomColorName] = useState('');
  const [customColorHex, setCustomColorHex] = useState('#344E40');
  const [showCustomColor, setShowCustomColor] = useState(false);

  // Sizes & Per-(size, color) stock matrix
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['S', 'M', 'L', 'XL']);
  const [stockMatrix, setStockMatrix] = useState<Record<string, string>>({});
  const [batchStock, setBatchStock] = useState('');

  // Photos (new picked photos + existing URLs when editing)
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [backPhoto, setBackPhoto] = useState<PickedPhoto | null>(null);
  const [detailPhoto, setDetailPhoto] = useState<PickedPhoto | null>(null);
  const [existingBackUrl, setExistingBackUrl] = useState<string | null>(null);
  const [existingDetailUrl, setExistingDetailUrl] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const wide = useWindowDimensions().width >= 750;

  useEffect(() => {
    void AsyncStorage.getItem(CUSTOM_CAT_STORAGE_KEY).then(raw => {
      if (!raw) return;
      try {
        setCustomCategories(JSON.parse(raw));
      } catch {
        // ignore
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (user?.role !== 'admin') {
      setLoading(false);
      return;
    }
    try {
      const [p, stats, ana, payList] = await Promise.all([
        request<Product[]>('/api/admin/products'),
        request<AdminSummary>('/api/admin/summary'),
        request<TryonAnalytics>('/api/admin/tryon-analytics').catch(() => null),
        request<AdminPayment[]>('/api/admin/payments').catch(() => []),
      ]);
      setProducts(p);
      setSummary(stats);
      if (ana) setAnalytics(ana);
      setPayments(payList);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleApprovePayment(id: string) {
    setPaymentBusyId(id);
    try {
      await request(`/api/admin/payments/${id}/approve`, { method: 'POST' });
      await load();
      notify('Đã duyệt giao dịch & cộng lượt thử cho khách hàng.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPaymentBusyId(null);
    }
  }

  async function handleRejectPayment(id: string) {
    setPaymentBusyId(id);
    try {
      await request(`/api/admin/payments/${id}/reject`, { method: 'POST' });
      await load();
      notify('Đã từ chối giao dịch.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPaymentBusyId(null);
    }
  }

  const allCategories = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const c of DEFAULT_CATEGORIES) map.set(c.name, c);
    for (const c of customCategories) map.set(c.name, c);
    for (const p of products) {
      if (p.category && !map.has(p.category)) {
        map.set(p.category, { name: p.category, tryon_category: p.tryon_category });
      }
    }
    return Array.from(map.values());
  }, [customCategories, products]);

  const filteredProducts = useMemo(() => {
    const q = normalizeVi(searchQuery);
    return products.filter(p => {
      if (q) {
        const hay = normalizeVi(`${p.name} ${p.category} ${p.material}`);
        if (!hay.includes(q)) return false;
      }
      if (filterCategory !== 'ALL' && p.category !== filterCategory) return false;
      if (filterStatus === 'ACTIVE' && !p.active) return false;
      if (filterStatus === 'HIDDEN' && p.active) return false;
      if (filterStatus === 'LOW_STOCK' && !p.variants.some(v => v.stock <= 3)) return false;
      return true;
    });
  }, [products, searchQuery, filterCategory, filterStatus]);

  function openForm(product?: Product) {
    setEditing(product || null);
    setName(product?.name || '');
    setPrice(product ? String(product.price) : '');
    setOriginalPrice(product?.original_price ? String(product.original_price) : '');
    setCategory(product?.category || 'Áo');
    setDescription(product?.description || '');
    setMaterial(product?.material || 'Cotton');

    const initColors = product?.colors.length ? product.colors.map(c => ({ ...c })) : [{ name: 'Trắng', hex: '#FFFFFF' }];
    const initSizes = product?.sizes.length ? [...product.sizes] : ['S', 'M', 'L', 'XL'];
    setSelectedColors(initColors);
    setSelectedSizes(initSizes);

    const matrix: Record<string, string> = {};
    if (product) {
      for (const v of product.variants) {
        matrix[`${v.color}:${v.size}`] = String(v.stock);
      }
    } else {
      const defaults: Record<string, string> = { S: '15', M: '30', L: '25', XL: '10' };
      for (const c of initColors) {
        for (const sz of initSizes) {
          matrix[`${c.name}:${sz}`] = defaults[sz] || '15';
        }
      }
    }
    setStockMatrix(matrix);
    setBatchStock('');
    setPhoto(null);
    setBackPhoto(null);
    setDetailPhoto(null);
    setExistingBackUrl(product?.back_image_url || product?.size_chart?.back_image_url || null);
    setExistingDetailUrl(product?.detail_image_url || product?.size_chart?.detail_image_url || null);
    setShowCustomColor(false);
    setCustomColorName('');
    setFormError(null);
    setShowForm(true);
  }

  async function pick(target: 'front' | 'back' | 'detail' = 'front') {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (!result.canceled && result.assets[0]) {
        if (target === 'front') setPhoto(result.assets[0]);
        else if (target === 'back') setBackPhoto(result.assets[0]);
        else if (target === 'detail') setDetailPhoto(result.assets[0]);
      }
    } catch {
      setFormError('Không mở được thư viện ảnh.');
    }
  }

  function toggleColorSwatch(swatch: Color) {
    const exists = selectedColors.some(c => c.name === swatch.name);
    if (exists) {
      if (selectedColors.length <= 1) {
        setFormError('Sản phẩm cần có ít nhất 1 màu.');
        return;
      }
      setSelectedColors(prev => prev.filter(c => c.name !== swatch.name));
    } else {
      setSelectedColors(prev => [...prev, swatch]);
      setStockMatrix(prev => {
        const next = { ...prev };
        for (const sz of selectedSizes) {
          const key = `${swatch.name}:${sz}`;
          if (next[key] === undefined) next[key] = '15';
        }
        return next;
      });
    }
  }

  function addCustomColor() {
    const cname = customColorName.trim();
    const chex = customColorHex.trim();
    if (!cname || !/^#[0-9A-Fa-f]{6}$/.test(chex)) {
      setFormError('Nhập tên màu và mã HEX hợp lệ (ví dụ #344E40).');
      return;
    }
    if (selectedColors.some(c => c.name.toLowerCase() === cname.toLowerCase())) {
      setFormError('Màu này đã có trong danh sách đã chọn.');
      return;
    }
    toggleColorSwatch({ name: cname, hex: chex });
    setCustomColorName('');
    setShowCustomColor(false);
    setFormError(null);
  }

  function toggleSize(sz: string) {
    if (selectedSizes.includes(sz)) {
      if (selectedSizes.length <= 1) {
        setFormError('Sản phẩm cần có ít nhất 1 size.');
        return;
      }
      setSelectedSizes(prev => prev.filter(s => s !== sz));
    } else {
      setSelectedSizes(prev => [...prev, sz]);
      setStockMatrix(prev => {
        const next = { ...prev };
        for (const c of selectedColors) {
          const key = `${c.name}:${sz}`;
          if (next[key] === undefined) next[key] = '15';
        }
        return next;
      });
    }
  }

  function applyBatchStock() {
    if (!batchStock.trim()) return;
    const num = batchStock.replace(/\D/g, '') || '0';
    const updated: Record<string, string> = {};
    for (const c of selectedColors) {
      for (const sz of selectedSizes) {
        updated[`${c.name}:${sz}`] = num;
      }
    }
    setStockMatrix(prev => ({ ...prev, ...updated }));
    notify(`Đã điền ${num} cái cho tất cả biến thể màu/size.`);
  }

  async function handleCreateCategory() {
    const trimmed = newCatName.trim();
    if (trimmed.length < 2) {
      setFormError('Tên danh mục cần ít nhất 2 ký tự.');
      return;
    }
    const exists = allCategories.some(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      const updated = [...customCategories, { name: trimmed, tryon_category: newCatTryon }];
      setCustomCategories(updated);
      await AsyncStorage.setItem(CUSTOM_CAT_STORAGE_KEY, JSON.stringify(updated));
    }
    setCategory(trimmed);
    setShowAddCatModal(false);
    setNewCatName('');
    notify(`Đã lưu & chọn danh mục "${trimmed}".`);
  }

  async function save() {
    if (name.trim().length < 2 || !Number.isInteger(Number(price)) || Number(price) <= 0) {
      setFormError('Nhập tên sản phẩm và giá bán nguyên dương hợp lệ.');
      return;
    }
    if (description.trim().length < 10) {
      setFormError('Nhập mô tả sản phẩm ít nhất 10 ký tự.');
      return;
    }
    if (selectedColors.length === 0 || selectedSizes.length === 0) {
      setFormError('Chọn ít nhất 1 màu sắc và 1 size.');
      return;
    }
    if (!editing && !photo) {
      setFormError('Vui lòng chọn ảnh chính diện cho thiết kế mới.');
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      // Upload any newly picked photos in parallel
      const [mainUp, backUp, detailUp] = await Promise.all([
        photo ? photoForm(photo, 'file').then(f => request<{ url: string }>('/api/admin/upload', { method: 'POST', body: f })) : Promise.resolve(null),
        backPhoto
          ? photoForm(backPhoto, 'file').then(f => request<{ url: string }>('/api/admin/upload', { method: 'POST', body: f }))
          : Promise.resolve(null),
        detailPhoto
          ? photoForm(detailPhoto, 'file').then(f => request<{ url: string }>('/api/admin/upload', { method: 'POST', body: f }))
          : Promise.resolve(null),
      ]);

      const matchedCat = allCategories.find(c => c.name === category);
      const tryon_cat =
        matchedCat?.tryon_category ||
        (category.toLowerCase().includes('quần')
          ? 'bottoms'
          : category.toLowerCase().includes('váy') || category.toLowerCase().includes('đầm')
          ? 'one-pieces'
          : 'tops');

      const variantList = selectedColors.flatMap(c =>
        selectedSizes.map(sz => ({
          size: sz,
          color: c.name,
          stock: Math.max(0, Math.min(10000, Number(stockMatrix[`${c.name}:${sz}`]) || 0)),
        }))
      );
      const parsedOrig = originalPrice.trim() ? Number(originalPrice.replace(/\D/g, '')) : 0;

      if (editing) {
        await request(`/api/admin/products/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            price: Number(price),
            original_price: parsedOrig,
            category,
            tryon_category: tryon_cat,
            material: material.trim() || 'Cotton',
            description: description.trim(),
            colors: selectedColors,
            sizes: selectedSizes,
            variants: variantList,
            ...(mainUp ? { image_url: mainUp.url } : {}),
            back_image_url: backUp ? backUp.url : existingBackUrl ?? '',
            detail_image_url: detailUp ? detailUp.url : existingDetailUrl ?? '',
          }),
        });
      } else {
        const totalStock = variantList.reduce((acc, v) => acc + v.stock, 0);
        await request('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            price: Number(price),
            original_price: parsedOrig > 0 ? parsedOrig : null,
            category,
            tryon_category: tryon_cat,
            image_url: mainUp!.url,
            back_image_url: backUp?.url,
            detail_image_url: detailUp?.url,
            material: material.trim() || 'Cotton',
            description: description.trim(),
            colors: selectedColors,
            sizes: selectedSizes,
            stock_per_variant: Math.max(1, Math.round(totalStock / Math.max(1, variantList.length))),
            variant_stocks: variantList,
            tag: 'MỚI',
            featured: false,
          }),
        });
      }
      setShowForm(false);
      await Promise.all([load(), refresh()]);
      notify(editing ? 'Đã cập nhật thiết kế.' : 'Đã thêm thiết kế mới vào bộ sưu tập.');
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(product: Product) {
    setBusy(true);
    try {
      await request(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !product.active }),
      });
      await Promise.all([load(), refresh()]);
      notify(product.active ? `Đã ẩn "${product.name}".` : `Đã mở bán lại "${product.name}".`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (user?.role !== 'admin') {
    return (
      <Screen>
        <Header title="Quản lý shop" back />
        <Empty
          icon="storefront-outline"
          title="Không gian của chủ shop"
          description="Đăng nhập bằng tài khoản chủ shop để quản lý sản phẩm và đơn hàng."
          action="Đăng nhập"
          onPress={() => router.push('/auth')}
        />
      </Screen>
    );
  }

  const totalDraftStock = selectedColors.reduce(
    (acc, c) => acc + selectedSizes.reduce((sAcc, sz) => sAcc + (Number(stockMatrix[`${c.name}:${sz}`]) || 0), 0),
    0
  );

  return (
    <Screen onRefresh={load}>
      <Header
        title="ShopFit Studio"
        subtitle="SHOP MANAGEMENT"
        back
        right={<IconButton name="refresh-outline" label="Làm mới thống kê" onPress={() => void load()} />}
      />
      <ErrorMessage message={error} />

      <AdminDashboard
        summary={summary}
        analytics={analytics}
        payments={payments}
        paymentBusyId={paymentBusyId}
        onApprovePayment={id => void handleApprovePayment(id)}
        onRejectPayment={id => void handleRejectPayment(id)}
        wide={wide}
      />

      {/* PRODUCT LIST HEADER & ADD BUTTON */}
      <View style={[s.between, { marginTop: 16, marginBottom: 14 }]}>
        <View>
          <Text style={[s.title, { fontSize: 28 }]}>Các thiết kế</Text>
          <Text style={[s.muted, { fontSize: 12, marginTop: 2 }]}>
            {filteredProducts.length} / {products.length} mẫu hiển thị
          </Text>
        </View>
        <Button icon="add" onPress={() => openForm()}>
          Thêm mẫu mới
        </Button>
      </View>

      {/* SEARCH & FILTER CONTROLS */}
      <View
        style={{
          backgroundColor: '#FAF8F5',
          borderWidth: 1,
          borderColor: '#EAE6DD',
          borderRadius: 12,
          padding: 12,
          marginBottom: 18,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'white',
            borderWidth: 1,
            borderColor: t.colors.line,
            borderRadius: 8,
            paddingHorizontal: 12,
            height: 42,
          }}
        >
          <Ionicons name="search-outline" size={18} color={t.colors.muted} style={{ marginRight: 8 }} />
          <TextInput
            accessibilityLabel="Tìm sản phẩm trong shop"
            placeholder="Tìm theo tên thiết kế, chất liệu, danh mục..."
            placeholderTextColor={t.colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={{ flex: 1, fontSize: 13, color: t.colors.ink, fontFamily: t.fonts.regular }}
          />
          {searchQuery ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm" onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={t.colors.muted} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={[s.muted, { fontSize: 11, marginRight: 4 }]}>Danh mục:</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setFilterCategory('ALL')}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: filterCategory === 'ALL' ? t.colors.green : '#EEECE8',
            }}
          >
            <Text style={{ fontSize: 11, color: filterCategory === 'ALL' ? 'white' : t.colors.ink, fontFamily: t.fonts.medium }}>Tất cả</Text>
          </Pressable>
          {allCategories.map(c => (
            <Pressable
              key={c.name}
              accessibilityRole="button"
              onPress={() => setFilterCategory(c.name)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: filterCategory === c.name ? t.colors.green : '#EEECE8',
              }}
            >
              <Text style={{ fontSize: 11, color: filterCategory === c.name ? 'white' : t.colors.ink, fontFamily: t.fonts.medium }}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={[s.muted, { fontSize: 11, marginRight: 4 }]}>Trạng thái:</Text>
          {(
            [
              ['ALL', 'Tất cả'],
              ['ACTIVE', 'Đang bán'],
              ['LOW_STOCK', '⚠️ Sắp hết'],
              ['HIDDEN', 'Đã ẩn'],
            ] as const
          ).map(([st, label]) => (
            <Pressable
              key={st}
              accessibilityRole="button"
              onPress={() => setFilterStatus(st)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: filterStatus === st ? t.colors.green : '#EEECE8',
              }}
            >
              <Text style={{ fontSize: 11, color: filterStatus === st ? 'white' : t.colors.ink, fontFamily: t.fonts.medium }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* PRODUCT LIST */}
      {loading ? (
        <ActivityIndicator color={t.colors.green} style={{ padding: 40 }} />
      ) : filteredProducts.length === 0 ? (
        <View style={{ padding: 30, alignItems: 'center' }}>
          <Text style={s.muted}>Không tìm thấy sản phẩm phù hợp bộ lọc.</Text>
        </View>
      ) : (
        filteredProducts.map(product => {
          const hasLowStock = product.variants.some(v => v.stock <= 3 && v.stock > 0);
          const isOutOfStock = product.stock <= 0;
          return (
            <View
              key={product.id}
              style={[
                s.card,
                {
                  flexDirection: 'row',
                  gap: 16,
                  marginBottom: 14,
                  padding: 15,
                  opacity: product.active ? 1 : 0.6,
                  borderColor: isOutOfStock ? '#FCA5A5' : hasLowStock ? '#FCD34D' : t.colors.line,
                },
              ]}
            >
              <Image
                source={mediaUrl(product.image_url)}
                contentFit="cover"
                style={{ width: 80, height: 110, borderRadius: 8, backgroundColor: t.colors.sand }}
              />
              <View style={{ flex: 1 }}>
                <View style={[s.between]}>
                  <Text style={[s.text, { fontFamily: t.fonts.medium, fontSize: 15, flex: 1 }]}>{product.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {isOutOfStock ? (
                      <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color: '#B91C1C', fontSize: 10, fontFamily: t.fonts.bold }}>HẾT HÀNG</Text>
                      </View>
                    ) : hasLowStock ? (
                      <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ color: '#B45309', fontSize: 10, fontFamily: t.fonts.bold }}>⚠️ SẮP HẾT</Text>
                      </View>
                    ) : null}
                    <View
                      style={{
                        backgroundColor: product.active ? t.colors.greenLight : '#F3F4F6',
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }}
                    >
                      <Text style={{ color: product.active ? t.colors.green : t.colors.muted, fontSize: 9, fontFamily: t.fonts.bold }}>
                        {product.active ? 'ĐANG BÁN' : 'ĐÃ ẨN'}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>
                  {money(product.price)} · Tổng tồn: <Text style={{ fontFamily: t.fonts.bold, color: t.colors.ink }}>{product.stock}</Text> (
                  {product.category})
                </Text>

                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {product.variants.map(v => (
                    <Text
                      key={`${v.size}-${v.color}`}
                      style={{
                        fontSize: 10,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: v.stock <= 3 ? '#F87171' : '#E5E7EB',
                        backgroundColor: v.stock <= 3 ? '#FEF2F2' : '#F9FAFB',
                        color: v.stock <= 3 ? '#DC2626' : t.colors.muted,
                        fontFamily: t.fonts.medium,
                      }}
                    >
                      {product.colors.length > 1 ? `${v.color}·${v.size}` : v.size}: {v.stock}
                    </Text>
                  ))}
                </View>

                <View style={[s.row, { flexWrap: 'wrap', marginTop: 10, gap: 14 }]}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => openForm(product)}
                    style={{ minHeight: 38, justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: t.colors.green }}>Sửa & tồn kho</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Số đo ${product.name}`}
                    disabled={busy}
                    onPress={() => router.push(`/admin-sizing/${product.id}`)}
                    style={{ minHeight: 38, justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: t.colors.green }}>Bảng số đo & ảnh sau</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void toggle(product)}
                    style={{ minHeight: 38, justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: t.colors.muted }}>
                      {product.active ? 'Ẩn sản phẩm' : 'Hiện sản phẩm'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })
      )}

      {/* MODAL THÊM / CHỈNH SỬA ĐẦY ĐỦ SẢN PHẨM */}
      <Modal
        visible={showForm}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setShowForm(false);
        }}
      >
        <Screen>
          <Header
            title={editing ? 'Chỉnh sửa thiết kế' : 'Một thiết kế mới'}
            subtitle="SHOPFIT CATALOG"
            right={
              <IconButton
                name="close"
                label="Đóng biểu mẫu"
                onPress={() => {
                  if (!busy) setShowForm(false);
                }}
              />
            }
          />
          <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center' }}>
            <Field label="Tên sản phẩm *" value={name} onChangeText={setName} placeholder="Ví dụ: Áo sơ mi lụa tơ tằm" />
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 14 : 0 }}>
              <View style={{ flex: 1 }}>
                <Field label="Giá bán (VND) *" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="Ví dụ: 350000" />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Giá gốc gạch ngang (tùy chọn)"
                  value={originalPrice}
                  onChangeText={setOriginalPrice}
                  keyboardType="numeric"
                  placeholder="Ví dụ: 450000"
                />
              </View>
            </View>

            {/* 1. DANH MỤC */}
            <View style={{ marginBottom: 18 }}>
              <View style={[s.between, { marginBottom: 8 }]}>
                <Text style={s.label}>Danh mục sản phẩm *</Text>
                <Pressable accessibilityRole="button" onPress={() => setShowAddCatModal(true)}>
                  <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: t.colors.green }}>+ Thêm danh mục mới</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {allCategories.map(c => (
                  <Pressable
                    key={c.name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: c.name === category }}
                    onPress={() => setCategory(c.name)}
                    style={{
                      paddingHorizontal: 16,
                      minHeight: 44,
                      borderRadius: 8,
                      backgroundColor: c.name === category ? t.colors.green : t.colors.greenLight,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: t.fonts.medium, fontSize: 12, color: c.name === category ? 'white' : t.colors.green }}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <Field label="Chất liệu *" value={material} onChangeText={setMaterial} placeholder="Cotton, Linen, Lụa..." />
            <Field
              label="Mô tả sản phẩm *"
              value={description}
              onChangeText={setDescription}
              multiline
              style={{ minHeight: 90, textAlignVertical: 'top' }}
              placeholder="Mô tả ngắn gọn về thiết kế, phom dáng và dịp mặc phù hợp..."
            />

            {/* 2. BẢNG CHỌN NHIỀU MÀU SẮC */}
            <View
              style={{
                backgroundColor: '#FAF9F6',
                borderWidth: 1,
                borderColor: '#E8E4DC',
                borderRadius: 12,
                padding: 14,
                marginBottom: 18,
                gap: 10,
              }}
            >
              <View style={s.between}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="color-palette-outline" size={18} color={t.colors.green} />
                  <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>
                    Màu sắc sản phẩm ({selectedColors.length} màu) *
                  </Text>
                </View>
                <Pressable onPress={() => setShowCustomColor(v => !v)}>
                  <Text style={{ fontSize: 11, color: t.colors.green, fontFamily: t.fonts.medium }}>
                    {showCustomColor ? 'Ẩn màu riêng' : '+ Thêm màu riêng'}
                  </Text>
                </Pressable>
              </View>
              <Text style={[s.muted, { fontSize: 11 }]}>Chạm để bật/tắt một hoặc nhiều màu cho thiết kế này:</Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[...POPULAR_COLORS, ...selectedColors.filter(sc => !POPULAR_COLORS.some(pc => pc.name === sc.name))].map(c => {
                  const isSelected = selectedColors.some(sc => sc.name === c.name);
                  return (
                    <Pressable
                      key={c.name}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => toggleColorSwatch(c)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: isSelected ? t.colors.green : '#D1D5DB',
                        backgroundColor: isSelected ? t.colors.greenLight : 'white',
                      }}
                    >
                      <View
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 7,
                          backgroundColor: c.hex,
                          borderWidth: 1,
                          borderColor: '#00000020',
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: isSelected ? t.fonts.bold : t.fonts.regular,
                          color: isSelected ? t.colors.green : t.colors.ink,
                        }}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {showCustomColor && (
                <View style={{ marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E5E1D8', gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 2 }}>
                      <Field label="Tên màu mới" value={customColorName} onChangeText={setCustomColorName} placeholder="Xanh bơ, Đỏ rượu..." />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Mã HEX"
                        value={customColorHex}
                        onChangeText={setCustomColorHex}
                        autoCapitalize="none"
                        placeholder="#344E40"
                      />
                    </View>
                  </View>
                  <Button variant="outline" onPress={addCustomColor} style={{ minHeight: 40, paddingVertical: 8 }}>
                    Thêm màu vào sản phẩm
                  </Button>
                </View>
              )}
            </View>

            {/* 3. TỒN KHO THEO MÀU / SIZE */}
            <View
              style={{
                backgroundColor: '#FAF9F6',
                borderWidth: 1,
                borderColor: '#E8E4DC',
                borderRadius: 12,
                padding: 14,
                marginBottom: 18,
                gap: 12,
              }}
            >
              <View style={[s.between]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="cube-outline" size={18} color={t.colors.green} />
                  <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: t.colors.ink }}>Tồn kho theo màu / size</Text>
                </View>
                <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: t.colors.green }}>Tổng: {totalDraftStock} cái</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {ALL_SIZES.map(sz => {
                  const active = selectedSizes.includes(sz);
                  return (
                    <Pressable
                      key={sz}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => toggleSize(sz)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: active ? t.colors.green : '#D1D5DB',
                        backgroundColor: active ? t.colors.green : 'white',
                      }}
                    >
                      <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: active ? 'white' : t.colors.muted }}>{sz}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ gap: 8, marginTop: 4 }}>
                {selectedColors.flatMap(c =>
                  selectedSizes.map(sz => {
                    const mKey = `${c.name}:${sz}`;
                    return (
                      <View
                        key={mKey}
                        style={[s.between, { backgroundColor: 'white', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' }]}
                      >
                        <Text style={{ fontFamily: t.fonts.medium, fontSize: 13, color: t.colors.ink, flex: 1 }}>
                          {c.name} / Size {sz}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <TextInput
                            accessibilityLabel={`Tồn kho ${c.name} size ${sz}`}
                            value={stockMatrix[mKey] ?? '0'}
                            onChangeText={v => setStockMatrix(prev => ({ ...prev, [mKey]: v.replace(/\D/g, '') }))}
                            keyboardType="numeric"
                            placeholder="0"
                            style={{
                              borderWidth: 1,
                              borderColor: t.colors.line,
                              borderRadius: 6,
                              height: 38,
                              width: 80,
                              textAlign: 'center',
                              fontFamily: t.fonts.regular,
                              fontSize: 14,
                              color: t.colors.ink,
                              backgroundColor: '#FCFCFB',
                            }}
                          />
                          <Text style={[s.muted, { fontSize: 12 }]}>cái</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 4,
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: '#EAE6DD',
                }}
              >
                <TextInput
                  value={batchStock}
                  onChangeText={setBatchStock}
                  keyboardType="numeric"
                  placeholder="Số lượng"
                  style={{
                    borderWidth: 1,
                    borderColor: t.colors.line,
                    borderRadius: 6,
                    height: 36,
                    width: 80,
                    textAlign: 'center',
                    fontSize: 12,
                    backgroundColor: 'white',
                    color: t.colors.ink,
                  }}
                />
                <Button variant="outline" onPress={applyBatchStock} style={{ height: 36, minHeight: 36, paddingHorizontal: 12 }}>
                  Điền nhanh tất cả
                </Button>
              </View>
            </View>

            {/* 4. 3 GÓC ẢNH SẢN PHẨM (CHÍNH DIỆN, MẶT SAU, CẬN CHẤT VẢI) */}
            <Text style={[s.label, { marginTop: 6, fontSize: 13 }]}>1. Ảnh chính diện {!editing && '(Bắt buộc)'}</Text>
            {(photo?.uri || editing?.image_url) && (
              <Image
                source={photo ? photo.uri : mediaUrl(editing?.image_url)}
                contentFit="contain"
                style={{ height: 190, width: '100%', borderRadius: 10, marginBottom: 10, backgroundColor: t.colors.sand }}
              />
            )}
            <Button variant="outline" icon="image-outline" onPress={() => void pick('front')} style={{ marginBottom: 14 }}>
              {photo || editing ? 'Đổi ảnh chính diện' : 'Chọn ảnh chính diện từ máy'}
            </Button>

            <View style={[s.between, { marginTop: 4 }]}>
              <Text style={[s.label, { fontSize: 13 }]}>2. Ảnh mặt sau (Tùy chọn cho AI xoay góc lưng)</Text>
              {(backPhoto || existingBackUrl) && (
                <Pressable
                  onPress={() => {
                    setBackPhoto(null);
                    setExistingBackUrl(null);
                  }}
                >
                  <Text style={{ fontSize: 11, color: t.colors.error, fontFamily: t.fonts.medium }}>Xóa ảnh</Text>
                </Pressable>
              )}
            </View>
            {(backPhoto?.uri || existingBackUrl) && (
              <Image
                source={backPhoto ? backPhoto.uri : mediaUrl(existingBackUrl)}
                contentFit="contain"
                style={{ height: 170, width: '100%', borderRadius: 10, marginBottom: 10, backgroundColor: t.colors.sand }}
              />
            )}
            <Button variant="outline" icon="sync-outline" onPress={() => void pick('back')} style={{ marginBottom: 14 }}>
              {backPhoto || existingBackUrl ? 'Đổi ảnh mặt sau' : '+ Thêm ảnh chi tiết mặt sau'}
            </Button>

            <View style={[s.between, { marginTop: 4 }]}>
              <Text style={[s.label, { fontSize: 13 }]}>3. Ảnh cận chất vải / đường may (Tùy chọn)</Text>
              {(detailPhoto || existingDetailUrl) && (
                <Pressable
                  onPress={() => {
                    setDetailPhoto(null);
                    setExistingDetailUrl(null);
                  }}
                >
                  <Text style={{ fontSize: 11, color: t.colors.error, fontFamily: t.fonts.medium }}>Xóa ảnh</Text>
                </Pressable>
              )}
            </View>
            {(detailPhoto?.uri || existingDetailUrl) && (
              <Image
                source={detailPhoto ? detailPhoto.uri : mediaUrl(existingDetailUrl)}
                contentFit="contain"
                style={{ height: 170, width: '100%', borderRadius: 10, marginBottom: 10, backgroundColor: t.colors.sand }}
              />
            )}
            <Button variant="outline" icon="search-outline" onPress={() => void pick('detail')} style={{ marginBottom: 18 }}>
              {detailPhoto || existingDetailUrl ? 'Đổi ảnh cận chất vải' : '+ Thêm ảnh cận chất vải / đường may'}
            </Button>

            <ErrorMessage message={formError} />
            <Button loading={busy} icon="checkmark" onPress={() => void save()} style={{ marginTop: 8, marginBottom: 30 }}>
              {editing ? 'Lưu thay đổi' : 'Thêm thiết kế vào bộ sưu tập'}
            </Button>
          </View>
        </Screen>
        <ToastOverlay />
      </Modal>

      {/* MODAL THÊM DANH MỤC MỚI KÈM ÁNH XẠ AI */}
      <Modal visible={showAddCatModal} transparent animationType="fade" onRequestClose={() => setShowAddCatModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 22, maxWidth: 440, width: '100%', gap: 14 }}>
              <View style={[s.between]}>
                <Text style={{ fontFamily: t.fonts.bold, fontSize: 18, color: t.colors.ink }}>Thêm danh mục mới</Text>
                <IconButton name="close" label="Đóng" onPress={() => setShowAddCatModal(false)} />
              </View>

              <Field label="Tên danh mục *" value={newCatName} onChangeText={setNewCatName} placeholder="Ví dụ: Đầm dạ hội, Áo blazer..." />

              <View>
                <Text style={s.label}>Nhóm phom dáng thử đồ AI *</Text>
                <Text style={[s.muted, { fontSize: 11, marginBottom: 8 }]}>
                  Giúp Gemini AI hiểu đúng vị trí trang phục khi khách hàng thử đồ:
                </Text>

                {(
                  [
                    ['tops', '👔 Thân trên (Áo, Sơ mi, Blazer, Áo len...)'],
                    ['bottoms', '👖 Thân dưới (Quần jean, Quần âu, Chân váy...)'],
                    ['one-pieces', '👗 Toàn thân (Váy, Đầm liền, Jumpsuit, Set bộ...)'],
                  ] as const
                ).map(([val, desc]) => (
                  <Pressable
                    key={val}
                    accessibilityRole="button"
                    accessibilityState={{ selected: newCatTryon === val }}
                    onPress={() => setNewCatTryon(val)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: newCatTryon === val ? t.colors.green : '#E5E7EB',
                      backgroundColor: newCatTryon === val ? t.colors.greenLight : 'white',
                      marginBottom: 6,
                    }}
                  >
                    <Ionicons
                      name={newCatTryon === val ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={newCatTryon === val ? t.colors.green : t.colors.muted}
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={{
                        fontFamily: newCatTryon === val ? t.fonts.bold : t.fonts.regular,
                        fontSize: 12,
                        color: t.colors.ink,
                        flex: 1,
                      }}
                    >
                      {desc}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Button onPress={() => void handleCreateCategory()} icon="checkmark">
                Xác nhận thêm danh mục
              </Button>
            </View>
            <ToastOverlay />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
