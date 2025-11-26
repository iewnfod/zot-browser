import { Divider } from '@heroui/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Api } from '@/lib/ipc/api.ts';

export default function ResizeSidebarDivider({
  sidebarWidth,
  setSidebarWidth,
} : {
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
}) {
  const [showColor, setShowColor] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const scaleFactor = useRef(1);

  const handleMouseLeave = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      setShowColor(false);
    }
  };

  const handleMouseEnter = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setShowColor(true);
    }, 100);
  };

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    console.log("Sidebar width start drag");

    Api.scaleFactor((factor: number) => {
      scaleFactor.current = factor;
      console.log("Scale factor:", factor);
    });

    isDragging.current = true;

    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

    e.preventDefault();
  }, [sidebarWidth]);

  const handleDragMove = (e: MouseEvent) => {
    if (!isDragging.current) return;

    const deltaX = (e.clientX - dragStartX.current) * scaleFactor.current;
    const newWidth = Math.max(200, Math.min(500, dragStartWidth.current + deltaX));

    console.log(`Sidebar width move drag, delta x: ${deltaX}, new width: ${newWidth}, factor: ${scaleFactor.current}`);

    setSidebarWidth(newWidth);
  };

  const handleDragEnd = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    console.log('Sidebar width end drag');
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [handleDragMove, handleDragEnd]);

  return (
    <div
      className="h-full pb-2 pt-2 pl-0.5 pr-0.5 cursor-ew-resize"
      onMouseDown={handleDragStart}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Divider
        className={`
          rounded-medium h-full w-1
          transition-all ease-in-out duration-300
          ${showColor ? 'bg-neutral-200' : 'bg-transparent'}
        `}
      />
    </div>
  );
}
