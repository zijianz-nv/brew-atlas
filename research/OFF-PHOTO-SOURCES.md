# Open Food Facts 实物照片测试数据来源

核验与采集日期：2026-09-14。此次确实取得了可下载的产品照片候选，未注册账户、未提供 API key、未付款。它是有图的啤酒商品测试数据，不是已经核实的全球精酿酒款全集。

## 实际可用的公开入口

本机请求 `world.openfoodfacts.org/api/v2/search` 的 `categories_tags=en:beers`、`categories_tags_en=beers` 两种参数，以及 category JSON、旧 CGI 搜索，均遇到 HTTP 503。因此该阶段没有把旧 API 返回失败解释为需要注册，也没有用旧研究里的总数当成本次查询成功。

随后验证官方 [Search-a-licious 公开搜索](https://search.openfoodfacts.org/search?q=categories_tags%3A%22en%3Abeers%22&page_size=100&page=1) HTTP 200。请求为：

```text
GET https://search.openfoodfacts.org/search?q=categories_tags%3A%22en%3Abeers%22&page_size=100&page=1
```

其响应的 `debug.query` 显示对 `categories_tags` 使用 `en:beers` 精确 term。采集器仍逐条检查数组确实包含 `en:beers`，排除根啤、根啤糖果、糖果标签；不从 `beer` 子串判断酒类身份。每页顺序请求，间隔至少 7 秒；发生请求错误时保存已有结果并停止。

接口的官方依据是 [API 参考](https://openfoodfacts.github.io/search-a-licious/users/ref-openapi/)、[查询语言说明](https://openfoodfacts.github.io/search-a-licious/users/explain-query-language/) 和 [GitHub 源码](https://github.com/openfoodfacts/search-a-licious)。开源代码许可不替代下述数据及照片许可。

## 此次取得了多少

- 搜索入口取得 17 页，每页 100 行，共 1,700 行原始响应；遍历至第 1,671 行时达到候选目标。
- 最终暂存 1,500 个不同条码的候选产品，其中 1,494 个来自 Search-a-licious，6 个来自前期官方 Hugging Face 小样。
- 所有候选都有非空品名、精确啤酒分类、选中的 `front_{lang}`、有效 `imgid`/`rev`，且 `imgid` 指向原图记录。保留原图上传者、上传时间及尺寸信息。
- 1,173 个候选有品牌字段；本批响应中可用的独立酒精度数值字段为 0，不能补造 ABV、IBU、风味或生产地点。
- 搜索返回 `count: 10000`，同时明确 `is_count_exact: false`。这里的 10,000 不是查明的全球啤酒总量，更不是一万种精酿。

首个 20 行搜索小样中，19 行通过前图元数据检查；这个比例仅描述小样。元数据有图不等于最终照片下载成功。包装尺寸、同款不同条码、重复照片、泛化品名、无品牌与下载失败仍须在导入阶段处理。1,500 个候选不能直接称为 1,500 款新酒，也不意味着每款已经核验精酿身份。

实际导入、照片、地图参考点及保留条码数以 [`public/data/off.json`](../public/data/off.json) 的 `metadata.counts` 为准；本说明不固定首批导入数量。批量下载和导入另由 `scripts/import-off-photos.py` 执行。

## 时间与覆盖限制

本批 Search-a-licious 记录的 `last_indexed_datetime` 范围是 **2024-02-29 至 2024-10-27**，索引较旧。抓取日期是 2026-09-14，不表示产品或图片在当天更新。每条产品的 `last_modified_t`、每张原图的 `uploaded_t` 分别保留，不能与索引日期混用。

前期备用来源是 OFF 官方维护的 [Hugging Face product-database](https://huggingface.co/datasets/openfoodfacts/product-database)，读取到的仓库 revision 为 `d75439d6ed36ec9abe625d3702c8fb51c7d67d89`、`lastModified` 为 `2026-09-13T18:22:00Z`。此 revision 只对应那 6 个 HF 候选；不能给后续搜索索引记录统一标成这个日期。

HF 宽条件 `categories LIKE '%beer%'` 曾返回 4,768 个匹配及 `partial: false`，但含根啤汽水、糖果等，不能作为啤酒总数。大页和后续页出现 500/502，因此未继续通过该查询扩量。任何未来返回的 `partial`/部分扫描标记都应保留。

数据包含大众品牌及无酒精啤酒，不能统称精酿。`countries_tags` 表示销售市场，不能拿来绘制产地。只有另有证据的酒厂或品牌参考地点才能上图；品牌所在地也不证明每一款的实际生产工厂。

## 照片下载与实际验证

[OFF 图片下载说明](https://openfoodfacts.github.io/openfoodfacts-server/api/how-to-download-images/) 建议小量图片从官网获取，较多图片用 [公开 AWS 数据集](https://openfoodfacts.github.io/openfoodfacts-server/api/aws-images-dataset/)。本轮只取少量核对图；批量使用 AWS 原图的 400px 版本。

实测 `Hoptimista`（条码 `0013189953166`）：官网选中前图 HTTP 200，目视为实际酒瓶；AWS `data/001/318/995/3166/2.400.jpg` HTTP 200；AWS `front_fr.7.400.jpg` HTTP 404。因此不能假设官网加工后的 selected 文件也存在于 AWS，应使用 selected 所引用的原始 `imgid`，保留其署名。

短条码在两个服务的规则不同，已分别实测条码 `40173832`：

| 地址形式 | 实测 |
|---|---|
| 官网 `/images/products/40173832/front_de.6.400.jpg` | 200 |
| AWS `/data/40173832/2.400.jpg` | 404 |
| AWS 补成 13 位后 `/data/000/004/017/3832/2.400.jpg` | 200 |

采集器据此区分官网与 AWS 路径。1,500 个候选中 101 个短条码已按此规则整理；官网目录与源返回目录逐条核对无差异。原始照片直接保存，采集器不编辑或生成图片。各图片仍需下载校验；真实照片不保证一定是透明背景或统一摄影风格。

## 许可、署名与可追溯性

[OFF 官方许可说明](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/) 分别规定：数据库使用 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)，独立内容使用 [DbCL 1.0](https://opendatacommons.org/licenses/dbcl/1-0/)，产品照片使用 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。保留 Open Food Facts 及原图贡献者署名、产品来源链接、许可链接，并按各自许可履行再分发要求。照片中的商标和包装图形可能另有权利；该许可不等于品牌背书。

公开的 [`fetch-manifest.json`](../public/data-sources/off/fetch-manifest.json) 只含来源 URL、revision、SHA-256、原始文件名、时间和计数，没有 Cookie 或请求头。完整原始 JSON 响应、逐页校验文件、少量图片探针及候选暂存在 `.runtime/off/`，没有作为不相关原始头信息公开。`products.json` 是带来源的中间结果，最终分发字段、去重与图片清单以导入产物为准。

可复用采集器：`python3 scripts/fetch-off-beers.py --source search --page-size 100 --target 1500 --max-pages 24 --interval 7`。达到本地已有候选目标后直接复用，不为重复运行再次请求或清空来源记录。
