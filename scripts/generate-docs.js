/**
 * 生成文档站同步脚本（readthedocs pre_build 调用）
 *
 * 职责：将最新版本 CHANGELOG（standard-version 在 apps/cli 生成的
 * `apps/cli/CHANGELOG.md`）同步到文档站的 `documentation/changelog.md`。
 *
 * 背景：monorepo 迁移后发布流程在 apps/cli 内运行 standard-version，
 * 最新变更记录在 apps/cli/CHANGELOG.md（根目录 CHANGELOG.md 为迁移前遗留）。
 * readthedocs pre_build 在仓库根执行 `node scripts/generate-docs.js`，
 * 本脚本保证文档站 changelog 与最新发布版本一致。
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const docDir = path.join(repoRoot, 'documentation');

const copyTasks = [
  {
    src: path.join(repoRoot, 'apps', 'cli', 'CHANGELOG.md'),
    dest: path.join(docDir, 'changelog.md'),
    transform: (content) => {
      const lines = content.split('\n');
      const startIdx = lines.findIndex((line) => line.startsWith('## ['));
      const changelogContent =
        startIdx > 0 ? lines.slice(startIdx).join('\n') : content;

      return `# 更新日志

本文件记录了项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

${changelogContent}
`;
    },
  },
];

function copyAndTransform(src, dest, transform) {
  if (!fs.existsSync(src)) {
    console.log(`Source file not found: ${src}`);
    return false;
  }

  let content = fs.readFileSync(src, 'utf-8');

  if (transform) {
    content = transform(content);
  }

  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.writeFileSync(dest, content);
  console.log(`Copied: ${path.relative(repoRoot, src)} -> ${path.relative(repoRoot, dest)}`);
  return true;
}

function main() {
  console.log('Generating documentation...\n');

  let success = 0;
  let total = copyTasks.length;

  for (const task of copyTasks) {
    if (copyAndTransform(task.src, task.dest, task.transform)) {
      success++;
    }
  }

  console.log(`\nDone! ${success}/${total} files processed.`);
}

main();
