import { useCallback, useState } from 'react';
import { useCenter } from './center-context';

export function useViewState(key, initial) {
  const { viewState } = useCenter();
  const [value, setValue] = useState(() => viewState.current.has(key) ? viewState.current.get(key) : typeof initial === 'function' ? initial() : initial);
  const update = useCallback(next => setValue(current => {
    const result = typeof next === 'function' ? next(current) : next;
    viewState.current.set(key, result); return result;
  }), [key, viewState]);
  return [value, update];
}
