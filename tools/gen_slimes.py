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



# =====================================================================
# 확장 조합 28종: 부품(장식 효과)을 조합하는 사양(SPEC) 기반 생성
# =====================================================================
def fx_flames(cv, outer, inner, n=3):
    o, c = hexc(outer), hexc(inner)
    xs = {1: [CX], 2: [CX - 7, CX + 7], 3: [CX - 10, CX, CX + 10]}[n]
    for i, fx in enumerate(xs):
        h = 10 if (n == 3 and i == 1) or n == 1 else 7
        for k in range(h):
            w = max(0, (h - k) // 2 - (1 if k < 2 else 0)) + (1 if k < 3 else 0)
            for x in range(fx - w, fx + w + 1):
                cv.put(x, 12 - k, c if abs(x - fx) < w or k > h - 2 else o)


def fx_crystals(cv, light_c, dark_c, top=12):
    for sx, h in ((CX - 11, 8), (CX - 4, 11), (CX + 4, 9), (CX + 11, 7)):
        for k in range(h):
            w = (h - k) // 3
            for x in range(sx - w, sx + w + 1):
                cv.put(x, top + 2 - k, hexc(light_c) if x <= sx else hexc(dark_c))


def fx_swirls(cv, col):
    sw = [(0, 0), (1, 0), (2, 0), (3, 0), (4, -1), (5, -2), (5, -3), (4, -4), (3, -5), (2, -5), (1, -4), (1, -3), (2, -2)]
    for ox, oy in ((CX - 19, 18), (CX + 13, 14), (CX - 4, 6)):
        for x, y in sw:
            cv.put(ox + x, oy + y, hexc(col))
        for k in range(5):
            cv.put(ox - k - 1, oy, hexc(col))


def fx_rocks(cv, col):
    c = hexc(col)
    for rx, ry, s in ((CX - 13, 9, 6), (CX + 7, 7, 7), (CX - 2, 6, 5)):
        cv.rect(rx, ry, s, s - 1, c); cv.put(rx, ry, light(c, 0.3)); cv.put(rx + s - 1, ry + s - 2, dark(c, 0.3))


def fx_bubbles(cv, col, spots=((9, 8, 2), (33, 5, 3), (23, 1, 1))):
    bubbles(cv, spots, hexc(col))


def fx_bolts(cv, col='#ffec50'):
    c = hexc(col)
    for bx, by in ((CX + 13, 6), (CX - 17, 8)):
        for k in range(9):
            x = bx + (k % 3 == 1) - (k % 3 == 2)
            cv.put(x, by + k, c); cv.put(x + 1, by + k, light(c, 0.5))


def fx_inner_bolt(cv, col='#ffe23a'):
    bolt(cv, CX - 1, 20, 10, hexc(col))


def fx_trefoil(cv, y=4):
    for x in range(CX - 4, CX + 5):
        for yy in range(y - 4, y + 5):
            d = math.hypot(x - CX, yy - y); a = (math.degrees(math.atan2(yy - y, x - CX)) + 360) % 120
            if d <= 1.3 or (2 <= d <= 4.3 and a < 60):
                cv.put(x, yy, (30, 30, 30, 255))
            elif d <= 4.3:
                cv.put(x, yy, (255, 222, 40, 255))


def fx_drips(cv, col, xs=(9, 20, 33)):
    for x in xs:
        for k in range(4):
            cv.put(x, 33 + k - 1, hexc(col))


def fx_rain(cv, col):
    c = hexc(col)
    for x in range(6, 40, 5):
        for k in range(3):
            cv.put(x - k // 2, 34 - (x % 3) + k - 1, c)


def fx_snow(cv):
    for x, y in ((5, 6), (39, 9), (31, 2), (12, 1)):
        for d in (-1, 0, 1):
            cv.put(x + d, y, (245, 252, 255, 255)); cv.put(x, y + d, (245, 252, 255, 255))


def fx_magnet(cv):
    red, grey = (210, 50, 50, 255), (200, 205, 215, 255)
    for k in range(7):
        cv.rect(CX - 7, 4 + k, 3, 1, red if k < 5 else grey); cv.rect(CX + 5, 4 + k, 3, 1, red if k < 5 else grey)
    cv.rect(CX - 7, 1, 15, 3, red)
    for x, y in ((CX - 11, 2), (CX + 11, 3)):
        cv.put(x, y, (255, 240, 120, 255))


def fx_sand(cv, col):
    c = hexc(col)
    for k in range(26):
        x = (k * 17) % 44; y = 3 + (k * 7) % 12
        if abs(x - CX) > 8 or y < 8:
            cv.put(x, y, c)


def fx_skull(cv, y=1):
    sk = [(0, 0), (1, 0), (2, 0), (-1, 1), (3, 1), (-1, 2), (0, 2), (2, 2), (3, 2), (0, 3), (2, 3)]
    for x, yy in sk:
        cv.put(CX - 1 + x, y + yy, (235, 240, 225, 255))


def fx_ribbon(cv):
    cols = [(120, 255, 200, 255), (110, 200, 255, 255), (190, 120, 255, 255)]
    for x in range(4, 41):
        y = 5 + round(2.5 * math.sin(x / 4.0))
        for k, c in enumerate(cols):
            cv.put(x, y + k, c)


def fx_rays(cv, col):
    c = hexc(col)
    for k in range(12):
        a = k / 12 * math.pi * 2
        for r in (14, 15, 16):
            cv.px.setdefault((CX + round(math.cos(a) * r), 21 + round(math.sin(a) * r)), c[:3] + (255 if r < 16 else 140,))


def fx_shards(cv, col):
    """몸에 박힌 발광 결정 (육각 기둥 모양)"""
    c = hexc(col)
    for sx, sy, h in ((12, 33, 7), (28, 33, 6), (20, 33, 4)):
        for k in range(h):
            w = 1 if k < h - 2 else 0
            for x in range(sx - w, sx + w + 2):
                cv.put(x, sy - k, light(c, 0.45) if x <= sx else c if k < h - 1 else light(c, 0.2))
        cv.put(sx, sy - h, (240, 255, 220, 255))


def fx_cracks(cv, col, pts):
    c = hexc(col)
    for (x0, y0), (x1, y1) in ((p1, p2) for p1, p2 in zip(((12, 20), (24, 17), (18, 26)), ((17, 24), (30, 22), (25, 30)))):
        n = max(abs(x1 - x0), abs(y1 - y0))
        for k in range(n + 1):
            p = (round(x0 + (x1 - x0) * k / n), round(y0 + (y1 - y0) * k / n))
            if p in pts:
                cv.put(p[0], p[1], c)


def face_v(cv, kind, ex=CX, ey=21):
    if kind == 'angry':
        face(cv, ex, ey)
        for x0 in (ex - 8, ex + 5):  # 찌푸린 눈썹
            cv.put(x0, ey - 2, (27, 27, 42, 255)); cv.put(x0 + 1, ey - 2 + (1 if x0 < ex else 0), (27, 27, 42, 255))
            cv.put(x0 + 2, ey - 1 if x0 < ex else ey - 2, (27, 27, 42, 255))
    elif kind == 'three':      # 돌연변이: 눈 3개
        face(cv, ex, ey)
        cv.rect(ex - 1, ey - 5, 3, 3, (27, 27, 42, 255)); cv.put(ex - 1, ey - 5, (255, 255, 255, 255))
    elif kind == 'sleepy':
        face(cv, ex, ey, sleepy=True)
    else:
        face(cv, ex, ey)


# 사양: shape, c1, c2, mode(light|radial), pattern, alpha, face, back[], front[], after[], glow
SPEC = {
    'FROSTFIRE': dict(shape='dome', c1='#9fe6ff', c2='#4fa0ff', back=[('flames', '#2f8fff', '#e0f8ff')], after=[('snow',)], face='normal'),
    'LAVA':      dict(shape='dome', c1='#ff6a1f', c2='#8a2a10', back=[('rocks', '#4a3a34')], front=[('cracks', '#ffd23a')], after=[('drips', '#ff8a2a')], glow='#ff7a2a', face='angry'),
    'NAPALM':    dict(shape='ghost', c1='#ff7a2a', c2='#9fd14f', alpha=240, back=[('flames', '#ff6a1f', '#ffd040'), ('bubbles', '#b6ff6a', ((6, 10, 2), (38, 8, 2)))], face='angry'),
    'RAINSTORM': dict(shape='cloud', c1='#6a7f9f', c2='#3d4f6b', after=[('rain', '#7fc8ff'), ('bolts', '#ffe86a')], face='angry'),
    'ACIDRAIN':  dict(shape='cloud', c1='#c0e85a', c2='#7fb02a', after=[('rain', '#d8ff4a')], back=[('bubbles', '#e8ff9a', ((8, 9, 2), (36, 7, 2)))], face='sleepy'),
    'HEAVYWATER':dict(shape='drop', c1='#3a5fd0', c2='#23308a', back=[('trefoil',)], glow='#7fffa0', face='normal'),
    'AURORA':    dict(shape='orb', c1='#6fffd0', c2='#c070ff', mode='radial', back=[('ribbon',)], after=[('bolts', '#9ff8ff')], glow='#a0ffe8', face='normal'),
    'THUNDER':   dict(shape='cloud', c1='#4a4f6a', c2='#2e3248', front=[('inner_bolt', '#ffe23a')], after=[('bolts', '#ffec50')], face='angry'),
    'MAGNET':    dict(shape='dome', c1='#d04848', c2='#8a94a4', back=[('magnet',)], face='normal'),
    'NEURO':     dict(shape='ghost', c1='#c8ff4a', c2='#8a4aff', alpha=240, back=[('skull',)], after=[('bolts', '#d8ff6a')], face='angry'),
    'GAMMA':     dict(shape='orb', c1='#7aff5a', c2='#2a9a2a', mode='radial', after=[('rays', '#b6ff6a')], back=[('trefoil',)], glow='#b6ff6a', face='normal'),
    'BLIZZARD':  dict(shape='cloud', c1='#eef8ff', c2='#b0d8f0', back=[('swirls', '#ffffff')], after=[('snow',)], face='sleepy'),
    'PERMAFROST':dict(shape='cube', c1='#a8c8d8', c2='#6e8ea0', pattern='crystal', back=[('crystals', '#e6f8ff', '#9fd0e8')], cube=True, face='sleepy'),
    'TOXICICE':  dict(shape='drop', c1='#9fe89a', c2='#4fb08a', back=[('crystals', '#d8ffd0', '#7fd0a0')], after=[('drips', '#7fe06a')], face='normal'),
    'CRYO':      dict(shape='cube', c1='#c0f0ff', c2='#9a7aff', pattern='crystal', back=[('trefoil',)], after=[('snow',)], glow='#c8a0ff', cube=True, face='normal'),
    'SANDSTORM': dict(shape='dome', c1='#d8b46a', c2='#a88440', pattern='mottle_s', back=[('swirls', '#f0d8a0')], after=[('sand', '#e8c890')], face='sleepy'),
    'FALLOUT':   dict(shape='cloud', c1='#8a8f6a', c2='#5f6a4a', back=[('trefoil',)], after=[('sand', '#b6ff6a')], face='sleepy'),
    'SWAMP':     dict(shape='puddle', c1='#5f7a3a', c2='#3f5a2a', back=[('bubbles', '#9fd14f', ((10, 18, 2), (32, 16, 3), (22, 13, 1)))], after=[('drips', '#4f6a2a', (6, 38))], face='sleepy', ey=24),
    'ORE':       dict(shape='cube', c1='#5a5f6a', c2='#3a3f4a', pattern='crystal', front=[('shards', '#7aff5a')], glow='#7aff5a', cube=True, face='normal'),
    'MUTAGEN':   dict(shape='ghost', c1='#a64dff', c2='#8fd14f', alpha=240, back=[('bubbles', '#c8ff6a', ((6, 9, 2), (38, 6, 3), (30, 1, 1)))], glow='#c88aff', face='three', ey=18),
    # ---- 화학 족보 확장 8종 (공통: 반짝이 별) ----
    'HCl':  dict(shape='drop', c1='#d8ff6a', c2='#a8d82a', back=[('bubbles', '#f0ffb0', ((8, 9, 2), (36, 11, 1)))], after=[('drips', '#c8f04a')], star=True, face='normal'),
    'CH4':  dict(shape='cloud', c1='#b0d8ff', c2='#7fa8e0', back=[('flames', '#3a7bff', '#bfe0ff', 1)], star=True, face='sleepy'),
    'NO2':  dict(shape='cloud', c1='#c8763a', c2='#9a4a20', back=[('swirls', '#e0a070')], star=True, face='angry'),
    'SO2':  dict(shape='ghost', c1='#e8e07a', c2='#b0a840', alpha=240, back=[('swirls', '#fff4a0')], star=True, face='sleepy', ey=18),
    'FeS':  dict(shape='cube', c1='#d8b848', c2='#7a6020', pattern='crystal', cube=True, star=True, after=[('sparkle_gold',)], face='normal'),
    'UO2':  dict(shape='orb', c1='#5a6a3a', c2='#2a3a1a', mode='radial', back=[('trefoil',)], glow='#9aff5a', star=True, face='normal'),
    'NaOH': dict(shape='cube', c1='#f4f6ff', c2='#ccd4ee', pattern='crystal', cube=True, back=[('bubbles', '#ffffff', ((8, 8, 2), (37, 6, 2)))], star=True, face='normal'),
    'H2O2': dict(shape='drop', c1='#cfeeff', c2='#8fd0ff', back=[('bubbles', '#ffffff', ((7, 10, 1), (36, 9, 2), (30, 3, 1), (11, 4, 1)))], star=True, face='normal'),
}


def build(key):
    sp = SPEC[key]; cv = Canvas()
    def run(items):
        for it in items:
            name, args = it[0], it[1:]
            if name == 'flames': fx_flames(cv, *args)
            elif name == 'crystals': fx_crystals(cv, *args)
            elif name == 'swirls': fx_swirls(cv, *args)
            elif name == 'rocks': fx_rocks(cv, *args)
            elif name == 'bubbles': fx_bubbles(cv, *args)
            elif name == 'bolts': fx_bolts(cv, *args)
            elif name == 'inner_bolt': fx_inner_bolt(cv, *args)
            elif name == 'trefoil': fx_trefoil(cv)
            elif name == 'drips': fx_drips(cv, *args)
            elif name == 'rain': fx_rain(cv, *args)
            elif name == 'snow': fx_snow(cv)
            elif name == 'magnet': fx_magnet(cv)
            elif name == 'sand': fx_sand(cv, *args)
            elif name == 'skull': fx_skull(cv)
            elif name == 'ribbon': fx_ribbon(cv)
            elif name == 'rays': fx_rays(cv, *args)
            elif name == 'shards': fx_shards(cv, *args)
            elif name == 'cracks': fx_cracks(cv, args[0], pts)
            elif name == 'sparkle_gold':
                for sx, sy in ((5, 5), (39, 3), (33, 9)): star(cv, sx, sy, (255, 220, 90, 255))
    run(sp.get('back', []))
    pts = shape_set(sp['shape'])
    pattern = sp.get('pattern')
    paint_body(cv, pts, hexc(sp['c1']), hexc(sp['c2']) if sp.get('c2') else None, mode=sp.get('mode', 'light'),
               alpha=sp.get('alpha', 255), pattern='mottle' if pattern == 'mottle_s' else pattern)
    if pattern == 'mottle_s':
        for (x, y) in pts:
            if (x * 5 + y * 3) % 7 == 0:
                c = cv.get(x, y); cv.put(x, y, light(c, 0.25)[:3] + (c[3],))
    if sp.get('cube'):
        cube_faces(cv, pts)
    run(sp.get('front', []))
    ex = 20 if sp['shape'] == 'cube' else CX
    ey = sp.get('ey', 22 if sp['shape'] in ('cloud',) else 21 if sp['shape'] != 'drop' else 19)
    face_v(cv, sp.get('face', 'normal'), ex, ey)
    if sp['shape'] in ('dome', 'drop', 'cloud'):
        shine(cv, pts, 14 if sp['shape'] != 'drop' else 17, 16 if sp['shape'] != 'drop' else 14)
    cv.outline()
    if sp.get('glow'):
        glow(cv, pts, sp['glow'], 2 if sp['shape'] == 'orb' else 1, 90)
    run(sp.get('after', []))
    if sp.get('star'):
        star(cv, 40, 13); star(cv, 4, 4)
    return cv.image()



# =====================================================================
# 비밀 족보(말장난) 11종: 표정·소품 부품 추가
# =====================================================================
DARK = (27, 27, 42, 255)


def face_fun(cv, kind, ex=CX, ey=21):
    if kind == 'laugh':        # ^ ^ 눈 + 크게 벌린 입
        for x0 in (ex - 8, ex + 4):
            cv.put(x0, ey + 2, DARK); cv.put(x0 + 1, ey + 1, DARK); cv.put(x0 + 2, ey, DARK); cv.put(x0 + 3, ey + 1, DARK); cv.put(x0 + 4, ey + 2, DARK)
        cv.rect(ex - 3, ey + 4, 6, 3, DARK); cv.rect(ex - 2, ey + 6, 4, 1, (240, 90, 110, 255))
    elif kind == 'cool':       # 선글라스
        cv.rect(ex - 10, ey, 8, 4, DARK); cv.rect(ex + 2, ey, 8, 4, DARK); cv.rect(ex - 2, ey + 1, 4, 1, DARK)
        cv.put(ex - 9, ey + 1, (120, 140, 180, 255)); cv.put(ex + 3, ey + 1, (120, 140, 180, 255))
        cv.rect(ex - 2, ey + 6, 5, 1, DARK); cv.put(ex + 3, ey + 5, DARK)
    elif kind == 'kiss':       # 감은 눈 + 뽀뽀 입
        for x0 in (ex - 8, ex + 4):
            cv.rect(x0, ey + 2, 4, 1, DARK)
        cv.rect(ex - 1, ey + 5, 2, 2, (230, 60, 110, 255))
        for bx in (ex - 11, ex + 9):
            cv.rect(bx, ey + 4, 3, 2, (255, 120, 160, 255))
    elif kind == 'worried':    # 걱정 눈썹
        face(cv, ex, ey)
        cv.put(ex - 8, ey - 1, DARK); cv.put(ex - 7, ey - 2, DARK); cv.put(ex + 8, ey - 1, DARK); cv.put(ex + 7, ey - 2, DARK)
        cv.rect(ex - 2, ey + 6, 4, 1, DARK)
    elif kind == 'hush':       # 졸린 눈 + 입 앞 손가락
        face(cv, ex, ey, sleepy=True)
        cv.rect(ex, ey + 3, 2, 6, (255, 220, 190, 255))
    else:
        face_v(cv, kind, ex, ey)


def fx_hearts(cv):
    hrt = [(0, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (2, 1), (3, 1), (0, 2), (1, 2), (2, 2), (1, 3)]
    for ox, oy in ((5, 5), (35, 3), (30, 10)):
        for x, y in hrt:
            cv.put(ox + x, oy + y, (255, 90, 140, 255))


def fx_santa(cv):
    red, white = (220, 40, 50, 255), (250, 250, 250, 255)
    for k in range(8):           # 모자(삼각형) - 몸통 위쪽에 얹음
        for x in range(CX - 9 + k, CX + 10 - k * 2 + k):
            cv.put(x, 11 - k, red)
    cv.rect(CX - 11, 11, 23, 3, white)          # 흰 테두리
    for x, y in ((CX + 5, 2), (CX + 6, 2), (CX + 5, 3), (CX + 6, 3), (CX + 7, 3)):
        cv.put(x, y, white)                       # 방울


def fx_beard(cv, pts):
    for (x, y) in pts:
        if y >= 26 and abs(x - CX) < 14 - (y - 26):
            cv.put(x, y, (248, 248, 250, 255))


def fx_popcorn(cv):
    for bx, by in ((8, 6), (15, 2), (30, 3), (37, 8), (23, 0)):
        for x, y in ((0, 0), (1, 0), (0, 1), (1, 1), (2, 1), (1, 2)):
            cv.put(bx + x, by + y, (255, 248, 220, 255))
        cv.put(bx + 2, by, (255, 210, 90, 255))


def fx_zzz(cv):
    for ox, oy, s in ((33, 2, 3), (38, 7, 2)):
        for k in range(s + 1):
            cv.put(ox + k, oy, (220, 230, 255, 255)); cv.put(ox + s - k, oy + k, (220, 230, 255, 255)); cv.put(ox + k, oy + s, (220, 230, 255, 255))


def fx_puffs(cv):
    for sx in (16, 22, 28):
        for k in range(6):
            cv.put(sx + round(math.sin(k * 1.1) * 1.3), 8 - k, (250, 252, 255, 255))


def fx_panel(cv):
    cv.rect(13, 27, 12, 4, (40, 60, 80, 255)); cv.rect(14, 28, 3, 2, (120, 255, 160, 255)); cv.put(20, 28, (255, 120, 80, 255))


def fx_burst(cv):
    for k in range(16):
        a = k / 16 * math.pi * 2; r = 7 if k % 2 else 4
        for rr in range(r + 1):
            cv.put(CX + 6 + round(math.cos(a) * rr), 6 + round(math.sin(a) * rr), (255, 210, 60, 255) if rr < r - 1 else (255, 110, 40, 255))


def fx_rivets(cv, pts):
    for (x, y) in pts:
        if (x in (12, 28) and y % 5 == 0) or (y in (17, 31) and x % 5 == 0):
            cv.put(x, y, (200, 205, 215, 255))


def fx_stem(cv):
    cv.rect(CX - 1, 2, 3, 5, (110, 80, 40, 255)); cv.rect(CX - 1, 1, 3, 1, (70, 50, 25, 255))
    for k in range(5):           # 껍질 날개
        cv.put(CX - 4 - k, 9 + k, (255, 225, 80, 255)); cv.put(CX + 4 + k, 9 + k, (255, 225, 80, 255))


def fx_stripes(cv, pts):
    for (x, y) in pts:
        a = (math.degrees(math.atan2(y - 21, x - CX)) + 360) % 90
        if a < 45:
            cv.put(x, y, (250, 250, 250, 255))
    for (x, y) in pts:          # 가운데 구멍(구명튜브)
        if math.hypot(x - CX, y - 21) < 4:
            cv.put(x, y, (58, 70, 96, 0))


JOKE_SPEC = {
    'HEHE':   dict(shape='dome', c1='#fff1a8', c2='#f0d070', face='laugh', after=[('sparkles', '#ffffff')]),
    'NANA':   dict(shape='drop', c1='#ffe14a', c2='#e0b020', face='laugh', back=[('stem',)]),
    'SUN':    dict(shape='orb', c1='#ffcf3a', c2='#ff8a1a', mode='radial', face='cool', after=[('rays', '#ffb020')], glow='#ffd060'),
    'SOS':    dict(shape='orb', c1='#ff4a4a', c2='#d03030', face='worried', front=[('stripes',)], fey=13),
    'HOHOHO': dict(shape='dome', c1='#e03a3a', c2='#b02020', face='laugh', back=[('santa',)], front=[('beard',)], fey=19),
    'CHUU':   dict(shape='dome', c1='#ff9ad0', c2='#ff6ab0', face='kiss', after=[('hearts',)]),
    'CON':    dict(shape='cloud', c1='#fff6d8', c2='#f0d890', face='laugh', back=[('popcorn',)]),
    'HUSH':   dict(shape='ghost', c1='#4a5aa0', c2='#2a3a7a', alpha=240, face='hush', after=[('zzz',)], fey=17),
    'COOKER': dict(shape='cube', c1='#f2f6fc', c2='#c8d2e0', cube=True, face='laugh', back=[('puffs',)], front=[('panel',)], fex=20, fey=19),
    'NADIVE': dict(shape='drop', c1='#4aa8ff', c2='#2a70d0', face='worried', back=[('burst',)]),
    'FEFEFE': dict(shape='cube', c1='#7a8090', c2='#4a5060', cube=True, face='angry', front=[('rivets',)], fex=20),
}


def build_joke(key):
    sp = JOKE_SPEC[key]; cv = Canvas()
    def run(items, pts=None):
        for it in items:
            n, args = it[0], it[1:]
            {'stem': lambda: fx_stem(cv), 'santa': lambda: fx_santa(cv), 'popcorn': lambda: fx_popcorn(cv),
             'puffs': lambda: fx_puffs(cv), 'burst': lambda: fx_burst(cv), 'hearts': lambda: fx_hearts(cv),
             'zzz': lambda: fx_zzz(cv), 'panel': lambda: fx_panel(cv),
             'beard': lambda: fx_beard(cv, pts), 'rivets': lambda: fx_rivets(cv, pts), 'stripes': lambda: fx_stripes(cv, pts),
             'rays': lambda: fx_rays(cv, *args),
             'sparkles': lambda: [star(cv, x, y, (255, 255, 255, 255)) for x, y in ((4, 6), (40, 9), (36, 2))]}[n]()
    run(sp.get('back', []))
    pts = shape_set(sp['shape'])
    paint_body(cv, pts, hexc(sp['c1']), hexc(sp['c2']), mode=sp.get('mode', 'light'), alpha=sp.get('alpha', 255))
    if sp.get('cube'):
        cube_faces(cv, pts)
    run(sp.get('front', []), pts)
    if key == 'SOS':  # 구명튜브 구멍: 투명 처리
        for (x, y) in list(cv.px):
            if cv.px[(x, y)][3] == 0:
                del cv.px[(x, y)]
    face_fun(cv, sp.get('face', 'normal'), sp.get('fex', CX), sp.get('fey', 21 if sp['shape'] != 'drop' else 19))
    if sp['shape'] in ('dome', 'drop', 'cloud') and key != 'HOHOHO':
        shine(cv, pts, 14 if sp['shape'] != 'drop' else 17, 16 if sp['shape'] != 'drop' else 14)
    cv.outline()
    if sp.get('glow'):
        glow(cv, pts, sp['glow'], 2, 90)
    run(sp.get('after', []), pts)
    for x, y in ((41, 16), (3, 15)):  # 비밀 족보 공통 표식: 음표 모양 반짝이
        cv.put(x, y, (255, 160, 220, 255)); cv.put(x, y - 1, (255, 160, 220, 255)); cv.put(x + 1, y - 2, (255, 160, 220, 255))
    return cv.image()

SPECIAL_KEYS = ['STEAM', 'PLASMA', 'SHOCK', 'FROST', 'STORM', 'MUD', 'MIASMA', 'FUSION',
                'H2O', 'CO2', 'NaCl', 'NH3', 'Fe2O3', 'H2SO4', 'mix']


def main_special():
    os.makedirs(OUT, exist_ok=True)
    for k in SPECIAL_KEYS:
        special(k).save(f'{OUT}/slime_{k}.png')
    for k in SPEC:
        build(k).save(f'{OUT}/slime_{k}.png')
    for k in JOKE_SPEC:
        build_joke(k).save(f'{OUT}/slime_{k}.png')
    print(len(SPECIAL_KEYS) + len(SPEC) + len(JOKE_SPEC), 'combo slimes:', ' '.join(SPECIAL_KEYS + list(SPEC) + list(JOKE_SPEC)))


if __name__ == '__main__':
    main()          # 기본 29종 생성
    main_special()  # 조합 15종을 전용 그림으로 덮어씀
