#!/usr/bin/env python3
"""Collect a bounded non-commercial DIY Dog demo archive and verify image files.

No credentials or subscriptions. Source descriptions and recipe values are
archival, not assertions about current commercial products. Run from any cwd.
"""
import concurrent.futures
import hashlib
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
API = "https://punkapi-alxiw.amvera.io/v3/"
SOURCE = "https://github.com/alxiw/punkapi"
PDF = "https://brewdogmedia.s3.eu-west-2.amazonaws.com/docs/2019+DIY+DOG+-+V8.pdf"
LICENSE = "https://github.com/sammdec/punkapi/blob/master/LICENSE"

# Explicit editorial translations of the source description/tagline, not
# generated numerical sensory scores. Ingredients are copied separately.
SELECTION = {
    1: ("American IPA", "美式 IPA", "早期 Punk IPA，以葡萄柚、菠萝和荔枝香气铺开，收尾带鲜明苦感。", ["柑橘", "热带水果"], ["辣味烤牛肉", "芒果辣椒鸡肉塔可", "百香果芝士蛋糕"]),
    4: ("Stout", "世涛", "柔和顺滑的深色世涛，以浓郁巧克力风味为主。", ["巧克力", "顺滑"], ["香煎扇贝", "香煎鹿肉", "焦糖苹果派"]),
    14: ("Pale Ale", "淡色艾尔", "以百香果般的酒花香气为亮点，保持鲜明的酒花个性。", ["热带水果", "酒花"], ["柠檬鲜蟹", "山羊奶酪沙拉"]),
    21: ("Imperial Stout", "帝国世涛", "深色、浓厚的烘烤风味，是这款咖啡帝国世涛的主轴。", ["烘烤", "咖啡"], ["巧克力布朗尼", "芝士土豆泥配炸牛排"]),
    26: ("Ale", "艾尔", "莓果与焦糖交织，伴有果酱、巧克力、香料和烤面包气息。", ["莓果", "焦糖", "巧克力", "香料", "烘烤"], ["切达奶酪黑麦吐司", "摩洛哥鸡肉塔吉锅"]),
    29: ("Imperial Stout", "帝国世涛", "以特色麦芽、茉莉和蔓越莓酿造，再经烘烤法国橡木片陈放。", ["花香", "莓果", "烟熏"], ["蔓越莓汁烤牛肉", "蜂蜜火腿", "深色水果蛋糕"]),
    32: ("Low-alcohol Ale", "低醇艾尔", "0.5% 酒精度，搭配多种美式酒花与八种特色麦芽，强调完整的酒花表现。", ["酒花", "麦香"], ["蘑菇意大利面"]),
    37: ("Imperial IPA", "帝国 IPA", "焦糖麦芽托起浓烈的美式酒花，呈现柑橘、树脂和强烈苦感。", ["柑橘", "树脂", "焦糖"], ["蓝纹奶酪辣鸡翅", "辣汁香煎扇贝", "巧克力焦糖芝士蛋糕"]),
    55: ("Single-hop IPA", "单一酒花 IPA", "Citra 带来葡萄柚、橙子与柑橘香，伴随松针树脂和黑加仑气息。", ["柑橘", "松针", "莓果"], ["柠檬香草三文鱼", "切达奶酪配芒果酸辣酱"]),
    56: ("Single-hop IPA", "单一酒花 IPA", "Nelson Sauvin 呈现百香果、热带水果、醋栗与树脂感，由麦芽底色平衡。", ["热带水果", "树脂", "麦香"], ["烤哈罗米奶酪沙拉", "烤卡芒贝尔奶酪", "蟹肉饼"]),
    69: ("English IPA", "英式 IPA", "重现旧式远洋 IPA：中等酒体、复杂麦芽、木质与泥土般英式酒花气息。", ["麦香", "木质", "泥土"], ["蜂蜜火腿配辣烤胡萝卜", "熟成切达奶酪", "蜜桃馅饼"]),
    70: ("Russian Imperial Stout", "俄罗斯帝国世涛", "厚实酒体承载巧克力、咖啡与烘烤风味，摩卡和糖蜜感由酒花苦味平衡。", ["巧克力", "咖啡", "烘烤", "糖蜜"], ["黑椒汁牛排", "蓝纹奶酪燕麦饼", "巧克力芝士蛋糕"]),
    77: ("Porter", "波特", "柑橘、树脂与香料酒花气息之下，藏着烘烤麦芽、太妃糖、苦巧克力和木烟。", ["柑橘", "树脂", "烘烤", "巧克力", "烟熏"], ["蓝纹奶酪牛肉汉堡", "酱烤牛小排", "巧克力蛋糕"]),
    84: ("West Coast IPA", "西海岸 IPA", "轻盈太妃糖与焦糖麦芽，衬托柠檬草、青柠皮、葡萄柚及热带水果香。", ["柑橘", "热带水果", "焦糖"], ["巴哈风味鱼肉塔可", "牙买加香辣鸡", "苹果酥"]),
    99: ("Single-hop IPA", "单一酒花 IPA", "Simcoe 带来菠萝、木瓜、柑橘与松针感，少量焦糖麦芽增加层次。", ["热带水果", "柑橘", "松针", "焦糖"], ["香料蔓越莓火鸡", "辣酱球芽甘蓝", "姜味米布丁"]),
    101: ("Russian Imperial Stout", "俄罗斯帝国世涛", "可可碎、咖啡豆、香草荚与烘烤橡木构成浓厚世涛，苦味平衡巧克力甜感。", ["巧克力", "咖啡", "香草", "烘烤"], ["烟熏手撕牛胸肉", "浓缩咖啡外壳鹿肉", "香草冰淇淋阿芙佳朵"]),
    120: ("Saison", "赛松", "融合比利时赛松与美式 IPA，加入碎胡椒和石楠蜂蜜，带有果香与香辛感。", ["果香", "香料", "蜂蜜"], ["蒜香贻贝", "蟹肉热三明治", "黄油酥饼"]),
    144: ("Barrel-aged Scotch Ale", "桶陈苏格兰艾尔", "波本桶陈放带来香草、烤面包、巧克力和姜饼气息，酒体轻盈偏干。", ["香草", "烘烤", "巧克力", "香料"], ["卡真香料牛肉", "手撕猪肉", "焦糖巧克力酥饼"]),
    155: ("Witbier", "比利时小麦", "加入洛神花的低酒精度小麦啤酒，呈粉红色，酸感、苦味与酒体保持平衡。", ["酸爽"], ["草莓蟹肉寿司", "洋蓟鸡肉热三明治", "卡普雷塞沙拉"]),
    196: ("Sour IPA", "酸 IPA", "酸感与苦味并行，松针气息叠加树莓、蓝莓和酸樱桃的果味。", ["酸爽", "松针", "莓果"], ["烤南瓜配马苏里拉奶酪", "黑森林蛋糕"]),
    199: ("Pumpkin Ale", "南瓜艾尔", "鲜明香料之后是明亮柑橘，伴随烤棉花糖和太妃糖苹果般的秋日气息。", ["香料", "柑橘", "焦糖"], ["枫糖培根浓汤", "香料鸡肉蔬菜炖锅", "南瓜派"]),
    211: ("IPA", "柑橘 IPA", "原型版 Elvis Juice，以葡萄柚皮、松针、花香和树脂感叠加干爽饼干麦芽。", ["柑橘", "松针", "花香", "树脂", "麦香"], ["墨西哥酸橘汁腌鱼", "青柠香菜泰式绿咖喱", "葡萄柚舒芙蕾"]),
    215: ("Oatmeal Milk Stout", "燕麦牛奶世涛", "烘烤咖啡与巧克力开场，燕麦带来丝绒口感，余味出现香草和深色莓果。", ["咖啡", "巧克力", "烘烤", "香草", "莓果"], ["牡蛎炸饼", "牛腱炖菜"]),
    247: ("Porter", "椰子香草波特", "以椰子、香草与可可酿造的深色波特。", ["椰子", "香草", "巧克力"], ["仁当牛肉", "椰子杏仁饼", "鲜奶油泡芙"]),
    268: ("New England IPA", "新英格兰 IPA", "低背景苦感与饱满顺滑酒体，承载松针、核果、芒果、轻微树脂和青柠皮。", ["热带水果", "松针", "柑橘", "核果", "顺滑"], ["山羊奶酪意式烤面包", "香煎柠檬鳎鱼", "柑橘烤桃"]),
    310: ("Session IPA", "轻盈 IPA", "2017 原型挑战获胜配方，以橘子浸入的低强度 IPA 为特色。", ["柑橘"], ["薄荷羊肉塔吉锅", "橘子海绵蛋糕", "牛油果石榴沙拉"]),
    357: ("Sour Ale", "果味酸艾尔", "加入葡萄柚和橘子的轻盈酸艾尔，风味直接，适合作为酸啤入门。", ["柑橘", "酸爽"], ["桶陈菲达奶酪沙拉", "牛油果吐司", "香料橙子挞"]),
    364: ("Low-alcohol Berliner Weisse", "低醇柏林小麦", "0.5% 酒精度的柏林酸小麦，以树莓方向的丰富果味演绎锅内酸化配方。", ["莓果", "酸爽"], ["意式香醋鸡肉", "布里山羊奶酪披萨", "白巧克力曲奇"]),
    366: ("Pilsner", "皮尔森", "清脆拉格底色上，Saphir 酒花带来柑橘和核果，伴随烤吐司、香料和青柠果酱。", ["清爽", "柑橘", "核果", "烘烤", "香料"], ["越南河粉", "布法罗鸡翅", "生鱼片"]),
    387: ("Barrel-aged Imperial Stout", "桶陈帝国世涛", "波本桶陈酿的深色世涛，樱桃、西梅、葡萄干和森林水果之下是浓稠甜润酒体。", ["果干", "莓果", "甜润"], ["烧烤排骨", "伊顿麦斯甜点"]),
    410: ("Scottish Sour Ale", "苏格兰酸艾尔", "Cosmic Crush 单一水果酸啤系列的树莓版本。", ["莓果", "酸爽"], ["山羊奶酪", "白巧克力芝士蛋糕", "菊苣核桃无花果沙拉"]),
    413: ("Scottish Sour Ale", "苏格兰酸艾尔", "将蓝莓与薰衣草的组合带入苏格兰酸艾尔，结合莓果和花香。", ["莓果", "花香", "酸爽"], ["卡芒贝尔奶酪", "意式奶冻", "雉鸡胸肉"]),
}


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "BrewAtlas-noncommercial-demo/1.0"})
    with urllib.request.urlopen(request, timeout=35) as response:
        return response.read(), response.headers.get("Content-Type", "")


def collect_one(item):
    ident, editorial = item
    payload, content_type = get(f"{API}beers/{ident}")
    raw = json.loads(payload)
    assert raw["id"] == ident and raw["image"] != "keg.png"
    image_url = f"{API}images/{raw['image']}"
    image_payload, image_type = get(image_url)
    assert image_type.startswith("image/png") and image_payload.startswith(b"\x89PNG\r\n\x1a\n")
    filename = f"archive-{ident:03}.png"
    (ROOT / "public/images" / filename).write_bytes(image_payload)
    style, style_zh, description, flavors, pairings = editorial
    ingredients = raw.get("ingredients", {})
    result = {
        "id": f"archive-{ident:03}", "name": raw["name"], "breweryId": "brewdog-ellon",
        "style": style, "styleZh": style_zh, "abv": raw.get("abv"), "ibu": raw.get("ibu"),
        "srm": raw.get("srm"), "description": description, "originalDescription": raw["description"],
        "flavors": flavors, "hops": list(dict.fromkeys(x["name"] for x in ingredients.get("hops", []))),
        "malts": list(dict.fromkeys(x["name"] for x in ingredients.get("malt", []))),
        "yeast": ingredients.get("yeast"), "foodPairings": pairings, "firstBrewed": raw.get("first_brewed"),
        "image": f"/images/{filename}", "imageSource": image_url,
        "imageCredit": "BrewDog · DIY Dog V8；alxiw/punkapi 提取；仅非商业原型测试，非 MIT 品牌素材授权",
        "sourceUrls": [f"{API}beers/{ident}", SOURCE, PDF, LICENSE],
        "sourceNote": "DIY Dog 历史配方，中文风味由原描述/副标题整理。地图按 BrewDog 品牌归档至 Ellon，不表示每个历史批次最初均在此生产。",
        "collection": "archive",
    }
    return result, {"id": result["id"], "imageSha256": hashlib.sha256(image_payload).hexdigest(), "imageBytes": len(image_payload), "raw": raw}


def main():
    existing = ROOT / "public/data/archive.json"
    if existing.is_file() and len(json.loads(existing.read_text()).get("beers", [])) > len(SELECTION):
        raise SystemExit("档案已扩容。请运行 python3 scripts/expand-archive.py；原始收集器不会覆盖扩容版。")
    (ROOT / "public/data").mkdir(parents=True, exist_ok=True)
    (ROOT / "public/images").mkdir(parents=True, exist_ok=True)
    (ROOT / "research").mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        rows = list(executor.map(collect_one, SELECTION.items()))
    beers = [row[0] for row in rows]
    assert len(beers) == 32 and len({r[1]["imageSha256"] for r in rows}) == 32
    brewery = {
        "id": "brewdog-ellon", "name": "BrewDog (Ellon)", "nameZh": "酿酒狗 · 埃隆",
        "country": "United Kingdom", "countryZh": "英国", "city": "Ellon, Scotland",
        "lat": 57.37214, "lng": -2.05818, "locationPrecision": "brewery", "year": None,
        "website": "https://brewdog.com",
        "description": "BrewDog 位于苏格兰埃隆的酿造园区。本页汇集品牌 DIY Dog 历史配方；早期配方不等同于在此首次酿造。",
        "sourceUrls": ["https://brewdog.com/pages/customer-service-contact-us", "https://www.trove.scot/place/320338?display=image", "https://efp.brewdog.com/es/blog/diy-dog"],
    }
    (ROOT / "public/data/archive.json").write_text(json.dumps({"breweries": [brewery], "beers": beers}, ensure_ascii=False, indent=2) + "\n")
    lines = [
        "# BrewDog archive sources", "", "Collected: 2026-09-14. Purpose: local non-commercial interactive demo. No account or paid service.", "",
        "## Dataset and license", "",
        f"- API and repository: [{SOURCE}]({SOURCE}). The checked catalogue contains 415 BrewDog DIY Dog recipes. This demo selects 32.",
        f"- Recipe and image upstream: [BrewDog DIY Dog V8 PDF]({PDF}).",
        f"- [Original Punk API data license]({LICENSE}) explicitly permits free use, verbatim replication and sharing but excludes commercial use. The repository's MIT software license is not a general commercial license to BrewDog images or brands.",
        "- Images are locally saved source PNG files for the user-requested offline demo. All 32 returned HTTP 200 with PNG content types and PNG signatures; 32 unique SHA256 hashes. No keg placeholders.",
        "- ABV/IBU/SRM describe archival recipe entries. Do not represent these as today's packaging specifications. Missing values remain null.",
        "- Chinese descriptions are concise editorial translations; flavor tags summarize source description/tagline. No numeric sensory scores, ratings, or invented coordinates. Food pairings are translated from supplied entries, sometimes shortened.",
        "- Original descriptions are retained per beer for verification. Code fetching source fields remains in scripts/collect-archive.py.", "",
        "## Brewery location", "",
        "- [BrewDog official contact page](https://brewdog.com/pages/customer-service-contact-us) identifies the brewery address as Balmacassie Industrial Estate, Ellon, Aberdeenshire AB41 8BX.",
        "- [Historic Environment Scotland record 320338](https://www.trove.scot/place/320338?display=image) gives brewery latitude 57.37214, longitude -2.05818 and approximately 100 metre location precision. This is a site reference point, not an entrance or navigation pin.",
        "- Brewery year is left null because brand founding and Ellon site opening are different events.",
        "- [BrewDog DIY Dog introduction](https://efp.brewdog.com/es/blog/diy-dog) confirms early operations began in Fraserburgh. The map relates these beers to the BrewDog brand's Ellon archive hub, not to a claimed exact historical production facility for every recipe. The UI should retain the archive label.", "",
        "## Image and API audit", "", "| Beer | API source | Image source | Bytes | SHA256 |", "|---|---|---|---:|---|",
    ]
    for beer, audit in rows:
        lines.append(f"| {beer['name']} | [JSON]({beer['sourceUrls'][0]}) | [PNG]({beer['imageSource']}) | {audit['imageBytes']} | `{audit['imageSha256']}` |")
    lines += ["", "## Editorial edge cases", "", "- Nanny State and Raspberry Blitz are recorded at 0.5% ABV, displayed as low-alcohol rather than claiming zero alcohol.", "- Coffee Imperial Stout's coffee tag is additionally supported by its source name and tagline. Several tags similarly use the original beer name/tagline as well as its description; none derive from an unsupported flavor model.", "- Sorachi Ace's hop attribute values such as Aroma or Bitter are process roles; they are not treated as sensory flavors.", "- Public commercial deployment requires a fresh data/image authorization decision. This demo does not resolve those rights."]
    (ROOT / "research/ARCHIVE-SOURCES.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"beers": len(beers), "breweries": 1, "uniqueImages": 32, "totalImageBytes": sum(r[1]["imageBytes"] for r in rows), "abvRange": [min(x["abv"] for x in beers), max(x["abv"] for x in beers)]}))


if __name__ == "__main__":
    main()
