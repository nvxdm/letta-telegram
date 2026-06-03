import { Injectable } from '@nestjs/common';
import { marked, Tokens } from 'marked';

export type ParsedPart =
  | { kind: 'text'; html: string }
  | { kind: 'photo'; url: string; caption?: string }
  | { kind: 'document'; url: string; filename?: string };

export interface ParsedOutput {
  parts: ParsedPart[];
}

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i;
const DOCUMENT_EXT =
  /\.(pdf|zip|docx?|xlsx?|pptx?|csv|txt|json|xml|tar|gz|7z|rar|md|html?|mp3|m4a|wav|ogg|mp4|mov|avi)(\?.*)?$/i;
const MAX_TEXT_LEN = 4096;

@Injectable()
export class AgentOutputParserService {
  parse(input: string): ParsedOutput {
    if (!input || input.trim().length === 0) return { parts: [] };

    const tokens = marked.lexer(input);
    const ctx: RenderContext = { attachments: [] };
    const rendered = this.renderTokens(tokens, ctx).trim();

    const parts: ParsedPart[] = [];

    if (rendered.length > 0) {
      for (const chunk of this.chunkHtml(rendered)) {
        parts.push({ kind: 'text', html: chunk });
      }
    }

    parts.push(...ctx.attachments);

    return { parts };
  }

  private renderTokens(tokens: Tokens.Generic[], ctx: RenderContext): string {
    return tokens.map((t) => this.renderToken(t, ctx)).join('');
  }

  private renderToken(token: Tokens.Generic, ctx: RenderContext): string {
    switch (token.type) {
      case 'space':
        return '\n';
      case 'heading': {
        const t = token as Tokens.Heading;
        const inner = this.renderInline(t.tokens ?? [], ctx);
        // Skip empty tags (e.g. a heading that is only an image) — Telegram
        // rejects messages containing empty entities like <b></b>.
        return inner.length > 0 ? `<b>${inner}</b>\n\n` : '';
      }
      case 'paragraph': {
        const t = token as Tokens.Paragraph;
        const inner = this.renderInline(t.tokens ?? [], ctx);
        return inner.length > 0 ? `${inner}\n\n` : '';
      }
      case 'list':
        return this.renderList(token as Tokens.List, ctx);
      case 'blockquote': {
        const t = token as Tokens.Blockquote;
        const inner = this.renderTokens(t.tokens ?? [], ctx).trim();
        return inner.length > 0 ? `<blockquote>${inner}</blockquote>\n\n` : '';
      }
      case 'code': {
        const t = token as Tokens.Code;
        const lang = (t.lang ?? '').trim();
        const langAttr = lang.length > 0 ? ` class="language-${escapeAttr(lang)}"` : '';
        return `<pre><code${langAttr}>${escapeHtml(t.text)}</code></pre>\n\n`;
      }
      case 'table':
        return this.renderTable(token as Tokens.Table, ctx);
      case 'hr':
        return '\n──────────\n\n';
      case 'html': {
        const t = token as Tokens.HTML;
        return escapeHtml(t.text);
      }
      case 'text': {
        const t = token as Tokens.Text & { tokens?: Tokens.Generic[] };
        if (t.tokens && t.tokens.length > 0) {
          return this.renderInline(t.tokens, ctx);
        }
        return t.text ?? '';
      }
      default:
        return '';
    }
  }

  private renderInline(tokens: Tokens.Generic[], ctx: RenderContext): string {
    return tokens.map((t) => this.renderInlineToken(t, ctx)).join('');
  }

  private renderInlineToken(token: Tokens.Generic, ctx: RenderContext): string {
    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text & { tokens?: Tokens.Generic[] };
        if (t.tokens && t.tokens.length > 0) return this.renderInline(t.tokens, ctx);
        return t.text ?? '';
      }
      case 'escape': {
        const t = token as Tokens.Escape;
        return t.text;
      }
      case 'strong': {
        const t = token as Tokens.Strong;
        const inner = this.renderInline(t.tokens ?? [], ctx);
        return inner.length > 0 ? `<b>${inner}</b>` : '';
      }
      case 'em': {
        const t = token as Tokens.Em;
        const inner = this.renderInline(t.tokens ?? [], ctx);
        return inner.length > 0 ? `<i>${inner}</i>` : '';
      }
      case 'del': {
        const t = token as Tokens.Del;
        const inner = this.renderInline(t.tokens ?? [], ctx);
        return inner.length > 0 ? `<s>${inner}</s>` : '';
      }
      case 'codespan': {
        const t = token as Tokens.Codespan;
        return `<code>${t.text}</code>`;
      }
      case 'br':
        return '\n';
      case 'link': {
        const t = token as Tokens.Link;
        const url = (t.href ?? '').trim();
        const label = this.renderInline(t.tokens ?? [], ctx) || (t.text ?? url);
        if (IMAGE_EXT.test(url)) {
          ctx.attachments.push({ kind: 'photo', url, caption: stripTags(label) || undefined });
          return '';
        }
        if (DOCUMENT_EXT.test(url)) {
          ctx.attachments.push({ kind: 'document', url, filename: stripTags(label) || undefined });
          return '';
        }
        if (!url) return label;
        return `<a href="${escapeAttr(url)}">${label}</a>`;
      }
      case 'image': {
        const t = token as Tokens.Image;
        const url = (t.href ?? '').trim();
        if (url) {
          ctx.attachments.push({
            kind: 'photo',
            url,
            caption: stripTags(t.text ?? '').trim() || undefined,
          });
        }
        return '';
      }
      case 'html': {
        const t = token as Tokens.HTML & { text?: string };
        return escapeHtml(t.text ?? '');
      }
      default:
        return '';
    }
  }

  private renderList(token: Tokens.List, ctx: RenderContext): string {
    const ordered = token.ordered;
    const start = typeof token.start === 'number' ? token.start : 1;
    const lines: string[] = [];

    token.items.forEach((item, i) => {
      const bullet = ordered ? `${start + i}.` : '•';
      const body = this.renderListItem(item, ctx).trim();
      const indented = body.split('\n').map((l, idx) => (idx === 0 ? l : `   ${l}`)).join('\n');
      const prefix = item.task ? (item.checked ? '☑ ' : '☐ ') : '';
      lines.push(`${bullet} ${prefix}${indented}`);
    });

    return `${lines.join('\n')}\n\n`;
  }

  private renderListItem(item: Tokens.ListItem, ctx: RenderContext): string {
    const tokens = item.tokens ?? [];
    return tokens
      .map((t) => {
        if (t.type === 'text') {
          const tt = t as Tokens.Text & { tokens?: Tokens.Generic[] };
          if (tt.tokens && tt.tokens.length > 0) return this.renderInline(tt.tokens, ctx);
          return tt.text ?? '';
        }
        if (t.type === 'paragraph') {
          return this.renderInline((t as Tokens.Paragraph).tokens ?? [], ctx);
        }
        if (t.type === 'list') {
          const nested = this.renderList(t as Tokens.List, ctx);
          return `\n${nested.trimEnd()}`;
        }
        return this.renderToken(t, ctx);
      })
      .join('');
  }

  private renderTable(token: Tokens.Table, ctx: RenderContext): string {
    const headerCells = token.header.map((cell) =>
      stripTags(this.renderInline(cell.tokens ?? [], ctx)),
    );
    const rows = token.rows.map((row) =>
      row.map((cell) => stripTags(this.renderInline(cell.tokens ?? [], ctx))),
    );

    const widths = headerCells.map((h, colIdx) => {
      const colMax = rows.reduce((m, row) => Math.max(m, (row[colIdx] ?? '').length), h.length);
      return Math.min(colMax, 40);
    });

    const fmtRow = (cells: string[]): string =>
      '| ' + cells.map((c, i) => padOrTruncate(c, widths[i] ?? c.length)).join(' | ') + ' |';

    const sep = '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|';

    const lines: string[] = [fmtRow(headerCells), sep, ...rows.map(fmtRow)];
    return `<pre>${escapeHtml(lines.join('\n'))}</pre>\n\n`;
  }

  private chunkHtml(html: string): string[] {
    if (html.length <= MAX_TEXT_LEN) return [html];

    const chunks: string[] = [];
    let remaining = html;
    while (remaining.length > MAX_TEXT_LEN) {
      const window = remaining.slice(0, MAX_TEXT_LEN);
      // Math.max(1, …) guarantees forward progress (no infinite loop); empty
      // pieces are dropped so we never send Telegram an empty message.
      const cut = Math.max(1, this.findSafeCut(window));
      const piece = remaining.slice(0, cut).trim();
      if (piece.length > 0) chunks.push(piece);
      remaining = remaining.slice(cut).trim();
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
  }

  private findSafeCut(window: string): number {
    const candidates = [
      window.lastIndexOf('\n\n'),
      window.lastIndexOf('\n'),
      window.lastIndexOf('. '),
      window.lastIndexOf(' '),
    ];
    for (const c of candidates) {
      if (c > MAX_TEXT_LEN * 0.5 && !splitsTagOrEntity(window, c)) return c;
    }
    // Back off from the hard limit to the last offset that doesn't bisect an
    // HTML tag or entity (which would make Telegram reject the chunk).
    for (let i = Math.min(window.length, MAX_TEXT_LEN); i > 0; i--) {
      if (!splitsTagOrEntity(window, i)) return i;
    }
    return MAX_TEXT_LEN;
  }
}

interface RenderContext {
  attachments: ParsedPart[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

export function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * True if cutting `s` at offset `i` would land inside an HTML tag (`<…>`) or an
 * entity (`&…;`), which would yield malformed markup Telegram refuses to render.
 */
function splitsTagOrEntity(s: string, i: number): boolean {
  if (s.lastIndexOf('<', i - 1) > s.lastIndexOf('>', i - 1)) return true;
  const amp = s.lastIndexOf('&', i - 1);
  if (amp !== -1 && i - amp <= 12) {
    const semi = s.indexOf(';', amp);
    if (semi === -1 || semi >= i) return true;
  }
  return false;
}

function padOrTruncate(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}
