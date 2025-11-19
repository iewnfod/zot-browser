import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardBody } from '@heroui/react';

export default function ContextMenu({
  children,
  menuItems
} : {
  children: ReactNode;
  menuItems: ReactNode[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({x: 0, y: 0});
  const [showContextMenu, setShowContextMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setPosition({ x: e.clientX, y: e.clientY });

    // 使用 requestAnimationFrame 确保在下一帧打开新菜单
    requestAnimationFrame(() => {
      setShowContextMenu(true);
    });
  }, []);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setShowContextMenu(false);
    }
  }, []);

  const handleClickInside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setShowContextMenu(false);
    }
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.addEventListener('contextmenu', handleContextMenu);
      containerRef.current.addEventListener('mousedown', handleClickInside);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('contextmenu', handleContextMenu);
        containerRef.current.removeEventListener('mousedown', handleClickInside);
        document.removeEventListener('mousedown', handleClickOutside);
      }
    };
  }, [handleContextMenu, handleClickOutside]);

  const handleAfterMenuItemClick = () => {
    setShowContextMenu(false);
  };

  const enhancedMenuItems = menuItems.map((item, index) => {
    if (React.isValidElement(item)) {
      return React.cloneElement(item, {
        // @ts-ignore
        ...item.props,
        onPress: (e: MouseEvent) => {
          // @ts-ignore
          item.props.onPress?.(e);
          handleAfterMenuItemClick();
        },
        onClick: (e: MouseEvent) => {
          // @ts-ignore
          item.props.onClick?.(e);
          handleAfterMenuItemClick();
        },
        key: index
      });
    }
    return item;
  });

  return (
    <div className="w-full h-full grow" ref={containerRef}>
      {children}
      {showContextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50"
          style={{
            left: position.x,
            top: position.y,
          }}
        >
          <Card>
            <CardBody className="p-0">
              {enhancedMenuItems}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
