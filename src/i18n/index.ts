export type Lang = 'zh' | 'en';

const zh: Record<string, string> = {
  directoryNotFound: '目录不存在',
  configNotFound: '未找到 playwright.config.ts 配置文件，请确保路径下包含 playwright.config.ts',
  configParseFailed: '配置文件解析失败',
  testDirNotFound: '测试目录不存在',
  configNotFoundDefault: '未找到 playwright.config.ts，使用默认配置',
  configLoadFailed: '配置文件加载失败',
  reporterNotSet: '外部配置未设置 reporter，将使用框架默认 reporter',
  configFileNotFound: '配置文件不存在',
};

const en: Record<string, string> = {
  directoryNotFound: 'Directory not found',
  configNotFound:
    'playwright.config.ts not found. Please ensure the path contains playwright.config.ts',
  configParseFailed: 'Failed to parse config file',
  testDirNotFound: 'Test directory not found',
  configNotFoundDefault: 'playwright.config.ts not found, using default config',
  configLoadFailed: 'Failed to load config file',
  reporterNotSet: 'External config has no reporter set, using framework default reporter',
  configFileNotFound: 'Config file not found',
};

const translations: Record<string, Record<string, string>> = { zh, en };

let currentLang: Lang = 'zh';

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: string, lang?: Lang): string {
  const targetLang = lang || currentLang;
  return translations[targetLang]?.[key] || key;
}

export { zh, en };
