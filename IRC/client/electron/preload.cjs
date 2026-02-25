const { contextBridge } = require("electron");
const os = require("node:os");

function getLocalIp() {
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    if (!addresses) {
      continue;
    }

    for (const address of addresses) {
      if (address.internal) {
        continue;
      }

      if (address.family === "IPv4") {
        return address.address;
      }
    }
  }

  for (const addresses of Object.values(interfaces)) {
    if (!addresses) {
      continue;
    }

    for (const address of addresses) {
      if (!address.internal && address.family === "IPv6") {
        return address.address;
      }
    }
  }

  return null;
}

contextBridge.exposeInMainWorld("abyssDesktop", {
  platform: process.platform,
  localIp: getLocalIp()
});
