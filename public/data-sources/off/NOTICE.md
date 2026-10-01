# Open Food Facts 实物照片与商品资料

来源： https://world.openfoodfacts.org 。通过官方公开搜索 https://search.openfoodfacts.org 与官方备用快照 https://huggingface.co/datasets/openfoodfacts/product-database 读取；每条保留实际来源。每款条码商品及照片作者见 products.json、images.json 和酒款资料。

数据库 ODbL 1.0：https://opendatacommons.org/licenses/odbl/1-0/
单项内容 DbCL 1.0：https://opendatacommons.org/licenses/dbcl/1-0/
照片 CC BY-SA 3.0：https://creativecommons.org/licenses/by-sa/3.0/
官方说明：https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/

派生 /data/off.json 继续以上数据库许可。处理包括精确类别筛选、品牌与明确商品名包装去重、中文风格显示标签、已有来源的品牌参考位置关联及缺失值标注。照片沿用官方选定正面图对应的原始照片400px版本，未改动像素。原图可能为瓶、罐或多件包装，非透明抠图。照片里的包装图案仍可能包含品牌等第三方权利。

商品销售地区与原料来源未用于地图定位。未提供风味时留空；没有以品牌关系推定逐款实际生产厂。未核验全部酒款的精酿属性，条数不能充作全球独立精酿数量。
