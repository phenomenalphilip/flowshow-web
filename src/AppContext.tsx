import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Presentation, Slide, SlideElement } from './types';

interface AppState {
  presentation: Presentation;
  selectedSlideId: string | null;
  selectedElementIds: string[];
  isEditingText: boolean;
  isPresenting: boolean;
}

interface AppContextType extends AppState {
  setPresentation: React.Dispatch<React.SetStateAction<Presentation>>;
  addSlide: () => void;
  deleteSlide: (id: string) => void;
  selectSlide: (id: string) => void;
  addElement: (slideId: string, element: Omit<SlideElement, 'id' | 'zIndex'>) => void;
  updateElement: (slideId: string, elementId: string, updates: Partial<SlideElement>) => void;
  deleteElements: (slideId: string, elementIds: string[]) => void;
  selectElements: (ids: string[]) => void;
  setIsEditingText: (isEditing: boolean) => void;
  setIsPresenting: (isPresenting: boolean) => void;
  updatePresentationTitle: (title: string) => void;
  updateSlideBackground: (slideId: string, background: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const initialSlide: Slide = {
  id: crypto.randomUUID(),
  elements: [
    {
      id: crypto.randomUUID(),
      type: 'text',
      x: 100,
      y: 100,
      width: 600,
      height: 100,
      content: 'Title Slide',
      fontSize: 48,
      color: '#000000',
      zIndex: 1,
    },
    {
      id: crypto.randomUUID(),
      type: 'text',
      x: 100,
      y: 220,
      width: 600,
      height: 50,
      content: 'Subtitle placeholder',
      fontSize: 24,
      color: '#666666',
      zIndex: 2,
    }
  ],
  background: '#ffffff',
};

const initialPresentation: Presentation = {
  id: crypto.randomUUID(),
  title: 'Untitled Presentation',
  slides: [initialSlide],
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [presentation, setPresentation] = useState<Presentation>(initialPresentation);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(initialSlide.id);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [isEditingText, setIsEditingText] = useState<boolean>(false);
  const [isPresenting, setIsPresenting] = useState<boolean>(false);

  const addSlide = useCallback(() => {
    const newSlide: Slide = {
      id: crypto.randomUUID(),
      elements: [],
      background: '#ffffff',
    };
    setPresentation((prev) => ({
      ...prev,
      slides: [...prev.slides, newSlide],
    }));
    setSelectedSlideId(newSlide.id);
    setSelectedElementIds([]);
  }, []);

  const deleteSlide = useCallback((id: string) => {
    setPresentation((prev) => {
      const newSlides = prev.slides.filter((s) => s.id !== id);
      if (newSlides.length === 0) {
        // Don't delete the last slide, or maybe add a blank one
        return prev;
      }
      return { ...prev, slides: newSlides };
    });
    setSelectedSlideId((prevId) => {
      if (prevId === id) {
        const remaining = presentation.slides.filter(s => s.id !== id);
        return remaining.length > 0 ? remaining[0].id : null;
      }
      return prevId;
    });
  }, [presentation.slides]);

  const selectSlide = useCallback((id: string) => {
    setSelectedSlideId(id);
    setSelectedElementIds([]);
    setIsEditingText(false);
  }, []);

  const addElement = useCallback((slideId: string, elementData: Omit<SlideElement, 'id' | 'zIndex'>) => {
    setPresentation((prev) => ({
      ...prev,
      slides: prev.slides.map((slide) => {
        if (slide.id === slideId) {
          const maxZ = slide.elements.reduce((max, el) => Math.max(max, el.zIndex), 0);
          const newElement: SlideElement = {
            ...elementData,
            id: crypto.randomUUID(),
            zIndex: maxZ + 1,
          };
          return {
            ...slide,
            elements: [...slide.elements, newElement],
          };
        }
        return slide;
      }),
    }));
  }, []);

  const updateElement = useCallback((slideId: string, elementId: string, updates: Partial<SlideElement>) => {
    setPresentation((prev) => ({
      ...prev,
      slides: prev.slides.map((slide) => {
        if (slide.id === slideId) {
          return {
            ...slide,
            elements: slide.elements.map((el) => 
              el.id === elementId ? { ...el, ...updates } : el
            ),
          };
        }
        return slide;
      }),
    }));
  }, []);

  const deleteElements = useCallback((slideId: string, elementIds: string[]) => {
    setPresentation((prev) => ({
      ...prev,
      slides: prev.slides.map((slide) => {
        if (slide.id === slideId) {
          return {
            ...slide,
            elements: slide.elements.filter((el) => !elementIds.includes(el.id)),
          };
        }
        return slide;
      }),
    }));
    setSelectedElementIds((prev) => prev.filter(id => !elementIds.includes(id)));
  }, []);

  const selectElements = useCallback((ids: string[]) => {
    setSelectedElementIds(ids);
  }, []);

  const updatePresentationTitle = useCallback((title: string) => {
    setPresentation((prev) => ({ ...prev, title }));
  }, []);

  const updateSlideBackground = useCallback((slideId: string, background: string) => {
    setPresentation((prev) => ({
      ...prev,
      slides: prev.slides.map((slide) =>
        slide.id === slideId ? { ...slide, background } : slide
      ),
    }));
  }, []);

  const value: AppContextType = {
    presentation,
    setPresentation,
    selectedSlideId,
    selectedElementIds,
    isEditingText,
    isPresenting,
    addSlide,
    deleteSlide,
    selectSlide,
    addElement,
    updateElement,
    deleteElements,
    selectElements,
    setIsEditingText,
    setIsPresenting,
    updatePresentationTitle,
    updateSlideBackground,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
