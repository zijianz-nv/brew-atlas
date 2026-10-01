#!/usr/bin/env python3
"""Report a merged geographic batch from actual imported records and local files.

No network requests or data mutations. --directory selects another compatible
batch; all counts are derived from its source IDs and the installed dataset.
"""
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIRECTORY = ROOT / 'research/beertasting-density-2026-09-18'
CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']
CONTINENT_ZH = dict(zip(CONTINENTS, ['非洲', '亚洲', '欧洲', '北美洲', '南美洲', '大洋洲']))


def load(path):
    return json.loads(path.read_text())


def save(path, value):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def source_id(row):
    result = row['sourceRecord']['id']
    assert result in row['sourceIds'], row['id']
    return result


def point(maker):
    lat, lng = maker.get('lat'), maker.get('lng')
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return None
    if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError(f"Invalid coordinate: {maker['id']}")
    return round(lat, 5), round(lng, 5)


def report(data_path, directory):
    installed = load(data_path)
    source = load(directory / 'beers.json')
    merge = load(directory / 'merge-audit.json')
    additions = {r['id']: r for r in source['records']}
    assert len(additions) == len(source['records']) == source['selected_count']
    rows = installed['beers']
    all_ids = [source_id(r) for r in rows]
    assert len(all_ids) == len(set(all_ids)), 'Duplicate installed source IDs'
    assert additions.keys() <= set(all_ids), 'Batch is not fully imported yet'
    new = [r for r in rows if source_id(r) in additions]
    old = [r for r in rows if source_id(r) not in additions]
    old_hash = hashlib.sha256('\n'.join(source_id(r) for r in old).encode()).hexdigest()
    assert len(old) == merge['priorRecords'], 'Unexpected baseline size'
    assert old_hash == merge['originalIdsSha256'], 'Original IDs/order were not preserved'
    assert len(new) == merge['newRecords']
    makers = {b['id']: b for b in installed['breweries']}
    assert len(makers) == len(installed['breweries'])
    old_maker_ids = {r['breweryId'] for r in old}
    new_maker_ids = {r['breweryId'] for r in new}
    assert not old_maker_ids.intersection(new_maker_ids), 'Batch reuses an old brewery'
    assert len(new_maker_ids) == merge['newBreweries']
    assert old_maker_ids | new_maker_ids == set(makers), 'Unreferenced/missing brewery'

    cached = {}
    public = ROOT / 'public'
    for r in rows:
        status = r.get('imageCacheStatus')
        if status != 'cached':
            assert not r.get('image'), f"Non-cached row still has image: {r['id']}"
            cached[r['id']] = False
            continue
        for field in ['image', 'imageThumbnail', 'imageOriginal']:
            path = r.get(field)
            assert path and path.startswith('/images/beertasting/'), (r['id'], field)
            actual = (public / path.lstrip('/')).resolve()
            actual.relative_to(public.resolve())
            assert actual.is_file() and actual.stat().st_size > 0, (r['id'], field)
        cached[r['id']] = True

    def points(records):
        return {p for bid in {r['breweryId'] for r in records} if (p := point(makers[bid])) is not None}

    def image_points(records):
        return points([r for r in records if cached[r['id']]])

    def group(before, added, total):
        old_points = points(before)
        new_points = points(added)
        return {
            'beforeRecords': len(before), 'addedRecords': len(added), 'totalRecords': len(total),
            'beforeBreweries': len({r['breweryId'] for r in before}),
            'addedBreweries': len({r['breweryId'] for r in added}),
            'totalBreweries': len({r['breweryId'] for r in total}),
            'beforeReferencePoints': len(old_points), 'differentPointsWithinBatch': len(new_points),
            'newReferencePoints': len(new_points - old_points), 'totalReferencePoints': len(points(total)),
            'addedCandidateImageRecords': sum(additions[source_id(r)]['image_class'] == 'candidate' for r in added),
            'addedCachedImageRecords': sum(cached[r['id']] for r in added),
            'addedDescribedImageRecords': sum(bool(cached[r['id']] and r.get('description')) for r in added),
            'totalDescribedImageRecords': sum(bool(cached[r['id']] and r.get('description')) for r in total),
            'totalCachedImageRecords': sum(cached[r['id']] for r in total),
            'addedPointsWithCachedImages': len(image_points(added)),
            'referenceLocalities': sorted({makers[r['breweryId']]['city'] for r in added}),
            'addedIndustrialReferenceRecords': sum(r.get('catalogRole') == 'industrial_reference' for r in added),
        }

    def continent(r):
        value = r['sourceRecord'].get('sampling_continent')
        assert value in CONTINENTS, (r['id'], value)
        return value

    def country(r):
        return makers[r['breweryId']]['countryCode']

    countries = sorted({country(r) for r in rows})
    continent_stats = {name: group([r for r in old if continent(r) == name],
                                  [r for r in new if continent(r) == name],
                                  [r for r in rows if continent(r) == name]) for name in CONTINENTS}
    country_stats = {}
    for code in countries:
        value = group([r for r in old if country(r) == code],
                      [r for r in new if country(r) == code],
                      [r for r in rows if country(r) == code])
        maker = next(b for b in makers.values() if b['countryCode'] == code)
        country_stats[code] = {'name': maker['country'], 'nameZh': maker.get('countryZh'), **value}
    old_points, new_points, total_points = points(old), points(new), points(rows)
    grids = {}
    for size in (5, 10):
        previous = {(math.floor(lat / size), math.floor(lng / size)) for lat, lng in old_points}
        current = {(math.floor(lat / size), math.floor(lng / size)) for lat, lng in total_points}
        grids[str(size)] = {'degrees': size, 'before': len(previous), 'after': len(current), 'added': len(current - previous)}

    references = load(directory / 'brewery-locations.json')['records']
    osm = []
    for ref in references:
        if ref.get('coordinateProvider') != 'openstreetmap':
            continue
        evidence_file = ROOT / ref['coordinateEvidenceFile']
        evidence = load(evidence_file)
        node = next(n for n in evidence['response']['elements']
                    if n['type'] == 'node' and n['id'] == ref['coordinateSourceNodeId'])
        assert (node['lat'], node['lon']) == (ref['lat'], ref['lng'])
        osm.append({'place': ref['coordinatePlaceTitle'], 'nodeId': node['id'], 'nodeVersion': node['version'],
                    'sourceUrl': ref['coordinateSourceUrl'], 'queryUrl': ref['coordinateQueryUrl'],
                    'evidenceFile': ref['coordinateEvidenceFile'], 'lat': node['lat'], 'lng': node['lon'],
                    'attribution': evidence['response']['copyright'], 'licenseUrl': evidence['response']['license']})
    roles = Counter(r.get('catalogRole') or 'independence_not_verified' for r in new)
    role_makers = {}
    for role in roles:
        relevant = [r for r in new if (r.get('catalogRole') or 'independence_not_verified') == role]
        role_makers[role] = sorted({makers[r['breweryId']]['name'] for r in relevant})
    summary = {
        'generatedAt': datetime.now(timezone.utc).isoformat(), 'method': source['method'], 'batch': source['batch'],
        'sourceCapturedAt': source['updated_at'], 'priorRecordsPreserved': len(old),
        'priorBreweriesPreserved': len(old_maker_ids), 'originalIdsSha256': old_hash,
        'addedRecords': len(new), 'addedBreweries': len(new_maker_ids),
        'addedCandidateImages': sum(r['image_class'] == 'candidate' for r in additions.values()),
        'addedCachedImages': sum(cached[r['id']] for r in new),
        'addedUniqueCachedOriginalFiles': len({r['imageOriginal'] for r in new if cached[r['id']]}),
        'differentPointsWithinBatch': len(new_points), 'newPointsBeyondPrior': len(new_points - old_points),
        'addedPointsWithCachedImages': len(image_points(new)),
        'newCountriesOrRegions': sorted({country(r) for r in new} - {country(r) for r in old}),
        'geographicGridCells': grids,
        'current': {'beers': len(rows), 'breweries': len(makers), 'cachedImages': sum(cached.values()),
                    'countriesOrRegions': len(countries), 'distinctReferencePoints': len(total_points),
                    'pointsWithCachedImages': len(image_points(rows))},
        'continents': continent_stats, 'countries': country_stats,
        'roles': dict(roles), 'roleBreweries': role_makers,
        'missingImageBreweries': [{'name': makers[bid]['name'], 'city': makers[bid]['city'],
                                  'countryCode': makers[bid]['countryCode']}
                                 for bid in sorted(new_maker_ids)
                                 if not any(cached[r['id']] for r in new if r['breweryId'] == bid)],
        'locationPrecisionCounts': dict(Counter(r['locationPrecision'] for r in references)),
        'osmAttribution': osm,
        'imageCountMeaning': 'Counts records with all three local image variants present; unique original files are reported separately. Caching does not verify visual identity or reuse rights.',
        'pointCountMeaning': 'Unique reviewed city/settlement coordinates rounded to five decimal places; not production sites or a census of breweries.',
        'inputSha256': {'installedData': hashlib.sha256(data_path.read_bytes()).hexdigest(),
                        'batchRecords': hashlib.sha256((directory / 'beers.json').read_bytes()).hexdigest()},
    }
    save(directory / 'coverage-summary.json', summary)
    write_markdown(directory, summary)
    return summary


def write_markdown(directory, summary):
    s = summary
    lines = ['# 地理空白区域补充结果', '',
             f"新增 **{s['addedRecords']:,} 条酒款、{s['addedBreweries']} 家酒厂、{s['addedCachedImages']:,} 条有本地酒图的记录**。原有 {s['priorRecordsPreserved']:,} 条源 ID 及顺序完整保留，原 {s['priorBreweriesPreserved']} 家酒厂保留。本轮有 {s['differentPointsWithinBatch']} 个不同城市/聚落参考点，其中 {s['newPointsBeyondPrior']} 个与旧坐标不同，{s['addedPointsWithCachedImages']} 个点有可显示的本地酒图。", '',
             '| 大洲 | 新记录 | 新酒厂 | 新参考点 | 有图点 | 本地酒图记录 |',
             '|---|---:|---:|---:|---:|---:|']
    for key, r in s['continents'].items():
        lines.append(f"| {CONTINENT_ZH[key]} | {r['addedRecords']} | {r['addedBreweries']} | {r['newReferencePoints']} | {r['addedPointsWithCachedImages']} | {r['addedCachedImageRecords']} |")
    c = s['current']
    lines += ['', f"最终 BeerTasting 酒库：**{c['beers']:,} 条记录、{c['breweries']} 家酒厂、{c['distinctReferencePoints']} 个不同参考点、{c['countriesOrRegions']} 个国家或地区、{c['cachedImages']:,} 条有本地图片的记录**。本轮候选图记录 {s['addedCandidateImages']} 条，实际缓存 {s['addedCachedImages']} 条，对应 {s['addedUniqueCachedOriginalFiles']} 个不同本地原图文件；这些数字来自最终数据和本机文件存在性检查。", '',
              '## 按国家或地区', '',
              '| 国家/地区 | 新记录 | 新酒厂 | 新参考点 | 有图点 | 本地酒图记录 | 新参考地 |',
              '|---|---:|---:|---:|---:|---:|---|']
    for code, r in s['countries'].items():
        if not r['addedRecords']:
            continue
        label = r['nameZh'] or r['name']
        cities = ', '.join(r['referenceLocalities']).replace('|', '\\|')
        lines.append(f"| {label} ({code}) | {r['addedRecords']} | {r['addedBreweries']} | {r['newReferencePoints']} | {r['addedPointsWithCachedImages']} | {r['addedCachedImageRecords']} | {cities} |")
    new_countries = ', '.join(s['newCountriesOrRegions']) or '无'
    grid = s['geographicGridCells']['5']
    lines += ['', f"新增国家或地区代码：{new_countries}。5°经纬网格覆盖由 {grid['before']} 格增至 {grid['after']} 格，新增 {grid['added']} 格。这是本次样本分布，不是全球精酿密度或产区数量。", '',
              '## 地理精度与身份', '',
              '所有新增点均为核验过的城市/聚落参考，不能视为精确酒厂地址、当前生产线或每款酒的生产地。不同酒厂可能共用一个城市点，统计会去重；坐标按五位小数比较，不代表地理来源达到该精度。原目录 city/region 留在 sourceRecord，已核实的纠错另记 verifiedCity/verifiedRegion；完整证据在 brewery-locations.json 的 sourceUrls、coordinateEvidenceFile 及实际 page/node ID。', '',
              '本轮目录角色如下，未把整批记录都认证为独立精酿：', '']
    for role, count in s['roles'].items():
        if role == 'independence_not_verified':
            lines.append(f"- {count} 条未核验独立所有权，不据此判断当前运营状态。")
        else:
            lines.append(f"- `{role}`：{count} 条；酒厂为 {', '.join(s['roleBreweries'][role])}。身份来源保存在各子批次报告/来源记录中。")
    lines += ['', '## 图片与字段', '',
              '只统计 image、imageThumbnail、imageOriginal 三份本地文件都存在的缓存记录，不把候选远程 URL 当成可用本地图。候选图下载成功不等于逐张确认瓶罐身份或取得图片再利用权。未提供的风味、原料和工艺不补造；评分和评分人数来自源 rating/ratings_count，未用 Cheers 推算。', '']
    if s['missingImageBreweries']:
        labels = [f"{b['name']}（{b['city']}，{b['countryCode']}）" for b in s['missingImageBreweries']]
        lines.append('本轮仍没有本地酒图的酒厂：' + '；'.join(labels) + '。记录及入口保留，不填造替代商品图。')
    if s['osmAttribution']:
        lines += ['', '## OpenStreetMap 坐标来源', '']
        for item in s['osmAttribution']:
            lines.append(f"- {item['place']}：[{item['nodeId']}号村落节点]({item['sourceUrl']})，版本 {item['nodeVersion']}，纬度 {item['lat']}、经度 {item['lng']}；原始响应 `{item['evidenceFile']}`。未伪造 Wikipedia page ID。")
        lines += ['', '该坐标资料包含 © OpenStreetMap contributors 数据，依据 [Open Database License](https://opendatacommons.org/licenses/odbl/) 使用；参见 [OpenStreetMap 署名与版权说明](https://www.openstreetmap.org/copyright)。Pachar 的同名英文 Wikipedia 重定向到印度，已排除该错误候选；秘鲁村落身份按酒厂所在地证据另行核对。']
    lines += ['', '## 审计与重建', '',
              f"本轮方法为 `{s['method']}`，不冒称 IDS 导出。各子批次保存页面解析事实、源 HTML 哈希、请求记录及坐标原始响应；完整来源见本批次子目录的报告、页面及坐标归档。", '',
              '最终统计没有使用预计图片数或写死新增数量。运行下列命令可重新核对源 ID、合并审计、全部本地图文件及分组数量，然后重建 coverage-summary.json 和本报告：', '',
              '```sh', f'python3 scripts/report-beertasting-density.py --directory {directory.relative_to(ROOT)}', '```', '',
              f"生成时间：{s['generatedAt']}。最终数据和批次文件的 SHA256 保存在 coverage-summary.json。"]
    temporary = directory / 'REPORT.md.tmp'
    temporary.write_text('\n'.join(lines) + '\n')
    temporary.replace(directory / 'REPORT.md')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=ROOT / 'public/data/beertasting.json')
    parser.add_argument('--directory', type=Path, default=DEFAULT_DIRECTORY)
    args = parser.parse_args()
    summary = report(args.data.resolve(), args.directory.resolve())
    print(json.dumps({k: summary[k] for k in ('priorRecordsPreserved', 'priorBreweriesPreserved',
                     'addedRecords', 'addedBreweries', 'addedCandidateImages', 'addedCachedImages',
                     'newPointsBeyondPrior', 'addedPointsWithCachedImages', 'current')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
