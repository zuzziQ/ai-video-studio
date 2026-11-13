"""Test cho scripts/ad_gates.py. Chạy: python -m unittest discover -s scripts/tests  (không cần pytest)."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import ad_gates as g  # noqa: E402


def beats(*texts, claim=False):
    return [{"type": "body", "text": t, "claim_ids": ["c1"] if claim else []} for t in texts]


def codes(flags):
    return {f["code"] for f in flags}


def caps_of(*lines, t=0.0):
    """Mỗi dòng là một câu; các câu cách nhau 1 giây để bộ ghép câu tách đúng."""
    out = []
    for line in lines:
        words = []
        for w in line.split():
            words.append({"w": w, "s": round(t, 2), "e": round(t + 0.2, 2)})
            t += 0.25
        out.append({"t0": words[0]["s"], "t1": words[-1]["e"], "words": words})
        t += 1.0
    return out


def project(root, name, lines, ads=None, scenes=None, **tl):
    d = os.path.join(root, name)
    os.makedirs(os.path.join(d, "work"))
    with open(os.path.join(d, "work", "captions.json"), "w", encoding="utf-8") as f:
        json.dump(caps_of(*lines), f, ensure_ascii=False)
    data = {"width": 1080, "height": 1920, "duration": 20, "captions": "work/captions.json", "scenes": scenes or [],
            "audio": {"music": [{"mood": "hype"}]}, **tl}
    if ads is not None:
        data["ads"] = ads
    with open(os.path.join(d, "timeline.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return d


class Policy(unittest.TestCase):
    def test_before_after_only_for_body_industries(self):
        self.assertIn("POLICY-BEFORE-AFTER", codes(g.check_policy(beats("Nhìn da trước và sau 7 ngày"), "cosmetics")))
        self.assertNotIn("POLICY-BEFORE-AFTER", codes(g.check_policy(beats("Nhìn da trước và sau 7 ngày"), "finance")))

    def test_guarantee_personal_and_number(self):
        f = g.check_policy(beats("Cam kết hiệu quả 100%", "Bạn đang béo đúng không", "Giảm 40% thời gian"), "general")
        self.assertLessEqual({"POLICY-GUARANTEE", "POLICY-PERSONAL", "POLICY-NUMBER"}, codes(f))
        self.assertNotIn("POLICY-NUMBER", codes(g.check_policy(beats("Giảm 40% thời gian", claim=True), "general")))

    def test_platform_scope(self):
        self.assertNotIn("POLICY-ALCOHOL-TOBACCO", codes(g.check_policy(beats("Thưởng thức rượu vang"), "general", {"meta"})))
        self.assertIn("POLICY-ALCOHOL-TOBACCO", codes(g.check_policy(beats("Thưởng thức rượu vang"), "general", {"tiktok"})))

    def test_detect_industry(self):
        self.assertEqual(g.detect_industry("Serum dưỡng ẩm chăm sóc da"), "cosmetics")
        self.assertEqual(g.detect_industry("Viên uống collagen"), "supplements")
        self.assertEqual(g.detect_industry("Máy hút bụi cầm tay"), "general")
        self.assertEqual(g.detect_industry("Bộ sơn tường"), "general")   # "son" không khớp bên trong "sơn"/"sonic"


class Claims(unittest.TestCase):
    CL = [{"id": "c1", "text": "Đầu nhỏ giọt giúp kiểm soát lượng dùng mỗi lần", "status": "approved"},
          {"id": "c2", "text": "Trị dứt điểm mụn sau một tuần", "status": "prohibited"}]

    def test_similarity(self):
        self.assertEqual(g.similarity("serum dưỡng ẩm cho da", "serum dưỡng ẩm cho da"), 1.0)
        self.assertLess(g.similarity("serum dưỡng ẩm", "máy hút bụi cầm tay"), 0.2)

    def test_unapproved_citation_and_risky_phrase_block(self):
        f = g.check_script_claims([{"type": "body", "text": "Sản phẩm thần kỳ", "claim_ids": ["zzz"]}], self.CL)
        self.assertEqual([x["severity"] for x in f], ["critical", "critical"])

    def test_miscited_benefit_is_blocked(self):
        f = g.check_script_claims([{"type": "hook", "text": "Serum Mẫu A giúp dưỡng da hiệu quả", "claim_ids": ["c1"]}], self.CL)
        self.assertIn("BLOCK-01", codes(f))
        ok = g.check_script_claims([{"type": "body", "text": "Đầu nhỏ giọt giúp bạn kiểm soát lượng dùng", "claim_ids": ["c1"]}], self.CL)
        self.assertNotIn("BLOCK-01", codes(ok))
        warn = g.check_script_claims([{"type": "body", "text": "Sản phẩm giúp da mịn hơn", "claim_ids": []}], self.CL)
        self.assertIn("WARN-CLAIM", codes(warn))

    def test_prohibited_claim_blocks(self):
        f = g.check_script_claims([{"type": "body", "text": "trị dứt điểm mụn sau một tuần thôi", "claim_ids": []}], self.CL)
        self.assertTrue(any("bị cấm" in x["message"] for x in f))

    def test_risky_phrase_needs_word_boundary(self):
        # lỗi của bản gốc: "số 1" khớp "số 15", "100%" khớp "1100%"
        f = g.check_script_claims([{"type": "cta", "text": "Ghé cửa hàng số 15 Lê Lợi, doanh số tăng 1100% rồi"}], [])
        self.assertNotIn("BLOCK-01", codes(f))
        f = g.check_script_claims([{"type": "cta", "text": "Thương hiệu số 1, an toàn 100%."}], [])
        self.assertEqual(len([x for x in f if x["code"] == "BLOCK-01"]), 2)

    def test_blocked_list(self):
        f = g.check_script_claims([{"type": "cta", "text": "Rẻ hơn Đối Thủ X nhiều"}], [], ["đối thủ x"])
        self.assertIn("BLOCK-01", codes(f))

    def test_number_supported_by_claim(self):
        cl = [{"id": "c1", "text": "Pin dùng 12 giờ xem video", "status": "approved"}]
        self.assertEqual(g.check_script_claims([{"type": "cta", "text": "Pin 12 giờ"}], cl), [])
        self.assertIn("WARN-CLAIM", codes(g.check_script_claims([{"type": "cta", "text": "Pin 120 giờ"}], cl)))
        self.assertIn("WARN-CLAIM", codes(g.check_script_claims([{"type": "cta", "text": "Nhanh hơn 40%"}], cl)))
        # giá tiền, địa chỉ, thông số không phải số đo hiệu quả
        self.assertEqual(g.check_script_claims([{"type": "cta", "text": "Giá 12.490.000đ tại số 15 Lê Lợi, mã NOVA15, camera 200MP"}], cl), [])


class Originality(unittest.TestCase):
    A = {"id": "a", "text": "serum dưỡng ẩm cho da khô mùa đông", "hook": "da khô mùa đông", "scenes": ["s1", "s2", "s3"],
         "format": "review", "font": "review", "voice": {"voice": "v1", "provider": None, "rate": [1]}, "music": ["hype"]}

    def test_composite_rewards_real_differences(self):
        same = g.composite_similarity(self.A, dict(self.A))
        self.assertEqual(same["total"], 1.0)
        b = {**self.A, "text": "máy hút bụi cầm tay cho nhà nhỏ", "hook": "nhà nhỏ dọn sao", "scenes": ["s7", "s8"],
             "format": "kinetic", "voice": {"voice": "v2", "provider": None, "rate": [1.1]}, "music": ["calm"]}
        self.assertLess(g.composite_similarity(self.A, b)["total"], 0.1)

    def test_originality_picks_nearest(self):
        far = {**self.A, "id": "far", "text": "nội dung hoàn toàn khác biệt về xe máy", "hook": "xe máy", "scenes": ["x"]}
        o = g.originality(self.A, [far, {**self.A, "id": "twin"}])
        self.assertEqual(o["nearest"], "twin")
        self.assertEqual(o["score"], 0.0)
        self.assertFalse(o["ok"])
        self.assertIsNone(g.originality(self.A, []))


class Project(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_sentences_split_on_gap_and_punctuation(self):
        s = g.sentences(caps_of("Xin chào các bạn.", "hôm nay mình review serum"))
        self.assertEqual([x["text"] for x in s], ["Xin chào các bạn.", "hôm nay mình review serum"])
        caps = caps_of("a b.")
        caps[0]["words"].append({"w": "c", "s": 0.5, "e": 0.7})
        self.assertEqual(len(g.sentences(caps)), 2)
        self.assertEqual(g.sentences([{"hidden": True, "words": [{"w": "x", "s": 0, "e": 1}]}]), [])

    def test_off_by_default(self):
        d = project(self.tmp.name, "p", ["Cam kết hiệu quả 100%"])
        self.assertEqual(g.run(d), {"enabled": False, "issues": []})

    def test_run_flags_speech_and_screen_text(self):
        scenes = [{"type": "rv_callout", "t0": 3.0, "t1": 5, "text": "Trị dứt điểm mụn", "image": "media/a.png", "color": "#ff0000"},
                  {"type": "text", "t0": 6, "t1": 7, "text": "Cam kết hiệu quả", "hidden": True}]
        d = project(self.tmp.name, "p", ["Serum này cam kết hiệu quả sau 7 ngày", "ghé cửa hàng số 15 Lê Lợi nhé"],
                    ads={"on": True, "industry": "cosmetics"}, scenes=scenes)
        r = g.run(d)
        self.assertTrue(r["enabled"] and r["blocked"])
        self.assertEqual(r["industry"], "cosmetics")
        pol = [i for i in r["issues"] if i["kind"] == "ad_policy"]
        self.assertIn("POLICY-GUARANTEE", {i["code"] for i in pol})
        med = [i for i in pol if i["code"] == "POLICY-MEDICAL"]
        self.assertEqual((len(med), med[0]["t"]), (1, 3.0))       # chữ trên màn hình, đúng thời điểm scene
        self.assertIn("chữ trên màn hình", med[0]["msg"])
        self.assertFalse(any("số 15" in i["msg"] and i["kind"] == "ad_claim" for i in r["issues"]))
        self.assertFalse(any("media/a.png" in i["msg"] or "#ff0000" in i["msg"] for i in r["issues"]))
        self.assertIsNone(r["originality"])                       # không có phiên bản nào để so

    def test_clean_script_passes_and_industry_is_detected(self):
        d = project(self.tmp.name, "p", ["Serum dưỡng ẩm có đầu nhỏ giọt tiện dùng"], ads={"on": True})
        r = g.run(d)
        self.assertEqual((r["industry"], r["blocked"], r["issues"]), ("cosmetics", False, []))

    def test_claims_need_evidence_only_when_claims_declared(self):
        lines = ["Sản phẩm giúp da mịn hơn"]
        self.assertEqual(g.run(project(self.tmp.name, "a", lines, ads={"on": True, "industry": "general"}))["issues"], [])
        ads = {"on": True, "industry": "general", "claims": [{"text": "Đầu nhỏ giọt giúp kiểm soát lượng dùng"}]}
        r = g.run(project(self.tmp.name, "b", lines, ads=ads))
        self.assertEqual([(i["kind"], i["severity"]) for i in r["issues"]], [("ad_claim", "med")])
        self.assertFalse(r["blocked"])

    def test_originality_against_variants(self):
        lines = ["Serum dưỡng ẩm cho da khô mùa đông", "dùng hai lần mỗi ngày"]
        base = project(self.tmp.name, "base", lines, ads={"on": True, "industry": "general"}, pack="review")
        twin = project(self.tmp.name, "base_v1", lines, pack="review")
        other = project(self.tmp.name, "base_v2", ["Máy hút bụi cầm tay cho nhà nhỏ", "pin dùng bốn mươi phút"], pack="kinetic",
                        scenes=[{"type": "text", "t0": 1, "t1": 2, "text": "Gọn nhẹ"}])
        with open(os.path.join(base, "variants.json"), "w", encoding="utf-8") as f:
            json.dump({"base": base, "variants": [{"dir": other}]}, f)
        r = g.run(base)
        self.assertTrue(r["originality"]["ok"])
        self.assertEqual(r["originality"]["compared"], 1)
        r = g.run(base, [twin])
        self.assertFalse(r["originality"]["ok"])
        self.assertEqual(os.path.basename(r["originality"]["nearest"]), "base_v1")
        self.assertEqual([i["code"] for i in r["issues"] if i["kind"] == "ad_originality"], ["BLOCK-04"])
        self.assertTrue(r["blocked"])

    # ---- M17: phiên bản A/B của "Tạo phiên bản" (scripts/variants.mjs)
    def _ab_group(self, kind="hook", ab_test=None, hooks=("Bạn đã biết điều này?", "Sự thật ít ai nói")):
        lines = ["Serum dưỡng ẩm cho da khô mùa đông", "dùng hai lần mỗi ngày"]
        base = project(self.tmp.name, "base", lines, ads={"on": True, "industry": "general"}, pack="review")
        vs = []
        for k, h in enumerate(hooks, 1):
            sc = [{"type": "text", "t0": 0.05, "t1": 2.8, "_variant": True, "lines": [{"text": h.upper()}]}] if h else []
            vs.append(project(self.tmp.name, f"base_v{k}", lines, ads={"on": True, "industry": "general"}, pack="review",
                              scenes=sc, _variant={"base": base, "i": k, "kind": kind}))
        v = {"base": base, "kind": kind, "variants": [{"dir": x} for x in vs]}
        if ab_test is not None:
            v["ab_test"] = ab_test
        with open(os.path.join(base, "variants.json"), "w", encoding="utf-8") as f:
            json.dump(v, f)
        return base, vs

    def test_hook_only_ab_variants_are_a_low_reminder(self):
        base, vs = self._ab_group()
        r = g.run(vs[0])
        orig = [i for i in r["issues"] if i["kind"] == "ad_originality"]
        self.assertEqual([(i["code"], i["severity"]) for i in orig], [("INFO-AB", "low")])
        self.assertFalse(r["blocked"])
        self.assertTrue(r["originality"]["ab"])
        self.assertLess(r["originality"]["parts"]["hook"], g.AB_SAME)     # hook = chữ trên màn hình 3 giây đầu
        self.assertEqual(r["originality"]["compared"], 2)                   # gốc + bản kia, không tự so với chính nó

    def test_undeclared_group_still_blocks(self):
        base, vs = self._ab_group(ab_test=False)
        r = g.run(vs[0])
        self.assertEqual([i["code"] for i in r["issues"] if i["kind"] == "ad_originality"], ["BLOCK-04"])
        self.assertTrue(r["blocked"])

    def test_ab_group_with_identical_hooks_blocks(self):
        base, vs = self._ab_group(hooks=("Cùng một câu hook", "Cùng một câu hook"))
        r = g.run(vs[0])
        orig = [i for i in r["issues"] if i["kind"] == "ad_originality"]
        self.assertTrue(any(i["code"] == "BLOCK-04" and "giống hệt" in i["msg"] for i in orig))

    def test_outside_copy_blocks_even_inside_ab_group(self):
        base, vs = self._ab_group()
        twin = project(self.tmp.name, "copy", ["Serum dưỡng ẩm cho da khô mùa đông", "dùng hai lần mỗi ngày"], pack="review",
                       scenes=[{"type": "text", "t0": 0.05, "t1": 2.8, "lines": [{"text": "BẠN ĐÃ BIẾT ĐIỀU NÀY?"}]}])
        r = g.run(vs[0], [twin])
        self.assertIn(("BLOCK-04", "high"), [(i["code"], i["severity"]) for i in r["issues"] if i["kind"] == "ad_originality"])
        self.assertTrue(r["blocked"])

    def test_self_is_excluded_when_paths_are_spelled_differently(self):
        base, vs = self._ab_group()
        alias = vs[0] + os.sep + "." + os.sep                               # cùng thư mục, viết khác
        self.assertFalse(any(g.same_dir(x, alias) for x in g.sibling_dirs(alias, {"_variant": {"base": base}})))
        self.assertTrue(g.same_dir(vs[0], alias))
        self.assertEqual(len(g.sibling_dirs(alias, {"_variant": {"base": base}})), 2)


def write_product(home, pid, **fields):
    d = os.path.join(home, "products")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, pid + ".json"), "w", encoding="utf-8") as f:
        json.dump({"version": 1, "id": pid, "name": "Serum X", **fields}, f, ensure_ascii=False)
    return d


class Products(unittest.TestCase):
    """Product Brain (M18): `ads.product` trỏ tới $AVS_HOME/products/<id>.json."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = os.path.join(self.tmp.name, "home")
        old = os.environ.get("AVS_HOME")
        os.environ["AVS_HOME"] = self.home
        self.addCleanup(lambda: os.environ.__setitem__("AVS_HOME", old) if old is not None else os.environ.pop("AVS_HOME", None))
        self.claims = [
            {"id": "c1", "text": "Đầu nhỏ giọt giúp kiểm soát lượng dùng", "status": "approved", "evidence": "Thử nghiệm nội bộ 2026"},
            {"id": "c2", "text": "Trị dứt điểm mụn sau một tuần", "status": "prohibited"},
            {"id": "c3", "text": "Giúp da mịn hơn sau 14 ngày", "status": "approved", "evidence": "Báo cáo lab", "expires": "2020-01-01"},
            {"id": "c4", "text": "Dưỡng ẩm suốt 24 giờ", "status": "approved"},          # thiếu bằng chứng → coi là pending
        ]
        write_product(self.home, "serum-x", industry="cosmetics", claims=self.claims, blocked=["tên đối thủ"])

    def test_bad_ids_never_leave_the_products_folder(self):
        for bad in ["../config", "..", "a/b", "a\\b", "C:x", "Serum", ".hidden", "a.json", "x" * 65, "", None, 5, "ok\n"]:
            with self.assertRaises(g.ProductError, msg=repr(bad)):
                g.product_file(bad)
        self.assertTrue(g.product_file("serum-x").endswith(os.path.join("products", "serum-x.json")))

    def test_symlink_out_of_products_is_refused(self):
        outside = os.path.join(self.tmp.name, "secret.json")
        with open(outside, "w", encoding="utf-8") as f:
            f.write("{}")
        try:
            os.symlink(outside, os.path.join(self.home, "products", "evil.json"))
        except (OSError, NotImplementedError):
            self.skipTest("không tạo được symlink trên máy này")
        with self.assertRaises(g.ProductError):
            g.load_product("evil")

    def test_claim_status_needs_evidence_and_respects_expiry(self):
        st = [g.claim_status(c, "2026-11-13") for c in self.claims]
        self.assertEqual(st, ["approved", "prohibited", "expired", "pending"])
        self.assertEqual(g.claim_status({"status": "weird"}), "pending")

    def test_resolve_merges_product_with_legacy_claims(self):
        cfg = {"on": True, "product": "serum-x", "claims": [{"id": "c1", "text": "Chai thuỷ tinh tái chế"}], "blocked": ["TÊN ĐỐI THỦ", "giá rẻ nhất"]}
        r = g.resolve_ads(cfg, today="2026-11-13")
        self.assertEqual(r["industry"], "cosmetics")
        self.assertEqual([c["id"] for c in r["claims"]], ["serum-x:c1", "serum-x:c2", "serum-x:c3", "serum-x:c4", "c1"])
        self.assertEqual([c["status"] for c in r["claims"]], ["approved", "prohibited", "expired", "pending", "approved"])
        self.assertEqual(r["blocked"], ["TÊN ĐỐI THỦ", "giá rẻ nhất"])       # trùng không phân biệt hoa/thường
        self.assertEqual(r["product"], {"id": "serum-x", "name": "Serum X", "claims": 4, "approved": 1})
        self.assertEqual(r["issues"], [])

    def test_project_with_product_is_checked_against_its_claims(self):
        lines = ["Trị dứt điểm mụn sau một tuần", "Đầu nhỏ giọt giúp kiểm soát lượng dùng", "Nói về tên đối thủ"]
        r = g.run(project(self.tmp.name, "p", lines, ads={"on": True, "product": "serum-x"}))
        self.assertEqual((r["industry"], r["product"]["id"], r["claims"]), ("cosmetics", "serum-x", {"approved": 1, "other": 3}))
        msgs = [i["msg"] for i in r["issues"] if i["code"] == "BLOCK-01"]
        self.assertTrue(any("Trùng claim bị cấm" in m for m in msgs))
        self.assertTrue(any("tên đối thủ" in m for m in msgs))
        self.assertFalse(any("kiểm soát lượng dùng" in i["msg"] and i["kind"] == "ad_claim" for i in r["issues"]))
        self.assertTrue(r["blocked"])

    def test_missing_or_bad_product_blocks_with_overridable_claim_issue(self):
        for pid in ("khong-co", "../x"):
            r = g.run(project(self.tmp.name, "p" + str(len(pid)), ["Serum dưỡng ẩm"], ads={"on": True, "product": pid}))
            miss = [i for i in r["issues"] if i["code"] == "PRODUCT-MISSING"]
            self.assertEqual([(i["kind"], i["severity"]) for i in miss], [("ad_claim", "high")])
            self.assertTrue(r["blocked"])
            self.assertIn("error", r["product"])

    def test_legacy_project_without_product_is_unchanged(self):
        ads = {"on": True, "industry": "general", "claims": [{"text": "Đầu nhỏ giọt giúp kiểm soát lượng dùng"}]}
        r = g.run(project(self.tmp.name, "p", ["Sản phẩm giúp da mịn hơn"], ads=ads))
        self.assertIsNone(r["product"])
        self.assertEqual([(i["kind"], i["severity"]) for i in r["issues"]], [("ad_claim", "med")])

    def test_check_script_uses_product_and_reports_beat_index(self):
        payload = {"ads": {"on": True, "product": "serum-x"},
                   "beats": [{"text": "Đầu nhỏ giọt giúp kiểm soát lượng dùng", "type": "hook"}, {"text": "  "},
                             {"text": "Trị dứt điểm mụn sau một tuần", "type": "body"}]}
        r = g.check_script(payload)
        self.assertTrue(r["blocked"])
        self.assertEqual(r["industry"], "cosmetics")
        self.assertEqual({i["beat"] for i in r["issues"] if i["severity"] == "high"}, {2})   # chỉ số trong payload
        self.assertEqual([c["text"] for c in r["approved"]], ["Đầu nhỏ giọt giúp kiểm soát lượng dùng"])
        self.assertIn("Trị dứt điểm mụn sau một tuần", r["prohibited"])
        self.assertIn("tên đối thủ", r["blocked_phrases"])

    def test_check_script_missing_product_is_blocked(self):
        r = g.check_script({"ads": {"product": "khong-co"}, "beats": []})
        self.assertTrue(r["blocked"])
        self.assertEqual(r["issues"][0]["code"], "PRODUCT-MISSING")
        self.assertIsNone(r["issues"][0]["beat"])


if __name__ == "__main__":
    unittest.main()
