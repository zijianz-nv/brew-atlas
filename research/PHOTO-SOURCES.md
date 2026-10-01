# 免费啤酒照片来源实测

核实日期：2026-09-14。范围：免注册、无需用户 API key 的公开来源；仅研究及少量样本，未修改应用数据。Open Food Facts 由另一工作分支核实，本报告未请求 OFF。当前基线为世界精选 31、BrewDog 325、OpenBeer 5,893 条；已有 356 条带图记录不计新增。

## 可以采用的补图来源

**Wikimedia Commons 适合有依据地逐款补图，可作为 OFF 的替代；它不是现成的万款精酿商品数据库。** [Beer bottles 分类](https://commons.wikimedia.org/wiki/Category:Beer_bottles)及其国家分类可枚举图片，再通过 [Imageinfo API](https://www.mediawiki.org/wiki/API:Imageinfo)取得作者、文件描述、下载地址和每图许可。酒厂、风味、ABV、IBU、生产位置通常需要另外核对，不能从拍摄地点或分类国别推断。

本次 API 实测的直接分类成员数：Beer bottles 649 张、Beer cans 179 张、Beer labels 397 张；32 个国家/地区的瓶图分类合计 **1,228 个文件成员关系**，含比利时 588、荷兰 109、捷克 66、德国 61、葡萄牙 60、墨西哥 49、澳大利亚 33、意大利 31、加拿大 31、日本 29、中国 21。分类可交叉、一个产品可有多图，且含合影、旧包装和大型品牌，以上均不能称作去重酒款数量。保存的原始计数为 `.runtime/photo-alternatives/commons-category-counts.json`。

四个抽样均 HTTP 200，JPEG 签名有效，已直接查看照片、确认标签与描述一致。下载的是 Commons 提供的约 500px 缩略图，未进行任何图像编辑。完整元数据、SHA256、下载链接、许可链接、匹配状态见 `.runtime/photo-alternatives/commons-verified.json`。

| 图片及明确酒款 | 署名 / 许可 | 现有数据关联 | 图片尺寸 / 大小 |
|---|---|---|---|
| [3 Fonteinen Oude Kriek](https://commons.wikimedia.org/wiki/File:3_Fonteinen_Oude_Kriek.jpg)；`commons-0.jpg` | Alpina~nlwiki / CC BY-SA 4.0 | `openbeer-5608` 名为 Drie Fonteinen Kriek，仅候选，未确认版本，不自动绑定 | 500×667 / 53,863 字节 |
| [Burleigh Bighead](https://commons.wikimedia.org/wiki/File:BIGHEAD_beer_from_Burleigh_Brewing_Co..JPG)；`commons-1.jpg` | Kgbo / CC BY-SA 4.0 | 未绑定；现有库无同名酒款 | 500×667 / 84,912 字节 |
| [Coopers Best Extra Stout](https://commons.wikimedia.org/wiki/File:Coopers_ExtraStout.jpg)；`commons-2.jpg` | Miguel Andrade / CC0 | **确认对应 `openbeer-4933`、`openbeer-brewery-397`，属于补图，不是新增酒款** | 500×1,386 / 149,999 字节 |
| [Verdi Imperial Stout](https://commons.wikimedia.org/wiki/File:Verdi_Imperial_Stout.jpg)；`commons-3.jpg` | Dirk Van Esbroeck / CC BY-SA 3.0 | 未绑定；现有库无同名酒款 | 500×940 / 73,160 字节 |

图片文件均在 `.runtime/photo-alternatives/`。本轮仅确认上述四张图片；没有把分类里的数百个文件宣称为已整理完成的 100+ 新酒款。批量补图应按“明确品牌与产品 → 原始图片许可 → 现有商品去重 → 官网补参数”验收。Commons 的照片许可按单张文件处理，不能将全部图片标为 CC0。[站外复用说明](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)

## Punk 新源：新增专属图片为零

[alxiw/punkapi GitHub](https://github.com/alxiw/punkapi)当前是 415 条 DIY Dog 历史配方。已有完整导入审计表明：325 个数字文件名的专属 PNG 全部已在 archive；其余 88 条引用 `keg.png`、2 条引用 `cask.png`。不能将这 90 条通用桶图算为新增真实瓶图，更不能承诺额外 100+。

本轮重测 `/v3/beers/8`：Peroxide Punk 返回 `keg.png`；图片 HTTP 200、381×760，是通用包装。重测 `/v3/beers/366`：Lost Lager 返回 `366.png`；HTTP 200、428×678，SHA256 与现有 `/images/archive-366.png` 一致。样本请求保存在 `sample-downloads.json`，详细历史全量审计见 `ARCHIVE-SOURCES.md`。字段包括名称、描述、ABV、IBU、SRM、原料、配方、搭餐；仍只属于 BrewDog。软件 MIT 不等同授予 BrewDog 产品图片商用许可；原始数据声明见 [原 Punk API LICENSE](https://github.com/sammdec/punkapi/blob/master/LICENSE)。

## 其他候选与排除原因

| 来源 / GitHub | 实际量级与字段 | 图片实测 | 结论 |
|---|---|---|---|
| [SampleAPIs](https://github.com/jermbo/SampleAPIs)，`https://api.sampleapis.com/beers/{ale,stouts,red-ale}` | 实测 314+117+178=609 行；含名称、价格、rating、image；缺酒厂 ID、ABV/IBU、风味、地理。仅 529 行有 HTTP 图片 URL，全部指向 TotalWine；API 公开可写，已有 `beezer`、`image:"no"` 等测试内容 | Founders All Day IPA 图返回 404；Founders CBS 图 200，但仅 102×143 PNG。两次均为原记录给出的图链 | 仅适合 API 教学，不作为可信图文产品库。项目自述不拥有数据，仅供教育；MIT 代码不能代替第三方图片许可。rating 无可靠出处，不能导入评分 |
| [BeerBB-1K](https://github.com/devfoo-one/BeerBB-1K) | 作者公布 1,000 张照片及逐瓶 bounding box、brand、isOpen；CC BY-SA 4.0。**1,000 张照片不等于 1,000 款啤酒**；未取得去重品牌总数 | raw GitHub 的 `BeerBB-1K/0000.jpg` 与 `0000.json` 均 200。照片 1,000×750，标注 Berliner Pilsner，但瓶子只占小角落，标签不足以独立目视确认产品 | 真实且有许可，适合识瓶算法测试；没有风味、ABV、厂址，重复拍摄不适合充当大规模酒款目录。本轮不计可新增酒款 |
| [Classification of Beer Bottles 论文](https://arxiv.org/html/2201.03791v1) | 5,207 张图，**44 个类别**，每瓶至少约 100 张不同背景照片 | 未找到与本次需求相符的免注册完整图文目录，因此未下载 | 不能把 5,207 张识别训练照片当 5,207 款酒 |
| [philipperemy/beer-dataset](https://github.com/philipperemy/beer-dataset) | 自述从 BreweryDB 抓取 30,280 条，含描述/ABV/IBU/标签图 URL | 未请求付费站、未批量下载 | 来源是第三方商业数据库抓取，未发现明确授予该数据与图像再分发的许可；不当作免费开放库 |
| [Wikidata Beer 项目](https://www.wikidata.org/wiki/Wikidata:WikiProject_Beer) | `P18` 可连接 Commons 图片；实体可能是品牌而非具体 SKU | 本轮仅发一条图片数量聚合，WDQS 返回 429（outage 期间每分钟限流），停止请求 | 不报告未拿到的图片数，也不将品牌数算作带图酒款数 |

GitHub REST 匿名 tree 请求返回 403 rate limit 后已停止使用该 API；公开项目网页和已知 raw 样本 URL 可正常读取。没有注册账号、付费、请求用户密钥或修改产品数据。
