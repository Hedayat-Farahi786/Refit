import type { PageReport, ReviewResult } from '@refit/shared';
import { stripJsonComments } from '../util/json.js';

const JSON_BLOCK = /```(?:json|JSON)\s*\n([\s\S]*?)```/g;

interface Extracted {
  /** Text before the last JSON block (the human summary). */
  summary: string;
  json: unknown | null;
}

/** Finds the last ```json block in an agent's answer and parses it leniently. */
export function extractLastJson(text: string): Extracted {
  const blocks = [...text.matchAll(JSON_BLOCK)];
  const last = blocks.at(-1);
  if (!last || last.index === undefined) return { summary: text.trim(), json: null };
  const summary = text.slice(0, last.index).trim();
  try {
    return { summary, json: JSON.parse(stripJsonComments(last[1] ?? '')) };
  } catch {
    return { summary: text.trim(), json: null };
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()) : [];
}

/** Reads a page report (appendix A, section 4). Unparseable answers keep their text, marked unstructured. */
export function parsePageReport(text: string): PageReport {
  const { summary, json } = extractLastJson(text);
  if (!json || typeof json !== 'object') {
    return { status: 'partial', summary: summary || 'The agent did not write a report.', inventory: [], changes: [], componentsUsed: [], concerns: [], structured: false };
  }
  const data = json as Record<string, unknown>;
  return {
    status: data['status'] === 'partial' ? 'partial' : 'done',
    summary,
    inventory: strings(data['inventory']),
    changes: strings(data['changes']),
    componentsUsed: strings(data['componentsUsed']),
    concerns: strings(data['concerns']),
    structured: true,
  };
}

type ReviewBody = Omit<ReviewResult, 'runId' | 'createdAt' | 'provider' | 'costUsd'>;

/** Reads the agent review JSON (section 3.3 of the spec). */
export function parseReview(text: string): ReviewBody {
  const { summary, json } = extractLastJson(text);
  if (!json || typeof json !== 'object') {
    return { structured: false, summary: summary || text.trim(), uiStack: [], layout: '', sharedComponents: [], risks: [], pages: [], recommendations: [] };
  }
  const data = json as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : []);
  const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return {
    structured: true,
    summary: str(data['summary']) || summary,
    uiStack: strings(data['uiStack']),
    layout: str(data['layout']),
    sharedComponents: list(data['sharedComponents']).map((item) => ({ name: str(item['name']), files: strings(item['files']), why: str(item['why']) })),
    risks: list(data['risks']).map((item) => ({ title: str(item['title']), files: strings(item['files']), detail: str(item['detail']) })),
    pages: list(data['pages']).map((item) => {
      const complexity = str(item['complexity']).toLowerCase();
      const notes = str(item['notes']);
      return {
        route: str(item['route']),
        purpose: str(item['purpose']),
        complexity: complexity === 'high' || complexity === 'low' ? complexity : 'medium',
        ...(notes ? { notes } : {}),
      } as ReviewBody['pages'][number];
    }),
    recommendations: strings(data['recommendations']),
  };
}
