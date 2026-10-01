// Browsing groups, not a certification system or a prediction of sensory intensity.
export const STYLE_FAMILIES = Object.freeze([
  ['ipa', 'IPA'], ['pale-ale', '淡色艾尔'], ['amber-brown', '琥珀 / 棕色艾尔'],
  ['stout-porter', '世涛 / 波特'], ['wheat', '小麦啤酒'], ['lager-bock', '拉格 / 博克'],
  ['sour', '酸啤'], ['belgian', '比利时 / 赛松'], ['other', '其他类型'], ['unknown', '种类待补充'],
].map(([id, label]) => Object.freeze({ id, label })));

const options = rows => Object.freeze(rows.map(([id, label]) => Object.freeze({ id, label })));
export const FACETS = Object.freeze({
  taste: options([['bitter', '苦感'], ['sweet', '甜感'], ['sour', '酸感']]),
  mouthfeel: options([['light', '轻盈'], ['full', '饱满'], ['smooth', '顺滑'], ['crisp', '清爽'], ['lively', '气泡活跃']]),
  aroma: options([
    ['citrus', '柑橘'], ['tropical', '热带水果'], ['berry', '莓果 / 樱桃'], ['stone-fruit', '核果'],
    ['fruit', '果香'], ['banana', '香蕉'], ['dried-fruit', '果干'], ['coffee', '咖啡'], ['chocolate', '巧克力'],
    ['caramel', '焦糖'], ['floral', '花香'], ['malt', '麦香'], ['resin', '松针 / 树脂'], ['hoppy', '酒花'],
    ['spice', '香料'], ['roast', '烘烤'], ['smoke', '烟熏'], ['vanilla', '香草'], ['honey', '蜂蜜'],
    ['nut', '坚果'], ['coconut', '椰子'], ['wood', '木质'], ['earth', '泥土'], ['molasses', '糖蜜'],
  ]),
  process: options([['dry-hop', '干投酒花'], ['barrel-aged', '桶陈'], ['mixed-fermentation', '混合发酵'], ['bottle-conditioned', '瓶中二次发酵']]),
  ingredient: options([
    ['hops', '酒花'], ['barley', '大麦'], ['wheat', '小麦'], ['oats', '燕麦'], ['rye', '黑麦'], ['rice', '大米'],
    ['fruit', '水果'], ['coffee', '咖啡'], ['cacao', '可可'], ['honey', '蜂蜜'], ['lactose', '乳糖'], ['spice', '香料'],
  ]),
});

const str = value => typeof value === 'string' ? value.trim() : '';
const list = value => Array.isArray(value) ? value : [];
const normalize = value => str(value).normalize('NFKC').toLowerCase().replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim();
const slug = value => normalize(value).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
const isGeneric = value => /^(?:|beer|beers|ale|ales|unclassified beer|unknown|n\/?a|other|啤酒|艾尔)$/i.test(str(value)) || /未分类|未知|待补充|待核对|未提供|未细分/.test(str(value));

const styleRules = [
  ['ipa', /\b(?:ipa|neipa|india(?:n)?[ -]pale ale)\b|印度淡色艾尔/i],
  ['sour', /\b(?:sour|lambic|gueuze|geuze|gose|berliner weisse|flanders red|oud bruin|faro)\b|酸啤|酸艾尔|兰比克|贵兹|古斯|柏林小麦/i],
  // Weizenbock is a wheat beer; schwarzbier and dark lager are never stout aliases.
  ['wheat', /\b(?:wheat|weizen|hefeweizen|dunkelweizen|weizenbock|weissbier|weiss|witbier|wit)\b|belgian(?:-style)? white|小麦|白啤/i],
  ['lager-bock', /\b(?:lager|pilsner|pilsener|pils|bock|doppelbock|eisbock|maibock|helles|schwarzbier|marzen|märzen|oktoberfest|festbier|dortmunder|kellerbier|rauchbier)\b|拉格|皮尔森|博克|慕尼黑|十月节/i],
  ['stout-porter', /\b(?:stout|porter)\b|世涛|司陶特|波特/i],
  ['belgian', /\b(?:belgian|belgo|saison|dubbel|tripel|triple ale|quadrupel|quad|biere de garde|bière de garde|abbey ale)\b|比利时|赛松|修道院/i],
  ['amber-brown', /\b(?:amber|brown|red ale|scotch ale|scottish ale|dark ale|altbier|dark mild)\b|(?:^|\s)alt(?:\s|$)|琥珀|棕色|红艾尔|红色艾尔|苏格兰|深色艾尔/i],
  ['pale-ale', /\b(?:pale ale|pale mild ale|bitter|esb|blonde ale|blond ale|golden ale|kolsch|kölsch)\b|淡色艾尔|金色艾尔|金艾尔|科隆/i],
];

// Source browsing categories can resolve missing/ambiguous styles. These exact
// labels are not sensory, ingredient, fermentation or craft-status evidence.
const sourceStyleFamilies = new Map([
  ['india pale ale', 'ipa'], ['porter/stout', 'stout-porter'], ['wheat beer', 'wheat'],
  ['pale lager', 'lager-bock'], ['dark lager', 'lager-bock'], ['bock', 'lager-bock'],
  ['sour fermentation', 'sour'], ['spontaneous fermentation', 'sour'],
  ['ale (belgian)', 'belgian'], ['kölsch', 'pale-ale'], ['alt', 'amber-brown'],
  ['ale (angloamerican)', 'other'], ['creative beers', 'other'], ['finishing style', 'other'],
  ['alcohol free', 'other'], ['beer mixed beverages', 'other'], ['cider', 'other'],
  ['light beers bottom fermenting', 'lager-bock'],
]);

const offStyleTags = [
  ['en:double-dry-hopped-ipa', 'Double Dry-hopped IPA', '双重干投 IPA'],
  ['en:triple-ipa', 'Triple IPA', '三倍 IPA'], ['en:new-england-ipa', 'New England IPA', '新英格兰 IPA'],
  ['en:double-ipa', 'Double IPA', '双倍 IPA'], ['en:session-ipa', 'Session IPA', '轻饮型 IPA'],
  ['en:hazy-ipa', 'Hazy IPA', '浑浊 IPA'], ['en:west-coast-ipa', 'West Coast IPA', '西海岸 IPA'],
  ['en:brut-ipa', 'Brut IPA', '干型 IPA'], ['en:rye-ipa', 'Rye IPA', '黑麦 IPA'],
  ['ca:cervesa-ipa', 'IPA', 'IPA'], ['en:india-pale-ales', 'IPA', 'IPA'],
  ['en:lambic-beers', 'Lambic', '兰比克'], ['en:gueuze', 'Gueuze', '贵兹'], ['en:sour-beers', 'Sour Beer', '酸啤'],
  ['en:hefeweizen-beers', 'Hefeweizen', '德式酵母小麦'], ['en:wheat-beers', 'Wheat Beer', '小麦啤酒'],
  ['en:dark-lagers', 'Dark Lager', '深色拉格'], ['en:doppelbock-beers', 'Doppelbock', '双料博克'],
  ['en:bock-beers', 'Bock', '博克'], ['en:pilsners', 'Pilsner', '皮尔森'], ['en:lagers', 'Lager', '拉格'],
  ['en:stouts', 'Stout', '世涛'], ['en:triple-ales', 'Tripel', '比利时三料'],
  ['en:amber-beers', 'Amber Beer', '琥珀啤酒'], ['en:dark-ales', 'Dark Ale', '深色艾尔'],
  ['en:pale-ales', 'Pale Ale', '淡色艾尔'], ['en:blonde-ales', 'Blonde Ale', '金色艾尔'],
];

function styleOf(beer) {
  const raw = beer.sourceRecord && typeof beer.sourceRecord === 'object' ? beer.sourceRecord : {};
  const category = str(raw.style_family) || str(beer.sourceCategory);
  const categoryFamily = sourceStyleFamilies.get(normalize(category));
  let en = str(beer.style), zh = str(beer.styleZh);
  if (isGeneric(en) && isGeneric(zh) && !isGeneric(raw.style)) en = str(raw.style);
  let sourceText = `种类：${isGeneric(en) ? zh : en}`;
  if (isGeneric(en) && isGeneric(zh)) {
    const tag = offStyleTags.find(([id]) => list(beer.offCategories).includes(id));
    if (!tag) return { family: categoryFamily || 'unknown', substyle: null,
      sourceText: categoryFamily ? `来源分类：${category}` : '', declaredStyle: '' };
    [sourceText, en, zh] = tag;
  }
  const combined = [en, zh].filter(value => !isGeneric(value)).join(' ').trim();
  // The old catalogue explicitly leaves some fermentation families unresolved.
  const matchedFamily = styleRules.find(([, pattern]) => pattern.test(combined))?.[0];
  let family = /\b(?:cream|rye) ale or lager\b/i.test(en) ? 'other' : matchedFamily || categoryFamily || 'other';
  // "Blonde Ale" and "Strong Ale" need their declared Belgian category, while
  // explicit IPA, lambic, wit, lager and porter styles retain their own groups.
  const belgianContext = categoryFamily === 'belgian' && ['pale-ale', 'amber-brown', 'other'].includes(family);
  if (belgianContext) family = 'belgian';
  if (categoryFamily && (!matchedFamily || belgianContext)) sourceText += `；来源分类：${category}`;
  const canonical = normalize(isGeneric(en) ? zh : en)
    .replace(/-style\b/g, '').replace(/\b(?:india|indian)[ -]pale ale\b/g, 'ipa')
    .replace(/\bnew england ipa\s*\(neipa\)/g, 'new england ipa').replace(/\bneipa\b/g, 'new england ipa')
    .replace(/\bpilsener\b/g, 'pilsner').replace(/\bblond\b/g, 'blonde');
  return { family, substyle: { id: slug(canonical), label: !isGeneric(zh) ? zh : en }, sourceText,
    declaredStyle: !isGeneric(en) ? en : zh };
}

// Use complete source clauses; an unqualified keyword in an uncertain/negative
// clause must not become an asserted characteristic. Missing values stay unknown.
function clauses(value) {
  return str(value).split(/[.!?;。！？；\n]|\bbut\b|\bhowever\b|但是|不过/iu).map(str).filter(Boolean);
}
function affirmative(text) {
  return !/\b(?:no|not|never|zero|without|neither|nor|lack(?:s|ing)?|free from|may|might|could|can|would|should|perhaps|possibly|potentially|seems?|inspired|reminiscent|optional(?:ly)?|try|recommend(?:ed)?|suggest(?:ed)?|if|avoid|instead of|rather than|whether)\b|未添加|未使用|未经|未进行|不含|没有|无明显|并非|并不|不苦|不甜|不酸|不是|可选|可能|疑似|尝试|建议|避免/i.test(text);
}

const labelRules = {
  taste: { bitter: ['苦感', '苦味'], sweet: ['甜润', '甜感', '甜味'], sour: ['酸爽', '酸感', '酸味'] },
  mouthfeel: { light: ['轻盈'], full: ['饱满', '醇厚'], smooth: ['顺滑', '丝滑'], crisp: ['清爽', '干爽'], lively: ['气泡活跃', '细密气泡'] },
  aroma: {
    citrus: ['柑橘'], tropical: ['热带水果'], berry: ['莓果', '樱桃'], 'stone-fruit': ['核果'], fruit: ['果香'], banana: ['香蕉'],
    'dried-fruit': ['果干'], coffee: ['咖啡'], chocolate: ['巧克力'], caramel: ['焦糖'], floral: ['花香'], malt: ['麦香'],
    resin: ['松针', '树脂'], hoppy: ['酒花'], spice: ['香料', '丁香'], roast: ['烘烤'], smoke: ['烟熏'], vanilla: ['香草'],
    honey: ['蜂蜜'], nut: ['坚果', '杏仁'], coconut: ['椰子'], wood: ['木质', '木桶'], earth: ['泥土'], molasses: ['糖蜜'],
  },
};

const sensoryRules = {
  taste: {
    bitter: /\bbitterness\b|\bbitter (?:finish|aftertaste|taste|palate|beer|edge)\b|苦感|苦味|苦韵/i,
    sweet: /\bsweetness\b|\bsweet (?:finish|aftertaste|taste|palate|beer)\b|甜感|甜润|甜味/i,
    sour: /\b(?:sourness|acidity)\b|\b(?:sour|tart) (?:finish|aftertaste|taste|palate|beer|edge)\b|酸感|酸味|酸爽/i,
  },
  mouthfeel: {
    light: /\blight[ -]bod(?:y|ied)\b|酒体轻盈|轻盈酒体/i,
    full: /\bfull[ -]bod(?:y|ied)\b|\b(?:rich|full) mouthfeel\b|酒体饱满|饱满酒体|厚重酒体/i,
    smooth: /\b(?:silky|creamy) (?:mouthfeel|body|texture)\b|\bsmooth (?:mouthfeel|body|finish|texture|beer|ale)\b|口感顺滑|顺滑口感|酒体顺滑|丝滑/i,
    crisp: /\bcrisp (?:finish|mouthfeel|beer|ale|lager)\b|\bfinishes? (?:\w+ and )?crisp\b|清爽口感|口感清爽|干爽收尾/i,
    lively: /\b(?:high|lively|bright) carbonation\b|\beffervescent\b|气泡活跃|细密气泡/i,
  },
};

const processRules = {
  'dry-hop': /\bdry[ -]hopp(?:ed|ing)\b|\bdry[ -]hop(?:ped)? (?:with|using|addition)\b|干投酒花|酒花干投/i,
  'barrel-aged': /\bbarrel[ -]ag(?:ed|ing|eing)\b|\b(?:age[ds]?|mature[ds]?)\b[^.;]{0,55}\b(?:barrels?|casks?)\b|\b(?:barrels?|casks?)\b[^.;]{0,20}\bag(?:ed|ing|eing)\b|桶陈|橡木桶陈酿/i,
  'mixed-fermentation': /\bmixed[ -](?:culture[ -])?fermentation\b|\bfermented with (?:a )?mixed culture\b|混合发酵|混菌发酵/i,
  'bottle-conditioned': /\bbottle[ -]condition(?:ed|ing)\b|\b(?:secondary|second) fermentation in (?:the )?bottle\b|\brefermented in (?:the )?bottle\b|瓶中二次发酵|瓶中再发酵/i,
};
const ingredientRules = {
  barley: /\bbarley\b|大麦/i, wheat: /\bwheat\b|小麦/i, oats: /\boats?\b|燕麦/i,
  rye: /\brye\b|黑麦/i, rice: /\brice\b|大米|稻米/i,
  fruit: /\b(?:fruit|berries|berry|strawberr(?:y|ies)|raspberr(?:y|ies)|blueberr(?:y|ies)|blackberr(?:y|ies)|cranberr(?:y|ies)|cloudberr(?:y|ies)|lingonberr(?:y|ies)|tayberr(?:y|ies)|gooseberr(?:y|ies)|blackcurrant|cherr(?:y|ies)|mango|peach(?:es)?|pineapple|passionfruit|orange|lemon|lime|yuzu|guava|papaya|quince|plum|apricot|tangerine|grapefruit|raisins?)\b|水果|莓果|樱桃|芒果|桃汁|菠萝|柠檬|橙皮|百香果/i,
  coffee: /\bcoffee\b|咖啡/i, cacao: /\b(?:cacao|cacoa|cocoa|chocolate)\b|可可|巧克力/i,
  honey: /\bhoney\b|蜂蜜/i, lactose: /\blactose\b|\bmilk sugar\b|乳糖/i,
  spice: /\b(?:coriander|cinnamon|cloves?|vanilla|peppercorns?|pepper|chill?i(?:es)?|ginger|cardamom|cardamon|nutmeg|juniper|rosemary|cumin|caraway|grains of paradise)\b|香料|芫荽|肉桂|丁香|香草|胡椒|辣椒|生姜/i,
};
const otherAddition = /\b(?:chips?|powder|sugar|syrup|juice|puree|nibs|peel|tea|salt|concentrate|cacao|cocoa|cacoa|caramalt|marshmallows?|seeds?|nuts?|cascara|sea ?buckthorn|agave|hibiscus|liquorice)\b/i;
function ingredientName(value) { return str(typeof value === 'string' ? value : value?.name); }
function positiveAmount(value) { return !(value && typeof value === 'object' && Number.isFinite(value.amount?.value) && value.amount.value <= 0); }
function isHop(value) {
  const name = ingredientName(value);
  return name && affirmative(name) && !otherAddition.test(name) && !Object.values(ingredientRules).some(pattern => pattern.test(name));
}

export function classifyBeer(input) {
  const beer = input && typeof input === 'object' ? input : {};
  const style = styleOf(beer);
  const result = { family: style.family, substyle: style.substyle, taste: [], mouthfeel: [], aroma: [], process: [], ingredient: [], evidence: [] };
  const sourceUrl = list(beer.sourceUrls).find(url => /^https?:\/\//.test(str(url))) || null;
  const seen = new Set();
  const add = (dimension, id, text, url = sourceUrl) => {
    const key = `${dimension}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (Array.isArray(result[dimension])) result[dimension].push(id);
    result.evidence.push({ dimension, id, text: str(text).slice(0, 360), sourceUrl: url });
  };
  if (style.family !== 'unknown') add('family', style.family, style.sourceText);
  if (style.substyle) add('substyle', style.substyle.id, style.sourceText);
  // A style explicitly named "Barrel Aged" or "Dry Hopped Lager" is a source
  // assertion. A broad source category (or a suggestive beer name) is not.
  if (style.declaredStyle && affirmative(style.declaredStyle)) {
    for (const [id, pattern] of Object.entries(processRules)) {
      if (pattern.test(style.declaredStyle)) add('process', id, `来源风格：${style.declaredStyle}`);
    }
  }

  for (const flavor of list(beer.flavors).filter(value => typeof value === 'string')) {
    const declared = list(beer.flavorEvidence).find(item => item?.flavor === flavor);
    // Automated excerpts from names alone are too ambiguous for a sensory claim.
    const supporting = declared ? list(declared.matches).filter(match => ['description', 'tagline'].includes(match?.field))
      .find(match => affirmative(str(match.excerpt)) && str(match.excerpt)) : null;
    if (declared && !supporting) continue;
    if (!affirmative(flavor)) continue;
    const text = supporting ? `来源${supporting.field}：${supporting.excerpt}` : `来源风味标签：${flavor}`;
    for (const [dimension, rules] of Object.entries(labelRules)) {
      for (const [id, aliases] of Object.entries(rules)) {
        if (!aliases.includes(flavor)) continue;
        // Earlier keyword tags such as "smooth molasses" cannot by themselves
        // prove a smooth mouthfeel; require sensory wording in the excerpt.
        if (supporting && dimension !== 'aroma' && !sensoryRules[dimension]?.[id]?.test(str(supporting.excerpt))) continue;
        add(dimension, id, text);
      }
    }
  }

  const raw = beer.sourceRecord && typeof beer.sourceRecord === 'object' ? beer.sourceRecord : {};
  // Aroma stays tied to the existing curated/evidenced tags. Do not mine serving
  // suggestions, beer names, style names, recipes or food pairings for aromas.
  const descriptions = [...new Set([str(raw.description), str(beer.originalDescription)].filter(Boolean))];
  for (const description of descriptions) for (const clause of clauses(description)) {
    if (!affirmative(clause) || /\b(?:pair|serve|dessert|recipe|recommend|food)\b/i.test(clause)) continue;
    for (const [dimension, rules] of Object.entries(sensoryRules)) {
      for (const [id, pattern] of Object.entries(rules)) if (pattern.test(clause)) add(dimension, id, `来源描述：${clause}`);
    }
    for (const [id, pattern] of Object.entries(processRules)) if (pattern.test(clause)) add('process', id, `来源描述：${clause}`);
  }

  const ingredients = raw.ingredients && typeof raw.ingredients === 'object' ? raw.ingredients : {};
  const extractIngredient = (name, field) => {
    if (!name || !affirmative(name) || /\b(?:flavou?r|aroma|notes? of|reminiscent|imitation)\b|风味|香气|像是/i.test(name)) return;
    for (const [id, pattern] of Object.entries(ingredientRules)) {
      if (field === '来源麦芽原料' && !['barley', 'wheat', 'oats', 'rye', 'rice'].includes(id)) continue;
      // Chocolate/honey/coffee malt is a malt name, not evidence of added cacao,
      // honey or coffee. Whisky-soaked wood likewise does not assert rye grain.
      if (['cacao', 'coffee', 'honey'].includes(id) && /\bmalt\b|麦芽/i.test(name)) continue;
      if (id === 'rye' && /\bwhisk(?:e)?y\b/i.test(name)) continue;
      if (pattern.test(name)) add('ingredient', id, `${field}：${name}`);
    }
  };
  const maltItems = [...list(beer.malts), ...list(ingredients.malt)];
  for (const item of maltItems) if (positiveAmount(item)) extractIngredient(ingredientName(item), '来源麦芽原料');
  const hopItems = [...list(beer.hops), ...list(ingredients.hops)];
  for (const item of hopItems) {
    if (!positiveAmount(item)) continue;
    const name = ingredientName(item);
    extractIngredient(name, '来源配方添加物');
    if (isHop(item)) add('ingredient', 'hops', `来源酒花原料：${name}`);
  }
  for (const item of list(ingredients.hops)) {
    if (positiveAmount(item) && isHop(item) && /^dry[ -]hop(?:\b|,)/i.test(str(item?.add)) && affirmative(str(item?.add))) {
      add('process', 'dry-hop', `来源配方：${ingredientName(item)} · 添加阶段 ${item.add}`);
    }
  }
  for (const item of [...list(ingredients.additions), ...list(ingredients.other), ...list(ingredients.fruit)]) {
    if (positiveAmount(item)) extractIngredient(ingredientName(item), '来源配方原料');
  }
  for (const clause of clauses(raw.method?.twist)) {
    if (!affirmative(clause)) continue;
    extractIngredient(clause, '来源配方工艺 / 添加物');
    // Dry-hop timing on coffee or sugar additions is not proof of dry-hopping hops.
    for (const [id, pattern] of Object.entries(processRules)) {
      if (id !== 'dry-hop' && pattern.test(clause)) add('process', id, `来源配方工艺：${clause}`);
    }
  }
  const tags = list(beer.offCategories);
  if (tags.includes('en:double-dry-hopped-ipa')) add('process', 'dry-hop', 'Open Food Facts 分类：en:double-dry-hopped-ipa');
  if (tags.includes('en:beers-with-fruits')) add('ingredient', 'fruit', 'Open Food Facts 分类：en:beers-with-fruits');
  // A style such as lambic, milk stout or wheat beer does not itself assert
  // fermentation, ingredients or taste. Numeric IBU is not sensory intensity.
  for (const dimension of Object.keys(FACETS)) {
    const order = FACETS[dimension].map(option => option.id);
    result[dimension].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  return result;
}
