const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("tangAgent", {
  platform: process.platform
});
