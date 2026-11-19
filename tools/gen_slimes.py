"""코드 기반 픽셀아트 슬라임 생성기 (화풍 통일용).
사용: python3 tools/gen_slimes.py [출력폴더=assets]
- 44x36 픽셀 격자에 그린 뒤 4배 최근접 확대 -> 176x144 PNG
- 몸통: 돔형, 좌상단 광원(하이라이트/그림자 3단), 눈 2개
- 속성 장식: 불꽃/물방울/번개/얼음가시/바람소용돌이/바위/독거품/방사능
- 원소 기호는 게임에서 글자로 덧그린다(그림에는 넣지 않음)
"""
import math
import os
import sys
from PIL import Image

W, H, SCALE = 44, 36, 4
OUTLINE = (26, 28, 44, 255)
OUT = sys.argv[1] if len(sys.argv) > 1 else 'assets'


def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def mix(c, d, t):
    return tuple(round(c[i] + (d[i] - c[i]) * t) for i in range(3)) + (255,)


def light(c, t):
    return mix(c, (255, 255, 255), t)


def dark(c, t):
    return mix(c, (0, 0, 0), t)


class Canvas:
    def __init__(self):
        self.px = {}

    def put(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.px[(x, y)] = c

    def get(self, x, y):
        return self.px.get((x, y))

    def rect(self, x0, y0, w, h, c):
        for y in range(y0, y0 + h):
            for x in range(x0, x0 + w):
                self.put(x, y, c)

    def outline(self):
        add = {}
        for (x, y) in list(self.px):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                p = (x + dx, y + dy)
                if p not in self.px and 0 <= p[0] < W and 0 <= p[1] < H:
                    add[p] = OUTLINE
        self.px.update(add)

    def image(self):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            if 0 <= x < W and 0 <= y < H:  # 효과가 범위 밖에 찍은 픽셀은 무시
                im.putpixel((x, y), c)
        return im.resize((W * SCALE, H * SCALE), Image.NEAREST)


# ---------- 몸통 ----------
def body(cv, c1, c2=None, top=12, bottom=33, R=17, cx=22, eyes=True, texture=None):
    """돔형 슬라임 몸통. c2가 있으면 좌->우 2색 그라데이션(합성 슬라임)."""
    h = bottom - top
    inside = set()
    for y in range(top, bottom + 1):
        t = (y - top) / h
        hw = R * math.sqrt(max(0.0, 1 - ((0.62 - t) / 0.62) ** 2)) if t < 0.62 else R
        if y == bottom:
            hw -= 2
        elif y == bottom - 1:
            hw -= 1
        for x in range(round(cx - hw), round(cx + hw) + 1):
            inside.add((x, y))
    for (x, y) in inside:
        base = c1 if c2 is None else mix(c1, c2, (x - (cx - R)) / (2 * R))
        dx, dy = (x - cx) / R, (y - top) / h
        shade = dx * 0.8 + dy * 1.1  # 좌상단 광원
        if y >= bottom - 2 or shade > 1.05:
            col = dark(base, 0.28)
        elif shade > 0.65:
            col = dark(base, 0.12)
        elif shade < -0.35:
            col = light(base, 0.32)
        else:
            col = base
        if texture == 'rock' and (x * 7 + y * 13) % 11 == 0:
            col = dark(base, 0.35)
        if texture == 'mottle' and (x * 5 + y * 3) % 7 == 0:
            col = light(base, 0.2)
        cv.put(x, y, col)
    # 하이라이트(광택)
    hx, hy = cx - round(R * 0.5), top + round(h * 0.22)
    for x, y in ((hx, hy), (hx + 1, hy), (hx + 2, hy), (hx, hy + 1), (hx - 1, hy + 1), (hx - 1, hy + 2)):
        if (x, y) in inside:
            cv.put(x, y, (255, 255, 255, 255))
    if eyes:
        ey = top + round(h * 0.42)
        for ex in (cx - 7, cx + 5):
            cv.rect(ex, ey, 3, 4, (27, 27, 42, 255))
            cv.put(ex, ey, (255, 255, 255, 255))
            cv.put(ex + 1, ey, (255, 255, 255, 255))
        # 볼 홍조
        for bx in (cx - 10, cx + 9):
            cv.put(bx, ey + 4, light((255, 120, 140, 255), 0.2)); cv.put(bx + 1, ey + 4, light((255, 120, 140, 255), 0.2))
    return inside


# ---------- 속성 장식 ----------
def deco_fire(cv, c, top=12, cx=22):
    flame = [(0, 0), (0, -1), (0, -2), (1, -1), (-1, 0), (1, 0), (0, -3)]
    for fx, h in ((cx - 10, 7), (cx, 10), (cx + 10, 7)):
        for k in range(h):
            w = max(0, (h - k) // 2 - (1 if k < 2 else 0)) + (1 if k < 3 else 0)
            for x in range(fx - w, fx + w + 1):
                col = (255, 214, 64, 255) if abs(x - fx) < w or k > h - 2 else (255, 106, 40, 255)
                cv.put(x, top - k, col)
    for x, y in ((cx - 13, top - 3), (cx + 13, top - 5), (cx + 4, top - 8)):
        cv.put(x, y, (255, 180, 60, 255))
    _ = flame


def deco_water(cv, c, top=12, cx=22):
    # 머리 위 물방울
    dx, dy = cx + 7, top - 10
    for k in range(9):
        w = [0, 0, 1, 1, 2, 2, 3, 2, 1][k]
        for x in range(dx - w, dx + w + 1):
            cv.put(x, dy + k, light(c, 0.15) if x < dx else c)
    cv.put(dx - 1, dy + 4, (255, 255, 255, 255)); cv.put(dx - 1, dy + 5, (255, 255, 255, 255))
    # 몸통 물결 하이라이트
    for x in range(cx - 10, cx + 10):
        if (x // 2) % 2 == 0:
            cv.put(x, top + 15, light(c, 0.45))


def deco_elec(cv, c, top=12, cx=22):
    bolt = [(0, 0), (1, 1), (2, 2), (1, 3), (2, 4), (3, 5), (2, 6), (3, 7), (4, 8)]
    for bx, by in ((cx + 12, top - 6), (cx - 16, top - 4)):
        for x, y in bolt:
            cv.put(bx + x, by + y, (255, 238, 90, 255))
            cv.put(bx + x + 1, by + y, (255, 255, 200, 255))
            cv.put(bx + x + 2, by + y, (255, 210, 40, 255))
    for x, y in ((cx - 2, top - 4), (cx + 3, top - 6), (cx + 7, top - 3)):
        cv.put(x, y, (255, 255, 160, 255))


def deco_ice(cv, c, top=12, cx=22):
    for sx, h in ((cx - 11, 8), (cx - 4, 11), (cx + 4, 9), (cx + 11, 7)):
        for k in range(h):
            w = (h - k) // 3
            for x in range(sx - w, sx + w + 1):
                cv.put(x, top + 2 - k, (200, 245, 255, 255) if x <= sx else (140, 215, 245, 255))
    for x, y in ((cx - 15, top + 4), (cx + 15, top + 2)):
        cv.put(x, y, (230, 250, 255, 255))


def deco_wind(cv, c, top=12, cx=22):
    swirl = [(0, 0), (1, 0), (2, 0), (3, 0), (4, -1), (5, -2), (5, -3), (4, -4), (3, -5), (2, -5), (1, -4), (1, -3), (2, -2)]
    for ox, oy in ((cx - 18, top + 6), (cx + 13, top + 2), (cx - 4, top - 5)):
        for x, y in swirl:
            cv.put(ox + x, oy + y, (235, 250, 245, 255))
        for k in range(6):
            cv.put(ox - k - 1, oy, (210, 235, 230, 255))


def deco_earth(cv, c, top=12, cx=22):
    for rx, ry, s in ((cx - 13, top - 3, 6), (cx + 7, top - 5, 7), (cx - 2, top - 6, 5)):
        cv.rect(rx, ry, s, s - 1, (150, 120, 80, 255))
        cv.put(rx, ry, (190, 160, 110, 255))
        cv.put(rx + s - 1, ry + s - 2, (100, 78, 50, 255))


def deco_poison(cv, c, top=12, cx=22):
    for bx, by, r in ((cx - 9, top - 4, 3), (cx + 6, top - 7, 4), (cx + 14, top - 1, 2), (cx - 1, top - 10, 2)):
        for y in range(by - r, by + r + 1):
            for x in range(bx - r, bx + r + 1):
                if (x - bx) ** 2 + (y - by) ** 2 <= r * r + 0.5:
                    cv.put(x, y, light(c, 0.25))
        cv.put(bx - (r > 1), by - (r > 1), (255, 255, 255, 255))
    # 흘러내림
    for x in (cx - 13, cx + 10):
        for k in range(3):
            cv.put(x, 33 + k - 1, dark(c, 0.15))


def deco_rad(cv, c, top=12, cx=22):
    # 머리 위 방사능 표식(작은 삼엽) + 빛 입자
    ox, oy = cx, top - 6
    for x in range(ox - 5, ox + 6):
        for y in range(oy - 5, oy + 6):
            d = math.hypot(x - ox, y - oy)
            ang = (math.degrees(math.atan2(y - oy, x - ox)) + 360) % 120
            if d <= 1.5:
                cv.put(x, y, (30, 30, 30, 255))
            elif 2.2 <= d <= 5.2 and ang < 60:
                cv.put(x, y, (30, 30, 30, 255))
            elif d <= 5.2:
                cv.put(x, y, (255, 222, 40, 255))
    for x, y in ((cx - 14, top - 2), (cx + 14, top - 1), (cx - 9, top - 8), (cx + 10, top - 9)):
        cv.put(x, y, (190, 255, 120, 255))


DECO = {'fire': deco_fire, 'water': deco_water, 'elec': deco_elec, 'ice': deco_ice,
        'wind': deco_wind, 'earth': deco_earth, 'poison': deco_poison, 'rad': deco_rad}


def make(color, attrs, color2=None, texture=None, crown=False, sparkle=False):
    cv = Canvas()
    c1 = hexc(color)
    c2 = hexc(color2) if color2 else None
    # 장식은 몸통 뒤(위쪽)에 먼저, 몸통이 앞을 덮는다
    for i, a in enumerate(attrs[:2]):
        DECO[a](cv, c1 if i == 0 else (c2 or c1))
    body(cv, c1, c2, texture=texture)
    if crown:
        for x in range(14, 31):
            cv.put(x, 9, (255, 205, 50, 255))
            cv.put(x, 10, (220, 160, 30, 255))
        for x in (14, 18, 22, 26, 30):
            for k in range(3):
                cv.put(x, 8 - k, (255, 215, 60, 255))
        cv.put(22, 10, (230, 60, 80, 255))
    if sparkle:  # 화학 족보(화합물): 반짝이 별
        for sx, sy in ((5, 6), (38, 10)):
            for x, y in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                cv.put(sx + x, sy + y, (255, 240, 150, 255))
    cv.outline()
    return cv.image()


def main():
    sys.path.insert(0, os.path.dirname(__file__))
    import json
    import subprocess
    # data.js에서 원소/합성/족보 목록을 읽는다 (Node로 JSON 출력)
    js = ("import('./src/data.js').then(d=>console.log(JSON.stringify({el:d.ELEMENTS,fu:d.FUSIONS,"
          "rc:d.RECIPES.map(r=>({key:r.key,color:r.color,need:r.need}))})))")
    data = json.loads(subprocess.check_output(['node', '-e', js], cwd=os.path.join(os.path.dirname(__file__), '..')))
    attr_of = {e['sym']: e['attr'] for e in data['el']}
    os.makedirs(OUT, exist_ok=True)
    made = []
    for e in data['el']:
        tex = 'rock' if e['attr'] == 'earth' else None
        make(e['color'], [e['attr']], texture=tex).save(f"{OUT}/slime_{e['sym']}.png"); made.append(e['sym'])
    for f in data['fu']:
        a, b = f['pair']
        make(f['color'], [a, b], color2=None).save(f"{OUT}/slime_{f['key']}.png"); made.append(f['key'])
    for r in data['rc']:
        attrs = list(dict.fromkeys(attr_of[k] for k in r['need']))
        make(r['color'], attrs, sparkle=True).save(f"{OUT}/slime_{r['key']}.png"); made.append(r['key'])
    make('#9aa3b5', ['earth'], texture='mottle').save(f"{OUT}/slime_mix.png"); made.append('mix')
    make('#5fc8ff', ['water'], crown=True).save(f"{OUT}/slime_mega.png"); made.append('mega')
    print(len(made), 'slimes:', ' '.join(made))




# =====================================================================
# 조합 슬라임 전용 그림 (고유 몸 모양 + 효과). main()보다 먼저 정의되도록 아래에서 main 재정의
# =====================================================================
CX = 22


def shape_set(kind):
    """몸 모양 픽셀 집합: dome / drop / cloud / cube / orb / puddle / ghost"""
    s = set()
    def circ(cx, cy, r):
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.6:
                    s.add((x, y))
    if kind == 'drop':      # 물방울: 위가 뾰족, 아래가 둥근
        circ(CX, 24, 10)
        for y in range(6, 24):
            hw = (y - 6) / 18 * 10
            for x in range(round(CX - hw), round(CX + hw) + 1):
                s.add((x, y))
    elif kind == 'cloud':   # 구름: 둥근 혹 3개 + 평평한 바닥
        circ(13, 24, 8); circ(CX, 19, 10); circ(31, 24, 8)
        for y in range(24, 33):
            for x in range(7, 38):
                s.add((x, y))
    elif kind == 'orb':     # 구체
        circ(CX, 21, 12)
    elif kind == 'puddle':  # 웅덩이: 넓고 낮게 + 혹
        for y in range(22, 34):
            for x in range(2, 43):
                if ((x - CX) / 20) ** 2 + ((y - 28) / 6.5) ** 2 <= 1:
                    s.add((x, y))
        circ(15, 23, 5); circ(28, 21, 6)
    elif kind == 'ghost':   # 가스: 둥근 머리 + 물결 꼬리
        circ(CX, 18, 12)
        for y in range(18, 33):
            for x in range(CX - 12, CX + 13):
                wave = 30 + round(2 * math.sin((x - CX) / 2.2))
                if y <= wave:
                    s.add((x, y))
    elif kind == 'cube':    # 결정 큐브(정면 + 윗면)
        for y in range(15, 34):
            for x in range(10, 31):
                s.add((x, y))
        for k in range(6):  # 윗면(평행사변형)
            for x in range(10 + k, 31 + k):
                s.add((x, 14 - k))
        for k in range(6):  # 옆면
            for y in range(14 - k, 34 - k):
                s.add((31 + k, y))
    else:                   # dome
        for y in range(12, 34):
            t = (y - 12) / 21
            hw = 17 * math.sqrt(max(0.0, 1 - ((0.62 - t) / 0.62) ** 2)) if t < 0.62 else 17
            hw -= 2 if y == 33 else 1 if y == 32 else 0
            for x in range(round(CX - hw), round(CX + hw) + 1):
                s.add((x, y))
    return s


def paint_body(cv, pts, c1, c2=None, mode='light', alpha=255, pattern=None):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for (x, y) in pts:
        base = c1 if c2 is None else mix(c1, c2, (x - x0) / max(1, x1 - x0))
        if mode == 'radial':  # 안쪽이 밝게 빛나는 구체
            d = math.hypot(x - cx + 2, y - cy + 2) / max(1, (x1 - x0) / 2)
            col = light(base, 0.65) if d < 0.3 else light(base, 0.3) if d < 0.55 else base if d < 0.85 else dark(base, 0.25)
        else:
            dx, dy = (x - cx) / max(1, (x1 - x0) / 2), (y - y0) / max(1, y1 - y0)
            sh = dx * 0.8 + dy * 1.1
            col = dark(base, 0.28) if (y >= y1 - 1 or sh > 1.05) else dark(base, 0.12) if sh > 0.65 else light(base, 0.32) if sh < -0.35 else base
        if pattern == 'marble' and math.sin(x * 0.55 + math.sin(y * 0.5) * 2.2) > 0.55:
            col = c2 if c2 else light(base, 0.4)
        if pattern == 'rust' and (x * 7 + y * 11) % 9 in (0, 1):
            col = mix(col, (210, 110, 40, 255), 0.6)
        if pattern == 'crystal' and (x + y) % 6 == 0:
            col = light(col, 0.35)
        cv.put(x, y, col[:3] + (alpha,))


def cube_faces(cv, pts):
    """큐브 입체감: 윗면 밝게, 옆면 어둡게"""
    for (x, y) in pts:
        c = cv.get(x, y)
        if c is None:
            continue
        if y < 15 and x < 31 + (14 - y):
            cv.put(x, y, light(c, 0.35)[:3] + (c[3],))
        elif x > 30:
            cv.put(x, y, dark(c, 0.3)[:3] + (c[3],))


def face(cv, ex, ey, sleepy=False):
    for x0 in (ex - 7, ex + 5):
        if sleepy:
            cv.rect(x0, ey + 2, 3, 1, (27, 27, 42, 255))
        else:
            cv.rect(x0, ey, 3, 4, (27, 27, 42, 255))
            cv.put(x0, ey, (255, 255, 255, 255)); cv.put(x0 + 1, ey, (255, 255, 255, 255))
    for bx in (ex - 10, ex + 9):
        cv.put(bx, ey + 4, (255, 150, 165, 255)); cv.put(bx + 1, ey + 4, (255, 150, 165, 255))


def shine(cv, pts, x, y):
    for p in ((x, y), (x + 1, y), (x + 2, y), (x, y + 1), (x - 1, y + 1), (x - 1, y + 2)):
        if p in pts:
            cv.put(p[0], p[1], (255, 255, 255, 255))


def glow(cv, pts, color, r=2, a=110):
    """외곽선 바깥 반투명 발광 (외곽선 처리 후에 그린다)"""
    c = hexc(color)
    for (x, y) in list(pts):
        for dx in range(-r - 1, r + 2):
            for dy in range(-r - 1, r + 2):
                p = (x + dx, y + dy)
                if p not in cv.px and 0 <= p[0] < W and 0 <= p[1] < H and dx * dx + dy * dy <= (r + 1) ** 2:
                    cv.px[p] = c[:3] + (a,)


def bolt(cv, x, y, n=8, col=(255, 236, 80, 255)):
    for k in range(n):
        cv.put(x + (k % 3 == 1) - (k % 3 == 2), y + k, col)
        cv.put(x + 1 + (k % 3 == 1) - (k % 3 == 2), y + k, (255, 255, 200, 255))


def bubbles(cv, spots, col):
    for bx, by, r in spots:
        for y in range(by - r, by + r + 1):
            for x in range(bx - r, bx + r + 1):
                if (x - bx) ** 2 + (y - by) ** 2 <= r * r + 0.5:
                    cv.put(x, y, col)
        cv.put(bx - (r > 1), by - (r > 1), (255, 255, 255, 255))


def star(cv, sx, sy, col=(255, 240, 150, 255)):
    for x, y in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
        cv.put(sx + x, sy + y, col)


def special(key):
    cv = Canvas(); after = []  # after: 외곽선 이후 그릴 것(발광·입자)
    if key == 'STEAM':      # 수증기: 구름 몸 + 김 3줄기
        pts = shape_set('cloud'); paint_body(cv, pts, hexc('#e3ecf3'), hexc('#c4d3df'))
        for sx in (12, 22, 32):
            for k in range(7):
                cv.put(sx + round(math.sin(k * 0.9) * 1.5), 9 - k + (0 if sx == 22 else 3), (245, 250, 255, 255))
        face(cv, CX, 22, sleepy=True); shine(cv, pts, 15, 18)
    elif key == 'PLASMA':   # 플라즈마: 빛나는 구체 + 번개 고리
        pts = shape_set('orb'); paint_body(cv, pts, hexc('#ff4fd0'), mode='radial')
        face(cv, CX, 20)
        after += [lambda: glow(cv, pts, '#ff7be6', 2, 90), lambda: bolt(cv, 4, 10), lambda: bolt(cv, 37, 14), lambda: bolt(cv, 30, 0, 6)]
    elif key == 'SHOCK':    # 감전수: 물방울 몸 안에 번개
        pts = shape_set('drop'); paint_body(cv, pts, hexc('#4cc8ff'))
        bolt(cv, 21, 21, 10, (255, 230, 60, 255)); face(cv, CX, 18); shine(cv, pts, 17, 14)
        after += [lambda: bolt(cv, 6, 8, 6), lambda: bolt(cv, 36, 10, 6)]
    elif key == 'FROST':    # 서리: 얼음 결정 큐브 + 눈송이
        pts = shape_set('cube'); paint_body(cv, pts, hexc('#c9f3ff'), hexc('#8fd8f5'), pattern='crystal'); cube_faces(cv, pts)
        face(cv, 20, 21)
        for x, y in ((40, 4), (5, 6)):
            for d in range(-2, 3):
                cv.put(x + d, y, (240, 252, 255, 255)); cv.put(x, y + d, (240, 252, 255, 255))
                cv.put(x + d, y + d, (210, 240, 255, 255))
    elif key == 'STORM':    # 화염폭풍: 불 슬라임을 감싸는 불꽃 회오리
        pts = shape_set('dome'); paint_body(cv, pts, hexc('#ff8a2e'), hexc('#ff4a2e'))
        face(cv, CX, 21); shine(cv, pts, 13, 16)
        def ring():
            for k in range(40):
                a = k / 40 * math.pi * 2
                x = CX + round(math.cos(a) * 21); y = 21 + round(math.sin(a) * 9) - (k // 8)
                if not (8 < x < 36 and y > 12):
                    cv.put(x, y, (255, 214, 64, 255) if k % 3 else (255, 110, 40, 255))
        after.append(ring)
    elif key == 'MUD':      # 진흙: 웅덩이 몸 + 거품 + 흘러내림
        pts = shape_set('puddle'); paint_body(cv, pts, hexc('#8a6a3a'), hexc('#6d512a'))
        bubbles(cv, [(10, 26, 1), (34, 25, 2), (24, 30, 1)], (170, 140, 95, 255)); face(cv, CX, 22)
        for x in (6, 38):
            for k in range(3):
                cv.put(x, 34 + k - 1, (110, 82, 45, 255))
    elif key == 'MIASMA':   # 독안개: 반투명 가스 유령 + 해골 표식
        pts = shape_set('ghost'); paint_body(cv, pts, hexc('#9fd14f'), hexc('#6aa83a'), alpha=230)
        face(cv, CX, 17)
        bubbles(cv, [(6, 8, 2), (38, 6, 2), (33, 2, 1)], (190, 240, 120, 255))
        sk = [(0, 0), (1, 0), (2, 0), (-1, 1), (3, 1), (-1, 2), (0, 2), (2, 2), (3, 2), (0, 3), (2, 3)]
        for x, y in sk:
            cv.put(CX - 1 + x, 1 + y, (235, 240, 225, 255))
        after.append(lambda: glow(cv, pts, '#b6ff6a', 1, 70))
    elif key == 'FUSION':   # 핵융합: 태양 구체 + 코로나 + 궤도 고리
        pts = shape_set('orb'); paint_body(cv, pts, hexc('#c860ff'), mode='radial')
        face(cv, CX, 20)
        def corona():
            for k in range(16):
                a = k / 16 * math.pi * 2
                for r in (14, 15, 16):
                    cv.px.setdefault((CX + round(math.cos(a) * r), 21 + round(math.sin(a) * r)), (255, 222, 60, 255 if r < 16 else 140))
            for k in range(60):
                a = k / 60 * math.pi * 2
                p = (CX + round(math.cos(a) * 21), 21 + round(math.sin(a) * 5))
                if p not in pts:
                    cv.px[p] = (255, 255, 255, 200)
        after += [lambda: glow(cv, pts, '#e8a0ff', 2, 100), corona]
    elif key == 'H2O':      # 물: 물방울 + 반짝이
        pts = shape_set('drop'); paint_body(cv, pts, hexc('#3aa0ff')); face(cv, CX, 19); shine(cv, pts, 17, 14)
        after += [lambda: star(cv, 6, 8), lambda: star(cv, 38, 12)]
    elif key == 'CO2':      # 이산화탄소: 회색 구름 + 기포
        pts = shape_set('cloud'); paint_body(cv, pts, hexc('#8a93a8'), hexc('#6d7488')); face(cv, CX, 22, sleepy=True)
        bubbles(cv, [(9, 10, 2), (36, 8, 2), (24, 4, 1)], (190, 198, 214, 255)); after.append(lambda: star(cv, 40, 3))
    elif key == 'NaCl':     # 소금: 하얀 결정 큐브
        pts = shape_set('cube'); paint_body(cv, pts, hexc('#f2f5fa'), hexc('#c8d2e0'), pattern='crystal'); cube_faces(cv, pts); face(cv, 20, 21)
        after += [lambda: star(cv, 5, 6), lambda: star(cv, 40, 2)]
    elif key == 'NH3':      # 암모니아: 청록 가스 유령 + 소용돌이
        pts = shape_set('ghost'); paint_body(cv, pts, hexc('#4fd1b0'), hexc('#2fa58a'), alpha=235); face(cv, CX, 17)
        for k in range(10):
            a = k * 0.7
            cv.put(36 + round(math.cos(a) * k * 0.4), 8 + round(math.sin(a) * k * 0.4), (200, 255, 240, 255))
        after.append(lambda: star(cv, 5, 5))
    elif key == 'Fe2O3':    # 녹: 녹슨 금속 돔 + 녹 조각
        pts = shape_set('dome'); paint_body(cv, pts, hexc('#a8452a'), hexc('#7a3420'), pattern='rust'); face(cv, CX, 21)
        for x, y in ((9, 9), (35, 7), (30, 3)):
            cv.rect(x, y, 2, 2, (200, 100, 45, 255))
        after.append(lambda: star(cv, 40, 12))
    elif key == 'H2SO4':    # 황산: 노란 돔 + 산 거품 + 녹아내리는 방울
        pts = shape_set('dome'); paint_body(cv, pts, hexc('#e6d800'), hexc('#a8c800')); face(cv, CX, 21); shine(cv, pts, 13, 16)
        bubbles(cv, [(10, 8, 2), (32, 5, 3), (22, 2, 1)], (240, 255, 120, 255))
        for x in (9, 20, 33):
            for k in range(4):
                cv.put(x, 33 + k - 1, (200, 230, 40, 255))
        after.append(lambda: star(cv, 41, 14))
    elif key == 'mix':      # 혼합물: 두 색이 섞인 마블 돔
        pts = shape_set('dome'); paint_body(cv, pts, hexc('#9aa3b5'), hexc('#b88ad8'), pattern='marble'); face(cv, CX, 21); shine(cv, pts, 13, 16)
    else:
        return None
    cv.outline()
    for fn in after:
        fn()
    return cv.image()


SPECIAL_KEYS = ['STEAM', 'PLASMA', 'SHOCK', 'FROST', 'STORM', 'MUD', 'MIASMA', 'FUSION',
                'H2O', 'CO2', 'NaCl', 'NH3', 'Fe2O3', 'H2SO4', 'mix']


def main_special():
    os.makedirs(OUT, exist_ok=True)
    for k in SPECIAL_KEYS:
        special(k).save(f'{OUT}/slime_{k}.png')
    print(len(SPECIAL_KEYS), 'combo slimes:', ' '.join(SPECIAL_KEYS))


if __name__ == '__main__':
    main()          # 기본 29종 생성
    main_special()  # 조합 15종을 전용 그림으로 덮어씀
