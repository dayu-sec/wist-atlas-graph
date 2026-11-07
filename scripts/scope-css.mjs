// 把 Tailwind 的编译产物整份收进 `.atlas-graph-root` 作用域。
//
// 只改 CSS 变量是不够的：utility 类名（`.hidden` / `.grid` / `.flex` …）是全局选择器，
// 宿主的响应式变体（例如 AppHeader 的 `hidden xl:inline`）会因为这些后加载的 `.hidden`
// 被压掉。所以给每条规则的选择器都加作用域前缀；`@keyframes` 里的 `from/to/百分比`
// 不是选择器，跳过。
import { readFileSync, writeFileSync } from 'node:fs';
import postcss from 'postcss';

const file = new URL('../dist/atlas-graph.css', import.meta.url);
const css = readFileSync(file, 'utf8');
const root = postcss.parse(css);

function scopeSelector(selector) {
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;
  if (trimmed === ':root' || trimmed === ':host') return '.atlas-graph-root';
  if (trimmed.startsWith('.atlas-graph-root')) return trimmed;
  return `.atlas-graph-root ${trimmed}`;
}

root.walkRules((rule) => {
  const parent = rule.parent;
  if (parent && parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
  const scoped = [...new Set(rule.selectors.map(scopeSelector))];
  rule.selectors = scoped;
});

const output = root.toString();

if (/^\.hidden\s*\{/m.test(output)) {
  throw new Error('作用域化失败：仍存在未加前缀的 .hidden');
}

writeFileSync(file, output);
