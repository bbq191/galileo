/**
 * AI 客户端：Ollama 空响应重试、上下文长度、4xx 不重试
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { DeepseekClient } from '@/lib/ai/deepseek-client';

function ollamaReply(content: string, doneReason = 'stop') {
  return new Response(
    JSON.stringify({ model: 'deepseek-r1:1.5b', done: true, done_reason: doneReason, message: { role: 'assistant', content, thinking: '未分类、未分类' } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function createClient(maxRetries: number, numCtx?: number) {
  return new DeepseekClient({ apiUrl: 'http://localhost:11434', apiKey: 'ollama', model: 'deepseek-r1:1.5b', timeout: 5000, maxRetries, retryDelay: 1, numCtx });
}

describe('DeepseekClient.chat', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('内容为空时重试，下一次返回有效内容', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ollamaReply('', 'length'))
      .mockResolvedValueOnce(ollamaReply('{"type":"select"}'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(createClient(2).chat([{ role: 'user', content: '？' }], { max_tokens: 1500 })).resolves.toBe('{"type":"select"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('重试后仍为空时报错并说明原因，不返回空字符串', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => ollamaReply('', 'length'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(createClient(2).chat([{ role: 'user', content: '？' }], { max_tokens: 1500 }))
      .rejects.toThrow('AI 返回内容为空：输出达到 max_tokens 上限 (1500)');

    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => ollamaReply('  \n', 'stop'));
    await expect(createClient(1).chat([{ role: 'user', content: '？' }])).rejects.toThrow('AI 返回内容为空 (finish_reason: stop)');
  });

  it('配置 numCtx 时作为 Ollama 的 num_ctx 发送，未配置时不发送', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => ollamaReply('ok'));

    await createClient(1, 16384).chat([{ role: 'user', content: 'q' }]);
    await createClient(1).chat([{ role: 'user', content: 'q' }]);

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies[0].options.num_ctx).toBe(16384);
    expect(bodies[1].options).not.toHaveProperty('num_ctx');
  });

  it('4xx（如 Prompt 超过上下文长度）不重试', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response('{"error":"request (4246 tokens) exceeds the available context size (4096 tokens)"}', { status: 400, statusText: 'Bad Request' })
    );
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(createClient(3).chat([{ role: 'user', content: 'q' }])).rejects.toThrow('400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
