"""python -m edge_tts --voice V --text T --write-media F → ghi F (vài byte) và in giọng đã nhận; không gọi mạng."""
import sys

a = sys.argv[1:]
out = a[a.index("--write-media") + 1]
with open(out, "wb") as f:
    f.write(b"FAKE-MP3 " + a[a.index("--voice") + 1].encode())
print("fake edge_tts", a[a.index("--voice") + 1])
