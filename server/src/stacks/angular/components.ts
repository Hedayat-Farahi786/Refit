import path from 'node:path';
import ts from 'typescript';
import { objectProperties, stringValue, unwrap, type TsProject } from './ts-project.js';

export interface ComponentFiles {
  className: string | null;
  /** Template file, or the component file itself for inline templates. */
  templateFile: string | null;
  styleFiles: string[];
}

/** Reads the @Component decorator of a class to find its template and style files. */
export async function readComponentFiles(project: TsProject, file: string, className: string | null): Promise<ComponentFiles> {
  const source = await project.source(file);
  const empty: ComponentFiles = { className, templateFile: null, styleFiles: [] };
  if (!source) return empty;

  const classes = source.statements.filter(ts.isClassDeclaration);
  const decorated = classes.filter((declaration) => componentDecorator(declaration) !== null);
  const target =
    (className ? decorated.find((declaration) => declaration.name?.text === className) : undefined) ??
    // A default-exported or only component in the file.
    decorated.find((declaration) =>
      (ts.getModifiers(declaration) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword),
    ) ??
    (decorated.length === 1 ? decorated[0] : undefined);
  if (!target) return empty;

  const metadata = componentDecorator(target);
  const dir = path.posix.dirname(file);
  const resolve = (relative: string) => path.posix.normalize(path.posix.join(dir, relative));
  const result: ComponentFiles = { className: target.name?.text ?? className, templateFile: null, styleFiles: [] };
  if (!metadata) return result;

  const props = objectProperties(metadata);
  const templateUrl = stringValue(props.get('templateUrl'));
  if (templateUrl) result.templateFile = resolve(templateUrl);
  else if (props.has('template')) result.templateFile = file;

  const styleUrl = stringValue(props.get('styleUrl'));
  if (styleUrl) result.styleFiles.push(resolve(styleUrl));
  const styleUrls = props.get('styleUrls');
  if (styleUrls && ts.isArrayLiteralExpression(unwrap(styleUrls))) {
    for (const element of (unwrap(styleUrls) as ts.ArrayLiteralExpression).elements) {
      const value = stringValue(element);
      if (value) result.styleFiles.push(resolve(value));
    }
  }
  return result;
}

function componentDecorator(declaration: ts.ClassDeclaration): ts.ObjectLiteralExpression | null {
  for (const decorator of ts.getDecorators(declaration) ?? []) {
    const call = decorator.expression;
    if (!ts.isCallExpression(call)) continue;
    const name = ts.isIdentifier(call.expression) ? call.expression.text : null;
    if (name !== 'Component') continue;
    const arg = call.arguments[0] ? unwrap(call.arguments[0]) : undefined;
    return arg && ts.isObjectLiteralExpression(arg) ? arg : null;
  }
  return null;
}

/** Counts files that declare an Angular component (any file name style, including Angular 20+'s). */
export function looksLikeComponent(text: string): boolean {
  return /@Component\s*\(/.test(text);
}
