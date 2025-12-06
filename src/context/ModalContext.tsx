// src/context/ModalContext.tsx
import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Category, Product, Bar } from '../types';

// Define the types of modals and their expected props
type ModalTypes = {
  PRODUCT: { product?: Product };
  CATEGORY: { category?: Category };
  QUICK_SALE: {};
  USER_MANAGEMENT: {};
  SUPPLY: {};
  BAR_STATS: { bar: Bar };
  // Add other modal types as needed
};

// Define the state structure
type ModalState = {
  type: keyof ModalTypes | null;
  props: any;
};

// Define the actions
type ModalAction =
  | { type: 'OPEN_MODAL'; modalType: keyof ModalTypes; modalProps?: any }
  | { type: 'CLOSE_MODAL' };

// Reducer to manage modal state
const modalReducer = (state: ModalState, action: ModalAction): ModalState => {
  switch (action.type) {
    case 'OPEN_MODAL':
      return {
        ...state,
        type: action.modalType,
        props: action.modalProps || {},
      };
    case 'CLOSE_MODAL':
      return { ...state, type: null, props: {} };
    default:
      return state;
  }
};

// Define the context shape
interface ModalContextType {
  modalState: ModalState;
  openModal: <T extends keyof ModalTypes>(type: T, props?: ModalTypes[T]) => void;
  closeModal: () => void;
}

// Create the context
const ModalContext = createContext<ModalContextType | undefined>(undefined);

// Provider component
export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const [modalState, dispatch] = useReducer(modalReducer, { type: null, props: {} });

  const openModal = <T extends keyof ModalTypes>(type: T, props?: ModalTypes[T]) => {
    dispatch({ type: 'OPEN_MODAL', modalType: type, modalProps: props });
  };

  const closeModal = () => {
    dispatch({ type: 'CLOSE_MODAL' });
  };

  return (
    <ModalContext.Provider value={{ modalState, openModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  );
};

// Custom hook to use the modal context
export const useModal = () => {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};