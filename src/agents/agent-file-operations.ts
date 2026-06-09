import * as fs from 'fs';
import * as path from 'path';
import { PatchApplier } from './patch-applier';

/**
 * 统一的文件操作抽象，封装路径解析、安全检查和文件读写逻辑。
 * 从 AgentService 中提取，消除分散在各方法中的 fs 调用。
 */
export class AgentFileOperations {
  constructor(private projectRoot: string) {}

  /** 更新项目根目录（如 setProjectRoot 时调用） */
  setProjectRoot(root: string): void {
    this.projectRoot = root;
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }

  /** 将相对路径解析为基于 projectRoot 的绝对路径；若已是绝对路径则直接返回 */
  resolveProjectPath(relativeOrAbsolute: string): string {
    return path.isAbsolute(relativeOrAbsolute)
      ? relativeOrAbsolute
      : path.resolve(this.projectRoot, relativeOrAbsolute);
  }

  /** 检查解析后的路径是否在项目根目录内（安全写校验） */
  isWithinProjectRoot(resolvedPath: string): boolean {
    return PatchApplier.isWithinProjectRoot(resolvedPath, this.projectRoot);
  }

  /** 判断文件是否存在 */
  exists(filePath: string): boolean {
    return fs.existsSync(this.resolveProjectPath(filePath));
  }

  /** 读取文件内容，路径自动解析 */
  readFile(filePath: string): string {
    const resolvedPath = this.resolveProjectPath(filePath);
    return fs.readFileSync(resolvedPath, 'utf-8');
  }

  /** 写入文件，自动创建父目录 */
  writeFile(filePath: string, content: string): void {
    const resolvedPath = this.resolveProjectPath(filePath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolvedPath, content, 'utf-8');
  }

  /** 确保目录存在，不存在则递归创建 */
  ensureDirectory(dirPath: string): void {
    const resolvedPath = this.resolveProjectPath(dirPath);
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
  }

  /** 列出目录下的文件名，可选正则过滤 */
  listFiles(dirPath: string, pattern?: RegExp): string[] {
    const resolvedPath = this.resolveProjectPath(dirPath);
    if (!fs.existsSync(resolvedPath)) {
      return [];
    }
    const entries = fs.readdirSync(resolvedPath);
    return entries.filter((entry) => !pattern || pattern.test(entry));
  }
}
