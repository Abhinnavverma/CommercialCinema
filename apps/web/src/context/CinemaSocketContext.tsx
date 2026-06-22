import { createContext, useContext, type ReactNode } from "react";
import { useCinemaSocket, type CinemaSocketState } from "../hooks/useCinemaSocket";

const CinemaSocketContext = createContext<CinemaSocketState | null>(null);

type CinemaSocketProviderProps = {
  children: ReactNode;
  enabled?: boolean;
  value?: CinemaSocketState;
};

export function CinemaSocketProvider({ children, enabled = true, value }: CinemaSocketProviderProps) {
  const socketState = useCinemaSocket({ enabled: value ? false : enabled });
  return (
    <CinemaSocketContext.Provider value={value ?? socketState}>{children}</CinemaSocketContext.Provider>
  );
}

export function useCinemaSocketContext(): CinemaSocketState {
  const context = useContext(CinemaSocketContext);
  if (!context) {
    throw new Error("useCinemaSocketContext must be used within CinemaSocketProvider");
  }
  return context;
}
