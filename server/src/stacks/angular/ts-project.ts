import path from 'node:path';
import ts from 'typescript';
import type { RepoContext } from '../types.js';

interface PathAlias {
  prefix: string;
  suffix: string;
  hasWildcard: boolean;
  targets: string[];
}

interface TsConfigJson {
  extends?: string;
  compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
}

/**
 * Parses TypeScript files of a repo on demand and resolves imports between them, including
 * tsconfig `paths` aliases such as `@app/*`. Paths are repo-relative with forward slashes.
 */
export class TsProject {
  private readonly sources = new Map<string, Promise<ts.SourceFile | null>>();
  private aliases: PathAlias[] = [];

  private constructor(private readonly repo: RepoContext) {}

  static async create(repo: RepoContext): Promise<TsProject> {
    const project = new TsProject(repo);
    project.aliases = await readAliases(repo);
    return project;
  }

  source(file: string): Promise<ts.SourceFile | null> {
    let cached = this.sources.get(file);
    if (!cached) {
      cached = this.repo.readText(file).then((text) =>
        text === null ? null : ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
      );
      this.sources.set(file, cached);
    }
    return cached;
  }

  /** Resolves an import specifier used in `fromFile` to a repo file, or null for packages and misses. */
  resolveImport(fromFile: string, specifier: string): string | null {
    const candidates: string[] = [];
    if (specifier.startsWith('.')) {
      candidates.push(path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier)));
    } else if (specifier.startsWith('/')) {
      candidates.push(specifier.slice(1));
    } else {
      for (const alias of this.aliases) {
        if (alias.hasWildcard) {
          if (specifier.startsWith(alias.prefix) && specifier.endsWith(alias.suffix)) {
            const middle = specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length);
            for (const target of alias.targets) candidates.push(target.replace('*', middle));
          }
        } else if (specifier === alias.prefix) {
          candidates.push(...alias.targets);
        }
      }
    }
    for (const candidate of candidates) {
      const found = this.findFile(candidate);
      if (found) return found;
    }
    return null;
  }

  /** Resolves a module path written relative to a folder (old `loadChildren: 'path#Module'` strings). */
  resolveFromFolders(specifier: string, folders: string[]): string | null {
    for (const folder of folders) {
      const found = this.findFile(path.posix.normalize(path.posix.join(folder, specifier)));
      if (found) return found;
    }
    return null;
  }

  private findFile(base: string): string | null {
    const clean = base.replace(/^\.\//, '');
    const options = [clean, `${clean}.ts`, `${clean}/index.ts`];
    if (clean.endsWith('.js')) options.unshift(`${clean.slice(0, -3)}.ts`);
    for (const option of options) {
      if (option.endsWith('.ts') && this.repo.hasFile(option)) return exactCase(this.repo, option);
    }
    return null;
  }
}

function exactCase(repo: RepoContext, file: string): string {
  const lower = file.toLowerCase();
  return repo.files.find((candidate) => candidate.toLowerCase() === lower) ?? file;
}

async function readAliases(repo: RepoContext): Promise<PathAlias[]> {
  const aliases: PathAlias[] = [];
  for (const file of ['tsconfig.json', 'tsconfig.base.json', 'tsconfig.app.json']) {
    let config = await repo.readJson<TsConfigJson>(file);
    let configDir = path.posix.dirname(file);
    // Follow one level of "extends" for settings defined in a base config.
    if (config && !config.compilerOptions?.paths && config.extends?.startsWith('.')) {
      const parentFile = path.posix.normalize(path.posix.join(configDir, config.extends));
      const parent = await repo.readJson<TsConfigJson>(parentFile.endsWith('.json') ? parentFile : `${parentFile}.json`);
      if (parent) {
        config = parent;
        configDir = path.posix.dirname(parentFile);
      }
    }
    const paths = config?.compilerOptions?.paths;
    if (!paths) continue;
    const baseUrl = path.posix.normalize(path.posix.join(configDir, config?.compilerOptions?.baseUrl ?? '.'));
    for (const [pattern, targets] of Object.entries(paths)) {
      const star = pattern.indexOf('*');
      aliases.push({
        prefix: star === -1 ? pattern : pattern.slice(0, star),
        suffix: star === -1 ? '' : pattern.slice(star + 1),
        hasWildcard: star !== -1,
        targets: targets.map((target) => path.posix.normalize(path.posix.join(baseUrl, target)).replace(/^\.\//, '')),
      });
    }
    if (aliases.length > 0) break;
  }
  return aliases;
}

/** Removes `as`, `satisfies`, parentheses and `!` around an expression. */
export function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

export function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  return null;
}

export function stringValue(expression: ts.Expression | undefined): string | null {
  if (!expression) return null;
  const inner = unwrap(expression);
  if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) return inner.text;
  return null;
}

/** Map of property name to initializer for an object literal (shorthand properties included). */
export function objectProperties(object: ts.ObjectLiteralExpression): Map<string, ts.Expression> {
  const props = new Map<string, ts.Expression>();
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property)) {
      const name = propertyName(property.name);
      if (name) props.set(name, property.initializer);
    } else if (ts.isShorthandPropertyAssignment(property)) {
      props.set(property.name.text, property.name);
    }
  }
  return props;
}

export function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}
