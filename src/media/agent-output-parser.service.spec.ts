import { AgentOutputParserService, ParsedPart } from './agent-output-parser.service';

describe('AgentOutputParserService', () => {
  const parser = new AgentOutputParserService();

  const textParts = (parts: ParsedPart[]): string[] =>
    parts.filter((p): p is Extract<ParsedPart, { kind: 'text' }> => p.kind === 'text').map((p) => p.html);

  const photoParts = (parts: ParsedPart[]) =>
    parts.filter((p): p is Extract<ParsedPart, { kind: 'photo' }> => p.kind === 'photo');

  const documentParts = (parts: ParsedPart[]) =>
    parts.filter((p): p is Extract<ParsedPart, { kind: 'document' }> => p.kind === 'document');

  it('returns no parts for empty/whitespace input', () => {
    expect(parser.parse('').parts).toEqual([]);
    expect(parser.parse('   \n  ').parts).toEqual([]);
  });

  it('converts headings to bold', () => {
    const { parts } = parser.parse('# Hello\n\n## World');
    const html = textParts(parts).join('\n');
    expect(html).toContain('<b>Hello</b>');
    expect(html).toContain('<b>World</b>');
  });

  it('renders bold and italic with Telegram HTML tags', () => {
    const { parts } = parser.parse('**bold** and _italic_ and ~~strike~~');
    const html = textParts(parts)[0];
    expect(html).toContain('<b>bold</b>');
    expect(html).toContain('<i>italic</i>');
    expect(html).toContain('<s>strike</s>');
  });

  it('renders inline code and fenced code blocks', () => {
    const { parts } = parser.parse('Run `npm test` to start.\n\n```js\nconst x = 1;\n```');
    const html = textParts(parts).join('\n');
    expect(html).toContain('<code>npm test</code>');
    expect(html).toContain('<pre><code class="language-js">const x = 1;');
  });

  it('renders unordered lists with bullets', () => {
    const { parts } = parser.parse('- apple\n- banana\n- cherry');
    const html = textParts(parts)[0];
    expect(html).toContain('• apple');
    expect(html).toContain('• banana');
    expect(html).toContain('• cherry');
  });

  it('renders ordered lists with numbers', () => {
    const { parts } = parser.parse('1. first\n2. second\n3. third');
    const html = textParts(parts)[0];
    expect(html).toMatch(/1\. first/);
    expect(html).toMatch(/2\. second/);
    expect(html).toMatch(/3\. third/);
  });

  it('renders tables inside <pre> with aligned columns', () => {
    const md = '| Col A | Col B |\n|-------|-------|\n| 1     | 22    |\n| xxx   | y     |';
    const { parts } = parser.parse(md);
    const html = textParts(parts)[0];
    expect(html).toContain('<pre>');
    expect(html).toContain('</pre>');
    expect(html).toContain('| Col A | Col B |');
    expect(html).toContain('| 1');
    expect(html).toContain('| xxx');
  });

  it('renders blockquotes', () => {
    const { parts } = parser.parse('> Quoted line one\n> Quoted line two');
    const html = textParts(parts)[0];
    expect(html).toMatch(/<blockquote>[\s\S]+<\/blockquote>/);
    expect(html).toContain('Quoted line one');
  });

  it('renders plain links with anchor tags', () => {
    const { parts } = parser.parse('Visit [Anthropic](https://anthropic.com) today.');
    const html = textParts(parts)[0];
    expect(html).toContain('<a href="https://anthropic.com">Anthropic</a>');
  });

  it('extracts ![alt](url) image syntax as photo attachments', () => {
    const { parts } = parser.parse('Some text.\n\n![A cat](https://i.example/cat.png)\n\nMore text.');
    expect(photoParts(parts)).toEqual([
      { kind: 'photo', url: 'https://i.example/cat.png', caption: 'A cat' },
    ]);
    const html = textParts(parts).join('\n');
    expect(html).toContain('Some text');
    expect(html).toContain('More text');
    expect(html).not.toContain('cat.png');
  });

  it('treats links with image extensions as photo attachments', () => {
    const { parts } = parser.parse('[photo](https://e.com/foo.jpg)');
    expect(photoParts(parts)).toEqual([
      { kind: 'photo', url: 'https://e.com/foo.jpg', caption: 'photo' },
    ]);
  });

  it('treats links with document extensions as document attachments', () => {
    const { parts } = parser.parse('[report](https://e.com/q4.pdf)');
    expect(documentParts(parts)).toEqual([
      { kind: 'document', url: 'https://e.com/q4.pdf', filename: 'report' },
    ]);
  });

  it('escapes HTML special characters in agent text', () => {
    const { parts } = parser.parse('Compare a < b and a > b & done.');
    const html = textParts(parts)[0];
    expect(html).toContain('a &lt; b');
    expect(html).toContain('a &gt; b');
    expect(html).toContain('&amp; done');
    expect(html).not.toContain('<script');
  });

  it('escapes HTML inside code blocks', () => {
    const { parts } = parser.parse('```\n<script>alert(1)</script>\n```');
    const html = textParts(parts)[0];
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/<script>/i);
  });

  it('escapes link href attribute', () => {
    const { parts } = parser.parse('[click](https://e.com/?a="b"&c=<d>)');
    const html = textParts(parts)[0];
    expect(html).toContain('&quot;');
    expect(html).toContain('&lt;d&gt;');
    expect(html).toContain('&amp;c=');
  });

  it('handles mixed content: headings + paragraphs + lists + table + image', () => {
    const md = [
      '# Analysis',
      '',
      '## Details',
      '- one',
      '- two',
      '',
      '| K | V |',
      '|---|---|',
      '| a | 1 |',
      '',
      '![](https://x.example/img.png)',
      '',
      'See you later.',
    ].join('\n');

    const { parts } = parser.parse(md);
    expect(photoParts(parts)).toHaveLength(1);
    const html = textParts(parts).join('\n');
    expect(html).toContain('<b>Analysis</b>');
    expect(html).toContain('<b>Details</b>');
    expect(html).toContain('• one');
    expect(html).toContain('<pre>');
    expect(html).toContain('| K | V |');
    expect(html).toContain('See you later.');
  });

  it('renders horizontal rule as a separator', () => {
    const { parts } = parser.parse('above\n\n---\n\nbelow');
    const html = textParts(parts)[0];
    expect(html).toContain('above');
    expect(html).toContain('below');
    expect(html).toMatch(/─{5,}/);
  });

  it('chunks output longer than 4096 chars across multiple text parts', () => {
    const long = ('A long sentence that wraps. '.repeat(200) + '\n\n').repeat(2);
    const { parts } = parser.parse(long);
    const texts = textParts(parts);
    expect(texts.length).toBeGreaterThan(1);
    for (const t of texts) {
      expect(t.length).toBeLessThanOrEqual(4096);
    }
  });

  it('preserves nested formatting (bold inside list item)', () => {
    const { parts } = parser.parse('- **Important:** read this');
    const html = textParts(parts)[0];
    expect(html).toContain('• <b>Important:</b> read this');
  });

  it('does not emit empty paragraphs', () => {
    const { parts } = parser.parse('hello\n\n\n\nworld');
    const html = textParts(parts)[0];
    expect(html).not.toMatch(/\n{4,}/);
  });

  it('handles the real-world Ukrainian analysis sample (smoke test)', () => {
    const md = [
      '**🔍 Аналіз транзакції: Аптека «384» — 251.50 грн**',
      '',
      '### **1. Ключові деталі транзакції**',
      '- **Тип операції**: POS-покупка (категорія «Pharmacies»)',
      '- **Сума**: 251.50 грн',
      '',
      '---',
      '',
      '### **3. Різниця між «Аптекою» і «ОВДП-інвестицією»**',
      '| Критерій | Аптека | ОВДП |',
      '|----------|--------|------|',
      '| Мета     | побут  | актив|',
      '| Сума     | 251.50 | 1000+|',
    ].join('\n');

    const { parts } = parser.parse(md);
    const html = textParts(parts).join('\n');
    expect(html).toContain('<b>');
    expect(html).toContain('• <b>Тип операції</b>');
    expect(html).toContain('<pre>');
    expect(html).toContain('Критерій');
    expect(html).not.toContain('**'); // no leftover markdown asterisks
    expect(html).not.toMatch(/^###/m);
  });

  it('drops empty entities from image-only headings and bold', () => {
    const heading = parser.parse('# ![logo](https://x/l.png)');
    expect(textParts(heading.parts).join('')).not.toContain('<b></b>');
    expect(photoParts(heading.parts)).toHaveLength(1); // image still relayed

    const strong = parser.parse('**[x](https://x/y.png)**');
    expect(textParts(strong.parts).join('')).not.toContain('<b></b>');
    expect(photoParts(strong.parts)).toHaveLength(1);
  });

  it('chunks long formatted output without bisecting tags or entities', () => {
    // Bold words have no internal spaces, so whitespace cuts fall between
    // complete <b>…</b> pairs; literal < and & become entities via marked.
    const unit = '**Important** note about a < b & c, see [docs](https://example.com/guide). ';
    const texts = textParts(parser.parse(unit.repeat(120)).parts);
    expect(texts.length).toBeGreaterThan(1);
    for (const t of texts) {
      expect(t.length).toBeGreaterThan(0);
      expect(t.length).toBeLessThanOrEqual(4096);
      // never ends inside a tag (a '<' with no following '>')
      expect(t.lastIndexOf('<')).toBeLessThanOrEqual(t.lastIndexOf('>'));
      // never ends inside an entity (a '&' with no following ';')
      const amp = t.lastIndexOf('&');
      if (amp !== -1) expect(t.indexOf(';', amp)).toBeGreaterThanOrEqual(amp);
      // bold tags stay balanced within each chunk
      expect((t.match(/<b>/g) ?? []).length).toBe((t.match(/<\/b>/g) ?? []).length);
    }
  });
});
