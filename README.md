# exam-client — Foxy Exam Desktop Client

![Electron](https://img.shields.io/badge/Electron-35-47848F?style=for-the-badge&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

Ứng dụng desktop cho thí sinh thi trực tuyến. Tích hợp lockdown browser, telemetry engine, camera/screen stream qua LiveKit, phát hiện AI local (MediaPipe), và giao diện làm bài.

## Features

### Exam Lockdown
- Chế độ kiosk/fullscreen bắt buộc khi thi
- Chặn phím tắt hệ thống (Alt+Tab, Alt+F4, Cmd+Q, PrintScreen...)
- Phát hiện và cảnh báo ứng dụng cấm đang chạy (banned apps)
- Phát hiện máy ảo (VMware, VirtualBox, Hyper-V, QEMU, KVM...)
- Thu thập device fingerprint & peripheral monitoring

### Telemetry Engine
- Ghi nhận sự kiện: focus/blur, clipboard, resize, keyboard shortcuts
- Gửi perf_metrics định kỳ (CPU, RAM, GPU, app CPU, app RAM)
- Device snapshot: liệt kê thiết bị ngoại vi USB
- Process monitoring: danh sách tiến trình kèm owner (user/system)

### LiveKit Integration
- Publish camera + screen share track qua WebRTC
- Auto-reconnect khi mất kết nối
- Stream quality adaptive

### AI Local (Browser)
- MediaPipe Face Detection: phát hiện khuôn mặt phía client
- TensorFlow.js: gaze tracking, emotion analysis (optional)

### Cross-platform
- Windows (NSIS installer)
- macOS (DMG)
- Linux (AppImage, deb)

## Tech Stack

| Component | Technology |
|-----------|------------|
| Shell | Electron 35 |
| UI | React 19 + TypeScript + Vite 6 |
| Styling | Tailwind CSS 4 + Shadcn UI |
| WebRTC | LiveKit Client SDK |
| WebSocket | Laravel Echo + Pusher protocol |
| AI | MediaPipe Vision, TensorFlow.js |
| Build | electron-builder |
| Monitoring | Sentry |

## Quick Start

### Prerequisites
- Node.js 18+ (khuyến nghị 20+)
- pnpm 9+

### Development

```bash
cd exam-client
pnpm install

# Configure environment
cp src/.env.example src/.env
# Edit: VITE_API_BASE_URL, VITE_REVERB_*, VITE_LIVEKIT_URL

# Run in development mode (Vite + Electron)
pnpm run dev
```

### Build

```bash
# Build for current OS
pnpm run build:electron

# Build for specific OS
pnpm run release:linux    # AppImage + deb
pnpm run release:win      # NSIS installer (x64)
pnpm run release:local    # Current OS, no publish
```

Output: `release/{version}/`

## Project Structure

```
exam-client/
├── electron/
│   ├── main.ts              # Electron main process entry
│   ├── main-window.ts       # BrowserWindow setup (kiosk, security)
│   ├── preload.ts           # Context bridge (IPC expose)
│   ├── ipc-handlers.ts      # IPC handler registration (process, VM, screenshot...)
│   ├── ipc-exam-session.ts  # Exam session lifecycle IPC
│   ├── security.ts          # Security policies (CSP, keyboard intercept)
│   ├── runtime.ts           # Runtime config resolution
│   ├── diagnostic-log.ts    # Diagnostic logging for production
│   ├── peripheral-monitor.ts # USB device monitoring
│   ├── platform/
│   │   ├── platform-ops.ts  # IPlatformOps interface
│   │   ├── windows-ops.ts   # Windows-specific implementations
│   │   ├── darwin-ops.ts    # macOS-specific implementations
│   │   ├── linux-ops.ts     # Linux-specific implementations
│   │   └── index.ts         # Platform factory (getPlatformOps)
│   ├── banned-process-match.ts
│   ├── safe-banned-kill.ts
│   ├── unix-kill-pattern.ts
│   └── sentry-main.ts
├── src/
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Router + providers
│   ├── config/
│   │   └── runtime-shared.ts # Shared runtime config
│   ├── components/
│   │   ├── exam/            # Exam-specific components
│   │   └── ui/              # Shadcn UI components
│   ├── hooks/               # Custom React hooks
│   ├── services/
│   │   ├── telemetry-engine.ts    # Client telemetry system
│   │   └── livekit-publisher.ts   # LiveKit stream management
│   ├── .env.example
│   └── .env
├── public/
│   └── assets/icons/        # App icons (ico, icns, png)
├── scripts/                 # Build helper scripts
├── .github/workflows/       # CI/CD (electron-publish-matrix)
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Platform Architecture

IPC handlers sử dụng **interface pattern** cho cross-platform support:

```
IPlatformOps (interface)
├── WindowsOps  — tasklist, WMI, PowerShell
├── DarwinOps   — ps, sysctl, system_profiler
└── LinuxOps    — ps, systemd-detect-virt, lsusb
```

Mỗi class implement các phương thức:
- `getProcessListCommand()` — Lệnh lấy danh sách process
- `parseProcessList(stdout)` — Parse output thành `ProcessInfo[]`
- `getBannedAppsCommand()` — Lệnh kiểm tra ứng dụng cấm
- `detectVirtualMachine()` — Phát hiện VM
- `killProcessByPid(pid, name)` — Kill process cấm

## Environment Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `https://exam-local.konnn04.dev` | Backend API base URL |
| `VITE_REVERB_HOST` | `ws-exam-local.konnn04.dev` | WebSocket host |
| `VITE_REVERB_PORT` | `443` | WebSocket port |
| `VITE_REVERB_SCHEME` | `https` | WebSocket protocol |
| `VITE_REVERB_APP_KEY` | `exam-key-local` | Reverb app key |
| `VITE_LIVEKIT_URL` | `wss://...` | LiveKit server URL |
| `SENTRY_DSN` | `https://...@sentry.io/...` | Sentry error tracking |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | Performance sampling (0-1) |

## CI/CD

GitHub Actions workflow (`electron-publish-matrix.yml`):
- Build trên matrix: Windows (x64), Linux (x64), macOS (arm64 + x64)
- Auto-publish GitHub Release (draft)
- Artifact upload per platform

## Security

- Content Security Policy (CSP) strict
- `nodeIntegration: false`, `contextIsolation: true`
- IPC via `contextBridge` only (preload script)
- Keyboard shortcut interception trong exam mode
- Process isolation: renderer process sandboxed

## Author

**Konnn04** — Foxy Exam Client
