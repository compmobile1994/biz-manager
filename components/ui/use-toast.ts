'use client';

import * as React from 'react';
import type { ToastActionElement, ToastProps } from '@/components/ui/toast';

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 4000;
const TOAST_AUTO_DISMISS_MS = 5000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type Action =
  | { type: 'ADD'; toast: ToasterToast }
  | { type: 'UPDATE'; toast: Partial<ToasterToast> & { id: string } }
  | { type: 'DISMISS'; id?: string }
  | { type: 'REMOVE'; id?: string };

interface State {
  toasts: ToasterToast[];
}

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleRemove(id: string) {
  if (timeouts.has(id)) return;
  const t = setTimeout(() => {
    timeouts.delete(id);
    dispatch({ type: 'REMOVE', id });
  }, TOAST_REMOVE_DELAY);
  timeouts.set(id, t);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD':
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case 'UPDATE':
      return { toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)) };
    case 'DISMISS': {
      if (action.id) scheduleRemove(action.id);
      else state.toasts.forEach((t) => scheduleRemove(t.id));
      return {
        toasts: state.toasts.map((t) => (action.id === undefined || t.id === action.id ? { ...t, open: false } : t)),
      };
    }
    case 'REMOVE':
      return { toasts: action.id ? state.toasts.filter((t) => t.id !== action.id) : [] };
  }
}

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((l) => l(memoryState));
}

let nextId = 0;
export function toast({ ...props }: Omit<ToasterToast, 'id'>) {
  const id = String(++nextId);
  dispatch({
    type: 'ADD',
    toast: { ...props, id, open: true, onOpenChange: (open) => !open && dispatch({ type: 'DISMISS', id }) },
  });
  // Explicit auto-dismiss timer — kicks in after 5 seconds so toasts never
  // hang on screen, regardless of whether Radix's own duration triggers.
  setTimeout(() => dispatch({ type: 'DISMISS', id }), TOAST_AUTO_DISMISS_MS);
  return { id, dismiss: () => dispatch({ type: 'DISMISS', id }) };
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);
  return { ...state, toast, dismiss: (id?: string) => dispatch({ type: 'DISMISS', id }) };
}
