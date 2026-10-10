import { createContext } from 'react';
export const AdminDraftContext = createContext<((id: string, dirty: boolean) => void) | null>(null);
