// "Bám lời thoại" (studio/routes/27_tplfit.mjs → scripts/tpl_fit.mjs): after "Dùng mẫu" every template scene is re-timed to the
// sentence it belongs to, its placeholder text rewritten from the speech, sample photos replaced by photos found for that
// sentence and caption keywords highlighted. Projects without captions get them first (whisper). library.js calls
// Studio.fitTemplate(tpl) right after applying a template; the project tab has a button to run it again. One ⌘Z undoes it
// together with the template.
'use strict';
(() => {
  const S = Studio, esc = S.esc;
  const css = document.createElement('style');
  css.textContent = `.tf-p { margin: 0 0 var(--space-2); } .tf-el { font-size: var(--text-2xs); margin-top: var(--space-1); }`;
  document.head.appendChild(css);
  let busy = false;
  // S26 M186: chạy nền trong khay việc, không hộp chờ giữa màn hình. Server ghi lại timeline.json lúc xong → khoá sửa timeline tới khi xong.
  // Xong thì thẻ ghi tóm tắt; còn lưu ý (Claude lỗi, thiếu key ảnh, chỗ lời thoại không nhắc tới) thì nút "Xem chi tiết" mở hộp.
  S.fitTemplate = async (tpl, o = {}) => {
    if (busy) return;
    busy = true;
    if (!await S.saveNow()) { busy = false; return; }
    const t = await S.jobs.start('/api/tplfit', { claude: o.claude !== false, images: o.images !== false }, { kind: 'tplfit',
      title: `Mẫu ${tpl?.name ? '“' + tpl.name + '” ' : ''}khớp lời thoại`, note: 'Canh graphic đúng lúc nói, viết lại chữ, thay ảnh mẫu theo lời nói, nhấn từ khoá phụ đề',
      onDone: done, onFail: fail });
    busy = false;
    return t;
  };
  const fail = j => ({ text: `${j.step || 'Chưa làm mẫu khớp lời thoại được'}. Mẫu đã được áp dụng nhưng chữ và ảnh vẫn là nội dung mẫu: kiểm tra video có tiếng nói rồi bấm “Bám lời thoại” ở tab Dự án để thử lại.` });
  async function done(j) {
    await S.reload();
    const x = j.out || {}, miss = [...new Set(x.missing || [])];
    const tr = x.transcribed ? `Đã tạo lời thoại (${x.transcribed.words} từ). ` : '';
    // nothing from a template on the timeline: say so instead of "khớp: 0 chữ, 0 ảnh, 0 cảnh" (no model call happened)
    if (!x.fit) return { text: `${tr}Chưa có cảnh mẫu để bám lời thoại: chọn một mẫu ở panel Mẫu rồi bấm “Dùng mẫu”, mẫu sẽ tự bám lời thoại.`, toast: 'Chưa có cảnh mẫu để bám lời thoại' };
    // free libraries only (no Pexels/Pixabay key): photos that do not match are skipped, so suggest adding a key
    const key = x.noStockKey ? `<p class="muted"><i class="ti ti-key"></i> Ảnh chỉ tìm trong thư viện miễn phí (Openverse/Commons), ảnh không khớp lời thoại được bỏ qua. Thêm key Pexels hoặc Pixabay (panel <b>B-roll AI</b> → nút <b>⚙ Key</b>) để có ảnh khớp hơn.</p>` : '';
    const ai = x.claude && x.claude !== 'ok' ? `<p class="muted"><i class="ti ti-alert-triangle"></i> Không dùng được Claude (${esc(x.claude)}), chữ được lấy thẳng từ lời nói — nên đọc lại.</p>` : '';
    const sum = `${x.fit} cảnh canh theo câu nói · ${x.texts} chữ viết lại · ${x.images} ảnh theo lời thoại${x.hl ? ` · ${x.hl} từ khoá phụ đề` : ''}`;
    const acts = [{ label: 'Hoàn tác', icon: 'ti-arrow-back-up', on: () => { undo(); S.toast('Đã hoàn tác'); return 'close'; } }];
    if (miss.length || ai || key) acts.unshift({ label: 'Xem chi tiết', icon: 'ti-list-details', primary: true, on: () => S.modal(`<h3><i class="ti ti-check"></i> Mẫu đã khớp lời thoại</h3>
      <p>${esc(tr)}${sum}.</p>${ai}${key}
      ${miss.length ? `<p class="muted">Còn ${miss.length} chỗ lời thoại không nhắc tới, bạn tự sửa nhé: ${miss.slice(0, 8).map(esc).join(' · ')}</p>` : ''}
      <div class="actions"><button class="primary" onclick="closeModal()">OK</button></div>`) });
    return { text: tr + sum + (miss.length || ai || key ? ' · có lưu ý' : ''), toast: `Mẫu đã khớp lời thoại: ${x.texts} chữ, ${x.images} ảnh, ${x.fit} cảnh — ⌘Z để hoàn tác`, acts };
  }
  S.jobs.resumable('tplfit', () => ({ onDone: done, onFail: fail }));
  document.addEventListener('click', e => { if (e.target.closest('[data-pact="tplfit"]')) { S.pushUndo(); S.fitTemplate(); } });
})();
