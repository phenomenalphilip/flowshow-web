import React from 'react';
import useMeasure from 'react-use-measure';

interface FixedStageProps {
  children: React.ReactNode | ((scale: number) => React.ReactNode);
  className?: string;
  width?: number;
  height?: number;
}

export function FixedStage({ children, className = '', width = 1920, height = 1080 }: FixedStageProps) {
  const [ref, bounds] = useMeasure();
  
  const scale = bounds.width > 0 ? Math.min(bounds.width / width, bounds.height / height) : 0;
  
  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <div 
        className="absolute left-1/2 top-1/2"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center center',
          visibility: scale > 0 ? 'visible' : 'hidden'
        }}
      >
        {typeof children === 'function' ? children(scale) : children}
      </div>
    </div>
  );
}