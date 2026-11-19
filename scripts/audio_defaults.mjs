// Âm thanh mặc định của dự án mới (S26 M181). Gain −20 cộng bộ nén sidechain cũ (duck vắng) làm nhạc thấp hơn giọng ~42 dB
// (đo trên sample/video-goc.mov: −41,5 dB), QC báo "Nhạc quá nhỏ". Gain −10 + hạ nhạc theo lời nói (VAD, −10 dB) cho ~−22 dB,
// giữa khoảng 18–26 dB mà ai_qc.mjs nhắm tới. Bản trình duyệt (studio/studio.js applyRecipe) giữ cùng hai số này.
export const DEFAULT_MUSIC_GAIN = -10;
export const DEFAULT_DUCK = { on: true, amount_db: -10, attack: 60, release: 400, hold: 250 };

/** audio của timeline mới: giọng + mix + một lớp nhạc nền phủ hết video. */
export function defaultAudio(total, mood = 'tech') {
  return { voice: 'work/aroll.mp4', mix: 'work/mix.wav', music: [{ t0: 0, t1: total, mood, gain: DEFAULT_MUSIC_GAIN }], sfx: [], duck: { ...DEFAULT_DUCK } };
}
