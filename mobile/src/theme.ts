export const theme = {
  colors: {
    background: '#F8F7F3', paper: '#FFFFFF', ink: '#202A23', muted: '#647067',
    green: '#344E40', greenLight: '#E7EDE6', line: '#E2E5DC', sand: '#EBE7DD',
    error: '#A03736', errorLight: '#FAEBE8', gold: '#8A642C', black: '#171E19',
  },
  fonts: { regular: 'DMSans_400Regular', medium: 'DMSans_500Medium', bold: 'DMSans_700Bold', serif: 'CormorantGaramond_500Medium', serifItalic: 'CormorantGaramond_500Medium_Italic' },
  radius: { small: 8, medium: 16, large: 24 },
};
export const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
export const dateLabel = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
export const orderStatuses: Record<string, string> = { pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', shipping: 'Đang giao', completed: 'Hoàn tất', cancelled: 'Đã hủy' };
