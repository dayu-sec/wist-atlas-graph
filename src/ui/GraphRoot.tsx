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
 */
export default function GraphRoot({ theme, className = '', children }: Props) {
  return (
    <div className={`atlas-graph-root ${className}`.trim()} data-theme={theme}>
      {children}
    </div>
  );
}
