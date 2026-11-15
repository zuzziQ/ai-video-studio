/**
 * Cây domain của AI Video Studio (bản zuzziQ) cho code-rag-mcp.
 * Domain: attribution, studio, ads, upstream, workflow.
 */
export const DOMAINS = {
  attribution: {
    name: "Ghi công tác giả Nguyễn Tất Kiểm (MIT)",
    service: "studio",
    port: 5186,
    ssot_path: "NOTICE",
    keywords: ["license", "notice", "ghi công", "tác giả", "bản quyền", "copyright", "00_author", "upstream", "fork", "rebrand"],
    summary: "Repo dựa trên AI Video Studio của Nguyễn Tất Kiểm (MIT). LICENSE, NOTICE, màn giới thiệu studio/features/00_author.js, dòng tác giả README và log khởi động server.mjs phải giữ nguyên trong mọi thay đổi.",
    guardrails: [
      "Không xoá hoặc sửa dòng Copyright, LICENSE, NOTICE; giữ màn giới thiệu studio/features/00_author.js (được đổi giao diện, không được ẩn hay bỏ tên, link).",
      "README của bản dẫn xuất phải có dòng \"Dựa trên AI Video Studio của Nguyễn Tất Kiểm\" kèm link repo gốc; không giới thiệu bản sửa như tự làm từ đầu.",
    ],
    leaf_chunks: [
      {
        id: "attribution-rules",
        layer: "domain",
        title: "Năm luật ghi công cho mọi agent",
        file_path: "AGENTS.md",
        lines: "1-17",
        keywords: ["license", "notice", "00_author", "readme", "server.mjs"],
        content: "Giữ Copyright, LICENSE, NOTICE, màn 00_author.js, dòng tác giả README và log server; bản dẫn xuất thêm dòng 'Dựa trên…' và link repo gốc.",
      },
      {
        id: "attribution-readme",
        layer: "domain",
        title: "README mục 16: bản quyền, ghi công, thành phần bên thứ ba",
        file_path: "README.md",
        lines: "859-879",
        keywords: ["mit", "sample", "hyperframes", "ghost-editor", "simple icons", "bên thứ ba"],
        content: "Giấy phép MIT, yêu cầu ghi công của tác giả, quyền dùng video mẫu, giấy phép từng thành phần bên thứ ba.",
      },
    ],
  },
  studio: {
    name: "Studio: server cục bộ, route và feature plugin",
    service: "studio",
    port: 5186,
    ssot_path: "references/studio.md",
    keywords: ["studio", "route", "feature", "plugin", "server.mjs", "api", "ctx", "addPanel", "queue", "job", "timeline.json"],
    summary: "studio/server.mjs nghe 127.0.0.1:5186, tự nạp studio/routes/*.mjs (export default ctx => handler) và studio/features/*.js (đối tượng Studio toàn cục). Việc chạy lâu là job trong scripts/queue.mjs; trạng thái lưu JSON trong thư mục dự án.",
    guardrails: [
      "Tính năng mới = một studio/routes/NN_x.mjs + một studio/features/NN_x.js theo hợp đồng ctx/Studio; không thêm framework hay cơ sở dữ liệu.",
      "Server chỉ nghe 127.0.0.1 và chỉ phục vụ file trong studio/, engine/, assets/, thư mục mẫu và thư mục dự án.",
      "Mọi /api/* cần token phiên (header X-AVS-Token, GET nhận ?avs_token=; editor gọi qua fetch đã vá trong studio/auth.js, URL media dùng avsUrl()); trang chính / và /project/* cần cookie phiên avs_s_<port> (bí mật riêng, không phải token) lấy qua link khởi chạy /?k=<token> (CLI đọc /project/ bằng header token); không bao giờ mở $AVS_HOME (~/.ai-video-studio) làm dự án; GET không được ghi file. Kiểm ở studio/security.mjs.",
    ],
    leaf_chunks: [
      {
        id: "studio-api",
        layer: "domain",
        title: "Bảng API của Studio cho script",
        file_path: "references/studio.md",
        lines: "57-80",
        keywords: ["api", "save", "export", "open", "job", "templates", "upload", "token", "origin", "avs_token"],
        content: "Token phiên, kiểm origin, giới hạn body (413/411), các đường dẫn /api/* (project, save, export, new, job, open có chặn thư mục cấu hình, media, still/srt POST, templates) và phạm vi file server phục vụ.",
      },
      {
        id: "studio-plugin",
        layer: "domain",
        title: "Hợp đồng plugin: route và feature",
        file_path: "references/studio.md",
        lines: "91-103",
        keywords: ["route", "feature", "ctx", "startJob", "addPanel", "addTopButton", "pollJob"],
        content: "Chữ ký route (ctx => (req,res,p,u) => bool), các hàm của ctx và đối tượng Studio, danh sách tính năng có sẵn theo số thứ tự.",
      },
    ],
  },
  ads: {
    name: "Cổng quảng cáo trong QC (chính sách, claim, nguyên bản)",
    service: "studio",
    port: 5186,
    ssot_path: "references/ad-gates.md",
    keywords: ["ads", "ad_gates", "qc", "policy", "claim", "originality", "meta", "tiktok", "industry", "blocked"],
    summary: "scripts/ad_gates.py soát lời thoại và chữ theo luật chính sách Meta/TikTok theo ngành, claim đã duyệt/cấm và điểm nguyên bản; scripts/ai_qc.mjs gọi nó khi timeline.ads.on và ghi vào .studio/qc.json.",
    guardrails: [
      "Cổng chỉ dò ngôn ngữ rủi ro, không tự sửa, không thay kiểm duyệt của nền tảng; với --fix một vấn đề chỉ hết khi lần soát lại trên bản đã lưu không còn thấy.",
      "Chặn xuất (scripts/export_gate.mjs): lỗi ad_policy mức cao không bỏ qua được; lỗi claim/nguyên bản bỏ qua phải ghi lý do (qc.json override + .studio/qc_overrides.log). Phiên bản A/B khai trong variants.json chỉ là INFO-AB mức thấp.",
    ],
    leaf_chunks: [
      {
        id: "ads-config",
        layer: "domain",
        title: "Bật cổng quảng cáo và cấu hình timeline.ads",
        file_path: "references/ad-gates.md",
        lines: "7-31",
        keywords: ["timeline.ads", "industry", "platforms", "claims", "originality_min", "ads.product", "Product Brain"],
        content: "Khối ads trong timeline.json: on, industry, platforms, claims (approved/prohibited/expired), blocked, product (id hồ sơ sản phẩm dùng chung ở $AVS_HOME/products/, references/products.md), originality_min; cách chạy riêng ad_gates.py.",
      },
    ],
  },
  upstream: {
    name: "Kéo bản mới từ repo gốc nguyentatkiem/ai-video-studio",
    service: "studio",
    port: 5186,
    ssot_path: "AGENTS.md",
    keywords: ["upstream", "fetch", "merge", "sync", "repo gốc", "nguyentatkiem"],
    summary: "Remote upstream chỉ kéo (push tắt). Gộp upstream/main vào nhánh riêng bằng merge --no-ff, kiểm ghi công và test, rồi mở PR Roadmap: M09.",
    guardrails: [
      "Không đẩy lên upstream, không gộp thẳng vào main; phần thêm của bản này nằm ở file mới để ít xung đột.",
    ],
    leaf_chunks: [
      {
        id: "upstream-sync",
        layer: "domain",
        title: "Quy trình kéo bản mới từ upstream",
        file_path: "AGENTS.md",
        lines: "72-87",
        keywords: ["git fetch upstream", "merge", "xung đột", "ghi công"],
        content: "Lệnh fetch, tạo nhánh chore/upstream-sync-<ngày>, merge --no-ff, xử lý xung đột, kiểm ghi công, mở PR.",
      },
    ],
  },
  workflow: {
    name: "Luật làm việc, CI và verify của bản zuzziQ",
    service: "studio",
    port: 5186,
    ssot_path: "docs/ROADMAP.md",
    keywords: ["roadmap", "ci", "gate", "verify", "unittest", "node --check", "pr-ship", "area"],
    summary: "Kế hoạch SSOT ở docs/ROADMAP.md (đợt Sxx, mục Mxx). CI một job gate: nhãn, dòng Roadmap, .rag/sync.js --check, node --check, unittest Python, node --test scripts/tests/*.test.mjs; không render video.",
    guardrails: [
      "Phần thêm nằm ở file mới; không đọc .env* hay token ~/.ai-video-studio; commit/PR không ghi tên AI.",
      "CI chạy khi PR, chạy tay và lịch tuần, một job gate không cài dependency; không render video trong CI.",
    ],
    leaf_chunks: [
      {
        id: "workflow-verify",
        layer: "domain",
        title: "Lệnh verify theo vùng đổi",
        file_path: "AGENTS.md",
        lines: "88-104",
        keywords: ["unittest", "node --check", "sync.js", "review-diff", "rủi ro high"],
        content: "Lệnh verify bước con và chốt Phase theo vùng; vùng rủi ro High (server.mjs, publish.mjs, telegram.mjs, queue.mjs).",
      },
    ],
  },
};
