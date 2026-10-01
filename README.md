# Brew Atlas · 酒瓶地图 Demo

当前版本 **1.19.0**。恢复并合并已有酒款，不再要求获奖、畅销或代表资格。获奖和代表保留为可重合的筛选标签。支持 Mac 本地运行和 GitHub Pages 静态部署。

[打开在线地图](https://zijianz-nv.github.io/brew-atlas/) · [浏览全部酒库](https://zijianz-nv.github.io/brew-atlas/?collection=all&view=library) · [查看日本](https://zijianz-nv.github.io/brew-atlas/?collection=all&view=globe&beer=curated-award-2953998)

## 本地数据

| 项目 | 数量 |
| --- | ---: |
| 合并后的来源记录 | 189,930 |
| 保留本地图片的记录 | 2,679 |
| 有介绍、图片及可信参考位置，可进入地图 | 661 |
| 有介绍或原文节录 | 134,482 |
| 有 ABV | 149,642 |
| 获奖标签 | 119 |
| 代表种子标签 | 6 |

含原 Demo 的 9,318 条，以及已下载的 KKCP、Hold My Beer、Luca、HopCity、Systembolaget、OFF 待补资料、BeerTasting 补充和 BeerRepublic 样本。按精确来源 ID、Untappd ID、条码和已复核的官方同款关系合并；其余跨来源名称仍可能重复，记录数不能当作已确认独立精酿数。历史配方、旧数据和包装版本保留来源说明，不宣称全部在售。缺酒名、确认非啤酒、只有 UUID 或虚构示例的数据留在研究审计中。

图片全部使用已缓存文件；仅有远程候选地址的记录不热链。地图继续要求真实介绍与可信参考位置，保留重复图片抑制、贴陆地、稳定缩放和不显示数字标记的规则。按最新要求统一缩小酒瓶，允许部分重叠；任意两张最多重叠较小图片面积的22%，每张与周围图片的累计相交面积最多35%，保证仍有可点击、可辨认的部分。没有可用图片或位置的记录也能在酒库检索。

日本现有 171 条来源记录、69 条带本地图、26 条满足地图资格。主动定位会先检查当前比例能否放下所选酒厂的照片，必要时一次放大到可用比例；手动缩放继续保留原地理锚点。是否同时可见取决于朝向、尺度、陆地空间和筛选，不代表 26 张会在全球视角全部铺出。

## 在 Mac 上查看

使用 Node.js 22.12 及以上版本（推荐 Node.js 24）：

```sh
npm ci
npm run build
npm start
```

第一次构建会从仓库中的压缩快照恢复大型数据文件，并校验 SHA-256 和记录数，无需注册服务或配置密钥。

双击“启动精酿地球.command”，再访问：

- 全部酒库：http://127.0.0.1:4173/?collection=all&view=library&v=118
- 全部地图：http://127.0.0.1:4173/?collection=all&view=globe&v=118

顶部切换地球、酒库和收藏；底部可筛选来源、种类、口味、风味、工艺、酒厂和地区。旧来源链接重新有效。“有图酒库”只是可选筛选，不再作为分享全部数据的入口。重启 Mac 后需再次运行启动器。

## GitHub Pages 部署

仓库 Settings → Pages 中将 Source 设为 GitHub Actions。推送到 `main`，或在 Actions 手动运行 `Deploy Brew Atlas to GitHub Pages`，即可构建、运行全部测试并部署。

工作流自动读取 Pages 的子目录路径，酒瓶图片、地图、数据和来源说明均使用同一路径。无需手改资源地址。网站地址见成功的部署任务输出。

发布目录将完整数据库拆为 22 个 JSON 分片及一份清单，每个文件不超过 8MiB。浏览器最多同时加载 4 个分片，完整合并后再显示酒库；记录、顺序和字段保持不变。`dist/`、测试截图、抓取工具缓存及本机认证信息均不提交到 GitHub。

## 构建与核验

`npm run build` 先恢复输入快照、生成获奖/代表中间目录，再合并数据，最后构建页面和打包实际引用的图片。完整工作文件保留在 `public/data/catalog.json`，不提交 Git；运行网站使用 `data/catalog.manifest.json` 及其分片。`npm test` 运行数据、合并、分类、地图、分片恢复与加载等检查。

- scripts/build-curated-catalog.mjs：精选中间目录 public/data/curated.json。
- scripts/build-local-catalog.mjs：完整运行目录和合并审计。
- scripts/restore-data-snapshots.mjs：恢复压缩输入并验证完整性。
- scripts/catalog-chunks.mjs：按字节预算生成完整数据分片。
- research/local-catalog/：压缩数据输入及完整性清单。
- scripts/local-catalog.test.mjs：旧库恢复和来源合并检查。
- scripts/marker-layout.test.mjs：图片尺寸、部分重叠、沿海布局和缩放稳定性检查。
- scripts/catalog-loader.test.mjs：分片完整加载、取消请求和部署路径检查。
- scripts/restore-data-snapshots.test.mjs：压缩输入恢复、校验与损坏拒绝检查。

浏览器验收报告和截图属于本地 `qa/` 产物，不随源码仓库发布。

代表 1000 仍是选样目标；当前6款为种子，不把大量普通酒款自动标成代表。软件许可见 `THIRD-PARTY-NOTICES.md`；数据和图片的来源、署名与许可说明分别保留在 `public/data-sources/` 与 `research/*-SOURCES.md`。
