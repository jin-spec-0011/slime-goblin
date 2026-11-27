"""어두운 단색 배경(회색) 걷기 영상 -> 걷기 시트 + 정지 이미지

사용:
  ffmpeg -i 영상.mp4 프레임폴더/f_%03d.png
  python3 tools/extract_walk_dark.py 프레임폴더 assets 시작 끝 간격 이름
  예) python3 tools/extract_walk_dark.py /tmp/frames assets 30 90 4 goblin_glutton_walk

- 테두리에서 시작해 '채도가 낮은 회색(배경·바닥 그림자)'만 지운다 (외곽선처럼 아주 어두운 색은 보존)
- 가장 큰 연결 덩어리만 남겨 먼지·반짝이 효과를 버린다
- 제자리 걷기이므로 모든 프레임의 합집합 영역으로 잘라 흔들림을 막는다
- 높이 220px로 맞춰 가로로 이어 붙인 시트와 첫 프레임 정지 이미지를 저장한다
"""
import sys
from collections import deque
from PIL import Image


def remove_dark_bg(im, lo=40, hi=95, sat=9):
    im = im.convert('RGBA'); w, h = im.size; px = im.load(); seen = bytearray(w * h)

    def is_bg(c):
        r, g, b = c[:3]
        return max(r, g, b) - min(r, g, b) <= sat and lo <= (r + g + b) / 3 <= hi

    q = deque((x, y) for x in range(w) for y in (0, h - 1))
    q.extend((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft(); i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    return im


def keep_largest(im):
    w, h = im.size; px = im.load(); seen = bytearray(w * h); comps = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy][3] == 0:
                continue
            comp, q = [], deque([(sx, sy)]); seen[sy * w + sx] = 1
            while q:
                x, y = q.popleft(); comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3] > 0:
                        seen[ny * w + nx] = 1; q.append((nx, ny))
            comps.append(comp)
    if not comps:
        return im
    keep = set(max(comps, key=len))
    for comp in comps:
        if len(comp) and comp[0] not in keep:
            for x, y in comp:
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    if len(sys.argv) != 7:
        print(__doc__); sys.exit(1)
    src, out, start, end, step, name = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
    frames = [keep_largest(remove_dark_bg(Image.open(f'{src}/f_{i:03d}.png'))) for i in range(start, end + 1, step)]
    boxes = [f.getbbox() for f in frames]
    ub = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    frames = [f.crop(ub) for f in frames]
    fw, fh = frames[0].size
    k = 220 / fh; tw = round(fw * k)
    sheet = Image.new('RGBA', (tw * len(frames), 220), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f.resize((tw, 220), Image.LANCZOS), (i * tw, 0))
    sheet.save(f'{out}/{name}.png')
    still = sheet.crop((0, 0, tw, 220)); still.crop(still.getbbox()).save(f'{out}/' + name.replace('_walk', '') + '.png')
    print(name, 'frames', len(frames), 'frame', tw, 'x 220')


if __name__ == '__main__':
    main()
