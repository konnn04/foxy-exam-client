import { exec } from "child_process";
import os from "os";

export interface PeripheralDevice {
  id: string; // HW identifier
  name: string; // Human readable name
  type: string; // Category, e.g., 'usb'
}

export class PeripheralMonitor {
  private previousDevices: Map<string, PeripheralDevice> = new Map();
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  public onChange: (action: "added" | "removed", device: PeripheralDevice) => void = () => {};

  start(intervalMs = 5000) {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Initial scan to populate baseline without emitting "added" for everything
    this.fetchDevices().then(devices => {
      this.previousDevices = new Map(devices.map(d => [d.id, d]));
      this.timer = setInterval(() => this.scan(), intervalMs);
    });
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async getSnapshot(): Promise<PeripheralDevice[]> {
    return await this.fetchDevices();
  }

  private async scan() {
    if (!this.isRunning) return;
    const currentList = await this.fetchDevices();
    const currentMap = new Map(currentList.map(d => [d.id, d]));

    // Check for additions
    currentMap.forEach((device, id) => {
      if (!this.previousDevices.has(id) && this.previousDevices.size > 0) {
        this.onChange("added", device);
      }
    });

    // Check for removals
    if (this.previousDevices.size > 0) {
      this.previousDevices.forEach((oldDevice, id) => {
        if (!currentMap.has(id)) {
          this.onChange("removed", oldDevice);
        }
      });
    }

    this.previousDevices = currentMap;
  }

  private fetchDevices(): Promise<PeripheralDevice[]> {
    const platform = os.platform();
    return new Promise((resolve) => {
      if (platform === "win32") {
        // Query WMI for Plug and Play devices that are currently present
        const cmd = `wmic path Win32_PnPEntity where "Present=true" get Caption,PNPDeviceID /format:csv`;
        exec(cmd, (err, stdout) => {
          if (err || !stdout) return resolve([]);
          const lines = stdout.split("\n");
          const devices: PeripheralDevice[] = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const parts = line.split(",");
            if (parts.length >= 3) {
              const name = parts[1].trim();
              const id = parts[2].trim();
              // Exclude some extremely generic system busses to reduce noise if desired,
              // but keeping it simple is best for full tracking.
              devices.push({ id, name, type: "usb/pnp" });
            }
          }
          resolve(devices);
        });
      } else if (platform === "linux") {
        exec("lsusb", (err, stdout) => {
          if (err || !stdout) return resolve([]);
          const lines = stdout.split("\n");
          const devices: PeripheralDevice[] = [];
          for (const l of lines) {
            const match = l.match(/ID ([0-9a-f:]+) (.+)/);
            if (match) {
              devices.push({ id: match[1], name: match[2].trim(), type: "usb" });
            }
          }
          resolve(devices);
        });
      } else if (platform === "darwin") {
        exec("system_profiler SPUSBDataType", (err, stdout) => {
          if (err || !stdout) return resolve([]);
          const lines = stdout.split("\n");
          const devices: PeripheralDevice[] = [];
          // A very rudimentary parse for macOS
          let currentDeviceName = "";
          for (const line of lines) {
            if (line.match(/^\s{8}[^:]+:/)) {
              currentDeviceName = line.trim().replace(/:$/, "");
            } else if (line.includes("Product ID:")) {
              const idMatch = line.match(/(0x[0-9a-f]+)/i);
              if (idMatch && currentDeviceName) {
                devices.push({ id: idMatch[1], name: currentDeviceName, type: "usb" });
                currentDeviceName = "";
              }
            }
          }
          resolve(devices);
        });
      } else {
        resolve([]);
      }
    });
  }
}
