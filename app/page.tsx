'use client';

import { useState } from 'react';
import type { ExtractedArticle } from '@/lib/wechat-extractor';

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
  const [url, setUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [notice, setNotice] = useState('支持公开的公众号文章链接');
  const [result, setResult] = useState<ExtractedArticle | null>(null);
  const [hasError, setHasError] = useState(false);
  const [copyNotice, setCopyNotice] = useState('');

  const extractStyle = async () => {
    setIsExtracting(true);
    setResult(null);
    setCopyNotice('');
    setHasError(false);
    setNotice('正在读取文章并提取样式，请稍候…');

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
      setNotice('提取完成。查看样式，或复制文章排版。');
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
        if (!document.execCommand('copy')) throw new Error('Copy failed');
        selection?.removeAllRanges();
      }
      setCopyNotice('排版已复制，请到公众号编辑器中粘贴。');
    } catch {
      setCopyNotice('复制未成功，请选中预览中的正文手动复制。');
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
        <span className="header-note">公众号排版工具</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">从一篇文章开始</div>
        <h1>提取公众号文章的<span>排版</span></h1>
        <p className="hero-copy">
          看配色、字号与间距，留住值得参考的排版。
        </p>

        <form className="extract-form" onSubmit={(event) => {
          event.preventDefault();
          if (!isExtracting) void extractStyle();
        }}>
          <label htmlFor="source-url">文章链接</label>
          <div className="extract-bar">
            <div className="url-field">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m8 12 4-4M7 6l1.5-1.5a4 4 0 0 1 5.7 5.7L13 11M7 9l-1.2 1.2a4 4 0 0 0 5.7 5.7L13 14" />
              </svg>
              <input
                id="source-url"
                name="url"
                type="url"
                required
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="粘贴 https://mp.weixin.qq.com/..."
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                aria-describedby="extract-status"
              />
            </div>
            <button className="primary-button" type="submit" disabled={isExtracting}>
              <span>{isExtracting ? '正在提取…' : '提取排版'}</span>
              <ArrowIcon />
            </button>
          </div>
        </form>

        <div className={`process-note ${result && !hasError ? 'is-done' : ''} ${hasError ? 'is-error' : ''}`} id="extract-status" role="status">
          <span className="process-icon" aria-hidden="true">{hasError ? '!' : result ? <CheckIcon /> : isExtracting ? '…' : 'i'}</span>
          {notice}
        </div>
      </section>

      {result && <section className="workspace" aria-label="排版提取结果">
        <aside className="style-panel">
          <div className="panel-heading">
            <div>
              <span className="section-index">01</span>
              <h2>样式概览</h2>
            </div>
          </div>

          <div className="template-name">
            <span>{result.author}</span>
            <p className="source-title">{result.title}</p>
            <p>仅展示识别到的样式，供排版时参考。</p>
          </div>

          {result.tokens.length > 0 ? <div className="token-grid">
            {result.tokens.map((token) => (
              <div className="token" key={token.label}>
                <span className="token-label">{token.label}</span>
                <span className="token-value">
                  {token.swatch && <i style={{ background: token.swatch }} />}
                  {token.value}
                </span>
              </div>
            ))}
          </div> : <p className="empty-tokens">未识别到明确的样式参数，仍可查看文章预览。</p>}

          <div className="component-list">
            <h3 className="list-label">内容元素</h3>
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
              <span className="section-index">02</span>
              <h2>排版预览</h2>
            </div>
            <div className="toolbar-actions">
              <button className="copy-button" onClick={copyToWechat}>
                复制排版
                <ArrowIcon />
              </button>
            </div>
          </div>

          <div className="phone-stage">
            <article className="phone-frame" aria-label="公众号文章排版预览">
              <div className="wechat-page" tabIndex={0} role="region" aria-label="文章正文，可滚动查看全文">
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
                  <p style={{ margin: '0 0 22px', color: '#706b64', fontSize: '14px' }}>
                    {result.author}
                  </p>
                  <div dangerouslySetInnerHTML={{ __html: result.html }} />
                </div>
              </div>
            </article>
            <p className="copy-feedback" role="status">{copyNotice}</p>
            <p className="preview-caption">上下滚动查看全文。粘贴到公众号编辑器后，请检查排版。</p>
          </div>
        </section>
      </section>}

      <footer>
        <p>样格 · 好排版的参考起点</p>
        <span>借鉴排版，表达自己的内容</span>
      </footer>
    </main>
  );
}
