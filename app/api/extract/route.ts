import { ExtractorError, fetchWechatArticle } from '@/lib/wechat-extractor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== 'string') {
      return Response.json(
        { ok: false, error: { code: 'INVALID_URL', message: '请粘贴公众号文章链接' } },
        { status: 400 },
      );
    }

    const article = await fetchWechatArticle(body.url);
    return Response.json(
      { ok: true, data: article },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof ExtractorError) {
      const status = error.code === 'INVALID_URL' ? 400 : error.code === 'ARTICLE_TOO_LARGE' ? 413 : 422;
      return Response.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status },
      );
    }

    console.error('Unexpected article extraction failure', error);
    return Response.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: '解析时出现意外错误，请稍后重试' } },
      { status: 500 },
    );
  }
}
