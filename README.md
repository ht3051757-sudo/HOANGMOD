# Mướp VIP Web

## Chạy local
1. Cài Node.js 20+.
2. `npm install`
3. Copy `.env.example` thành `.env` và đổi `SESSION_SECRET`, `ADMIN_PASSWORD`.
4. `npm start`
5. Mở `http://localhost:3000`
6. Admin: `http://localhost:3000/admin`

## Lưu ý production
- Đặt HTTPS và `cookie.secure=true`.
- Đặt Express `trust proxy` đúng với reverse proxy trước khi dùng IP ban.
- Dùng secret mạnh và không commit `.env`.
- Thay session MemoryStore bằng Redis/DB-backed session cho production.
- Link download chỉ nên trỏ tới tài nguyên bạn có quyền phân phối.

## Nội dung mặc định
Database mới không có menu. Admin phải tự thêm menu và link tải trong `/admin`. Chat cộng đồng cho phép người dùng đăng nhập gửi/xem tin nhắn; Admin có thể xoá toàn bộ lịch sử chat.
