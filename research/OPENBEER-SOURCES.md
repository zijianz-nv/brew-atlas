# Open Beer：已导入的免费历史啤酒目录

导入日期：2026-09-14。数据实际来自 GitHub [brewdega/open-beer-database-dumps](https://github.com/brewdega/open-beer-database-dumps)，免登录下载；不是生成的样例、评分记录或自酿配方。

已生成 `public/data/openbeer.json`：**5,893 条去重后的历史啤酒记录**。数据不保证精酿身份、现售状态、生产厂址或当代产区覆盖；所有新记录 `craftStatus=unknown`。这是可实际浏览、搜索和验证数据层的免费目录，不是“已拿到一万款精酿”。

## 原始文件与许可

已将原始字节保存到 `public/data-sources/openbeer/`：

| 文件 | 实际行数 | 来源 |
|---|---:|---|
| beers.csv | 5,901 | [GitHub 原始文件](https://raw.githubusercontent.com/brewdega/open-beer-database-dumps/master/dumps/beers.csv) |
| breweries.csv | 1,414 | [GitHub 原始文件](https://raw.githubusercontent.com/brewdega/open-beer-database-dumps/master/dumps/breweries.csv) |
| styles.csv | 141 | [GitHub 原始文件](https://raw.githubusercontent.com/brewdega/open-beer-database-dumps/master/dumps/styles.csv) |
| categories.csv | 11 | [GitHub 原始文件](https://raw.githubusercontent.com/brewdega/open-beer-database-dumps/master/dumps/categories.csv) |
| geocodes.csv | 1,304 | [GitHub 原始文件](https://raw.githubusercontent.com/brewdega/open-beer-database-dumps/master/dumps/geocodes.csv) |
| README.md | 原文许可与来源说明 | [GitHub README](https://raw.githubusercontent.com/brewdega/open-beer-database-dumps/master/README.md) |

另有 `manifest.json`，逐文件保存来源 URL、字节大小、SHA-256 与核验时间；`NOTICE.md` 记录修改与许可。数据文件仍为原始 CSV，不改其中的拼写、旧国名、浮点尾数及未知值。

[原 README](https://github.com/brewdega/open-beer-database-dumps/blob/master/README.md)明确声明数据库 ODbL、单项内容 DbCL。README 的 ODbL 锚点误连 DbCL，本项目保留原文，并提供正确 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) 与 [DbCL 1.0](https://opendatacommons.org/licenses/dbcl/1-0/) 链接。派生 `openbeer.json` 保留同样许可、署名、原文件下载路径；不把许可证替换成项目软件的 MIT 等许可。

完整机器可读派生数据是 `/data/openbeer.json`；原件、来源声明是 `/data-sources/openbeer/` 下的具体文件。公开展示时应链接可点击的归属说明与数据下载。ODbL 条件适用于此数据集合；其他演示数据与照片仍按各自来源许可处理。

## 处理与字段

入口：`python3 scripts/import-openbeer.py`。默认复用已下载原件；`--refresh` 以最多 4 并发重新下载六个小文件。脚本无第三方 Python 依赖、无账号或支付流程。

- 只按相同原 `brewery_id` 与归一化酒名去重：HTML 字符实体解码、Unicode NFKC、两端去空白、内部连续空白合并、casefold。没有跨厂模糊合并、年份归并或猜测同一产品。
- 合并 8 组共 8 条重复行，得到 5,893 条；最低数字 source id 生成 `openbeer-{id}`。每条 `sourceIds` 保留全部原 id，总和仍为 5,901；`metadata.duplicateGroups` 列出每组。
- 原酒厂 id 生成 `openbeer-brewery-{id}`。保留全部 1,414 家源酒厂，其中 1,329 家关联本目录酒款。原名称不虚构中文品牌名；`nameZh` 保留原名；风格显示标签翻译为中文，英文 `style` 仍来自 styles 表。
- ABV、IBU、SRM 非有限数、非正数和超出合理宽范围的值变为 `null`；浮点格式四舍五入到 4 位。由于旧表的 0 大量用作未知，本集合将所有 0 当未知，不能据此把无醇酒标成有确认的 0% ABV。原数值仍可按 source id 查 CSV。
- 重复组若有互相矛盾的非零数值，该参数为空并打标；若有互相矛盾的已知风格，标“未分类啤酒”。本次存在 4 组风格冲突，未任意择一。
- `description` / `originalDescription` 保存源英文描述；原始缺失为空字符串。没有自动翻译或生成品饮描述。`flavors`、`flavorEvidence`、hops、malts、foodPairings 为空数组；yeast、firstBrewed 为空。
- **图片全部为 null**。旧表只有 24 个相对 filepath，既没有原图文件又没有已验证的可用图片 URL，因此未导入；没有用同一瓶图、AI 图或通用插画冒充真实酒款照片。
- `sourceModified` 保留原日期，beer 表范围为 **2010-07-22 至 2011-10-04**。来源年份不当成该酒首酿年份。

## 地图语义与核验

国家显示规范化如 England/Scotland → United Kingdom、Czech Republic → Czechia、Korea, Republic of → South Korea；原文保存在 `countryRaw`。历史“Serbia and Montenegro”不强制映射到现今单个国家，澳门、台湾、法属波利尼西亚等按地区标签保存。统计名为国家/地区标签数，不能宣传为现代主权国家数。

本次酒款实际关联的 60 个规范标签中，**不包含** Serbia and Montenegro 或 Unknown；两者与 Vietnam 只出现在没有关联酒款的酒厂原表。60 标签中包含 Aruba、French Polynesia、Macao、Taiwan（各关联 1 条酒），所以仍需写“国家／地区”，不能写“60 个国家”。

只接受 geocodes.csv 中有限、纬度 [-90,90]、经度 [-180,180] 且不是 (0,0) 的点。本次没有空值、非有限数、越界或 0 轴异常点。**8 家酒厂有多个不同的源坐标**，这些酒厂 lat/lng 设 null，相关 source id 保留，未挑选任意点；同厂重复且一致坐标可合并。

全部位置使用 `locationPrecision=historical`、`locationRole=historical_brewery_reference`。这些是旧酒厂地点参照，不表示现役酿造厂，也不证明某一酒款在该处生产；不得与当前官方确认的生产地混为一谈。

| 导入后覆盖项 | 数量 |
|---|---:|
| 历史啤酒记录 | 5,893 |
| 酒厂记录 / 有酒款关联的酒厂 | 1,414 / 1,329 |
| 有不冲突历史坐标的酒厂 | 1,281 |
| 同时有关联酒款和历史坐标的酒厂 | 1,215 |
| 可关联历史坐标的啤酒记录 | 5,645 |
| 原始酒厂国家/地区标签 | 63 |
| 规范化后的酒厂国家/地区标签 | 62 |
| 酒款关联国家/地区标签 | 60 |
| 有原文描述 | 2,034 |
| 有正值 ABV / IBU / SRM | 3,037 / 19 / 13 |
| 有真实图片 / 已提取风味标签 | 0 / 0 |
| 已核实精酿身份 | 0 |

主要覆盖仍偏美国（4,543 条），中国内地只有 2 条；不是按全球产区均衡抽样。完整分布见 `metadata.beersByCountryOrHistoricalRegion`。

供应用识别的未分类精确值是 `style="Unclassified Beer"` / `styleZh="未分类啤酒"`（1,472 条），源 `style="Out of Category"` 另有 3 条。这些分类不应凭“同风格”成为相似酒推荐依据；Other Belgian-Style Ales（78 条）和 Specialty Beer（1 条）是较宽的源类别，也不等于真实风味相似。

导入检查包括 CSV 空列/空名、主键唯一、外键存在、所有源 id 被保留、派生 id 唯一、坐标有效性和冲突、JSON 不含 NaN/Infinity，以及缺图/风味保持真实为空。与现有 world/archive 集合未做跨来源实体去重，因此三集合相加是目录记录数，不能当作已经合并的唯一全球酒款数。
