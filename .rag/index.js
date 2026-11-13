/**
 * Knowledge pack của AI Video Studio (bản zuzziQ) cho code-rag-mcp: domain/SSOT, cấu hình cổng, không có bí mật.
 * Engine nạp qua <root>/.rag.json -> "knowledge": ".rag/index.js". Viết tay: chỉ giữ nhận định và con trỏ vào tài liệu,
 * mã; không chép lại chúng. `node .rag/sync.js --check` báo lệch (CI chạy lệnh này).
 */
export { DOMAINS } from "./data.js";
export { CONFIG_CATALOG } from "./data_configs.js";
export { GUARDRAIL_SOURCES } from "./data_sources.js";
/** Không có biến môi trường bắt buộc: token (Telegram, YouTube, Claude) nằm ở ~/.ai-video-studio/, không trong repo. */
export const SECRETS_MATRIX = {};
/** Một server Node duy nhất (studio/server.mjs), không có manifest kiến trúc. */
export const SERVICE_TO_DOMAIN = {};
export const MANIFEST = null;
