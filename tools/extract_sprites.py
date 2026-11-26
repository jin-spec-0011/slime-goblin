"""참고 이미지(제미나이 생성)에서 고블린·슬라임 스프라이트를 잘라 배경을 투명 처리한다.
사용: python3 tools/extract_sprites.py <참고이미지_폴더> <출력폴더>
좌표는 1932px 표시 기준(원본 2000px)이며"""
import sys
from collections import deque
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
S = 2000 / 1932

# 이름: (파일, x0, y0, x1, y1, 표시좌표 여부, 배경 허용오차)
BOXES = {
    # 원소 슬라임 (이미지 2 상단 로스터)
    'slime_O':  ('2.webp', 312, 122, 443, 238, True, 38),
    'slime_C':  ('2.webp', 650, 122, 795, 238, True, 38),
    'slime_He': ('2.webp', 822, 122, 945, 238, True, 38),
    'slime_Na': ('2.webp', 1145, 122, 1295, 238, True, 38),
    'slime_U':  ('2.webp', 1740, 122, 1865, 238, True, 38),
    # 화합물/혼합물/메가
    'slime_H2O':  ('2.webp', 1090, 895, 1265, 1035, True, 38),
    'slime_NH3':  ('2.webp', 1660, 875, 1855, 1045, True, 38),
    'slime_mix':  ('1.webp', 1615, 440, 1715, 510, True, 38),
    'slime_mega': ('4.webp', 1645, 565, 1835, 720, True, 30),
    # 슬라임 시트(7.webp, 어두운 체크 배경, 표시좌표) - 레벨 글자가 몸통 밖에 있는 것만 사용
    'slime_H':    ('7.webp', 425, 1350, 615, 1485, True, 'checker_dark'),
    'slime_Cl':   ('7.webp', 645, 1350, 830, 1485, True, 'checker_dark'),
    'slime_S':    ('7.webp', 1295, 1280, 1505, 1485, True, 'checker_dark'),
    'slime_Fe':   ('7.webp', 195, 1320, 395, 1495, True, 'checker_dark_strict'),
    'slime_N':    ('7.webp', 425, 1650, 615, 1835, True, 'checker_dark'),
    'slime_NaCl': ('7.webp', 1525, 1330, 1765, 1535, True, 'checker_dark'),
    # 고블린 로스터(6.webp, 체크무늬 배경, 원본 좌표) -> 게임 8종
    'goblin_normal':  ('6.webp', 105, 90, 325, 300, False, 'checker'),   # Goblin Roster (Draft)
    'goblin_fighter': ('6.webp', 425, 90, 635, 350, False, 'checker'),   # Shield Goblin
    'goblin_mage':    ('6.webp', 770, 440, 990, 670, False, 'checker'),  # Mage Goblin
    'goblin_rider':   ('6.webp', 95, 460, 370, 670, False, 'checker'),   # Spear Goblin
    'goblin_archer':  ('6.webp', 440, 460, 665, 670, False, 'checker'),  # Archer Goblin
    'goblin_captain': ('6.webp', 1665, 50, 1920, 325, False, 'checker'), # Goblin King
    # goblin_giant(정지 그림)은 영상 걷기 시트의 첫 프레임을 쓴다 (video 모드에서 생성). Ogre Chieftain(8.webp)은 사용 안 함
    'goblin_smart':   ('6.webp', 1390, 440, 1550, 670, False, 'checker'),# Rogue Goblin
    'item_catalyst':  ('6.webp', 835, 790, 920, 920, False, 'checker'),  # Catalyst
    'goblin_gasmask': ('6.webp', 745, 85, 960, 305, False, 'checker'),  # Gasmask Goblin
    'goblin_armored': ('6.webp', 1065, 450, 1255, 670, False, 'checker'),# Armored Goblin
    'goblin_shaman':  ('6.webp', 1325, 45, 1640, 335, False, 'checker'), # Shaman Goblin
    'goblin_cook':    ('6.webp', 1715, 405, 1985, 672, False, 'checker'),# Cook Goblin
}

def similar(a, b, tol):
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2]) <= tol * 3

CHECKER = {
    'checker': (16, [(135, 235)]),            # 밝은 체크(회색 162/205) - 고블린 로스터
    'checker_dark': (12, [(0, 120)]),
    'checker_beige': (0, []),
    'checker_dark_strict': (5, [(0, 16), (98, 112)]),  # 회색 몸통(Fe) 보존용          # 어두운 체크(검정/회색 105 + 경계 중간톤) - 슬라임 시트
}

def remove_checker(im, mode='checker'):
    """가짜 투명 체크무늬 배경 제거: 테두리에 연결된 무채색 체크 픽셀만 지운다."""
    im = im.convert('RGBA'); w, h = im.size; px = im.load()
    sat_max, ranges = CHECKER[mode]
    def is_bg(c):
        r, g, b = c[:3]; a = (r + g + b) / 3
        if max(r, g, b) - min(r, g, b) <= sat_max and any(lo <= a <= hi for lo, hi in ranges):
            return True
        # 베이지 체크(오우거 시트): 따뜻한 밝은 톤
        if mode == 'checker_beige':
            return r >= g >= b - 2 and r - b <= 40 and a >= 200
        # 슬라임 시트의 청회색 구분 띠
        return mode.startswith('checker_dark') and max(r, g, b) - min(r, g, b) <= 26 and 18 <= a <= 78 and b >= r
    seen = bytearray(w * h)
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
    # 반투명 그림자 잔여(밝은 무채색 고립 픽셀) 제거
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] and is_bg(c) and sum(1 for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))
                                     if 0 <= x+dx < w and 0 <= y+dy < h and px[x+dx, y+dy][3] == 0) >= 2:
                px[x, y] = (0, 0, 0, 0)
    return im

def drop_specks(im, min_px=60):
    """배경 제거 후 남은 작은 고립 조각(체크 경계 잔티)을 지운다."""
    w, h = im.size; px = im.load(); seen = bytearray(w * h)
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
            if len(comp) < min_px:
                for x, y in comp:
                    px[x, y] = (0, 0, 0, 0)
    return im

def add_outline(im, color=(16, 20, 30, 255)):
    """어두운 체크와 함께 지워진 외곽선을 1px로 복원한다 (불투명 픽셀에 닿은 투명 픽셀을 칠함)."""
    w, h = im.size; px = im.load()
    edge = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] == 0 and any(
        0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] > 0
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in edge:
        px[x, y] = color
    return im

def remove_bg(im, tol):
    """테두리에서 시작하는 플러드필. 테두리 평균색(배경)과 가깝고 이웃과 연속인 픽셀만 지운다.
    도트 외곽선(어두운 선)에서 멈추므로 흰색·회색 슬라임 몸통은 보존된다."""
    im = im.convert('RGBA'); w, h = im.size; px = im.load()
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + \
             [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    border.sort(key=lambda c: sum(c[:3]))
    ref = border[len(border) // 2]
    seen = bytearray(w * h)
    q = deque((x, y) for x in range(w) for y in (0, h - 1))
    q.extend((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        c = px[x, y]
        if not similar(c, ref, tol):
            continue
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and similar(px[nx, ny], c, 22):
                q.append((nx, ny))
    return im

VIDEO_MODE = len(sys.argv) > 3 and sys.argv[3] == 'video'
for name, (f, x0, y0, x1, y1, disp, tol) in ({} if VIDEO_MODE else BOXES).items():
    if name.startswith('slime_'):
        continue  # 슬라임은 tools/gen_slimes.py로 생성 (화풍 통일). 참고 이미지 추출은 고블린·아이템만
    im = Image.open(f'{SRC}/{f}').convert('RGB')
    k = S if disp else 1
    crop = im.crop((round(x0 * k), round(y0 * k), round(x1 * k), round(y1 * k)))
    out = remove_checker(crop, tol) if isinstance(tol, str) else remove_bg(crop, tol)
    if tol == 'checker':
        out = drop_specks(out, 40)  # 후광·잔상 등 떨어진 작은 조각 제거
    if isinstance(tol, str) and tol.startswith('checker_dark'):
        out = add_outline(add_outline(drop_specks(out)))  # 원본 도트 외곽선 두께(약 2px) 복원
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    if max(out.size) > 280:  # 게임 표시 크기 대비 과대 원본은 축소 (용량 절감)
        out.thumbnail((280, 280), Image.LANCZOS)
    out.save(f'{OUT}/{name}.png')
    print(name, out.size)

# ---------- 걷기 모션 시트 ----------
# 이름: (파일, y0, y1, [(x0, x1) 프레임별 열 구간], 배경모드, 출력 프레임 높이)
WALKS = {
    # 오우거 걷기는 영상(video 모드)에서 만든 16프레임 시트를 쓴다.
    # 예전 9.webp 8프레임 시트는 여기서 다시 만들면 16프레임 시트를 덮어쓰므로 제외.
}

def keep_largest(im):
    """옆 프레임에서 넘어온 조각을 버리고 가장 큰 연결 덩어리만 남긴다."""
    w, h = im.size; px = im.load(); seen = bytearray(w * h); comps = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy][3] == 0:
                continue
            comp, q = [], deque([(sx, sy)]); seen[sy * w + sx] = 1
            while q:
                x, y = q.popleft(); comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3] > 0:
                        seen[ny * w + nx] = 1; q.append((nx, ny))
            comps.append(comp)
    comps.sort(key=len, reverse=True)
    for comp in comps[1:]:
        if len(comp) < len(comps[0]) * 0.05:
            for x, y in comp:
                px[x, y] = (0, 0, 0, 0)
    return im

for name, (f, y0, y1, spans, mode, out_h) in ({} if VIDEO_MODE else WALKS).items():
    im = Image.open(f'{SRC}/{f}').convert('RGB')
    frames = []
    for x0, x1 in spans:
        fr = keep_largest(remove_checker(im.crop((x0 - 4, y0, x1 + 4, y1)), mode))
        frames.append(fr.crop(fr.getbbox()))
    # 발 기준(아래 정렬) + 가로 중심 정렬로 같은 크기 칸에 배치 -> 프레임 흔들림 최소화
    fw = max(f.width for f in frames); fh = max(f.height for f in frames)
    sheet = Image.new('RGBA', (fw * len(frames), fh), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        sheet.paste(fr, (i * fw + (fw - fr.width) // 2, fh - fr.height), fr)
    k = out_h / fh
    sheet = sheet.resize((round(sheet.width * k), out_h), Image.LANCZOS)
    sheet.save(f'{OUT}/{name}.png')
    print(name, 'frames', len(frames), 'frame', round(fw * k), 'x', out_h)

# ---------- 영상(걷기 루프) -> 스프라이트 시트 ----------
# 사용: python3 tools/extract_sprites.py <프레임폴더> <출력폴더> video <시작> <끝> <간격> <이름>
#  (프레임 폴더는 ffmpeg -i in.mp4 -vf crop=600:700:330:10 f_%03d.png 로 미리 추출)
def remove_video_bg(im):
    """영상의 체크무늬(따뜻한 회색, 압축 노이즈 포함) 배경을 테두리부터 지운다."""
    im = im.convert('RGBA'); w, h = im.size; px = im.load(); seen = bytearray(w * h)
    def is_bg(c):
        r, g, b = c[:3]
        return r >= g - 4 and g >= b - 4 and r - b <= 36 and (r + g + b) / 3 >= 160
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

if len(sys.argv) > 3 and sys.argv[3] == 'video':
    start, end, stepn, name = int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]), sys.argv[7]
    frames = [keep_largest(remove_video_bg(Image.open(f'{SRC}/f_{i:03d}.png'))) for i in range(start, end + 1, stepn)]
    # 제자리 걷기 영상이므로 프레임별 위치를 유지한 채 전체 합집합 영역으로 자른다 (흔들림 방지)
    boxes = [f.getbbox() for f in frames]
    ub = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    frames = [f.crop(ub) for f in frames]
    fw, fh = frames[0].size
    sheet = Image.new('RGBA', (fw * len(frames), fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * fw, 0), f)
    k = 220 / fh
    sheet = sheet.resize((round(fw * k) * len(frames), 220), Image.LANCZOS)
    sheet.save(f'{OUT}/{name}.png')
    # 정지 이미지(도움말·대기 상태)도 같은 캐릭터로 맞춤: 첫 프레임
    still = sheet.crop((0, 0, round(fw * k), 220)); still.crop(still.getbbox()).save(f'{OUT}/' + name.replace('_walk', '') + '.png')
    print(name, 'frames', len(frames), 'frame', round(fw * k), 'x 220')
