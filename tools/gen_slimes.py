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


if __name__ == '__main__':
    main()
