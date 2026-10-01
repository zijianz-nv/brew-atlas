# BeerTasting 公开目录：IDS 试采与独立地区扩采

本地测试来源为 [BeerTasting](https://www.beertasting.com/)。当前 **2,469 条记录、119 家酒厂、61 个国家或地区、6 洲**。记录数不是已核验独立精酿数，也不代表全部仍在售。原始 1,000 条保留真实 Instant Data Scraper 导出证据，其他 1,469 条均标记 direct_public_html，没有冒称使用 IDS。

前轮加入 432 条地理扩采；1.10.0 另加 **416 条、29 家酒厂、290 张候选图**，覆盖格鲁吉亚、新西兰、中国大陆、印度及非洲 7 国。新增 28 个不同城市/聚落点，其中 27 个与旧点不同；该版本共 64 个不同参考坐标。三组地区数据保存了 40 个成功的普通公开列表页面及源 SHA-256，每次流程低速读取、无需注册；不存在的目录跳过，没有访问限制绕过。

| 1.10.0 指定地区 | 新记录 | 本地图片 | 新酒厂 |
|---|---:|---:|---:|
| 格鲁吉亚 | 38 | 21 | 4 |
| 新西兰 | 146 | 108 | 6 |
| 中国大陆 | 76 | 47 | 4 |
| 印度 | 39 | 31 | 4 |
| 非洲 | 117 | 83 | 11 |

中国补上海、南京、武汉、香格里拉；印度补班加罗尔、浦那、Sangolda 和孟买。新西兰覆盖南北岛，格鲁吉亚使用国家 GE。非洲补博茨瓦纳、坦桑尼亚、纳米比亚、乌干达、加纳、摩洛哥及南非。36 条工业样本标记 industrial_reference，10 条集团收购品牌历史样本与7条集团所属小厂样本另行标记，其余未认证独立所有权。孟买 White Owl 标为历史品牌参考。Great State Aleworks 与 Swakopmund Brewing Company 无候选图，保留记录及地图入口。

图片缓存当前 **1,711 个候选原图 URL，全部成功**。744 条缺图与14条通用占位图在产品层保持为空。`image-cache.json` 记录来源 URL、HTTP 结果、原始字节 SHA-256、格式、尺寸及本地路径；若多款共用 URL，sourceBeerIds 保留其关系。原图放在 `/images/beertasting/original/`，远程地址只在来源元数据中追溯。

`source-records.json` 保留原始记录与批次，`source-breweries.json` 保留酒厂来源事实；`brewery-locations.json` 保留身份、坐标证据及备注。Natakhtari 的源 city=Georgia、Swakopmund 的空白城市和Toit的街区名称均保留在原字段，用户可见城市使用已核验名称。原省州冲突不用于规范地区统计。派生目录 `/data/beertasting.json` 使用独立来源 ID，不做跨来源模糊合并。

显示用 WebP 保留长宽比与透明通道，不裁剪、不放大：地图图最大 320×160，卡片图最大 800×400；只有衍生图按 EXIF 方向校正，原图字节不动。编码使用 Pillow、LANCZOS 缩放、WebP quality 88 / method 6。产品 `imageThumbnail` 指向本地地图图，`image` 指向本地卡片图，`imageOriginal` 指向本地原图；未缓存、失效和失败记录这些字段都为空，不静默回退到热链。

缓存成功表示取得并解码了来源文件，不等于确认图像身份。未逐张验证图片内容，来源可能包含其他包装形式，不能把缓存数量当成已确认瓶罐照片数。未取得图片或全库再利用授权，未将此数据标为开放许可。

缺失的风味、酒花、麦芽、酵母、发酵方式及配餐不予补写。原始 style 与 style_family 分开保留。当前 660 个来源 IBU 零值含义不确定，在 sourceRecord.ibu_raw 保留 0，产品 IBU 显示未知；787 个正 IBU 原样保留。评分和评分人数直接保留来源 avg_rating / ratings_count，不把 Cheers 当评价人数。

地图位置均标记 `locationPrecision=city`、`locationRole=brewery_city_reference`，表示城市、聚落或明示的辖区参考，不表示精确厂址、每款酒的实际生产地或销售国家。原批次的 Mikkeller 与木内酒造复用现有世界酒库中明确同酒厂的城市参考坐标；其他原批次位置依旧保留原核验依据。Cantillon 的旧精确历史坐标没有沿用。

上一轮地理扩采的 24 家对应 **23 个不同参考坐标**（Brewerkz 与 Brewlander 共享新加坡城市点），没有把这两家计为两个城市。扩采根据公开酒厂目录明确的 city/country，匹配已读取的城市坐标资料；歧义地点另核对官网或官方公司主页。Kathu 选用泰国 Phuket 的辖区参考，排除南非同名城镇；Brewhogs 选用官网明确的 Barbeque Downs，排除 Kyalami 赛车场。New Delhi、Moka、Avlonari、Singapore 等比来源地址更宽的参考范围逐条注明；Wendlandt 来源 region 与 Ensenada 冲突，原值保留并记录冲突，不用错误 region 定位。

每个位置的事实依据、坐标来源、读取日期和复用关系见 [brewery-locations.json](./brewery-locations.json)。城市坐标主要来自 Wikipedia 的公开坐标接口，酒厂与城市的关系由各条 `identitySourceUrl` 支持。香港等地区按来源地区标签保留，统计使用“国家或地区”。

使用支持 WebP 的 Pillow 环境执行 `python3 scripts/cache-beertasting-images.py` 建立缓存，默认最多 4 个并发，每 URL 每轮最多 2 次请求；401/403/429 不重试，429 会暂停该主机尚未发出的图片请求。重新运行复用经哈希核对的本地缓存，仅在明确传入 `--retry-failed` 时补一般失败项；拒绝访问和限流项不会因此重试。Unicode 文件名仅作浏览器等效 URL 编码，不改变来源路径。

在项目目录执行 `python3 scripts/import-beertasting.py` 可离线重建数据；导入脚本不联网、不注册、不新增采集，并逐项检查缓存文件与哈希。运行 `node --test scripts/beertasting-import.test.mjs` 校验数量、来源对应、缓存、缺失值、位置证据与重建一致性。

扩采的种子、分页解析、404 跳过记录、页面哈希、原始坐标响应及覆盖报告保存在项目 `research/beertasting-geographic-expansion-2026-09-18/`。`scripts/prepare-beertasting-expansion.py` 从保存的页面解析离线重建新增记录；`scripts/prepare-beertasting-expansion-locations.py` 从保存的地理响应及人工核对的显式地名映射重建参考点。

本轮审计位于 `research/beertasting-regions-2026-09-18/`，包括 georgia-nz、china-india、africa 三组页面/坐标快照、逐行核验和合并覆盖统计。`scripts/prepare-beertasting-regions.py` 离线合并批次并保留旧1,432条；`scripts/report-beertasting-regions.py` 根据实际导入数据和缓存生成统计。每条新坐标的 coordinateEvidenceFile 指向保存的原坐标响应，可用 page ID 与原值直接复核。

1.11.0 增密扩采新增 **524 条、44 家酒厂、44 个与旧数据不同的参考点、375 条本地图片**，1.11.0 共 108 个不同参考坐标。44 个普通列表页面保存原文及哈希；排除本次明确的硬苏打、苹果酒和蜂蜜酒。新增 8 条工业参照单独标记，Mont Blanc 的 15 条保留集团所属精酿参照标记，不把所有目录条目称为认证独立精酿。审计在 `research/beertasting-density-2026-09-18/`，运行 `scripts/prepare-beertasting-density.py`、`scripts/import-beertasting.py` 和 `scripts/report-beertasting-density.py` 可离线复现合并和统计。

新批次 43 个参考点使用归档的 Wikipedia 坐标响应。秘鲁 Pachar 排除错误的印度同名结果，使用 [OpenStreetMap 节点 3049741757](https://www.openstreetmap.org/node/3049741757) 的村落坐标，原响应、版本与节点 ID 已保存；该坐标数据 © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，适用 ODbL。仍不将村落中心声明为精确酒厂位置。

1.12.0 新增 97 条、8 家酒厂和 8 个不同城市参考点（当前合计116个不同坐标），72 张候选图全部缓存，其中39条有图且有介绍。原料、工艺等未知结构化字段仍保持为空；新批次源页、精确ID和坐标证据见 `research/beertasting-quality-2026-09-18/`。

本轮恢复 343 条真实 product.description 原文：288条来自归档列表、55条来自公开详情；98次有界公开详情请求全为200。原文不是酒厂介绍或用户评论，也不声称为厂商撰写。`originalDescription` 原样保留，`description` 仅去掉HTML标签和合并空白供显示；`descriptionEvidence` 提供原URL、页面SHA256、项目相对归档路径和Nuxt字段位置。导入使用 `research/beertasting-descriptions-2026-09-18/descriptions-reviewed.json` 固定快照，可运行 `scripts/enrich-beertasting-descriptions.py` 离线重提取后人工冻结下一版。

1,711条缓存图中，目前仅293条同时有真实介绍，因此可在地图、图片酒库、卡片和详情展示；缺介绍的图不创建图片节点，也不发图片请求。未删除源记录和缓存、未编造介绍。原位置上的数量仍代表该筛选范围内的目录记录，不等于已展示图片数。详情与介绍保留各自真实来源，图片仍使用本地缓存。
