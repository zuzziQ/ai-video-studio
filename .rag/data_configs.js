/**
 * Ứng dụng và cổng của AI Video Studio. `node .rag/sync.js --check` giữ cổng khớp với studio/server.mjs.
 */
export const CONFIG_CATALOG = {
  apps: [
    {
      id: "app-studio",
      name: "AI Video Studio (editor + API cục bộ)",
      domain: "localhost",
      aliases: ["studio", "editor", "server"],
      description: "Server Node thuần (studio/server.mjs) chỉ nghe 127.0.0.1, tự nạp studio/routes/*.mjs và phục vụ giao diện studio/features/*.js; render bằng Chrome headless + ffmpeg (engine/, scripts/render.mjs).",
      source_path: "studio",
      framework: "Node (không framework) + HTML/JS thuần; script Python gọi qua CLI",
      hosting_platform: "Máy người dùng (macOS, Windows 10/11); không có server từ xa",
      stacks: {},
    },
  ],
  microservices_ports_matrix: [
    { service: "studio", port: 5186, prefix: "/api", role: "studio/server.mjs (--port hoặc PORT)" },
  ],
};
