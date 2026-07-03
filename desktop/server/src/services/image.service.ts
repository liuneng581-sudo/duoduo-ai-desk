/**
 * AI Image Generation Service
 *
 * Uses user-configured image providers (OpenAI-compatible).
 * Falls back to env-based DALL-E if no providers configured.
 */

import prisma from '../config/database';
import { env } from '../config/env';
import logger from '../utils/logger';
import { assertSafeFetchUrl, UnsafeUrlError } from '../utils/urlSafety';
import { decryptIfNeeded } from '../utils/crypto';

// Image generation can be slow (DALL-E 10-60s). Cap it so a hung upstream
// doesn't leave the request handler (and the client) stuck indefinitely.
const IMAGE_TIMEOUT_MS = 90000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 20000;

export interface GenerateParams {
  userId: string;
  storeId?: string;
  productId?: string;
  mode: 'text2img' | 'img2img';
  prompt: string;
  sourceImageUrl?: string;
  model?: string;
  size?: string;
  quality?: string;
  n?: number;
}

interface ImageProviderConfig {
  id: string;
  name: string;
  apiBase: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
}

async function loadImageProvider(userId: string): Promise<ImageProviderConfig | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      'SELECT `value` FROM SystemConfig WHERE userId = ? AND `key` = ? LIMIT 1',
      userId, 'ai_providers',
    );
    if (rows.length > 0) {
      const providers = JSON.parse(rows[0].value) || [];
      const img = providers.find((p: any) => p.type === 'image' || p.type === 'both');
      // apiKey is stored encrypted (settings.routes saveProviders) — decrypt it.
      if (img) return { ...img, apiKey: decryptIfNeeded(img.apiKey || '') };
    }
  } catch {}
  return null;
}

function getFallbackImageProvider(): ImageProviderConfig {
  const key = env.OPENAI_API_KEY || '';
  if (!key) throw new Error('未配置图片生成 Provider。请在系统设置中添加或设置 OPENAI_API_KEY 环境变量。');
  return {
    id: 'fallback-dalle', name: 'DALL-E', apiBase: 'https://api.openai.com/v1', apiKey: key,
    models: ['dall-e-3', 'dall-e-2'], defaultModel: 'dall-e-3',
  };
}

async function callImageAPI(provider: ImageProviderConfig, params: {
  prompt: string; model: string; size: string; quality: string; n: number;
}): Promise<string[]> {
  const url = `${provider.apiBase.replace(/\/$/, '')}/images/generations`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error(`Image API error [${provider.name}]`, { status: res.status, body: err.slice(0, 500) });
    // Try to extract the upstream error message so the user sees why (e.g. 余额不足/
    // 模型不存在/key 无效), not just a bare status code.
    let detail = '';
    try { const j = JSON.parse(err); detail = j?.error?.message || j?.message || j?.error || ''; } catch {}
    throw new Error(`图片生成失败(${res.status})${detail ? ': ' + String(detail).slice(0, 120) : ''}`);
  }

  const data = await res.json() as { data: Array<{ url?: string; b64_json?: string }> };
  // Normalize to renderable strings: hosted URL as-is, base64 as a data URI
  // (a bare b64 string is not a valid <img src>).
  return data.data.map((d) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : ''));
}

export const imageService = {
  /**
   * Generate images (text-to-image or image-to-image).
   */
  async generate(params: GenerateParams) {
    const {
      userId, storeId, productId, mode, prompt,
      model, size = '1024x1024', quality = 'standard', n = 1,
    } = params;

    const provider = await loadImageProvider(userId) || getFallbackImageProvider();
    const selectedModel = model || provider.defaultModel;

    let resultUrls: string[];

    if (mode === 'text2img') {
      resultUrls = await callImageAPI(provider, { prompt, model: selectedModel, size, quality, n });
    } else {
      if (!params.sourceImageUrl) throw new Error('图生图模式需要提供原图');
      // 通用图生图:走 OpenAI 兼容的 /images/edits,原图以 multipart 上传。
      // 原图可以是 data: base64(本地上传)或 http(s) URL。size 原样透传(让中转站/
      // 兼容网关自己决定支持哪些尺寸),不再写死 dall-e-2 的方形限制。模型用用户选的。
      try {
        const editUrl = `${provider.apiBase.replace(/\/$/, '')}/images/edits`;
        const formData = new FormData();
        formData.append('prompt', prompt);
        formData.append('model', selectedModel);
        formData.append('n', String(n));
        formData.append('size', size);

        // 取原图字节:data:URI(本地上传)直接解码,否则按 URL 下载(SSRF 防护)。
        let imgBuffer: Buffer;
        if (params.sourceImageUrl.startsWith('data:')) {
          const comma = params.sourceImageUrl.indexOf(',');
          const b64 = comma >= 0 ? params.sourceImageUrl.slice(comma + 1) : '';
          imgBuffer = Buffer.from(b64, 'base64');
          if (imgBuffer.length === 0) throw new Error('上传的图片为空或格式不对');
        } else {
          await assertSafeFetchUrl(params.sourceImageUrl);
          const imgRes = await fetch(params.sourceImageUrl, { signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS) });
          if (!imgRes.ok) throw new Error('无法下载原图');
          imgBuffer = Buffer.from(await imgRes.arrayBuffer());
        }
        formData.append('image', new Blob([imgBuffer]), 'source.png');

        const res = await fetch(editUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${provider.apiKey}` },
          body: formData,
          signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        });
        if (res.ok) {
          const data = await res.json() as { data: Array<{ url?: string; b64_json?: string }> };
          resultUrls = data.data.map((d) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : ''));
        } else {
          const errBody = await res.text();
          logger.error(`Image edits API error [${provider.name}]`, { status: res.status, body: errBody.slice(0, 500) });
          throw new Error(`图生图失败: ${res.status}`);
        }
      } catch (err: any) {
        // SSRF rejection is a hard error — surface it, don't fall back.
        if (err instanceof UnsafeUrlError) throw err;
        // Edits endpoint unavailable (e.g. provider doesn't implement it): fall back
        // to text2img so the user still gets an image. Source NOT used in fallback.
        logger.warn(`Image edits unavailable (${err?.message || err}), falling back to text-to-image (source image NOT used)`);
        resultUrls = await callImageAPI(provider, { prompt, model: selectedModel, size, quality, n });
      }
    }

    const generated = resultUrls.filter((u) => u && u.length > 0);
    const failed = generated.length === 0;
    if (failed) {
      logger.error(`Image generation returned no usable URLs: mode=${mode} provider=${provider.name}`);
    }

    // Persist to DB
    const record = await prisma.imageGeneration.create({
      data: {
        userId,
        storeId: storeId || null,
        productId: productId || null,
        mode,
        prompt,
        sourceImageUrl: params.sourceImageUrl || null,
        resultUrls: JSON.stringify(generated),
        provider: provider.name,
        modelVersion: selectedModel,
        parameters: JSON.stringify({ size, quality, n }),
        status: failed ? 'failed' : 'completed',
        error: failed ? '图片服务未返回有效图片' : null,
      },
    });

    if (failed) {
      throw new Error('图片生成失败：服务未返回有效图片');
    }

    logger.info(`Image generated: ${record.id} mode=${mode} provider=${provider.name} urls=${generated.length}`);
    return { id: record.id, urls: generated, mode, provider: provider.name, modelVersion: selectedModel };
  },

  /**
   * Get generation history for a user.
   */
  async getHistory(userId: string, page = 1, pageSize = 20) {
    const [records, total] = await Promise.all([
      prisma.imageGeneration.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          mode: true,
          prompt: true,
          sourceImageUrl: true,
          resultUrls: true,
          provider: true,
          modelVersion: true,
          status: true,
          error: true,
          storeId: true,
          productId: true,
          createdAt: true,
        },
      }),
      prisma.imageGeneration.count({ where: { userId } }),
    ]);

    return {
      data: records.map((r) => ({
        ...r,
        resultUrls: r.resultUrls ? JSON.parse(r.resultUrls) : [],
      })),
      total,
      page,
      pageSize,
    };
  },

  /**
   * Delete a generation record.
   */
  async delete(userId: string, id: string): Promise<boolean> {
    const record = await prisma.imageGeneration.findUnique({ where: { id } });
    if (!record || record.userId !== userId) return false;
    await prisma.imageGeneration.delete({ where: { id } });
    return true;
  },
};
