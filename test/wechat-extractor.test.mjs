import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExtractorError,
  normalizeWechatUrl,
  parseWechatArticle,
} from '../lib/wechat-extractor.ts';

const ARTICLE_HTML = `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="一篇真实的测试文章">
    <meta name="author" content="测试公众号">
    <style>
      .layout-card { display:grid; grid-template-columns:1fr 2fr; gap:12px; box-shadow:0 2px 8px rgba(0,0,0,.12); }
      .layout-card p { text-align:center; }
    </style>
  </head>
  <body>
    <div id="js_content">
      <p style="font-size:16px;line-height:28.8px;color:#3f3f3f;margin-bottom:16px" onclick="alert(1)">
        这是用于测试的正文内容，应该能够被通用解析器识别并完整保留下来。
      </p>
      <section style="padding:12px;background:#f2f2f2;border-left:4px solid rgb(233,79,31);border-radius:8px">
        <strong style="color:#e94f1f">重要提示</strong>
      </section>
      <h2 style="font-size:20px;color:#e94f1f">章节标题</h2>
      <img data-src="https://mmbiz.qpic.cn/test.jpg" style="position:fixed;width:600px">
      <section style="height:180px;background-image:url('//mmbiz.qpic.cn/card-background.jpg');background-size:cover"></section>
      <section class="layout-card"><p>左栏</p><p>右栏</p></section>
      <a href="javascript:alert(1)" style="color:#e94f1f">危险链接</a>
      <script>window.bad = true</script>
    </div>
  </body>
</html>`;

test('parses and sanitizes a typical WeChat article', () => {
  const result = parseWechatArticle(
    ARTICLE_HTML,
    'https://mp.weixin.qq.com/s/example-article',
  );

  assert.equal(result.title, '一篇真实的测试文章');
  assert.equal(result.author, '测试公众号');
  assert.equal(result.baseStyle.fontSize, '16px');
  assert.equal(result.baseStyle.lineHeight, '1.8');
  assert.equal(result.tokens[0].value, '#E94F1F');
  assert.match(result.html, /src="https:\/\/mmbiz\.qpic\.cn\/test\.jpg"/);
  assert.match(result.html, /background-image:url\(&quot;https:\/\/mmbiz\.qpic\.cn\/card-background\.jpg&quot;\)/);
  assert.doesNotMatch(result.html, /onclick|<script|javascript:|position:fixed/);
  assert.match(result.html, /display:grid/);
  assert.match(result.html, /grid-template-columns:1fr 2fr/);
  assert.match(result.html, /box-shadow:0 2px 8px rgba\(0,0,0,.12\)/);
  assert.match(result.html, /text-align:center/);
  assert.ok(result.components.some((component) => component.label === '内容卡片'));
  assert.ok(result.components.some((component) => component.label === '文章图片'));
  assert.match(
    result.components.find((component) => component.label === '文章图片').detail,
    /2 张/,
  );
});

test('only accepts public WeChat article hosts', () => {
  assert.equal(
    normalizeWechatUrl('https://mp.weixin.qq.com/s/abc#fragment').toString(),
    'https://mp.weixin.qq.com/s/abc',
  );
  assert.throws(
    () => normalizeWechatUrl('https://example.com/?next=https://mp.weixin.qq.com/s/abc'),
    (error) => error instanceof ExtractorError && error.code === 'INVALID_URL',
  );
});

test('reports WeChat verification pages clearly', () => {
  assert.throws(
    () => parseWechatArticle('<html><body>环境异常，请完成安全验证</body></html>', 'https://mp.weixin.qq.com/s/abc'),
    (error) => error instanceof ExtractorError && error.code === 'ARTICLE_BLOCKED',
  );
});
