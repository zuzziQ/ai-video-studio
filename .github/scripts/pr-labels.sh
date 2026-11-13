#!/usr/bin/env bash
# Gán nhãn type/, area/, size/ cho PR từ tiêu đề Conventional Commit và số dòng đổi. Chạy như MỘT BƯỚC của job `gate`
# (templates/ci-gate.workflow.yml), không phải job riêng: một job riêng tính tối thiểu 1 phút mỗi lần (docs/CI-BUDGET.md, W1).
#
# Vào (biến môi trường): GH_TOKEN, PR_NUMBER, PR_TITLE (qua env, không nhúng vào lệnh), GITHUB_REPOSITORY.
# Quy tắc: type/ theo kiểu commit, area/<scope> cho mỗi scope (cách nhau bằng dấu phẩy) nếu repo CÓ nhãn đó, size/ theo số dòng.
# Chỉ đụng nhãn có tiền tố type/, area/, size/ (nhãn tay như risk/ và status/ không bao giờ bị xóa). Tiêu đề không theo
# Conventional Commit thì không làm gì. Không bao giờ làm job đỏ (PR từ fork có token chỉ đọc).
# Cần quyền `pull-requests: write` trong workflow.

set -u

if [ -z "${PR_NUMBER:-}" ]; then
  echo "pr-labels: không có PR_NUMBER, bỏ qua"
  exit 0
fi

title="${PR_TITLE:-}"
re='^([a-z]+)(\(([^)]*)\))?(!)?: '
if ! [[ "$title" =~ $re ]]; then
  echo "pr-labels: tiêu đề không theo Conventional Commit, không gán nhãn"
  exit 0
fi
ctype="${BASH_REMATCH[1]}"
scopes="${BASH_REMATCH[3]}"

case "$ctype" in
  feat) tlabel="type/feature" ;;
  fix) tlabel="type/bug" ;;
  perf) tlabel="type/perf" ;;
  refactor) tlabel="type/refactor" ;;
  docs) tlabel="type/docs" ;;
  test) tlabel="type/test" ;;
  ci) tlabel="type/ci" ;;
  chore | build | style | revert) tlabel="type/chore" ;;
  *)
    echo "pr-labels: kiểu commit lạ ($ctype), không gán nhãn"
    exit 0
    ;;
esac

existing="$(gh label list --limit 300 --json name --jq '.[].name' 2>/dev/null || true)"
has_label() { printf '%s\n' "$existing" | grep -Fxq -- "$1"; }

lines="$(gh pr view "$PR_NUMBER" --json additions,deletions --jq '.additions + .deletions' 2>/dev/null || true)"
case "$lines" in '' | *[!0-9]*) lines="" ;; esac

desired=()
has_label "$tlabel" && desired+=("$tlabel")

IFS=',' read -r -a parts <<<"$scopes"
for s in "${parts[@]:-}"; do
  s="$(printf '%s' "$s" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
  [ -n "$s" ] && has_label "area/$s" && desired+=("area/$s")
done

if [ -n "$lines" ]; then
  if [ "$lines" -lt 30 ]; then size="XS"
  elif [ "$lines" -lt 100 ]; then size="S"
  elif [ "$lines" -lt 300 ]; then size="M"
  elif [ "$lines" -lt 1000 ]; then size="L"
  else size="XL"; fi
  has_label "size/$size" && desired+=("size/$size")
fi

current="$(gh pr view "$PR_NUMBER" --json labels --jq '.labels[].name' 2>/dev/null || true)"

add=()
for d in "${desired[@]:-}"; do
  [ -n "$d" ] || continue
  printf '%s\n' "$current" | grep -Fxq -- "$d" || add+=("$d")
done

remove=()
while IFS= read -r c; do
  case "$c" in
    type/* | area/* | size/*)
      keep=0
      for d in "${desired[@]:-}"; do [ "$d" = "$c" ] && keep=1; done
      [ "$keep" = 0 ] && remove+=("$c")
      ;;
  esac
done <<<"$current"

args=()
if [ "${#add[@]}" -gt 0 ]; then
  args+=(--add-label "$(IFS=,; echo "${add[*]}")")
fi
if [ "${#remove[@]}" -gt 0 ]; then
  args+=(--remove-label "$(IFS=,; echo "${remove[*]}")")
fi

if [ "${#args[@]}" -eq 0 ]; then
  echo "pr-labels: nhãn đã đúng"
  exit 0
fi

echo "pr-labels: gh pr edit $PR_NUMBER ${args[*]}"
gh pr edit "$PR_NUMBER" "${args[@]}" || echo "pr-labels: không sửa được nhãn (token chỉ đọc?), bỏ qua"
exit 0
