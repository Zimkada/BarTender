// src/hooks/useModalState.ts
import { useReducer } from 'react';

type ModalState = {
  quickSale: boolean;
  productModal: boolean;
  categoryModal: boolean;
  supplyModal: boolean;
  userModal: boolean;
  // Ajout des modales admin qui resteront des modales flottantes
  barStatsModal: boolean;
};

type ModalAction = 
  | { type: 'OPEN'; modal: keyof ModalState }
  | { type: 'CLOSE'; modal: keyof ModalState }
  | { type: 'CLOSE_ALL' };

const modalReducer = (state: ModalState, action: ModalAction): ModalState => {
  switch (action.type) {
    case 'OPEN':
      return { ...state, [action.modal]: true };
    case 'CLOSE':
      return { ...state, [action.modal]: false };
    case 'CLOSE_ALL':
      return Object.keys(state).reduce(
        (acc, key) => ({ ...acc, [key]: false }), 
        {} as ModalState
      );
    default:
      return state;
  }
};

export function useModalState() {
  const [modals, dispatch] = useReducer(modalReducer, {
    quickSale: false,
    productModal: false,
    categoryModal: false,
    supplyModal: false,
    userModal: false,
    barStatsModal: false, // Initialisation
  });
  
  const openModal = (modal: keyof ModalState) => 
    dispatch({ type: 'OPEN', modal });
  
  const closeModal = (modal: keyof ModalState) => 
    dispatch({ type: 'CLOSE', modal });
  
  const closeAll = () => dispatch({ type: 'CLOSE_ALL' });
  
  return { modals, openModal, closeModal, closeAll };
}
