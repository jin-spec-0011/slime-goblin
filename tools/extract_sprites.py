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
    'slime_H':  ('2.webp', 487, 122, 610, 238, True, 38),
    'slime_C':  ('2.webp', 650, 122, 795, 238, True, 38),
    'slime_He': ('2.webp', 822, 122, 945, 238, True, 38),
    'slime_Fe': ('2.webp', 985, 122, 1115, 238, True, 38),
    'slime_Na': ('2.webp', 1145, 122, 1295, 238, True, 38),
    'slime_Cl': ('2.webp', 1372, 122, 1495, 238, True, 38),
    'slime_S':  ('2.webp', 1565, 122, 1690, 238, True, 38),
    'slime_U':  ('2.webp', 1740, 122, 1865, 238, True, 38),
    'slime_N':  ('1.webp', 55, 838, 175, 912, True, 38),
    # 화합물/혼합물/메가
    'slime_H2O':  ('2.webp', 1090, 895, 1265, 1035, True, 38),
    'slime_NH3':  ('2.webp', 1660, 875, 1855, 1045, True, 38),
    'slime_mix':  ('1.webp', 1615, 440, 1715, 510, True, 38),
    'slime_mega': ('4.webp', 1645, 565, 1835, 720, True, 30),
    # 고블린 로스터(6.webp, 체크무늬 배경, 원본 좌표) -> 게임 8종
    'goblin_normal':  ('6.webp', 105, 90, 325, 300, False, 'checker'),   # Goblin Roster (Draft)
    'goblin_fighter': ('6.webp', 425, 90, 635, 350, False, 'checker'),   # Shield Goblin
    'goblin_mage':    ('6.webp', 770, 440, 990, 670, False, 'checker'),  # Mage Goblin
    'goblin_rider':   ('6.webp', 95, 460, 370, 670, False, 'checker'),   # Spear Goblin
    'goblin_archer':  ('6.webp', 440, 460, 665, 670, False, 'checker'),  # Archer Goblin
    'goblin_captain': ('6.webp', 1665, 50, 1920, 325, False, 'checker'), # Goblin King
    'goblin_giant':   ('6.webp', 1065, 90, 1270, 300, False, 'checker'), # Stone-skin Goblin
    'goblin_smart':   ('6.webp', 1390, 440, 1550, 670, False, 'checker'),# Rogue Goblin
    'item_catalyst':  ('6.webp', 835, 790, 920, 920, False, 'checker'),  # Catalyst
    # 고블린 (구버전 단일 이미지, 로스터 로드 실패 시 대체)
    'goblin':        ('1.webp', 1062, 1640, 1208, 1792, True, 18),
    'goblin_frozen': ('1.webp', 730, 1655, 880, 1790, True, 40),
}

def similar(a, b, tol):
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2]) <= tol * 3

def remove_checker(im):
    """가짜 투명 체크무늬(회색 162/205) 배경 제거: 테두리에 연결된 무채색 밝은 픽셀만 지운다."""
    im = im.convert('RGBA'); w, h = im.size; px = im.load()
    def is_bg(c):
        r, g, b = c[:3]
        return max(r, g, b) - min(r, g, b) <= 16 and 135 <= (r + g + b) / 3 <= 235
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

for name, (f, x0, y0, x1, y1, disp, tol) in BOXES.items():
    im = Image.open(f'{SRC}/{f}').convert('RGB')
    k = S if disp else 1
    crop = im.crop((round(x0 * k), round(y0 * k), round(x1 * k), round(y1 * k)))
    out = remove_checker(crop) if tol == 'checker' else remove_bg(crop, tol)
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    out.save(f'{OUT}/{name}.png')
    print(name, out.size)
