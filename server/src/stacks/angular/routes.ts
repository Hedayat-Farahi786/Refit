import path from 'node:path';
import ts from 'typescript';
import type { ScannedPage } from '@refit/shared';
import { slugify } from '@refit/shared';
import type { RepoContext } from '../types.js';
import { readComponentFiles } from './components.js';
import { hasExportModifier, objectProperties, stringValue, TsProject, unwrap } from './ts-project.js';

/** An expression together with the file it was written in. */
interface Located<T extends ts.Node = ts.Expression> {
  node: T;
  file: string;
}

interface ComponentRef {
  file: string;
  className: string | null;
}

interface PageCandidate {
  route: string;
  depth: number;
  title: string | null;
  component: ComponentRef;
  routeFile: string;
  lazy: boolean;
}

export interface RouteExtraction {
  pages: ScannedPage[];
  routeFiles: string[];
  hashRouting: boolean;
  /** Things we could not follow (for example routes built by a function call). */
  warnings: string[];
}

const ROUTER_HINT = /forRoot|forChild|provideRouter|loadChildren|loadComponent|Routes\b/;

/**
 * Finds the app's pages by reading its routing code with the TypeScript parser:
 * RouterModule.forRoot/forChild, provideRouter, Routes arrays (also when imported from other
 * files), nested children, lazy loadChildren/loadComponent with arrow imports, and the old
 * 'path/to.module#Module' string syntax. Redirects and '**' routes are skipped.
 */
export async function extractRoutes(repo: RepoContext, sourceRoot: string): Promise<RouteExtraction> {
  const extractor = new RouteExtractor(repo, await TsProject.create(repo), sourceRoot);
  return extractor.run();
}

class RouteExtractor {
  private readonly candidates = new Map<string, PageCandidate>();
  private readonly routeFiles = new Set<string>();
  private readonly warnings: string[] = [];
  private readonly reachedChildCalls = new Set<ts.Node>();
  private readonly walked = new Set<string>();
  private hashRouting = false;

  constructor(
    private readonly repo: RepoContext,
    private readonly project: TsProject,
    private readonly sourceRoot: string,
  ) {}

  async run(): Promise<RouteExtraction> {
    const rootCalls: Located[] = [];
    const childCalls: Located[] = [];
    const tsFiles = this.repo.files.filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.d.ts') && !/(^|\/)(e2e|cypress|node_modules)\//.test(file),
    );

    for (const file of tsFiles) {
      const text = await this.repo.readText(file);
      if (!text || !ROUTER_HINT.test(text)) continue;
      if (/useHash\s*:\s*true|withHashLocation\s*\(|HashLocationStrategy/.test(text)) this.hashRouting = true;
      const source = await this.project.source(file);
      if (!source) continue;
      visit(source, (node) => {
        if (!ts.isCallExpression(node) || node.arguments.length === 0) return;
        const callee = node.expression.getText(source);
        const first = node.arguments[0]!;
        if (callee === 'RouterModule.forRoot' || callee === 'provideRouter' || callee.endsWith('.provideRouter')) {
          rootCalls.push({ node: first, file });
        } else if (callee === 'RouterModule.forChild') {
          childCalls.push({ node: first, file });
        }
      });
    }

    for (const call of rootCalls) await this.walkRoutes(call, '', 0);
    // forChild routes that no lazy route led to belong to feature modules imported eagerly,
    // so their paths start at the root.
    for (const call of childCalls) {
      if (!this.reachedChildCalls.has(call.node)) await this.walkRoutes(call, '', 0);
    }
    if (rootCalls.length === 0 && childCalls.length === 0) await this.walkExportedRouteArrays(tsFiles);

    const pages = await this.buildPages();
    return { pages, routeFiles: [...this.routeFiles].sort(), hashRouting: this.hashRouting, warnings: this.warnings };
  }

  /** Fallback for apps whose router setup we could not see: any exported `Routes` array. */
  private async walkExportedRouteArrays(files: string[]): Promise<void> {
    for (const file of files) {
      const source = await this.project.source(file);
      if (!source) continue;
      for (const statement of source.statements) {
        if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          const typeName = declaration.type?.getText(source);
          if ((typeName === 'Routes' || typeName === 'Route[]') && declaration.initializer) {
            await this.walkRoutes({ node: declaration.initializer, file }, '', 0);
          }
        }
      }
    }
  }

  private async walkRoutes(routes: Located, parentPath: string, depth: number): Promise<void> {
    if (depth > 12) return;
    const key = `${routes.file}:${routes.node.pos}:${parentPath}`;
    if (this.walked.has(key)) return;
    this.walked.add(key);
    for (const route of await this.resolveRouteObjects(routes, 0)) {
      await this.processRoute(route, parentPath, depth);
    }
  }

  private async resolveRouteObjects(located: Located, hops: number): Promise<Located<ts.ObjectLiteralExpression>[]> {
    if (hops > 8) return [];
    const node = unwrap(located.node);
    if (ts.isArrayLiteralExpression(node)) {
      const out: Located<ts.ObjectLiteralExpression>[] = [];
      for (const element of node.elements) {
        const inner = ts.isSpreadElement(element) ? element.expression : element;
        const resolved = unwrap(inner);
        if (ts.isObjectLiteralExpression(resolved)) out.push({ node: resolved, file: located.file });
        else out.push(...(await this.resolveRouteObjects({ node: inner, file: located.file }, hops + 1)));
      }
      return out;
    }
    if (ts.isObjectLiteralExpression(node)) return [{ node, file: located.file }];
    if (ts.isIdentifier(node)) {
      const value = await this.resolveIdentifierValue(node.text, located.file, 0);
      return value ? this.resolveRouteObjects(value, hops + 1) : [];
    }
    if (ts.isCallExpression(node)) {
      this.warnings.push(`Routes in ${located.file} are built by a function call (${node.expression.getText()}); add those pages by hand if they are missing.`);
    }
    return [];
  }

  /** Finds the value an identifier refers to: a local const or an imported export. */
  private async resolveIdentifierValue(name: string, file: string, hops: number): Promise<Located | null> {
    if (hops > 6) return null;
    const source = await this.project.source(file);
    if (!source) return null;
    for (const statement of source.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer) {
            return { node: declaration.initializer, file };
          }
        }
      }
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.importClause) {
        const clause = statement.importClause;
        const target = this.project.resolveImport(file, statement.moduleSpecifier.text);
        if (!target) continue;
        if (clause.name?.text === name) return this.resolveExportValue(target, 'default', hops + 1);
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            if (element.name.text === name) return this.resolveExportValue(target, element.propertyName?.text ?? name, hops + 1);
          }
        }
      }
    }
    return null;
  }

  private async resolveExportValue(file: string, exportName: string, hops: number): Promise<Located | null> {
    if (hops > 6) return null;
    const source = await this.project.source(file);
    if (!source) return null;
    for (const statement of source.statements) {
      if (exportName === 'default' && ts.isExportAssignment(statement)) {
        const expression = unwrap(statement.expression);
        if (ts.isIdentifier(expression)) return this.resolveIdentifierValue(expression.text, file, hops + 1);
        return { node: statement.expression, file };
      }
      if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName && declaration.initializer) {
            return { node: declaration.initializer, file };
          }
        }
      }
      if (ts.isExportDeclaration(statement)) {
        const target =
          statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
            ? this.project.resolveImport(file, statement.moduleSpecifier.text)
            : null;
        const clause = statement.exportClause;
        if (clause && ts.isNamedExports(clause)) {
          for (const element of clause.elements) {
            if (element.name.text !== exportName) continue;
            const original = element.propertyName?.text ?? element.name.text;
            return target ? this.resolveExportValue(target, original, hops + 1) : this.resolveIdentifierValue(original, file, hops + 1);
          }
        } else if (!clause && target) {
          const found = await this.resolveExportValue(target, exportName, hops + 1);
          if (found) return found;
        }
      }
    }
    return null;
  }

  private async processRoute(route: Located<ts.ObjectLiteralExpression>, parentPath: string, depth: number): Promise<void> {
    const props = objectProperties(route.node);
    const rawPath = stringValue(props.get('path')) ?? '';
    if (rawPath === '**') return;
    const fullPath = joinRoute(parentPath, rawPath);
    const children = props.get('children');
    const loadChildren = props.get('loadChildren');
    const hasComponent = props.has('component') || props.has('loadComponent');
    if (props.has('redirectTo') && !hasComponent && !children && !loadChildren) return;
    this.routeFiles.add(route.file);

    let component: ComponentRef | null = null;
    let lazy = false;
    const componentExpr = props.get('component');
    if (componentExpr && ts.isIdentifier(unwrap(componentExpr))) {
      component = await this.resolveClass((unwrap(componentExpr) as ts.Identifier).text, route.file, 0);
    }
    const loadComponent = props.get('loadComponent');
    if (!component && loadComponent) {
      const lazyImport = parseLazyImport(loadComponent);
      const target = lazyImport ? this.project.resolveImport(route.file, lazyImport.specifier) : null;
      if (target) {
        component = { file: target, className: lazyImport?.member ?? null };
        lazy = true;
      }
    }
    if (component) {
      this.addCandidate({ route: fullPath, depth, title: routeTitle(props), component, routeFile: route.file, lazy });
    }

    if (children) await this.walkRoutes({ node: children, file: route.file }, fullPath, depth + 1);
    if (loadChildren) await this.followLoadChildren(loadChildren, route.file, fullPath, depth + 1);
  }

  private async followLoadChildren(expression: ts.Expression, file: string, fullPath: string, depth: number): Promise<void> {
    const legacy = stringValue(expression);
    let target: string | null = null;
    let member: string | null = null;
    if (legacy !== null) {
      // Old syntax: 'app/admin/admin.module#AdminModule'
      const [modulePath = '', exportName] = legacy.split('#');
      target =
        this.project.resolveImport(file, modulePath.startsWith('.') ? modulePath : `./${modulePath}`) ??
        this.project.resolveFromFolders(modulePath, [this.sourceRoot, `${this.sourceRoot}/app`, '.']);
      member = exportName ?? null;
    } else {
      const lazyImport = parseLazyImport(expression);
      if (lazyImport) {
        target = this.project.resolveImport(file, lazyImport.specifier);
        member = lazyImport.member;
      }
    }
    if (!target) {
      this.warnings.push(`Could not follow a lazy route in ${file}${legacy ? ` ("${legacy}")` : ''}.`);
      return;
    }
    // An NgModule: its routes are in a RouterModule.forChild call, in the file or in its routing module.
    if (!member || /Module$/.test(member)) {
      const calls = await this.findChildCalls(target);
      if (calls.length > 0) {
        for (const call of calls) {
          this.reachedChildCalls.add(call.node);
          await this.walkRoutes(call, fullPath, depth);
        }
        return;
      }
    }
    // A routes file: `export default [...]` or a named export such as ADMIN_ROUTES.
    const exported = await this.resolveExportValue(target, member ?? 'default', 0);
    if (exported) await this.walkRoutes(exported, fullPath, depth);
    else this.warnings.push(`Could not find the routes exported by ${target}.`);
  }

  /** forChild calls in a module file and the relative files it imports (its routing module). */
  private async findChildCalls(moduleFile: string): Promise<Located[]> {
    const found: Located[] = [];
    const seen = new Set<string>();
    const scan = async (file: string, level: number) => {
      if (seen.has(file) || level > 2) return;
      seen.add(file);
      const source = await this.project.source(file);
      if (!source) return;
      visit(source, (node) => {
        if (ts.isCallExpression(node) && node.expression.getText(source) === 'RouterModule.forChild' && node.arguments[0]) {
          found.push({ node: node.arguments[0], file });
        }
      });
      if (found.length > 0) return;
      for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith('.')) {
          const next = this.project.resolveImport(file, statement.moduleSpecifier.text);
          if (next && /routing|routes/i.test(next)) await scan(next, level + 1);
        }
      }
    };
    await scan(moduleFile, 0);
    return found;
  }

  /** Finds the file that declares a class, following imports and barrel re-exports. */
  private async resolveClass(name: string, file: string, hops: number): Promise<ComponentRef | null> {
    if (hops > 5) return null;
    const source = await this.project.source(file);
    if (!source) return null;
    for (const statement of source.statements) {
      if (ts.isClassDeclaration(statement) && statement.name?.text === name) return { file, className: name };
    }
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const bindings = statement.importClause?.namedBindings;
      const imported =
        bindings && ts.isNamedImports(bindings) ? bindings.elements.find((element) => element.name.text === name) : undefined;
      const isDefault = statement.importClause?.name?.text === name;
      if (!imported && !isDefault) continue;
      const target = this.project.resolveImport(file, statement.moduleSpecifier.text);
      if (!target) return null;
      const original = imported?.propertyName?.text ?? name;
      return (await this.findClassInModule(target, original, hops + 1)) ?? { file: target, className: original };
    }
    return null;
  }

  private async findClassInModule(file: string, name: string, hops: number): Promise<ComponentRef | null> {
    if (hops > 5) return null;
    const source = await this.project.source(file);
    if (!source) return null;
    for (const statement of source.statements) {
      if (ts.isClassDeclaration(statement) && statement.name?.text === name) return { file, className: name };
    }
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const target = this.project.resolveImport(file, statement.moduleSpecifier.text);
      if (!target) continue;
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        const element = clause.elements.find((e) => e.name.text === name);
        if (element) return this.findClassInModule(target, element.propertyName?.text ?? name, hops + 1);
      } else if (!clause) {
        const found = await this.findClassInModule(target, name, hops + 1);
        if (found) return found;
      }
    }
    return null;
  }

  private addCandidate(candidate: PageCandidate): void {
    const existing = this.candidates.get(candidate.route);
    // A layout route and its empty-path child share a URL; the deeper (more specific) one wins.
    if (!existing || candidate.depth > existing.depth) this.candidates.set(candidate.route, candidate);
  }

  private async buildPages(): Promise<ScannedPage[]> {
    const pages: ScannedPage[] = [];
    const usedIds = new Set<string>();
    const sorted = [...this.candidates.values()].sort((a, b) => a.route.localeCompare(b.route));
    for (const candidate of sorted) {
      const files = await readComponentFiles(this.project, candidate.component.file, candidate.component.className);
      const className = files.className ?? candidate.component.className;
      let id = candidate.route === '/' ? 'home' : slugify(candidate.route.replace(/:/g, ''), 'page');
      for (let n = 2; usedIds.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
      usedIds.add(id);
      pages.push({
        id,
        name: candidate.title ?? nameFromClass(className) ?? nameFromRoute(candidate.route),
        route: candidate.route,
        params: routeParams(candidate.route),
        ...(className ? { componentClass: className } : {}),
        componentFile: candidate.component.file,
        ...(files.templateFile ? { templateFile: files.templateFile } : {}),
        styleFiles: files.styleFiles,
        routeFile: candidate.routeFile,
        lazy: candidate.lazy,
      });
    }
    return pages;
  }
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  node.forEachChild((child) => visit(child, callback));
}

/** Reads `() => import('./x').then(m => m.Y)` (or without `.then`) into its specifier and member. */
export function parseLazyImport(expression: ts.Expression): { specifier: string; member: string | null } | null {
  const fn = unwrap(expression);
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return null;
  let body: ts.Node = fn.body;
  if (ts.isBlock(body)) {
    const returned = body.statements.find(ts.isReturnStatement);
    if (!returned?.expression) return null;
    body = returned.expression;
  }
  let member: string | null = null;
  let current = unwrap(body as ts.Expression);
  if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === 'then') {
    const callback = current.arguments[0] ? unwrap(current.arguments[0]) : undefined;
    if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
      const result = ts.isBlock(callback.body) ? callback.body.statements.find(ts.isReturnStatement)?.expression : callback.body;
      const parameter = callback.parameters[0];
      if (result && ts.isPropertyAccessExpression(unwrap(result))) {
        member = (unwrap(result) as ts.PropertyAccessExpression).name.text;
      } else if (result && ts.isIdentifier(unwrap(result)) && parameter && ts.isObjectBindingPattern(parameter.name)) {
        member = (unwrap(result) as ts.Identifier).text;
      }
    }
    current = unwrap(current.expression.expression);
  }
  if (ts.isCallExpression(current) && current.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const specifier = stringValue(current.arguments[0]);
    return specifier ? { specifier, member } : null;
  }
  return null;
}

export function joinRoute(parent: string, child: string): string {
  const joined = `/${[parent, child].join('/')}`.replace(/\/{2,}/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

export function routeParams(route: string): string[] {
  return route
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1).replace(/\?$/, ''));
}

function routeTitle(props: Map<string, ts.Expression>): string | null {
  const title = stringValue(props.get('title'));
  if (title) return title;
  const data = props.get('data');
  if (data && ts.isObjectLiteralExpression(unwrap(data))) {
    const dataProps = objectProperties(unwrap(data) as ts.ObjectLiteralExpression);
    for (const key of ['title', 'pageTitle', 'breadcrumb', 'name', 'label']) {
      const value = stringValue(dataProps.get(key));
      if (value) return value;
    }
  }
  return null;
}

/** "RequestListComponent" -> "Request list". */
export function nameFromClass(className: string | null): string | null {
  if (!className) return null;
  const base = className.replace(/(Component|Page|View|Container|Screen)$/, '');
  if (!base) return null;
  const words = base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/);
  return words.map((word, i) => (i === 0 ? word : word.toLowerCase())).join(' ');
}

function nameFromRoute(route: string): string {
  const segment = route
    .split('/')
    .filter((part) => part && !part.startsWith(':'))
    .pop();
  if (!segment) return 'Home';
  const words = segment.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function routeFileFolder(file: string): string {
  return path.posix.dirname(file);
}
