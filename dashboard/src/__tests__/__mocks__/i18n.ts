export const t = vi.fn((key: string, _lang?: string) => key);
export const formatTemplate = vi.fn((template: string, params: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
);
export type Lang = 'zh' | 'en';
