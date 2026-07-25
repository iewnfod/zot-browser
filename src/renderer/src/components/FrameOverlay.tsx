import { RefObject, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * 全局背景画框：覆盖整个窗口（含 sidebar），用白色 path 挖出一个跟随 pageAreaRef 的圆角洞，
 * 并在洞口轮廓上叠加 inner shadow（复刻 figma 的 inner-shadow filter）。
 *
 * 作为整个 UI 的统一背景层：sidebar/divider/顶栏 都改透明，白色全部由这里提供。
 * 这样卡片洞口四周（含左侧）的 inner shadow 会自然落在透明的 sidebar 上，无遮挡割裂。
 *
 * - fixed inset-0 w-screen h-screen：覆盖全窗口。
 * - z-0：最底层；pointer-events-none：不拦截事件。
 * - 点击穿透靠主进程的 pageRect 坐标判断（与 CSS 无关），本组件不参与。
 */
export default function FrameOverlay({
  pageAreaRef
}: {
  pageAreaRef?: RefObject<HTMLDivElement | null>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgSize, setSvgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hole, setHole] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });
  const rawMaskId = useId();
  const dropShadowFilterId = `hole-shadow-${rawMaskId.replace(/:/g, '')}`;

  // 圆角半径（与 Card 默认 medium=12 对齐）。
  const HOLE_RADIUS = 12;
  // 外框外扩量：让 path 外缘远超 SVG root（root 默认会裁剪可视区外），
  // 这样 inner-shadow 在外缘的部分落在可视区外被裁掉，只剩洞口轮廓的阴影。
  const FRAME_OUTSET = 2000;
  // 消缝：洞口左边缘向内收 1px，让画框多覆盖 1px。
  // FrameOverlay 的测量矩形与底层网页 view 的整数像素边界之间，因亚像素取整会
  // 时有时无地错开 <1px，露出一条透明缝。让 SVG 内圈左侧多压 1px 即可盖住。
  const SEAM_FIX = 1;

  /**
   * 生成"带洞的画框"path：外圈=远超画布的大矩形、内圈=圆角矩形洞，用 even-odd 填充规则得到带洞形状。
   * 这个形状作为 inner-shadow filter 的 SourceGraphic，让内阴影出现在【洞口轮廓】上。
   */
  const framePath = useMemo(() => {
    const { w: W, h: H } = svgSize;
    const { x: hx, y, w: hw, h } = hole;
    if (W === 0 || H === 0 || hw === 0 || h === 0) return '';
    // 左边缘向内收 SEAM_FIX：x 右移、w 减小，画框在左侧多覆盖 1px
    const x = hx + SEAM_FIX;
    const w = hw - SEAM_FIX;
    const r = Math.max(0, Math.min(HOLE_RADIUS, w / 2, h / 2));
    // 外框：远超可视区，其内阴影落在 root 外被裁掉
    const outer =
      `M ${-FRAME_OUTSET} ${-FRAME_OUTSET} ` +
      `H ${W + FRAME_OUTSET} V ${H + FRAME_OUTSET} ` +
      `H ${-FRAME_OUTSET} Z`;
    // 内洞：圆角矩形，顺时针走，配合外框形成 even-odd 带洞区域
    const holeD =
      `M ${x + r} ${y} ` +
      `H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} ` +
      `V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} ` +
      `H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} ` +
      `V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
    return `${outer} ${holeD}`;
  }, [svgSize, hole]);

  // 镂空区域 = pageAreaRef 相对 SVG 的位置与尺寸，实时测量后喂给 path。
  useEffect(() => {
    const svg = svgRef.current;
    const el = pageAreaRef?.current;
    if (!svg || !el) return;
    const measure = (): void => {
      const sg = svg.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setSvgSize({ w: sg.width, h: sg.height });
      setHole({
        x: r.left - sg.left,
        y: r.top - sg.top,
        w: r.width,
        h: r.height
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(svg);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pageAreaRef]);

  return (
    <svg
      ref={svgRef}
      className="fixed inset-0 w-screen h-screen overflow-hidden pointer-events-none z-0"
      aria-hidden="true"
    >
      {/*
        洞口阴影 = 直接复刻 figma 的 inner-shadow filter，作用在【带洞 path】这个真实几何上：
        feMorphology erode + feGaussianBlur + arithmetic(k2=-1,k3=1) + alpha。
        inner shadow 出现在形状的内边缘 → 对带洞形状就是洞口轮廓，阴影从洞口向画框一侧扩散，
        不进入卡片内部；外缘（画布边界）的阴影超出 root、自然被裁掉。
      */}
      <defs>
        <filter id={dropShadowFilterId} x="-20%" y="-20%" width="140%" height="140%">
          <feMorphology operator="erode" radius="1" in="SourceAlpha" result="eroded"/>
          <feGaussianBlur in="eroded" stdDeviation="3" result="blurred"/>
          <feComposite in="blurred" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="innerShadow"/>
          <feColorMatrix in="innerShadow" type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.25 0" result="darkInner"/>
          <feComposite in="darkInner" in2="SourceAlpha" operator="in" result="clipped"/>
          <feMerge>
            <feMergeNode in="SourceGraphic"/>
            <feMergeNode in="clipped"/>
          </feMerge>
        </filter>
      </defs>
      <path
        d={framePath}
        fillRule="evenodd"
        fill="var(--bg-color)"
        filter={`url(#${dropShadowFilterId})`}
      />
    </svg>
  );
}
