'use client';

import { useMemo, useState } from 'react';
import type { ExtractedArticle } from '@/lib/wechat-extractor';

const SOURCE_URL =
  'https://mp.weixin.qq.com/s/OmGJIA9-srVV3mVIjjo2gQ';

const INITIAL_RESULT: ExtractedArticle = {
  sourceUrl: SOURCE_URL,
  title: 'AI 都能写代码了，普通人还剩什么机会？',
  author: '子扬AI',
  templateName: '橙灰知识风',
  description: '理性、直接、留白克制，以橙色强调关键判断。',
  tokens: [
    { label: '强调色', value: '#E94F1F', swatch: '#E94F1F' },
    { label: '正文色', value: '#3F3F3F', swatch: '#3F3F3F' },
    { label: '卡片底色', value: '#F7F7F7', swatch: '#F7F7F7' },
    { label: '正文字号', value: '16 px' },
    { label: '正文行高', value: '1.8 ×' },
    { label: '段落间距', value: '14 px' },
  ],
  components: [
    { label: '章节标题', detail: '橙色序号 · 20 px' },
    { label: '重点提示卡', detail: '左侧 4 px 强调线' },
    { label: '虚线分隔', detail: '上下留白 24 px' },
    { label: '结尾行动卡', detail: '浅灰底 · 8 px 圆角' },
  ],
  baseStyle: {
    color: '#3F3F3F',
    fontSize: '16px',
    lineHeight: '1.8',
    letterSpacing: '0.3px',
  },
  ruleCount: 10,
  html: `
    <p style="margin:0 0 14px">当 AI 把执行效率推到新的高度，真正稀缺的能力，开始从“做得更快”转向“判断什么值得做”。</p>
    <section style="margin:0 0 14px;padding:12px 16px;color:#333;background:#f7f7f7;border-left:4px solid #e94f1f;border-radius:0 6px 6px 0"><p style="margin:0">💭 普通人的机会，不在和 AI 比速度，而在定义问题和把控结果。</p></section>
    <div style="margin:24px 0;border-top:1px dashed #ddd"></div>
    <h3 style="margin:0 0 14px;color:#222;font-size:20px;line-height:1.5"><span style="color:#e94f1f">01</span>｜先看清变化发生在哪里</h3>
    <p style="margin:0 0 14px">需求、流程和判断正在成为新的瓶颈。把经验写清楚、让 AI 循环执行，再由人负责最后的取舍。</p>
    <p style="margin:0 0 14px"><strong style="color:#e94f1f">意图优先</strong>，比单纯追求工具熟练度更重要。</p>
    <section style="margin-top:24px;padding:16px 18px;color:#666;font-size:15px;background:#f7f7f7;border-radius:8px"><p style="margin:0">如果这篇文章对你有启发，欢迎点赞、收藏，和我一起探索 AI 时代的个人机会。</p></section>
  `,
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 10.2 3.1 3.1L15.5 6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

export default function Home() {
  const [url, setUrl] = useState(SOURCE_URL);
  const [isExtracting, setIsExtracting] = useState(false);
  const [hasExtracted, setHasExtracted] = useState(true);
  const [notice, setNotice] = useState('已加载示例；可粘贴任意公开公众号文章');
  const [result, setResult] = useState<ExtractedArticle>(INITIAL_RESULT);
  const [hasError, setHasError] = useState(false);

  const sourceLabel = useMemo(() => {
    try {
      return new URL(url).hostname.toLowerCase() === 'mp.weixin.qq.com'
        ? '微信公众号文章'
        : '仅支持微信公众号文章';
    } catch {
      return '等待有效链接';
    }
  }, [url]);

  const extractStyle = async () => {
    setIsExtracting(true);
    setHasExtracted(false);
    setHasError(false);
    setNotice('正在识别正文、标题、强调色与组件…');

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const payload = (await response.json()) as
        | { ok: true; data: ExtractedArticle }
        | { ok: false; error: { code: string; message: string } };

      if (!payload.ok) throw new Error(payload.error.message);

      setResult(payload.data);
      setHasExtracted(true);
      setNotice(`提取完成：识别到 ${payload.data.ruleCount} 项样式规则`);
    } catch (error) {
      setHasError(true);
      setNotice(error instanceof Error ? error.message : '解析失败，请稍后重试');
    } finally {
      setIsExtracting(false);
    }
  };

  const copyToWechat = async () => {
    const content = document.querySelector<HTMLElement>('#wechat-content');
    if (!content) return;

    const html = content.outerHTML;
    const plain = content.innerText;

    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([item]);
      } else {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNode(content);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand('copy');
        selection?.removeAllRanges();
      }
      setNotice('已复制富文本，可直接粘贴到公众号编辑器');
      setHasError(false);
    } catch {
      setNotice('浏览器未允许剪贴板权限，请选中右侧预览后复制');
      setHasError(true);
    }
  };

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="样格首页">
          <span className="brand-mark">样</span>
          <span>
            <b>样格</b>
            <small>WECHAT STYLE</small>
          </span>
        </a>
        <div className="header-note">
          <span className="status-dot" />
          通用解析 · 公开文章可用
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span>01</span> 从一篇文章开始</div>
        <h1>一篇文章，沉淀一套<br />公众号视觉风格。</h1>
        <p className="hero-copy">
          粘贴公众号文章链接，识别字体、颜色、间距与内容组件，
          生成可持续复用的排版模板。
        </p>

        <div className="extract-bar">
          <div className="url-field">
            <span className="link-glyph">↗</span>
            <div>
              <label htmlFor="source-url">{sourceLabel}</label>
              <input
                id="source-url"
                aria-label="公众号文章链接"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !isExtracting) void extractStyle();
                }}
                placeholder="粘贴 https://mp.weixin.qq.com/..."
                spellCheck={false}
              />
            </div>
          </div>
          <button className="primary-button" onClick={extractStyle} disabled={isExtracting}>
            <span>{isExtracting ? '正在提取…' : '一键提取格式'}</span>
            <ArrowIcon />
          </button>
        </div>

        <div className={`process-note ${hasExtracted ? 'is-done' : ''} ${hasError ? 'is-error' : ''}`} role="status">
          <span className="process-icon">{hasExtracted ? <CheckIcon /> : hasError ? '!' : '···'}</span>
          {notice}
        </div>
      </section>

      <section className="workspace" aria-label="风格提取结果">
        <aside className="style-panel">
          <div className="panel-heading">
            <div>
              <span className="section-index">02</span>
              <p>视觉模板</p>
            </div>
            <span className="saved-pill"><CheckIcon /> 已提取</span>
          </div>

          <div className="template-name">
            <span>提取自「{result.author}」</span>
            <h2>{result.templateName}</h2>
            <p>{result.description}</p>
          </div>

          <div className="token-grid">
            {result.tokens.map((token) => (
              <div className="token" key={token.label}>
                <span className="token-label">{token.label}</span>
                <span className="token-value">
                  {token.swatch && <i style={{ background: token.swatch }} />}
                  {token.value}
                </span>
              </div>
            ))}
          </div>

          <div className="component-list">
            <p className="list-label">识别到的组件</p>
            {result.components.map((component, index) => (
              <div className="component-row" key={`${component.label}-${index}`}>
                <span>{component.label}</span>
                <span>{component.detail}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className="preview-panel">
          <div className="preview-toolbar">
            <div>
              <span className="section-index">03</span>
              <p>公众号预览</p>
            </div>
            <div className="toolbar-actions">
              <span className="compatibility"><CheckIcon /> 微信兼容</span>
              <button className="copy-button" onClick={copyToWechat}>
                复制到公众号
                <ArrowIcon />
              </button>
            </div>
          </div>

          <div className="phone-stage">
            <article className="phone-frame" aria-label="公众号文章排版预览">
              <div className="phone-topbar">
                <span>‹</span>
                <b>公众号文章预览</b>
                <span>•••</span>
              </div>
              <div className="wechat-page">
                <div
                  id="wechat-content"
                  style={{
                    color: result.baseStyle.color,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
                    fontSize: result.baseStyle.fontSize,
                    lineHeight: result.baseStyle.lineHeight,
                    letterSpacing: result.baseStyle.letterSpacing,
                    overflowWrap: 'break-word',
                  }}
                >
                  <h2 style={{ margin: '0 0 12px', color: '#1f1f1f', fontSize: '23px', lineHeight: 1.45, letterSpacing: '-0.2px' }}>
                    {result.title}
                  </h2>
                  <p style={{ margin: '0 0 22px', color: '#999', fontSize: '13px' }}>
                    {result.author}
                  </p>
                  <div dangerouslySetInnerHTML={{ __html: result.html }} />
                </div>
              </div>
            </article>
            <p className="preview-caption">已自动转换为微信支持的内联样式</p>
          </div>
        </section>
      </section>

      <footer>
        <p>样格 · 把好排版变成可复用资产</p>
        <span>任意公开文章 / 公众号视觉提取</span>
      </footer>
    </main>
  );
}
