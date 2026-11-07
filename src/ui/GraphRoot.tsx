import type { ReactNode } from 'react';
import type { Theme } from '../index';

type Props = {
  theme: Theme;
  className?: string;
  children: ReactNode;
};

/**
 * 画布视觉的作用域根。
 *
 * 包里所有样式都挂在这个类下（连同 Tailwind 生成的设计令牌），所以宿主不需要装
 * Tailwind、也不会被 `--font-mono` / `--color-*` 这类变量污染。
 * `data-theme` 必须落在这一层：宿主的 `data-theme` 在 `<html>` 上，跨包不共享。
 *
 * 布局：根元素自带 `display:flex; flex:1; min-height:0`，宿主只要给它高度即可。
 * `className` 用于宿主自己的**普通 CSS 类**（utility 类只对后代生效，不要用在这一层）。
 */
export default function GraphRoot({ theme, className = '', children }: Props) {
  return (
    <div className={`atlas-graph-root ${className}`.trim()} data-theme={theme}>
      {children}
    </div>
  );
}
