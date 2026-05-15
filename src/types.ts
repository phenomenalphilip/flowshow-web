export type ElementType = 'text' | 'shape' | 'image';

export interface SlideElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  color?: string;
  fontSize?: number;
  shapeType?: 'rectangle' | 'circle' | 'triangle';
  imageUrl?: string;
  zIndex: number;
}

export interface Slide {
  id: string;
  elements: SlideElement[];
  background: string;
}

export interface Presentation {
  id: string;
  title: string;
  slides: Slide[];
}
