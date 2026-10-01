#!/usr/bin/env python3
"""Render a self-contained, file://-friendly preview; never fetch data or images."""

import argparse
import json
import math
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit


BASE = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = BASE / "research/beertasting-pilot-2026-09-18/beers.json"
NON_PRODUCT = re.compile(
    r"(?:placeholder|fallback|default[_-]|no[_-]?image|avatar|userpic|profile[_-]?(?:image|photo)|/static/)",
    re.IGNORECASE,
)


def text(value):
    return value.strip() if isinstance(value, str) else ""


def web_url(value):
    value = text(value)
    try:
        parsed = urlsplit(value)
        if parsed.scheme in ("http", "https") and parsed.hostname and not parsed.username and not parsed.password:
            return value
    except ValueError:
        pass
    return ""


def normalize(record):
    image = web_url(record.get("image_url"))
    image_class = text(record.get("image_class")).lower()
    if image_class not in ("candidate", "product", "verified") or NON_PRODUCT.search(unquote(image)):
        image = ""
    abv = record.get("abv_percent")
    if type(abv) not in (int, float) or not math.isfinite(abv) or not 0 <= abv <= 100:
        abv = None
    return {
        "name": text(record.get("name")) or text(record.get("display_name")) or "酒名未提供",
        "brewery": text(record.get("brewery_name")) or "酒厂未提供",
        "country": text(record.get("country_name")) or "地区未提供",
        "countryCode": text(record.get("country_code")),
        "family": text(record.get("style_family")) or "大类未提供",
        "style": text(record.get("style")),
        "abv": abv,
        "image": image,
        "url": web_url(record.get("url")),
    }


HTML = r'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="referrer" content="no-referrer">
<title>BeerTasting · 试采样本</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#19392e;background:#f4f3ee;font-synthesis:none}*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}button,a,input,select{-webkit-tap-highlight-color:transparent}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #adbf6d;outline-offset:3px}main{max-width:1440px;margin:auto;padding:38px 32px 28px}.eyebrow{font-size:12px;font-weight:650;letter-spacing:2px;color:#758377;margin:0 0 12px}.heading{display:flex;align-items:end;gap:18px;justify-content:space-between}h1{font-size:32px;letter-spacing:-1px;margin:0;font-weight:700}.note{font-size:13px;color:#6b756d;margin:10px 0 0;line-height:1.65}.stats{font-variant-numeric:tabular-nums;text-align:right;font-size:13px;color:#69766a;line-height:1.7}.stats strong{font-size:30px;color:#19392e;font-weight:600;margin-right:5px}.filters{margin:28px 0 20px;padding:16px;background:#fff;border:1px solid #e5e7dc;border-radius:15px;display:grid;grid-template-columns:1.6fr 1fr 1.15fr 1.05fr 1fr;gap:12px}label{display:flex;flex-direction:column;gap:7px;font-size:11px;letter-spacing:.5px;color:#617061}input,select{min-width:0;width:100%;height:39px;border:1px solid #e1e5da;background:#fafbf7;border-radius:7px;padding:0 10px;color:#203c2e;font-size:13px}input::placeholder{color:#9aa297}.toolbar{display:flex;align-items:center;justify-content:space-between;margin:4px 1px 15px;gap:12px;font-size:12px;color:#74806f}.reset{padding:5px 0;background:transparent;border:0;color:#37543f;cursor:pointer;text-decoration:underline;text-underline-offset:3px}.grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px}.card{min-width:0;border:1px solid #e4e7dc;background:#fff;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;color:inherit;text-decoration:none;transition:transform .16s,border-color .16s}.card:hover{transform:translateY(-3px);border-color:#a0b38c}.media{height:204px;padding:18px;display:flex;align-items:center;justify-content:center;position:relative;background:linear-gradient(145deg,#fdfdfa,#f4f6ef)}.media img{display:block;max-width:100%;width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply;opacity:0}.media img.ready{opacity:1}.media img[hidden],.media span[hidden]{display:none}.image-note{position:absolute;left:16px;right:16px;font-size:12px;color:#94a08b;text-align:center;line-height:1.7}.country{position:absolute;bottom:10px;left:12px;font-size:10px;color:#53684d;background:#ffffffdc;border:1px solid #e7ecdf;padding:3px 6px;border-radius:4px;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.body{padding:14px 13px 15px;display:flex;flex:1;flex-direction:column}.brewery{font-size:10px;color:#7a8973;margin:0 0 7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.name{font-size:15px;line-height:1.4;font-weight:650;margin:0 0 10px;overflow-wrap:anywhere}.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:auto}.chip{font-size:10px;line-height:1.4;padding:4px 6px;background:#eff3e9;border-radius:5px;color:#526945}.chip.abv{background:#f7f0df;color:#806c33;white-space:nowrap}.family{font-size:10px;color:#899080;margin:9px 0 0}.empty{padding:80px 20px;text-align:center;color:#7c8777;grid-column:1/-1;border:1px dashed #d8dfcc;border-radius:14px}.pagination{display:flex;align-items:center;justify-content:center;gap:18px;margin:30px 0 18px;font-size:12px;font-variant-numeric:tabular-nums}.pagination button{cursor:pointer;color:#37533e;background:#fff;border:1px solid #dce3d3;padding:9px 18px;border-radius:7px}.pagination button:disabled{opacity:.35;cursor:default}footer{text-align:center;color:#8c9684;font-size:11px;line-height:1.8;padding:4px 0}footer a{color:inherit}noscript{display:block;padding:30px;color:#5e683e}.count-label{white-space:nowrap}@media(min-width:1600px){.media{height:228px}}@media(max-width:1150px){.grid{grid-template-columns:repeat(4,minmax(0,1fr))}.filters{grid-template-columns:repeat(4,minmax(0,1fr))}.search-filter{grid-column:1/-1}.media{height:218px}}@media(max-width:720px){main{padding:24px 16px}.heading{align-items:start;flex-direction:column;gap:14px}h1{font-size:29px}.stats{text-align:left}.stats strong{font-size:25px}.filters{grid-template-columns:1fr 1fr;padding:12px;gap:12px;margin-top:20px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.media{height:184px;padding:17px}.name{font-size:14px}.toolbar{align-items:flex-start}.body{padding:12px}.pagination{gap:13px}}@media(prefers-reduced-motion:reduce){.card{transition:none}.card:hover{transform:none}}
</style>
</head>
<body>
<main>
<header>
<p class="eyebrow">BEERTASTING / SAMPLE COLLECTION</p>
<div class="heading"><div><h1>试采样本</h1><p class="note">图片来自来源网站，联网显示。点击卡片查看原页面。</p></div><div class="stats"><div><strong id="total">0</strong> 条样本</div><div id="summary"></div></div></div>
</header>
<form class="filters" id="filters" role="search">
<label class="search-filter">搜索<input type="search" id="search" placeholder="酒名、酒厂、风格…" autocomplete="off"></label>
<label>国家 / 地区<select id="country"><option value="">全部国家 / 地区</option></select></label>
<label>酒厂<select id="brewery"><option value="">全部酒厂</option></select></label>
<label>风格大类<select id="family"><option value="">全部大类</option></select></label>
<label>图片<select id="images"><option value="">全部样本</option><option value="yes">有原图链接</option><option value="no">无商品图链接</option></select></label>
</form>
<div class="toolbar"><span id="results" role="status" aria-live="polite"></span><button class="reset" id="reset" type="button">重置筛选</button></div>
<section class="grid" id="grid" aria-label="啤酒样本"></section>
<nav class="pagination" aria-label="样本分页"><button type="button" id="prev">上一页</button><span id="page"></span><button type="button" id="next">下一页</button></nav>
<footer>每页 24 条 · 有原图链接不代表图片当前可访问 · 数据快照：<span id="updated"></span><br>来源：<a href="https://www.beertasting.com" target="_blank" rel="noopener noreferrer">BeerTasting</a> · 此页仅用于试采查看</footer>
<noscript>请在浏览器中启用 JavaScript，以查看内嵌样本和筛选功能。</noscript>
</main>
<script id="sample-data" type="application/json">__PAYLOAD__</script>
<script>
'use strict';
const payload=JSON.parse(document.getElementById('sample-data').textContent);
const records=payload.records;
const $=id=>document.getElementById(id);
const controls=['search','country','brewery','family','images'];
let page=1;const pageSize=24;
let displayNames;try{displayNames=new Intl.DisplayNames(['zh-Hans'],{type:'region'});}catch{}
const countryLabels=new Map();
for(const r of records){let label=r.country;try{if(/^[A-Z]{2}$/.test(r.countryCode))label=displayNames?.of(r.countryCode)||label;}catch{}countryLabels.set(r.country,label);}
function node(tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=String(value);return el;}
function options(id,key,labelMap){const counts=new Map();for(const r of records)counts.set(r[key],(counts.get(r[key])||0)+1);const sorted=[...counts.keys()].sort((a,b)=>(labelMap?.get(a)||a).localeCompare(labelMap?.get(b)||b,'zh-Hans'));for(const value of sorted){const option=node('option','',`${labelMap?.get(value)||value} · ${counts.get(value)}`);option.value=value;$(id).append(option);}}
options('country','country',countryLabels);options('brewery','brewery');options('family','family');
$('total').textContent=records.length.toLocaleString('zh-CN');
$('summary').textContent=`${new Set(records.map(r=>r.country).filter(x=>x!=='地区未提供')).size} 个国家 / 地区 · ${new Set(records.map(r=>r.brewery).filter(x=>x!=='酒厂未提供')).size} 家酒厂`;
$('updated').textContent=payload.updatedAt||'未提供';
const searchIndex=records.map(r=>[r.name,r.brewery,r.country,countryLabels.get(r.country),r.family,r.style].join(' ').toLocaleLowerCase());
function selection(){const q=$('search').value.trim().toLocaleLowerCase();return records.filter((r,i)=>(!q||searchIndex[i].includes(q))&&(!$('country').value||r.country===$('country').value)&&(!$('brewery').value||r.brewery===$('brewery').value)&&(!$('family').value||r.family===$('family').value)&&(!$('images').value||Boolean(r.image)===($('images').value==='yes')));}
function card(r){const el=node(r.url?'a':'article','card');if(r.url){el.href=r.url;el.target='_blank';el.rel='noopener noreferrer';el.setAttribute('aria-label',`${r.name}，${r.brewery}，查看原页面`);}const media=node('div','media');const message=node('span','image-note',r.image?'图片加载中…':'暂无商品图');media.append(message);if(r.image){const img=node('img');img.alt=r.name;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.addEventListener('load',()=>{img.classList.add('ready');message.hidden=true;});img.addEventListener('error',()=>{img.hidden=true;message.hidden=false;message.textContent='图片暂不可用';});img.src=r.image;media.append(img);}media.append(node('span','country',countryLabels.get(r.country)||r.country));el.append(media);const body=node('div','body');body.append(node('p','brewery',r.brewery),node('h2','name',r.name));const chips=node('div','chips');chips.append(node('span','chip',r.style||r.family));if(r.abv!==null)chips.append(node('span','chip abv',`${r.abv.toLocaleString('zh-CN',{maximumFractionDigits:3})}% ABV`));body.append(chips);if(r.style&&r.family!=='大类未提供'&&r.style!==r.family)body.append(node('p','family',r.family));el.append(body);return el;}
function render(){const filtered=selection();const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(Math.max(1,page),pages);const start=(page-1)*pageSize;const end=Math.min(start+pageSize,filtered.length);$('grid').replaceChildren();if(!filtered.length)$('grid').append(node('div','empty','没有符合条件的样本，试试减少筛选条件。'));for(const r of filtered.slice(start,end))$('grid').append(card(r));$('results').textContent=filtered.length?`找到 ${filtered.length.toLocaleString('zh-CN')} 条 · 当前 ${start+1}–${end}`:'找到 0 条';$('page').textContent=`${page} / ${pages}`;$('prev').disabled=page===1;$('next').disabled=page===pages;}
for(const id of controls)$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;render();});
$('filters').addEventListener('submit',event=>event.preventDefault());
$('reset').addEventListener('click',()=>{for(const id of controls)$(id).value='';page=1;render();});
function navigate(step){page+=step;render();$('results').scrollIntoView({block:'start',behavior:'auto'});}
$('prev').addEventListener('click',()=>navigate(-1));$('next').addEventListener('click',()=>navigate(1));render();
</script>
</body>
</html>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, help="Default: preview.html beside the input JSON")
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    records = data.get("records") if isinstance(data, dict) else data
    if not isinstance(records, list) or any(not isinstance(r, dict) for r in records):
        parser.error("Input must be a JSON array or an object containing a records array")
    payload = {
        "records": [normalize(r) for r in records],
        "updatedAt": text(data.get("updated_at")) if isinstance(data, dict) else "",
    }
    embedded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    for char, escaped in (("&", r"\u0026"), ("<", r"\u003c"), (">", r"\u003e"), ("\u2028", r"\u2028"), ("\u2029", r"\u2029")):
        embedded = embedded.replace(char, escaped)
    output = args.output or args.input.with_name("preview.html")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(HTML.replace("__PAYLOAD__", embedded), encoding="utf-8")
    print(json.dumps({"output": str(output.resolve()), "records": len(records), "product_image_links": sum(bool(r["image"]) for r in payload["records"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
