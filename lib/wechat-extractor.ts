import { load, type CheerioAPI } from 'cheerio';
import juice from 'juice';

export type StyleToken = {
  label: string;
  value: string;
  swatch?: string;
};

export type ComponentRule = {
  label: string;
  detail: string;
};

export type ExtractedArticle = {
  sourceUrl: string;
  title: string;
  author: string;
  html: string;
  tokens: StyleToken[];
  components: ComponentRule[];
  baseStyle: {
    color: string;
    fontSize: string;
    lineHeight: string;
    letterSpacing: string;
  };
};

const MAX_ARTICLE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TEXT_COLOR = '#3F3F3F';

const REMOVED_TAGS = [
  'script',
  'style',
  'link',
  'meta',
  'iframe',
  'frame',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'noscript',
  'canvas',
  'svg',
  'audio',
  'video',
];

const ALLOWED_ATTRIBUTES = new Set([
  'style',
  'src',
  'alt',
  'width',
  'height',
  'href',
  'title',
  'colspan',
  'rowspan',
]);

const ALLOWED_STYLE_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'background-image',
  'background-attachment',
  'background-blend-mode',
  'background-clip',
  'background-origin',
  'background-position',
  'background-repeat',
  'background-size',
  'font-size',
  'font-weight',
  'font-style',
  'font-family',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-indent',
  'white-space',
  'word-break',
  'overflow-wrap',
  'vertical-align',
  'display',
  'visibility',
  'overflow',
  'overflow-x',
  'overflow-y',
  'float',
  'clear',
  'box-sizing',
  'box-shadow',
  'text-shadow',
  'opacity',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-style',
  'border-width',
  'border-radius',
  'width',
  'min-width',
  'max-width',
  'height',
  'min-height',
  'max-height',
  'aspect-ratio',
  'object-fit',
  'object-position',
  'position',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'transform',
  'transform-origin',
  'filter',
  'mix-blend-mode',
  'gap',
  'row-gap',
  'column-gap',
  'flex',
  'flex-basis',
  'flex-direction',
  'flex-grow',
  'flex-shrink',
  'flex-wrap',
  'align-items',
  'align-content',
  'align-self',
  'justify-content',
  'justify-items',
  'justify-self',
  'order',
  'grid',
  'grid-area',
  'grid-auto-columns',
  'grid-auto-flow',
  'grid-auto-rows',
  'grid-column',
  'grid-column-end',
  'grid-column-start',
  'grid-row',
  'grid-row-end',
  'grid-row-start',
  'grid-template',
  'grid-template-areas',
  'grid-template-columns',
  'grid-template-rows',
  'list-style',
  'list-style-position',
  'list-style-type',
  'columns',
  'column-count',
  'column-width',
  'border-collapse',
  'border-spacing',
  'table-layout',
  'writing-mode',
  '-webkit-box-orient',
  '-webkit-line-clamp',
]);

export class ExtractorError extends Error {
  readonly code:
    | 'INVALID_URL'
    | 'FETCH_FAILED'
    | 'ARTICLE_BLOCKED'
    | 'ARTICLE_NOT_FOUND'
    | 'ARTICLE_TOO_LARGE';

  constructor(
    code:
      | 'INVALID_URL'
      | 'FETCH_FAILED'
      | 'ARTICLE_BLOCKED'
      | 'ARTICLE_NOT_FOUND'
      | 'ARTICLE_TOO_LARGE',
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export function normalizeWechatUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ExtractorError('INVALID_URL', '请粘贴完整的公众号文章链接');
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'mp.weixin.qq.com') {
    throw new ExtractorError(
      'INVALID_URL',
      '目前仅支持 https://mp.weixin.qq.com 开头的公众号文章链接',
    );
  }

  url.hash = '';
  return url;
}

export async function fetchWechatArticle(input: string): Promise<ExtractedArticle> {
  let currentUrl = normalizeWechatUrl(input);

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;

    try {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
          'user-agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50',
        },
      });
    } catch {
      throw new ExtractorError(
        'FETCH_FAILED',
        '暂时无法读取这篇文章，请确认文章仍可公开访问后重试',
      );
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirectCount === 3) {
        throw new ExtractorError('FETCH_FAILED', '文章跳转次数过多，无法安全读取');
      }
      currentUrl = normalizeWechatUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      throw new ExtractorError(
        'FETCH_FAILED',
        `微信返回了 ${response.status}，请稍后重试或换一篇公开文章`,
      );
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_ARTICLE_BYTES) {
      throw new ExtractorError('ARTICLE_TOO_LARGE', '文章内容过大，暂时无法处理');
    }

    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_ARTICLE_BYTES) {
      throw new ExtractorError('ARTICLE_TOO_LARGE', '文章内容过大，暂时无法处理');
    }

    return parseWechatArticle(html, currentUrl.toString());
  }

  throw new ExtractorError('FETCH_FAILED', '无法读取这篇文章');
}

export function parseWechatArticle(pageHtml: string, sourceUrl: string): ExtractedArticle {
  const $ = load(pageHtml);
  const content = $('#js_content, .rich_media_content, [id^="js_content"]')
    .filter((_, element) => $(element).text().trim().length > 0)
    .first();

  if (!content.length) {
    const pageText = $('body').text().replace(/\s+/g, ' ').trim();
    if (/环境异常|访问过于频繁|安全验证|请完成验证|verify/i.test(pageText)) {
      throw new ExtractorError(
        'ARTICLE_BLOCKED',
        '微信要求安全验证，服务器暂时无法读取；请稍后重试或换一个公开链接',
      );
    }
    throw new ExtractorError(
      'ARTICLE_NOT_FOUND',
      '没有在页面中找到公众号正文，请确认链接指向一篇公开文章',
    );
  }

  const title = firstText($, [
    '#activity-name',
    '.rich_media_title',
    'meta[property="og:title"]',
    'title',
  ]);
  const author = firstText($, [
    '#js_name',
    '.rich_media_meta_text',
    'meta[name="author"]',
    'meta[property="og:article:author"]',
  ]);

  // Editors commonly place layout rules in class selectors instead of inline
  // attributes. Resolve those rules before sanitizing so copied HTML remains
  // visually faithful even after it leaves the original WeChat page.
  juice.juiceDocument($, {
    applyAttributesTableElements: true,
    applyHeightAttributes: true,
    applyStyleTags: true,
    applyWidthAttributes: true,
    preserveFontFaces: false,
    preserveKeyFrames: false,
    preserveMediaQueries: false,
    preservePseudos: false,
    removeStyleTags: true,
    resolveCSSVariables: true,
  });
  const analysis = analyzeStyles($, content);
  sanitizeContent($, content, sourceUrl);

  const cleanedHtml = content.html()?.trim();
  if (!cleanedHtml || content.text().replace(/\s+/g, '').length < 10) {
    throw new ExtractorError('ARTICLE_NOT_FOUND', '正文内容为空，无法生成排版模板');
  }

  const displayAuthor = author || '公众号作者';
  const components = buildComponents(analysis);
  const tokens: StyleToken[] = [];
  const colors: [string, string | undefined][] = [
    ['强调色', analysis.accentColor],
    ['正文色', analysis.textColor],
    ['卡片底色', analysis.backgroundColor],
  ];
  for (const [label, value] of colors) {
    if (value) tokens.push({ label, value, swatch: value });
  }
  if (analysis.fontSize != null) tokens.push({ label: '正文字号', value: `${analysis.fontSize} px` });
  if (analysis.lineHeight != null) tokens.push({ label: '正文行高', value: `${analysis.lineHeight} ×` });
  if (analysis.paragraphSpacing != null) tokens.push({ label: '段落间距', value: `${analysis.paragraphSpacing} px` });

  return {
    sourceUrl,
    title: title || '公众号文章',
    author: displayAuthor,
    html: cleanedHtml,
    tokens,
    components,
    baseStyle: {
      color: analysis.textColor || DEFAULT_TEXT_COLOR,
      fontSize: `${analysis.fontSize ?? 16}px`,
      lineHeight: String(analysis.lineHeight ?? 1.75),
      letterSpacing: analysis.letterSpacing,
    },
  };
}

type Analysis = {
  accentColor: string | undefined;
  textColor: string | undefined;
  backgroundColor: string | undefined;
  fontSize: number | undefined;
  lineHeight: number | undefined;
  paragraphSpacing: number | null;
  letterSpacing: string;
  headingCount: number;
  quoteCount: number;
  separatorCount: number;
  cardCount: number;
  imageCount: number;
};

function firstText($: CheerioAPI, selectors: string[]): string {
  for (const selector of selectors) {
    const element = $(selector).first();
    if (!element.length) continue;
    const value = element.is('meta') ? element.attr('content') : element.text();
    const normalized = value?.replace(/\s+/g, ' ').trim();
    if (normalized) return normalized;
  }
  return '';
}

function analyzeStyles($: CheerioAPI, content: ReturnType<CheerioAPI>): Analysis {
  const textColors = new Map<string, number>();
  const accentColors = new Map<string, number>();
  const backgrounds = new Map<string, number>();
  const fontSizes = new Map<number, number>();
  const lineHeights = new Map<number, number>();
  const paragraphSpacings: number[] = [];
  const letterSpacings = new Map<string, number>();
  const headingCount = content.find('h1,h2,h3,h4,h5,h6').length;
  let quoteCount = 0;
  let separatorCount = 0;
  let cardCount = 0;
  let backgroundImageCount = 0;

  content.find('*').each((_, element) => {
    const node = $(element);
    const declarations = parseStyle(node.attr('style') || '');
    const textLength = Math.max(1, node.clone().children().remove().end().text().trim().length);
    const tagName = element.tagName?.toLowerCase() || '';

    for (const color of extractColors(declarations.get('color') || '')) {
      addWeight(textColors, color, textLength);
      if (isAccentColor(color)) addWeight(accentColors, color, Math.min(textLength, 40));
    }

    const backgroundValue =
      declarations.get('background-color') ||
      declarations.get('background-image') ||
      declarations.get('background') ||
      '';
    if (/url\s*\(/i.test(backgroundValue)) backgroundImageCount += 1;
    for (const color of extractColors(backgroundValue)) {
      if (!isNearWhite(color)) addWeight(backgrounds, color, textLength);
    }

    const borderValue = [...declarations.entries()]
      .filter(([property]) => property.startsWith('border'))
      .map(([, value]) => value)
      .join(' ');
    for (const color of extractColors(borderValue)) {
      if (isAccentColor(color)) addWeight(accentColors, color, 12);
    }

    const fontSize = numericPixels(declarations.get('font-size'));
    if (fontSize && fontSize >= 12 && fontSize <= 22 && ['p', 'span', 'section', 'div'].includes(tagName)) {
      addWeight(fontSizes, fontSize, textLength);
    }

    const lineHeight = numericLineHeight(declarations.get('line-height'), fontSize);
    if (lineHeight && lineHeight >= 1.2 && lineHeight <= 2.5) {
      addWeight(lineHeights, lineHeight, textLength);
    }

    const marginBottom = numericPixels(declarations.get('margin-bottom'));
    if (tagName === 'p' && marginBottom != null && marginBottom <= 80) paragraphSpacings.push(marginBottom);

    const letterSpacing = declarations.get('letter-spacing');
    if (letterSpacing && !/normal|inherit|initial/.test(letterSpacing)) {
      addWeight(letterSpacings, letterSpacing, textLength);
    }

    const hasBackground = Boolean(backgroundValue && !/transparent|none/i.test(backgroundValue));
    const hasPadding = [...declarations.keys()].some((key) => key.startsWith('padding'));
    const hasRadius = declarations.has('border-radius');
    const hasLeftBorder = declarations.has('border-left');
    if (['section', 'div', 'blockquote'].includes(tagName) && hasBackground && (hasPadding || hasRadius)) {
      cardCount += 1;
    }
    if (tagName === 'blockquote' || hasLeftBorder) quoteCount += 1;
    if (tagName === 'hr' || /dashed|dotted/.test(borderValue) || declarations.has('border-top')) separatorCount += 1;
  });

  const accentColor = bestEntry(accentColors);
  const textColor = bestTextColor(textColors);
  const backgroundColor = bestEntry(backgrounds);
  const fontSize = bestEntry(fontSizes);
  const lineHeight = bestEntry(lineHeights);
  const paragraphSpacing = median(paragraphSpacings);

  return {
    accentColor,
    textColor,
    backgroundColor,
    fontSize,
    lineHeight,
    paragraphSpacing,
    letterSpacing: bestEntry(letterSpacings) || '0.3px',
    headingCount,
    quoteCount,
    separatorCount,
    cardCount,
    imageCount: content.find('img').length + backgroundImageCount,
  };
}

function sanitizeContent(
  $: CheerioAPI,
  content: ReturnType<CheerioAPI>,
  sourceUrl: string,
) {
  content.find(REMOVED_TAGS.join(',')).remove();
  content.find('*').each((_, element) => {
    const node = $(element);
    const attributes = { ...element.attribs };

    for (const name of Object.keys(attributes)) {
      if (!ALLOWED_ATTRIBUTES.has(name.toLowerCase())) node.removeAttr(name);
    }

    const safeStyle = sanitizeStyle(attributes.style || '', sourceUrl);
    if (safeStyle) node.attr('style', safeStyle);
    else node.removeAttr('style');

    if (node.is('img')) {
      const candidate =
        attributes['data-src'] ||
        attributes['data-original'] ||
        attributes['data-backsrc'] ||
        attributes['data-croporisrc'] ||
        attributes.src ||
        '';
      const safeSrc = safeRemoteUrl(candidate, sourceUrl);
      if (safeSrc) node.attr('src', safeSrc);
      else node.removeAttr('src');
      node.attr('loading', 'lazy');
      node.attr('referrerpolicy', 'no-referrer');
      const imageStyle = node.attr('style') || '';
      if (!/max-width\s*:/.test(imageStyle)) {
        node.attr('style', `${imageStyle}${imageStyle ? ';' : ''}max-width:100%;height:auto`);
      }
    }

    if (node.is('a')) {
      const safeHref = safeRemoteUrl(attributes.href || '', sourceUrl);
      if (safeHref) node.attr('href', safeHref);
      else node.removeAttr('href');
    }
  });

  content.find('img:not([src])').remove();
}

function parseStyle(style: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const part of style.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 1) continue;
    const property = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (property && value) declarations.set(property, value);
  }
  return declarations;
}

function sanitizeStyle(style: string, baseUrl: string): string {
  const clean: string[] = [];
  for (const [property, value] of parseStyle(style)) {
    if (!ALLOWED_STYLE_PROPERTIES.has(property)) continue;
    if (/expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding/i.test(value)) {
      continue;
    }
    if (
      property === 'position' &&
      !/^(static|relative|absolute|sticky)(\s*!important)?$/i.test(value.trim())
    ) {
      continue;
    }
    if (value.length > 180 || /[{}<>]/.test(value)) continue;

    let hasUnsafeUrl = false;
    const safeValue = value.replace(
      /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,
      (_, doubleQuoted: string, singleQuoted: string, bare: string) => {
        const candidate = (doubleQuoted || singleQuoted || bare || '').trim();
        const safeUrl = safeRemoteUrl(candidate, baseUrl);
        if (!safeUrl) {
          hasUnsafeUrl = true;
          return '';
        }
        return `url("${safeUrl}")`;
      },
    );
    if (hasUnsafeUrl || (/url\s*\(/i.test(value) && !/url\("https?:\/\//i.test(safeValue))) {
      continue;
    }

    clean.push(`${property}:${safeValue}`);
  }
  return clean.join(';');
}

function safeRemoteUrl(value: string, baseUrl: string): string | null {
  if (!value || /^data:/i.test(value)) return null;
  try {
    const url = new URL(value, baseUrl);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function extractColors(value: string): string[] {
  const colors: string[] = [];
  const hexMatches = value.match(/#[0-9a-f]{3,8}\b/gi) || [];
  for (const hex of hexMatches) {
    const normalized = normalizeHex(hex);
    if (normalized) colors.push(normalized);
  }

  const rgbMatches = value.match(/rgba?\([^)]*\)/gi) || [];
  for (const rgb of rgbMatches) {
    const normalized = rgbToHex(rgb);
    if (normalized) colors.push(normalized);
  }
  return colors;
}

function normalizeHex(value: string): string | null {
  const raw = value.slice(1);
  if (raw.length === 3) {
    return `#${raw.split('').map((character) => character + character).join('')}`.toUpperCase();
  }
  if (raw.length === 6) return `#${raw}`.toUpperCase();
  if (raw.length === 8 && raw.slice(6) !== '00') return `#${raw.slice(0, 6)}`.toUpperCase();
  return null;
}

function rgbToHex(value: string): string | null {
  const numbers = value.match(/[\d.]+/g)?.map(Number) || [];
  if (numbers.length < 3 || numbers.slice(0, 3).some((number) => number > 255)) return null;
  if (numbers.length === 4 && numbers[3] === 0) return null;
  return `#${numbers
    .slice(0, 3)
    .map((number) => Math.round(number).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function isAccentColor(hex: string): boolean {
  const [r, g, b] = hexChannels(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const lightness = (max + min) / 510;
  return saturation >= 0.28 && lightness >= 0.18 && lightness <= 0.82;
}

function isNearWhite(hex: string): boolean {
  const [r, g, b] = hexChannels(hex);
  return r > 242 && g > 242 && b > 242;
}

function bestTextColor(colors: Map<string, number>): string | undefined {
  const candidates = [...colors.entries()].filter(([hex]) => {
    const [r, g, b] = hexChannels(hex);
    return (r + g + b) / 3 < 190;
  });
  return candidates.sort((a, b) => b[1] - a[1])[0]?.[0];
}

function hexChannels(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function numericPixels(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/^(-?[\d.]+)px$/i);
  return match ? Number(match[1]) : null;
}

function numericLineHeight(value?: string, fontSize?: number | null): number | null {
  if (!value) return null;
  if (/^[\d.]+$/.test(value)) return Number(value);
  const pixels = numericPixels(value);
  return pixels && fontSize ? pixels / fontSize : null;
}

function addWeight<K>(map: Map<K, number>, key: K, weight: number) {
  map.set(key, (map.get(key) || 0) + weight);
}

function bestEntry<K>(map: Map<K, number>): K | undefined {
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildComponents(analysis: Analysis): ComponentRule[] {
  const components: ComponentRule[] = [];
  if (analysis.headingCount) {
    components.push({ label: '章节标题', detail: `${analysis.headingCount} 处 · 保留原样式` });
  }
  if (analysis.quoteCount) {
    components.push({ label: '引用 / 重点提示', detail: `${analysis.quoteCount} 处` });
  }
  if (analysis.cardCount) {
    components.push({ label: '内容卡片', detail: `${analysis.cardCount} 处 · 背景与留白` });
  }
  if (analysis.separatorCount) {
    components.push({ label: '内容分隔', detail: `${analysis.separatorCount} 处` });
  }
  if (analysis.imageCount) {
    components.push({ label: '文章图片', detail: `${analysis.imageCount} 张 · 已适配宽度` });
  }
  if (!components.length) {
    components.push({ label: '正文段落', detail: '已保留原始层级与间距' });
  }
  return components;
}
