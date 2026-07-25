import { Card, Menu, MenuItem } from '@heroui/react';
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 菜单项定义。键通过 `key` 区分；分隔线用 `divider: true`。
 * `isDisabled` 让该项灰显且不可触发。
 */
export interface ContextMenuItem {
  key: string;
  label?: string;
  startContent?: ReactNode;
  endContent?: ReactNode;
  shortcut?: string;
  color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  isDisabled?: boolean;
  divider?: boolean;
  onAction?: () => void;
}

/**
 * 受控的右键菜单容器：
 * - portal 到 document.body，规避 transform 祖先（Drawer 等）导致的 fixed 定位失效
 * - 挂载后测量尺寸，靠右/下边缘溢出时翻转或贴边
 * - Esc 关闭、点击外部关闭、菜单项选中后关闭
 * - 内部用 HeroUI Menu/MenuItem，自带键盘导航（↑↓ Enter）与 focus 管理
 *
 * 受控语义：由调用方在 `onContextMenu` 事件里设置 `open/x/y`，`onClose` 时复位。
 */
export default function ContextMenu({
  open,
  x,
  y,
  items,
  onClose
}: {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  // 打开 / 点击点变化时：重置到原始点，下一帧测量并修正边缘溢出
  useLayoutEffect(() => {
    if (!open) return;
    // 先回到原始点击点，保证测量基于正确的初始位置
    setPos({ left: x, top: y });

    const el = menuWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x;
    let top = y;
    // 右溢出 → 向左展开（若仍放不下则贴右边）
    if (left + rect.width > vw) {
      left = Math.max(8, x - rect.width);
      if (left + rect.width > vw) left = vw - rect.width - 8;
    }
    // 下溢出 → 向上展开（贴点击点上方），仍放不下则贴底边
    if (top + rect.height > vh) {
      top = Math.max(8, y - rect.height);
      if (top + rect.height > vh) top = vh - rect.height - 8;
    }
    left = Math.max(8, Math.min(left, vw - 8));
    top = Math.max(8, Math.min(top, vh - 8));
    setPos({ left, top });
  }, [open, x, y]);

  // Esc 关闭 + 点击外部关闭（修 Bug F、D）
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const onPointerDown = (e: PointerEvent): void => {
      const el = menuWrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    // 用 pointerdown 而非 mousedown：先于菜单项的 press 关闭，避免竞争；
    // 同时只判断"点击在菜单外" → 关闭，菜单内的点击交给 MenuItem 处理。
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, onClose]);

  // 失焦/窗口失活时关闭
  useEffect(() => {
    if (!open) return;
    const onBlur = (): void => onClose();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [open, onClose]);

  if (!open) return null;

  const disabledKeys = items.filter((i) => i.isDisabled && !i.divider).map((i) => i.key);

  const handleAction = (key: React.Key): void => {
    const item = items.find((i) => i.key === key);
    item?.onAction?.();
    onClose();
  };

  return createPortal(
    <div
      ref={menuWrapRef}
      className="fixed z-[100] min-w-[180px] max-w-[320px]"
      style={{ left: pos.left, top: pos.top }}
      // 阻止右键事件再次触发菜单；阻止 wheel 让底层页面滚动
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <Card shadow="lg" className="p-0 overflow-hidden">
        <Menu
          aria-label="context menu"
          autoFocus
          selectionMode="none"
          disabledKeys={disabledKeys}
          onAction={handleAction}
          variant="light"
          className="p-0 gap-0"
          itemClasses={{
            base: 'rounded-none px-2.5 py-1.5 text-sm min-w-[180px]'
          }}
        >
          {items.map((item) =>
            item.divider ? (
              // 分隔线：只读项，渲染一根细线，不参与选中/聚焦动作
              <MenuItem
                key={item.key}
                isReadOnly
                textValue="divider"
                className="!h-px !min-h-px !py-0 !my-0 !bg-default-200 !overflow-hidden"
              />
            ) : (
              <MenuItem
                key={item.key}
                color={item.color}
                startContent={item.startContent}
                endContent={item.endContent}
                shortcut={item.shortcut}
              >
                {item.label}
              </MenuItem>
            )
          )}
        </Menu>
      </Card>
    </div>,
    document.body
  );
}
