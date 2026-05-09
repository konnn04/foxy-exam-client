# exam-client — Foxy Exam Desktop Client

![Electron](https://img.shields.io/badge/Electron-35-47848F?style=for-the-badge&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

Ứng dụng desktop cho thí sinh thi trực tuyến. Tích hợp lockdown browser, telemetry engine, camera/screen stream qua LiveKit, phát hiện AI local (MediaPipe), và giao diện làm bài thi.

## Visuals
*(TBD: Thêm ảnh chụp màn hình lúc thí sinh đang làm bài và bị khóa màn hình tại đây)*

## Description

**exam-client** chịu trách nhiệm tạo ra một môi trường thi an toàn và chống gian lận ở cấp độ máy trạm (client-side):

- **Exam Lockdown:** Chế độ kiosk toàn màn hình, chặn phím tắt hệ thống (Alt+Tab, PrintScreen, etc.), phát hiện máy ảo (VMware, VirtualBox, etc.), phát hiện và diệt phần mềm bị cấm (banned apps).
- **Telemetry Engine:** Thu thập thiết bị ngoại vi USB, giám sát process, đo hiệu năng (CPU/RAM/GPU), theo dõi Focus/Blur.
- **AI Local:** Tích hợp MediaPipe Vision để phát hiện khuôn mặt và theo dõi ánh mắt (gaze tracking) trực tiếp trên trình duyệt, giảm tải cho server.
- **LiveKit Stream:** Chia sẻ đồng thời luồng WebRTC của Camera và Screen Capture.
- **Cross-platform:** Hỗ trợ IPC module riêng cho Windows, macOS, và Linux.

## Installation

### Prerequisites
- Node.js 18+ (khuyến nghị 20+)
- pnpm 9+

### Setup Development Environment
```bash
cd exam-client
pnpm install

cp src/.env.example src/.env
# Edit: VITE_API_BASE_URL, VITE_REVERB_*, VITE_LIVEKIT_URL
```

## Usage

### Development Mode
```bash
# Run Vite dev server + Electron wrapper
pnpm run dev
```

### Build & Release
```bash
# Build for current OS
pnpm run build:electron

# Build for specific OS platforms
pnpm run release:linux    # AppImage + deb
pnpm run release:win      # NSIS installer (x64)
pnpm run release:local    # Build for current OS without publishing
```
Sản phẩm build sẽ nằm ở thư mục `release/{version}/`.

### Security Policy
Ứng dụng áp dụng chính sách:
- Content Security Policy (CSP) chặt chẽ.
- `nodeIntegration: false` và `contextIsolation: true`.
- Giao tiếp giữa React và hệ điều hành chỉ thông qua `contextBridge` IPC (Preload script).

## Support
Tạo Issue trên kho lưu trữ chính [foxy-exam](https://github.com/konnn04/foxy-exam) nếu gặp vấn đề về phần mềm (crash, không nhận diện được camera).

## Roadmap
Phát triển thêm module cảnh báo mạng yếu và tích hợp Offline Mode caching cho các bài thi dài. Chi tiết tại `ARCHITECTURE.md`.

## Contributing
Mọi đóng góp nhằm hỗ trợ tính tương thích nền tảng (Platform support cho Linux distro lạ hoặc macOS ARM) đều được hoan nghênh.

## Authors and acknowledgment
**Konnn04** 
Đồ án Tốt nghiệp - Đại học Cần Thơ (CTU).

## License
Tài liệu và mã nguồn phục vụ giáo dục, thuộc bản quyền phát triển Đồ án CTU.

## Project status
Đang phát triển / Bảo trì. Hỗ trợ đầy đủ Windows và Linux (Debian-based).
