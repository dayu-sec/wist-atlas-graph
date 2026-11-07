type Props = {
  values: number[];
  height?: number;
  className?: string;
  ariaLabel?: string;
};

/** 极简 sparkline：归一化到 100×height，拉伸不变形描边（vector-effect）。 */
export default function Sparkline({ values, height = 36, className = '', ariaLabel }: Props) {
  if (values.length < 2) return null;
  const width = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 2 - ((value - min) / span) * (height - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${points.join(' L')}`;
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      className={`sparkline ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      height={height}
      style={{ height }}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? '趋势示例'}
    >
      <path className="area" d={area} vectorEffect="non-scaling-stroke" />
      <path className="line" d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
