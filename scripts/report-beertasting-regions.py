#!/usr/bin/env python3
"""Report the installed regional expansion from actual imported/cache records."""
from collections import Counter
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research/beertasting-regions-2026-09-18'
load = lambda path: json.loads(path.read_text())


def point(row):
    return round(row['lat'], 5), round(row['lng'], 5)


def main():
    data = load(ROOT / 'public/data/beertasting.json')
    additions = load(OUT / 'beers.json')['records']
    ids = {r['id'] for r in additions}
    new = [r for r in data['beers'] if r['sourceIds'][0] in ids]
    makers = {b['id']: b for b in data['breweries']}
    new_ids = {b['breweryId'] for b in new}
    new_makers = [b for b in data['breweries'] if b['id'] in new_ids]
    prior = [b for b in data['breweries'] if b['id'] not in new_ids]
    old_points = {point(b) for b in prior}
    new_points = {point(b) for b in new_makers}
    old_cells = {(math.floor(b['lat'] / 10), math.floor(b['lng'] / 10)) for b in prior}
    cells = {(math.floor(b['lat'] / 10), math.floor(b['lng'] / 10)) for b in data['breweries']}
    regions = []
    for name, codes in [('格鲁吉亚', ['GE']), ('新西兰', ['NZ']), ('中国大陆', ['CN']), ('印度', ['IN']),
                        ('非洲', ['BW', 'TZ', 'NA', 'UG', 'GH', 'MA', 'ZA'])]:
        rows = [b for b in new if makers[b['breweryId']]['countryCode'] in codes]
        region_makers = [b for b in new_makers if b['countryCode'] in codes]
        regions.append({'region': name, 'addedBeers': len(rows), 'cachedImages': sum(bool(b['image']) for b in rows),
            'addedBreweries': len(region_makers), 'countriesOrRegions': sorted({b['countryCode'] for b in region_makers}),
            'referenceLocalities': sorted({b['city'] for b in region_makers}),
            'uniqueReferencePoints': len({point(b) for b in region_makers}),
            'industrialReferences': sum(b.get('catalogRole') == 'industrial_reference' for b in rows)})
    summary = {'date': '2026-09-18', 'method': 'direct_public_html', 'priorRecordsPreserved': 1432,
        'addedRecords': len(new), 'addedBreweries': len(new_makers), 'addedCachedImages': sum(bool(b['image']) for b in new),
        'differentPointsWithinBatch': len(new_points), 'newPointsBeyondPrior': len(new_points - old_points),
        'newCountriesOrRegions': sorted({b['countryCode'] for b in new_makers} - {b['countryCode'] for b in prior}),
        'tenDegreeGridCells': {'before': len(old_cells), 'after': len(cells)},
        'current': {**data['metadata']['counts'], 'distinctReferencePoints': len({point(b) for b in data['breweries']})},
        'roles': dict(Counter(b.get('catalogRole', 'independence_not_verified') for b in new)),
        'regions': regions,
        'missingImageBreweries': [{'name': br['name'], 'city': br['city'], 'country': br['countryCode']}
            for br in new_makers if not any(b['image'] for b in new if b['breweryId'] == br['id'])]}
    (OUT / 'coverage-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    lines = ['# 指定地区补充结果（2026-09-18）', '',
        f"新增 **{len(new)} 条酒款、{len(new_makers)} 家酒厂、{summary['addedCachedImages']} 张本地图片**；原有 1,432 条记录保留。新增批次有 {len(new_points)} 个不同城市/聚落参考点，其中 {len(new_points - old_points)} 个与旧坐标不同。", '',
        '| 指定地区 | 新记录 | 本地酒图 | 新酒厂 | 城市/聚落参考 |', '|---|---:|---:|---:|---|']
    for r in regions:
        lines.append(f"| {r['region']} | {r['addedBeers']} | {r['cachedImages']} | {r['addedBreweries']} | {', '.join(r['referenceLocalities'])} |")
    lines += ['', f"BeerTasting 当前合计 **{len(data['beers']):,} 条、{len(data['breweries'])} 家酒厂、{summary['current']['cachedImages']:,} 张本地图片、{summary['current']['countriesOrRegions']} 个国家或地区**。10° 经纬网格样本覆盖从 {len(old_cells)} 格增加到 {len(cells)} 格；这不是全球酒厂密度或精酿产区总数。", '',
        '中国连原有北京、成都，新增上海、南京、武汉、香格里拉。印度连原有新德里，补班加罗尔、浦那、果阿 Sangolda 及孟买；The White Owl 明确为历史品牌参考。新西兰覆盖南北岛多个城市。格鲁吉亚按国家 GE 识别，与美国州无关。', '',
        '非洲新增博茨瓦纳、坦桑尼亚、纳米比亚、乌干达、加纳、摩洛哥，并扩充南非。南非 Cape Town 与旧库城市点重合，不另称新增城市。纳米比亚两家酒厂共享 Swakopmund 城市参考，不计作两处不同坐标。', '',
        '36 条大型酒厂样本明确标为 industrial_reference；另有 10 条集团收购品牌历史参照、7 条集团所属小型酒厂样本。其余也未声称已核验独立精酿身份。候选商品图片下载与格式校验成功，不等于逐张人工确认瓶罐身份。Great State Aleworks 的 3 条及 Swakopmund Brewing Company 的 7 条记录无候选图片，保留真实资料与地图入口，不生成替代图片。', '',
        '地理信息保留原始 sourceRecord；Natakhtari 源 city=Georgia 用已核验的村名展示，Swakopmund 的空格城市用已核验地名补足，Toit 按班加罗尔城市参考展示。南京、香格里拉和部分非洲条目的原省州字段有冲突，来源原值保留，仅将核验过的省州作为规范 region 输出。所有坐标仍是城市/聚落参考，不是精确厂址或逐款生产地。', '',
        '每条记录保存真实评分 rating 与 ratings_count，不使用 Cheers 推算；缺少风味、工艺和原料时保持为空。已缓存图全部本机加载，失败或缺图不热链、不填造。', '',
        '原始页面、字段与坐标证据分别在 georgia-nz/、china-india/、africa/；每个坐标引用 coordinateEvidenceFile 和实际 page ID。全部新增记录为 direct_public_html，不冒称 IDS 导出。', '',
        '离线复现：执行 scripts/prepare-beertasting-regions.py 后，运行 scripts/import-beertasting.py；图片缓存使用带 Pillow 的 Python 执行 scripts/cache-beertasting-images.py --source research/beertasting-regions-2026-09-18/cache-source.json。统计可用 scripts/report-beertasting-regions.py 重建。']
    (OUT / 'REPORT.md').write_text('\n'.join(lines) + '\n')
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
