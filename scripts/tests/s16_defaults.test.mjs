// S16 M120: mặc định của dự án mới / Tự lái không mang nhãn trình diễn (Claude) và a-roll tràn khung khi nguồn đúng khổ.
import test from 'node:test';
import assert from 'node:assert/strict';

const { endCard } = await import('../new_project.mjs');
const { autoPack } = await import('../autopilot.mjs');

test('endCard: có thương hiệu → tên + viên logo; không có → tiêu đề trống, không viên', () => {
  assert.deepEqual(endCard({ name: 'Tiệm Bánh Mây', logo: 'media/brand_x.png' }), { title: 'Tiệm Bánh Mây', pill: { icon: 'media/brand_x.png', text: 'Tiệm Bánh Mây' } });
  assert.deepEqual(endCard({ name: 'A' }), { title: 'A', pill: { icon: '', text: 'A' } });
  assert.deepEqual(endCard(null, 'Tiêu đề dự án'), { title: 'Tiêu đề dự án', pill: false });
  const e = endCard({});
  assert.deepEqual(e.title, [{ text: '' }]); // mảng không rỗng: engine không rơi về "SKILL AI EDIT VIDEO"
  assert.equal(e.pill, false);
});

test('autoPack: khổ tự chọn → basic (a-roll tràn khung); không đọc được video → basic', () => {
  assert.equal(autoPack('khong-co.mp4'), 'basic');
  assert.equal(autoPack('khong-co.mp4', 'auto'), 'basic');
  assert.equal(autoPack('khong-co.mp4', 'vertical'), 'basic');
});
