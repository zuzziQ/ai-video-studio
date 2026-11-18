/**
 * Nguồn trích cho mỗi guardrail trong DOMAINS (cùng thứ tự với domain.guardrails).
 */
const AG = "AGENTS.md";
export const GUARDRAIL_SOURCES = {
  attribution: [
    [{ file: AG, lines: "6-14" }],
    [{ file: "README.md", section: "16. Bản quyền và ghi công" }],
  ],
  studio: [
    [{ file: "references/studio.md", section: "Plugin (v4)" }],
    [{ file: "references/studio.md", section: "API (cho script)" }],
    [{ file: "references/studio.md", section: "API (cho script)" }],
  ],
  ads: [
    [{ file: "references/ad-gates.md", section: "Giới hạn" }],
    [{ file: "references/ad-gates.md", section: "Chặn xuất" }],
  ],
  upstream: [
    [{ file: AG, section: "Repo gốc" }],
  ],
  workflow: [
    [{ file: AG, section: "Luật làm việc của bản này (`zuzziQ/ai-video-studio`)" }],
    [{ file: AG, section: "CI (`D:/ai/docs/CI-BUDGET.md`)" }],
  ],
};
