import { useCallback, useEffect, useState } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';

export function useUnsavedChangesPrompt(when: boolean) {
  const blocker = useBlocker(when);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!when) {
          return;
        }
        event.preventDefault();
        event.returnValue = '';
      },
      [when],
    ),
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setIsDialogOpen(true);
      return;
    }
    if (blocker.state === 'unblocked') {
      setIsDialogOpen(false);
    }
  }, [blocker.state]);

  useEffect(() => {
    if (!when && blocker.state === 'blocked') {
      blocker.reset();
    }
  }, [blocker, when]);

  const confirmNavigation = useCallback(() => {
    setIsDialogOpen(false);
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  }, [blocker]);

  const stayOnPage = useCallback(() => {
    setIsDialogOpen(false);
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  }, [blocker]);

  return {
    isDialogOpen,
    confirmNavigation,
    stayOnPage,
  };
}
