import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="vi">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#344E40" />
        <meta
          name="description"
          content="ShopFit Studio — Thời trang thiết kế tích hợp Phòng thử đồ ảo AI 4 góc & Tư vấn chọn size thông minh theo số đo cơ thể."
        />
        <meta property="og:site_name" content="ShopFit Studio" />
        <meta property="og:title" content="ShopFit Studio · Phòng Thử Đồ AI 4 Góc & Tư Vấn Size" />
        <meta
          property="og:description"
          content="Khám phá bộ sưu tập thiết kế tối giản, ướm thử 4 góc trên ảnh của bạn bằng AI và chọn size chuẩn phom."
        />
        <meta property="og:type" content="website" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
