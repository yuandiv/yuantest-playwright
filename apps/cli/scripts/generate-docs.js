const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const docDir = path.join(rootDir, 'documentation');

const copyTasks = [
  {
    src: path.join(rootDir, 'CHANGELOG.md'),
    dest: path.join(docDir, 'changelog.md'),
    transform: (content) => {
      const lines = content.split('\n');
      const startIdx = lines.findIndex(line => line.startsWith('## ['));
      const changelogContent = startIdx > 0 
        ? lines.slice(startIdx).join('\n')
        : content;
      
      return `# 更新日志

本文件记录了项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

${changelogContent}
`;
    }
  }
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
  console.log(`Copied: ${path.relative(rootDir, src)} -> ${path.relative(rootDir, dest)}`);
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
